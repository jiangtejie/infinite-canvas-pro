"use client";

import { create } from "zustand";
import { readAccountStorage, accountStorageKey, currentAccountId } from "@/lib/account-storage";
import { localForageStorage } from "@/lib/localforage-storage";
import { marketingAssetIds, type MarketingWorkspace } from "@/lib/marketing";
import { fetchMarketingWorkspace, fetchMarketingWorkspaces, saveMarketingWorkspace, deleteMarketingWorkspace, fetchMarketingAssetReferences } from "@/services/api/marketing";
import { useAssetStore } from "./use-asset-store";
import { useUserStore } from "./use-user-store";

export const MARKETING_STORE_KEY = "infinite-canvas:marketing_store";
type MarketingState = {
    workspaces: MarketingWorkspace[];
    loaded: boolean;
    loading: boolean;
    load: (refresh?: boolean) => Promise<void>;
    save: (workspace: MarketingWorkspace) => Promise<MarketingWorkspace>;
    remove: (id: string) => Promise<void>;
    getFresh: (id: string) => Promise<MarketingWorkspace>;
};
let loading: Promise<void> | null = null;
async function persist(workspaces: MarketingWorkspace[]) {
    await localForageStorage.setItem(accountStorageKey(MARKETING_STORE_KEY), JSON.stringify({ state: { workspaces } }));
}

/** 营销资料跨设备可用前，先把引用的图片同步进账号云存储，并把存储键写回引用。 */
async function persistMarketingAssets(workspace: MarketingWorkspace, token: string) {
    const ids = marketingAssetIds(workspace);
    if (!ids.length) return;
    await useAssetStore.getState().syncMarketingAssets(token, ids);
    const keys = new Map(useAssetStore.getState().assets.filter((asset) => asset.kind === "image").map((asset) => [asset.id, asset.data.storageKey]));
    for (const owner of [workspace, ...workspace.brands, ...workspace.locations, ...workspace.offerings]) {
        owner.assets = owner.assets.map((ref) => ({ ...ref, storageKey: keys.get(ref.assetId) || "" }));
    }
}

export const useMarketingStore = create<MarketingState>((set, get) => ({
    workspaces: [], loaded: false, loading: false,
    load: async (refresh = false) => {
        if (loading) return loading;
        if (get().loaded && !refresh) return;
        const owner = currentAccountId();
        const token = useUserStore.getState().token;
        set({ loading: true });
        loading = (async () => {
            const { value } = await readAccountStorage(MARKETING_STORE_KEY);
            const local: MarketingWorkspace[] = value ? JSON.parse(value).state.workspaces : [];
            let workspaces = local;
            if (token) {
                const summaries: MarketingWorkspace[] = [];
                for (let page = 1; ; page++) {
                    const result = await fetchMarketingWorkspaces(token, page);
                    summaries.push(...result.items);
                    if (summaries.length >= result.total) break;
                }
                workspaces = await Promise.all(summaries.map((item) => fetchMarketingWorkspace(token, item.id)));
                for (const entry of local.filter((item) => !item.ownerUserId && !workspaces.some((remote) => remote.id === item.id))) {
                    try {
                        await persistMarketingAssets(entry, token);
                        workspaces.push(await saveMarketingWorkspace(token, { ...entry, revision: 0 }));
                    } catch {
                        workspaces.push(entry);
                    }
                }
            }
            if (owner !== currentAccountId()) return;
            await persist(workspaces);
            set({ workspaces, loaded: true });
        })().finally(() => { loading = null; if (owner === currentAccountId()) set({ loading: false }); });
        return loading;
    },
    save: async (input) => {
        const owner = currentAccountId();
        const token = useUserStore.getState().token;
        let saved: MarketingWorkspace;
        if (token) {
            await persistMarketingAssets(input, token);
            saved = await saveMarketingWorkspace(token, input);
        } else {
            const existing = get().workspaces.find((item) => item.id === input.id);
            if ((existing?.revision || 0) !== input.revision) throw new Error("资料已更新，请刷新后重新编辑");
            const now = new Date().toISOString();
            saved = { ...input, ownerUserId: "", revision: input.revision + 1, createdAt: existing?.createdAt || now, updatedAt: now };
        }
        if (owner !== currentAccountId()) throw new Error("账号已切换，请重新打开营销资料");
        const workspaces = [saved, ...get().workspaces.filter((item) => item.id !== saved.id)];
        await persist(workspaces);
        set({ workspaces });
        return saved;
    },
    remove: async (id) => {
        const owner = currentAccountId();
        const item = get().workspaces.find((entry) => entry.id === id);
        if (!item) return;
        const token = useUserStore.getState().token;
        if (token && item.ownerUserId) await deleteMarketingWorkspace(token, id, item.revision);
        if (owner !== currentAccountId()) return;
        const workspaces = get().workspaces.filter((entry) => entry.id !== id);
        await persist(workspaces);
        set({ workspaces });
    },
    getFresh: async (id) => {
        const token = useUserStore.getState().token;
        if (!token) {
            await get().load();
            const item = get().workspaces.find((entry) => entry.id === id);
            if (!item) throw new Error("营销资料已删除，请重新选择");
            return item;
        }
        const owner = currentAccountId();
        const item = await fetchMarketingWorkspace(token, id).catch((error) => {
            // 登录后未能接管的游客资料仍可在本机继续策划，删改时再按云存储要求处理。
            const local = get().workspaces.find((entry) => entry.id === id && !entry.ownerUserId);
            if (local) return local;
            throw error;
        });
        if (owner !== currentAccountId()) throw new Error("账号已切换");
        const workspaces = [item, ...get().workspaces.filter((entry) => entry.id !== id)];
        await persist(workspaces);
        set({ workspaces });
        return item;
    },
}));

export async function assertMarketingAssetCanBeRemoved(id: string) {
    await useMarketingStore.getState().load(true);
    const local = useMarketingStore.getState().workspaces.filter((workspace) => marketingAssetIds(workspace).includes(id));
    if (local.length) throw new Error(`素材仍被「${local.map((item) => item.name).join("、")}」引用，请先解除营销资料中的引用`);
    const token = useUserStore.getState().token;
    if (token && (await fetchMarketingAssetReferences(token)).includes(id)) throw new Error("素材仍被营销资料引用，请先解除引用");
}

