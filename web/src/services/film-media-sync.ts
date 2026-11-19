import type { FilmAsset, FilmImageSlot, FilmProject } from "@/lib/film/types";
import { useUserStore } from "@/stores/use-user-store";
import { canUseGlobalStorage, getImageBlob, loadStorageConfig, loadUserStorageProvider, uploadImage } from "@/services/image-storage";
import { getMediaBlob, uploadMediaBlob } from "@/services/file-storage";

export type FilmMediaReplacement = {
    url: string;
    storageKey: string;
    width?: number;
    height?: number;
};

type MediaRef = { storageKey?: string; url?: string; kind: "image" | "media" };

const PROMOTE_CONCURRENCY = 4;
const FAIL_TTL = 5 * 60_000;
const promotionCache = new Map<string, FilmMediaReplacement>();
const inFlight = new Map<string, Promise<FilmMediaReplacement | null>>();
const failedAt = new Map<string, number>();

function mediaKey(ref: MediaRef) {
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

async function promoteOne(ref: MediaRef, token: string): Promise<FilmMediaReplacement | null> {
    const key = mediaKey(ref);
    if (!key || ref.storageKey?.startsWith("server:")) return null;
    if (!isLocalKey(ref.storageKey) && !isLocalUrl(ref.url)) return null;
    const cached = promotionCache.get(key);
    if (cached) return cached;
    const failed = failedAt.get(key);
    if (failed && Date.now() - failed < FAIL_TTL) return null;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const task = (async (): Promise<FilmMediaReplacement | null> => {
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
            const blob = ref.storageKey ? await getMediaBlob(ref.storageKey) : ref.url ? await (await fetch(ref.url)).blob() : null;
            if (!blob) return null;
            const uploaded = await uploadMediaBlob(blob, `film-media-${crypto.randomUUID()}.${mimeExtension(blob.type)}`);
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

function collectSlot(slot: FilmImageSlot | undefined, refs: MediaRef[]) {
    for (const image of slot?.images || []) refs.push({ storageKey: image.storageKey, url: image.url, kind: "image" });
}

function collectAssetMedia(asset: FilmAsset, refs: MediaRef[]) {
    collectSlot(asset.concept, refs);
    collectSlot(asset.views, refs);
    const profile = asset.character;
    if (profile) {
        Object.values(profile.parts).forEach((part) => collectSlot(part.slot, refs));
        collectSlot(profile.expressions, refs);
        collectSlot(profile.master, refs);
        collectSlot(profile.card, refs);
        for (const state of profile.states) collectSlot(state.look, refs);
    }
    for (const variant of asset.location?.variants || []) collectSlot(variant.concept, refs);
}

function collectProjectMedia(project: FilmProject, refs: MediaRef[]) {
    [...(project.characters || []), ...(project.locations || []), ...(project.props || []), ...(project.costumes || [])].forEach((asset) => collectAssetMedia(asset, refs));
    if (project.style) collectAssetMedia(project.style, refs);
    for (const episode of project.episodes || []) {
        for (const scene of episode.scenes) {
            for (const shot of scene.shots) {
                if (shot.storageKey || shot.imageUrl) refs.push({ storageKey: shot.storageKey, url: shot.imageUrl, kind: "image" });
                if (shot.videoStorageKey || shot.videoUrl) refs.push({ storageKey: shot.videoStorageKey, url: shot.videoUrl, kind: "media" });
                for (const version of shot.imageVersions || []) refs.push({ storageKey: version.storageKey, url: version.url, kind: "image" });
                for (const version of shot.videoVersions || []) refs.push({ storageKey: version.storageKey, url: version.url, kind: "media" });
                for (const frame of [shot.firstFrame, shot.lastFrame]) {
                    if (frame) refs.push({ storageKey: frame.storageKey, url: frame.url, kind: "image" });
                }
            }
        }
    }
}

function collectRefs(projects: FilmProject[], library: FilmAsset[]) {
    const refs: MediaRef[] = [];
    projects.forEach((project) => collectProjectMedia(project, refs));
    library.forEach((asset) => collectAssetMedia(asset, refs));
    return refs;
}

/** 是否还有未升级到云存储的本地媒体。 */
export function filmMediaNeedsPromotion(projects: FilmProject[], library: FilmAsset[]) {
    return collectRefs(projects, library).some((ref) => isLocalKey(ref.storageKey) || (!ref.storageKey && isLocalUrl(ref.url)));
}

async function serverStorageAvailable() {
    const config = await loadStorageConfig().catch(() => null);
    if (!config) return false;
    return canUseGlobalStorage(config) || Boolean(config.allowUserProvider && loadUserStorageProvider());
}

/** 收集并上传项目中仍在本地的图片/视频，返回旧键到云存储键的替换表。 */
export async function collectFilmMediaPromotions(projects: FilmProject[], library: FilmAsset[], token: string, concurrency = PROMOTE_CONCURRENCY) {
    if (!(await serverStorageAvailable())) return new Map<string, FilmMediaReplacement>();
    const refs = collectRefs(projects, library);
    const unique = new Map<string, MediaRef>();
    for (const ref of refs) {
        const key = mediaKey(ref);
        if (key && !unique.has(key)) unique.set(key, ref);
    }
    await runLimited([...unique.values()].map((ref) => () => promoteOne(ref, token)), concurrency);
    if (useUserStore.getState().token !== token) return new Map<string, FilmMediaReplacement>();
    const replacements = new Map<string, FilmMediaReplacement>();
    for (const key of unique.keys()) {
        const replacement = promotionCache.get(key);
        if (replacement) replacements.set(key, replacement);
    }
    return replacements;
}

function applyPromotions<T>(value: T, replacements: Map<string, FilmMediaReplacement>): { value: T; changed: boolean } {
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
            if (dimensions && "url" in record) {
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
        replaceKey("storageKey", ["url", "imageUrl"], true);
        replaceKey("videoStorageKey", ["videoUrl"]);
        replaceUrl("url", "storageKey", true);
        replaceUrl("imageUrl", "storageKey", true);
        replaceUrl("videoUrl", "videoStorageKey");
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

export function applyFilmMediaPromotionsToProjects(projects: FilmProject[], replacements: Map<string, FilmMediaReplacement>) {
    let changed = false;
    const next = projects.map((project) => {
        const applied = applyPromotions(project, replacements);
        if (!applied.changed) return project;
        changed = true;
        return { ...applied.value, updatedAt: new Date().toISOString() };
    });
    return { projects: changed ? next : projects, changed };
}

export type FilmLibraryMediaSnapshot = {
    characters: FilmAsset[];
    locations: FilmAsset[];
    props: FilmAsset[];
    costumes: FilmAsset[];
    styles: FilmAsset[];
};

export function applyFilmMediaPromotionsToLibrary(library: FilmLibraryMediaSnapshot, replacements: Map<string, FilmMediaReplacement>) {
    let changed = false;
    const applyList = (assets: FilmAsset[]) => assets.map((asset) => {
        const applied = applyPromotions(asset, replacements);
        if (!applied.changed) return asset;
        changed = true;
        return { ...applied.value, updatedAt: new Date().toISOString() };
    });
    const next = {
        characters: applyList(library.characters),
        locations: applyList(library.locations),
        props: applyList(library.props),
        costumes: applyList(library.costumes),
        styles: applyList(library.styles),
    };
    return { library: changed ? next : library, changed };
}
