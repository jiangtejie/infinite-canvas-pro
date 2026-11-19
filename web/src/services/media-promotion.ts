import { useUserStore } from "@/stores/use-user-store";
import { canUseGlobalStorage, getImageBlob, loadStorageConfig, loadUserStorageProvider, uploadImage } from "@/services/image-storage";
import { getMediaBlob, uploadMediaBlob } from "@/services/file-storage";

export type MediaPromotionKind = "image" | "media";

export type MediaPromotionRef = {
    storageKey?: string;
    url?: string;
    kind: MediaPromotionKind;
};

export type MediaPromotionReplacement = {
    url: string;
    storageKey: string;
    width?: number;
    height?: number;
};

const PROMOTE_CONCURRENCY = 4;
const FAIL_TTL = 5 * 60_000;
const promotionCache = new Map<string, MediaPromotionReplacement>();
const inFlight = new Map<string, Promise<MediaPromotionReplacement | null>>();
const failedAt = new Map<string, number>();

function mediaKey(ref: MediaPromotionRef) {
    return ref.storageKey || ref.url || "";
}

function isLocalKey(storageKey?: string) {
    return Boolean(storageKey && /^(image|file|video|audio):/.test(storageKey));
}

function isLocalUrl(url?: string) {
    return Boolean(url && (url.startsWith("blob:") || url.startsWith("data:")));
}

function mimeExtension(mimeType: string) {
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    return "bin";
}

async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (index < tasks.length) {
            const current = index++;
            results[current] = await tasks[current]();
        }
    });
    await Promise.all(workers);
    return results;
}

