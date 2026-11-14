"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { accountStorageKey, readAccountStorage } from "@/lib/account-storage";
import { localForageStorage } from "@/lib/localforage-storage";
import { ASSET_STORE_KEY } from "@/lib/storage-keys";
import { collectStorageReferenceKeys } from "@/lib/storage-reference-keys";
import { cleanupUnusedImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";
import { collectStorageReferences } from "@/services/storage-references";
import { fetchUserAssetData, syncUserAssetData } from "@/services/api/user-config";
import { useUserStore } from "@/stores/use-user-store";

export type AssetKind = "text" | "image" | "video" | "audio";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type AudioAsset = AssetBase<"audio"> & { data: { url: string; storageKey?: string; bytes?: number; mimeType: string; durationMs?: number } };
export type Asset = TextAsset | ImageAsset | VideoAsset | AudioAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    category?: string;
    source?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => Promise<void>;
    removeAsset: (id: string) => void;
    hydrateAccountAssets: (token: string, syncEnabled?: boolean) => Promise<void>;
    syncAccountAssets: (token: string) => Promise<void>;
    syncMarketingAssets: (token: string, assetIds: string[]) => Promise<void>;
    stopAccountAssetSync: () => void;
    cleanupImages: (extra?: unknown, storageKeys?: ReadonlyMap<string, string>, ownerToken?: string) => void;
};

let activeAssetSyncToken = "";
let accountAssetSyncEnabled = false;
let isHydratingAccountAssets = false;
let hydratedAccountToken = "";
let hydratedAccountAt = 0;
let syncTimer: number | null = null;

type AssetSnapshot = { assets: Asset[] };

