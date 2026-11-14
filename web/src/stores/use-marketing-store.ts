"use client";

import { create } from "zustand";
import { readAccountStorage, accountStorageKey, currentAccountId } from "@/lib/account-storage";
import { localForageStorage } from "@/lib/localforage-storage";
import { MARKETING_STORE_KEY } from "@/lib/storage-keys";
import { marketingAssetIds, type MarketingWorkspace, type MarketingWorkspaceSummary } from "@/lib/marketing";
import { fetchMarketingWorkspace, fetchMarketingWorkspaces, saveMarketingWorkspace, deleteMarketingWorkspace, fetchMarketingAssetReferences } from "@/services/api/marketing";
import { useAssetStore } from "./use-asset-store";
import { useUserStore } from "./use-user-store";

type MarketingState = {
    workspaces: MarketingWorkspaceSummary[];
    details: Record<string, MarketingWorkspace>;
    offline: boolean;
    loaded: boolean;
    loading: boolean;
    load: (refresh?: boolean) => Promise<void>;
    ensureDetail: (id: string, force?: boolean) => Promise<MarketingWorkspace>;
    save: (workspace: MarketingWorkspace) => Promise<MarketingWorkspace>;
    remove: (id: string) => Promise<void>;
    getFresh: (id: string) => Promise<MarketingWorkspace>;
};
let loading: Promise<void> | null = null;

function summaryOf(workspace: MarketingWorkspace): MarketingWorkspaceSummary {
    return { id: workspace.id, ownerUserId: workspace.ownerUserId, name: workspace.name, industry: workspace.industry, revision: workspace.revision, createdAt: workspace.createdAt, updatedAt: workspace.updatedAt };
}

function readCache(value: string | null) {
    if (!value) return { workspaces: [], details: [] };
    try {
        const state = (JSON.parse(value) as { state?: { workspaces?: unknown; details?: unknown } }).state;
        return {
            workspaces: Array.isArray(state?.workspaces) ? state.workspaces as MarketingWorkspaceSummary[] : [],
            details: Array.isArray(state?.details) ? state.details as MarketingWorkspace[] : [],
        };
    } catch {
        return { workspaces: [], details: [] };
    }
}

