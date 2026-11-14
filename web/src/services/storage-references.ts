import { readOtherAccountStates } from "@/lib/account-storage";
import { collectMediaStorageKeys } from "@/services/file-storage";
import { collectImageStorageKeys } from "@/services/image-storage";

type GenerationLog = {
    images?: Array<{ storageKey?: string } | null>;
    references?: Array<{ storageKey?: string } | null>;
    video?: { storageKey?: string } | null;
};

type HydratableStore = {
    persist: {
        hasHydrated: () => boolean;
        onFinishHydration: (listener: () => void) => () => void;
    };
};

async function waitForHydration(store: HydratableStore) {
    if (store.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
        const unsubscribe = store.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
        });
        if (store.persist.hasHydrated()) {
            unsubscribe();
            resolve();
        }
    });
}

/** 收集所有本地业务数据中引用到的媒体存储键；画布、影视、素材、Skills、生成历史和其他账号分区都算。 */
export async function collectStorageReferences({ assets, skills, extra }: { assets?: unknown; skills?: unknown; extra?: unknown } = {}) {
    const { useCanvasStore, CANVAS_STORE_KEY } = await import("@/app/(user)/canvas/stores/use-canvas-store");
    const { useFilmStore, FILM_STORE_KEY } = await import("@/stores/use-film-store");
    const { useFilmCastStore, FILM_CAST_STORE_KEY } = await import("@/stores/use-film-cast-store");
    const { ASSET_STORE_KEY } = await import("@/stores/use-asset-store");
    await Promise.all([waitForHydration(useCanvasStore), waitForHydration(useFilmStore), waitForHydration(useFilmCastStore)]);
    const cast = useFilmCastStore.getState();
    return {
        assets,
        projects: useCanvasStore.getState().projects,
        filmProjects: useFilmStore.getState().projects,
        filmCast: { characters: cast.characters, locations: cast.locations },
        skills,
        extra,
        logKeys: await collectGenerationLogKeys(),
        otherAccounts: [
            ...(await readOtherAccountStates(CANVAS_STORE_KEY)),
            ...(await readOtherAccountStates(ASSET_STORE_KEY)),
            ...(await readOtherAccountStates(FILM_STORE_KEY)),
            ...(await readOtherAccountStates(FILM_CAST_STORE_KEY)),
        ],
    };
}

/** 图片与媒体存储键共用一份收集口径，避免删除链路只认其中一种前缀。 */
export function collectStorageReferenceKeys(data: unknown) {
    return collectMediaStorageKeys(data, collectImageStorageKeys(data, new Set<string>()));
}

async function collectGenerationLogKeys() {
    const keys: string[] = [];
    try {
        const localforage = (await import("localforage")).default;
        for (const storeName of ["image_generation_logs", "video_generation_logs"]) {
            const store = localforage.createInstance({ name: "infinite-canvas", storeName });
            await store.iterate<GenerationLog, void>((log) => {
                log?.images?.forEach((image) => {
                    if (image?.storageKey) keys.push(image.storageKey);
                });
                log?.references?.forEach((ref) => {
                    if (ref?.storageKey) keys.push(ref.storageKey);
                });
                if (log?.video?.storageKey) keys.push(log.video.storageKey);
            });
        }
    } catch (error) {
        console.error("Error gathering generation log storage keys", error);
    }
    return keys;
}