async function resolveStoredAsset(asset: Asset): Promise<Asset> {
    if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
    if (asset.kind === "audio" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
    if (asset.kind !== "image") return asset;
    if (asset.data.storageKey)
        return {
            ...asset,
            coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
            data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
        };
    if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
    const image = await uploadImage(asset.data.dataUrl);
    return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
}

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const { value } = await readAccountStorage(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.assets = await Promise.all(parsed.state.assets.map(resolveStoredAsset));
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(accountStorageKey(name), JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(accountStorageKey(name)),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            assets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                scheduleAssetSync(get);
                return id;
            },
            updateAsset: async (id, patch) => {
                set((state) => ({ assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)) }));
                scheduleAssetSync(get);
            },
            removeAsset: (id) =>
                set((state) => {
                    const deletedAsset = state.assets.find((asset) => asset.id === id);
                    const assets = state.assets.filter((asset) => asset.id !== id);

                    if (deletedAsset && deletedAsset.kind !== "text" && deletedAsset.data.storageKey) {
                        const key = deletedAsset.data.storageKey;
                        window.setTimeout(async () => {
                            try {
                                const usedKeys = collectStorageReferenceKeys(await collectStorageReferences({ assets }));
                                // 若全站没有其他地方再引用此 storageKey，则执行真正的物理删除
                                if (!usedKeys.has(key)) {
                                    if (key.startsWith("image:") || key.startsWith("server:")) {
                                        const { deleteStoredImages } = await import("@/services/image-storage");
                                        await deleteStoredImages([key]);
                                    }
                                    if (key.startsWith("file:") || key.startsWith("video:") || key.startsWith("server:")) {
                                        const { deleteStoredMedia } = await import("@/services/file-storage");
                                        await deleteStoredMedia([key]);
                                    }
                                }
                            } catch (error) {
                                console.error("Error cleaning up removed asset", error);
                            }
                        }, 0);
                    }

                    window.setTimeout(() => scheduleAssetSync(get), 0);
                    return { assets };
                }),
            hydrateAccountAssets: async (token, syncEnabled = false) => {
                if (!token) return;
                if (!syncEnabled && token === hydratedAccountToken && Date.now() - hydratedAccountAt < 15_000) return;
                activeAssetSyncToken = token;
                accountAssetSyncEnabled = syncEnabled;
                isHydratingAccountAssets = true;
                let succeeded = false;
                try {
                    const remote = await fetchUserAssetData<AssetSnapshot>(token);
                    const remoteAssets = await Promise.all(
                        (Array.isArray(remote?.assets) ? remote.assets : []).map((asset) =>
                            asset.kind === "image" && asset.data.storageKey?.startsWith("image:") ? resolveStoredAsset(asset) : asset,
                        ),
                    );
                    if (syncEnabled) {
                        const localAssets = get().assets;
                        const remoteIds = new Set(remoteAssets.map((asset) => asset.id));
                        const assets = mergeAssets(remoteAssets, localAssets);
                        set({ assets });
                        // 本地独有的素材（含游客期创作、接管过来的游客分区）要补传，否则会被远端列表直接覆盖掉。
                        if (localAssets.some((asset) => !remoteIds.has(asset.id))) await syncUserAssetData(token, { assets });
                    } else {
                        const localHasAssets = get().assets.length > 0;
                        if (!localHasAssets && remoteAssets.length) {
                            set({ assets: remoteAssets });
                        }
                    }
                    succeeded = true;
                } finally {
                    isHydratingAccountAssets = false;
                    if (succeeded) {
                        hydratedAccountToken = token;
                        hydratedAccountAt = Date.now();
                    }
                }
            },
            syncAccountAssets: async (token) => {
                if (!token || !accountAssetSyncEnabled) return;
                await syncUserAssetData(token, { assets: get().assets });
            },
            syncMarketingAssets: async (token, assetIds) => {
                if (!token) throw new Error("营销资料图片跨设备复用需要先登录");
                const ids = new Set(assetIds);
                const currentAssets = get().assets;
                const targetAssets = currentAssets.filter((asset) => ids.has(asset.id) && asset.kind === "image");
                if (targetAssets.length !== ids.size) throw new Error("营销资料引用的图片已不在当前账号的我的素材中");
                const unresolved = targetAssets.filter((asset) => asset.kind === "image" && !asset.data.storageKey?.startsWith("server:"));
                if (unresolved.length) {
                    for (const asset of unresolved) {
                        const image = asset as Extract<Asset, { kind: "image" }>;
                        const result = await uploadImage(image.data.dataUrl);
                        if (!result.storageKey.startsWith("server:")) throw new Error("营销图片没有保存到账号云存储，请检查存储权限后重试");
                        await get().updateAsset(image.id, { data: { ...image.data, ...result }, coverUrl: result.url });
                    }
                }
                if (get().assets.some((asset) => ids.has(asset.id) && asset.kind === "image" && !asset.data.storageKey?.startsWith("server:"))) throw new Error("营销图片同步未完成");
                await syncUserAssetData(token, { assets: get().assets });
            },
            stopAccountAssetSync: () => {
                activeAssetSyncToken = "";
                if (syncTimer) window.clearTimeout(syncTimer);
                syncTimer = null;
            },
            cleanupImages: (extra, storageKeys, ownerToken) => {
                window.setTimeout(async () => {
                    const { loadLocalAgentSkills, useAgentSkillStore } = await import("@/stores/use-agent-skill-store");
                    let skills: unknown;
                    try {
                        await useAgentSkillStore.getState().loadSkills();
                        const skillStore = useAgentSkillStore.getState();
                        const localSkills = useUserStore.getState().token ? await loadLocalAgentSkills() : [];
                        skills = [...skillStore.systemSkills, ...skillStore.userSkills, ...localSkills];
                    } catch (error) {
                        console.error("Error gathering Skill keys in cleanupImages", error);
                    }
                    try {
                        const used = await collectStorageReferences({ assets: get().assets, skills, extra });
                        await cleanupUnusedImages(used, storageKeys, ownerToken);
                        await cleanupUnusedMedia(used);
                    } catch (error) {
                        console.error("Error cleaning up unused media", error);
                    }
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
        },
    ),
);

function scheduleAssetSync(get: () => AssetStore) {
    if (isHydratingAccountAssets || !activeAssetSyncToken || !accountAssetSyncEnabled || typeof window === "undefined") return;
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
        void get().syncAccountAssets(activeAssetSyncToken).catch(() => {});
    }, 600);
}

export function mergeAssets(remoteAssets: Asset[], localAssets: Asset[]) {
    const records = new Map<string, Asset>();
    [...localAssets, ...remoteAssets].forEach((asset) => {
        const previous = records.get(asset.id);
        if (!previous || Date.parse(asset.updatedAt || "") >= Date.parse(previous.updatedAt || "")) {
            records.set(asset.id, asset);
        }
    });
    return Array.from(records.values()).sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
}