async function persist(workspaces: MarketingWorkspaceSummary[], details: Record<string, MarketingWorkspace>) {
    await localForageStorage.setItem(accountStorageKey(MARKETING_STORE_KEY), JSON.stringify({ state: { workspaces, details: Object.values(details) } }));
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
    workspaces: [], details: {}, offline: false, loaded: false, loading: false,
    load: async (refresh = false) => {
        if (loading) return loading;
        if (get().loaded && !refresh) return;
        const owner = currentAccountId();
        const token = useUserStore.getState().token;
        set({ loading: true });
        loading = (async () => {
            const { value } = await readAccountStorage(MARKETING_STORE_KEY);
            const cached = readCache(value);
            let workspaces = cached.workspaces;
            const details: Record<string, MarketingWorkspace> = Object.fromEntries(cached.details.map((item) => [item.id, item]));
            let offline = false;
            if (token) {
                const summaries: MarketingWorkspaceSummary[] = [];
                let fetched = false;
                try {
                    for (let page = 1; ; page++) {
                        const result = await fetchMarketingWorkspaces(token, page);
                        summaries.push(...result.items);
                        if (summaries.length >= result.total) break;
                    }
                    fetched = true;
                } catch (error) {
                    if (!cached.workspaces.length && !cached.details.length) throw error;
                    offline = true;
                }
                if (fetched) {
                    workspaces = summaries;
                    for (const [id, detail] of Object.entries(details)) {
                        const summary = workspaces.find((item) => item.id === id);
                        if (detail.ownerUserId && (!summary || summary.revision !== detail.revision)) delete details[id];
                    }
                    for (const entry of cached.details.filter((item) => !item.ownerUserId && !workspaces.some((remote) => remote.id === item.id))) {
                        try {
                            await persistMarketingAssets(entry, token);
                            const saved = await saveMarketingWorkspace(token, { ...entry, revision: 0 });
                            workspaces.unshift(summaryOf(saved));
                            details[saved.id] = saved;
                        } catch {
                            workspaces.push(summaryOf(entry));
                            details[entry.id] = entry;
                        }
                    }
                    for (const [id, detail] of Object.entries(details)) {
                        if (!detail.ownerUserId && workspaces.some((item) => item.id === id)) delete details[id];
                    }
                } else if (!workspaces.length && cached.details.length) {
                    workspaces = cached.details.map(summaryOf);
                }
            } else {
                workspaces = cached.details.map(summaryOf);
                const known = new Set(workspaces.map((item) => item.id));
                workspaces.push(...cached.workspaces.filter((item) => !known.has(item.id)));
            }
            if (owner !== currentAccountId()) return;
            await persist(workspaces, details);
            set({ workspaces, details, offline, loaded: true });
        })().finally(() => { loading = null; if (owner === currentAccountId()) set({ loading: false }); });
        return loading;
    },
    ensureDetail: async (id, force = false) => {
        const owner = currentAccountId();
        const findSummary = () => get().workspaces.find((item) => item.id === id);
        let summary = findSummary();
        if (!summary) {
            await get().load();
            summary = findSummary();
            if (!summary) throw new Error("营销资料已删除，请重新选择");
        }
        const cached = get().details[id];
        if (cached && !force) return cached;
        const token = useUserStore.getState().token;
        if (!token || !summary.ownerUserId) {
            if (cached) return cached;
            throw new Error("营销资料详情尚未加载，请联网后刷新");
        }
        const fetched = await fetchMarketingWorkspace(token, id);
        if (owner !== currentAccountId()) throw new Error("账号已切换");
        const workspaces = [summaryOf(fetched), ...get().workspaces.filter((entry) => entry.id !== id)];
        const details = { ...get().details, [id]: fetched };
        await persist(workspaces, details);
        set({ workspaces, details, offline: false });
        return fetched;
    },
    save: async (input) => {
        const owner = currentAccountId();
        const token = useUserStore.getState().token;
        let saved: MarketingWorkspace;
        if (token) {
            await persistMarketingAssets(input, token);
            saved = await saveMarketingWorkspace(token, input);
        } else {
            const existing = get().details[input.id];
            if ((existing?.revision || 0) !== input.revision) throw new Error("资料已更新，请刷新后重新编辑");
            const now = new Date().toISOString();
            saved = { ...input, ownerUserId: "", revision: input.revision + 1, createdAt: existing?.createdAt || now, updatedAt: now };
        }
        if (owner !== currentAccountId()) throw new Error("账号已切换，请重新打开营销资料");
        const workspaces = [summaryOf(saved), ...get().workspaces.filter((item) => item.id !== saved.id)];
        const details = { ...get().details, [saved.id]: saved };
        await persist(workspaces, details);
        set({ workspaces, details, ...(token ? { offline: false } : {}) });
        return saved;
    },
    remove: async (id) => {
        const owner = currentAccountId();
        const summary = get().workspaces.find((entry) => entry.id === id);
        if (!summary) return;
        const token = useUserStore.getState().token;
        if (token && summary.ownerUserId) await deleteMarketingWorkspace(token, id, summary.revision);
        if (owner !== currentAccountId()) return;
        const workspaces = get().workspaces.filter((entry) => entry.id !== id);
        const details = { ...get().details };
        delete details[id];
        await persist(workspaces, details);
        set({ workspaces, details });
    },
    getFresh: async (id) => get().ensureDetail(id, true),
}));

export async function assertMarketingAssetCanBeRemoved(id: string) {
    await useMarketingStore.getState().load(true);
    const local = Object.values(useMarketingStore.getState().details).filter((workspace) => marketingAssetIds(workspace).includes(id));
    if (local.length) throw new Error(`素材仍被「${local.map((item) => item.name).join("、")}」引用，请先解除营销资料中的引用`);
    const token = useUserStore.getState().token;
    if (token && (await fetchMarketingAssetReferences(token)).includes(id)) throw new Error("素材仍被营销资料引用，请先解除引用");
}