async function promoteOne(ref: MediaPromotionRef, token: string): Promise<MediaPromotionReplacement | null> {
    const key = mediaKey(ref);
    if (!key || ref.storageKey?.startsWith("server:")) return null;
    if (!isLocalKey(ref.storageKey) && !isLocalUrl(ref.url)) return null;
    const cached = promotionCache.get(key);
    if (cached) return cached;
    const failed = failedAt.get(key);
    if (failed && Date.now() - failed < FAIL_TTL) return null;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const task = (async (): Promise<MediaPromotionReplacement | null> => {
        if (useUserStore.getState().token !== token) return null;
        try {
            if (ref.kind === "image") {
                const input = ref.storageKey?.startsWith("image:") ? (await getImageBlob(ref.storageKey)) || ref.url : ref.url;
                if (!input) return null;
                const uploaded = await uploadImage(input);
                if (!uploaded.storageKey.startsWith("server:")) {
                    failedAt.set(key, Date.now());
                    return null;
                }
                const replacement = { url: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height };
                promotionCache.set(key, replacement);
                return replacement;
            }
            let blob = ref.storageKey ? await getMediaBlob(ref.storageKey) : null;
            if (!blob && ref.url && !isLocalUrl(ref.url)) blob = await (await fetch(ref.url)).blob();
            if (!blob) return null;
            const uploaded = await uploadMediaBlob(blob, `media-${crypto.randomUUID()}.${mimeExtension(blob.type)}`);
            if (!uploaded.storageKey.startsWith("server:")) {
                failedAt.set(key, Date.now());
                return null;
            }
            const replacement = { url: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height };
            promotionCache.set(key, replacement);
            return replacement;
        } catch {
            failedAt.set(key, Date.now());
            return null;
        }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
}

async function serverStorageAvailable() {
    const config = await loadStorageConfig().catch(() => null);
    if (!config) return false;
    return canUseGlobalStorage(config) || Boolean(config.allowUserProvider && loadUserStorageProvider());
}

export function mediaNeedsPromotion(refs: MediaPromotionRef[]) {
    return refs.some((ref) => isLocalKey(ref.storageKey) || (!ref.storageKey && isLocalUrl(ref.url)));
}

/** 把仍是本地 image:/video:/file: 的媒体升级到账号云存储，返回旧键到新引用的替换表。 */
export async function collectMediaPromotions(refs: MediaPromotionRef[], token: string, concurrency = PROMOTE_CONCURRENCY) {
    if (!(await serverStorageAvailable())) return new Map<string, MediaPromotionReplacement>();
    const unique = new Map<string, MediaPromotionRef>();
    for (const ref of refs) {
        const key = mediaKey(ref);
        if (key && !unique.has(key)) unique.set(key, ref);
    }
    await runLimited([...unique.values()].map((ref) => () => promoteOne(ref, token)), concurrency);
    if (useUserStore.getState().token !== token) return new Map<string, MediaPromotionReplacement>();
    const replacements = new Map<string, MediaPromotionReplacement>();
    for (const key of unique.keys()) {
        const replacement = promotionCache.get(key);
        if (replacement) replacements.set(key, replacement);
    }
    return replacements;
}

/** 在任意对象树中替换命中的媒体键；只克隆实际变化的节点。 */
export function applyMediaPromotions<T>(value: T, replacements: Map<string, MediaPromotionReplacement>): { value: T; changed: boolean } {
    if (!replacements.size) return { value, changed: false };
    let changed = false;
    const walk = (node: unknown): unknown => {
        if (!node || typeof node !== "object") return node;
        if (Array.isArray(node)) {
            let arrayChanged = false;
            const next = node.map((item) => {
                const result = walk(item);
                if (result !== item) arrayChanged = true;
                return result;
            });
            return arrayChanged ? next : node;
        }
        const record = node as Record<string, unknown>;
        let result: Record<string, unknown> = record;
        const ensureClone = () => {
            if (result === record) result = { ...record };
        };
        const replaceKey = (keyField: string, urlFields: string[], dimensions = false) => {
            const key = typeof record[keyField] === "string" ? record[keyField] as string : "";
            const replacement = key ? replacements.get(key) : undefined;
            if (!replacement) return;
            ensureClone();
            result[keyField] = replacement.storageKey;
            for (const field of urlFields) {
                if (typeof record[field] === "string") result[field] = replacement.url;
            }
            if (dimensions && ("url" in record || "dataUrl" in record)) {
                if (typeof replacement.width === "number") result.width = replacement.width;
                if (typeof replacement.height === "number") result.height = replacement.height;
            }
        };
        const replaceUrl = (urlField: string, keyField: string, dimensions = false) => {
            const url = typeof record[urlField] === "string" ? record[urlField] as string : "";
            const replacement = url ? replacements.get(url) : undefined;
            if (!replacement) return;
            ensureClone();
            result[keyField] = replacement.storageKey;
            result[urlField] = replacement.url;
            if (dimensions) {
                if (typeof replacement.width === "number") result.width = replacement.width;
                if (typeof replacement.height === "number") result.height = replacement.height;
            }
        };
        const replaceCoverUrl = () => {
            const url = typeof record.coverUrl === "string" ? record.coverUrl : "";
            const replacement = url ? replacements.get(url) : undefined;
            if (!replacement) return;
            ensureClone();
            result.coverUrl = replacement.url;
        };
        replaceKey("storageKey", ["url", "imageUrl", "dataUrl"], true);
        replaceKey("videoStorageKey", ["videoUrl"]);
        replaceUrl("url", "storageKey", true);
        replaceUrl("imageUrl", "storageKey", true);
        replaceUrl("dataUrl", "storageKey", true);
        replaceUrl("videoUrl", "videoStorageKey");
        replaceCoverUrl();
        for (const key of Object.keys(result)) {
            const child = result[key];
            if (!child || typeof child !== "object") continue;
            const nextChild = walk(child);
            if (nextChild !== child) {
                if (result === record) result = { ...record };
                result[key] = nextChild;
            }
        }
        if (result !== record) changed = true;
        return result;
    };
    const next = walk(value) as T;
    return { value: next, changed: next !== value && changed };
}
