import { create } from "zustand";
import type { PersistStorage, StorageValue } from "zustand/middleware";

import { accountStorageKey, readAccountStorage } from "@/lib/account-storage";
import { localForageStorage } from "@/lib/localforage-storage";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type SaveSyncStatus = "idle" | "syncing" | "synced" | "error";

type SaveStatusState = {
    status: SaveStatus;
    syncStatus: SaveSyncStatus;
    setStatus: (status: SaveStatus) => void;
    setSyncStatus: (status: SaveSyncStatus) => void;
};

/** 本地保存与账号同步分开记录，避免一方成功覆盖另一方失败。 */
export const useSaveStatusStore = create<SaveStatusState>((set) => ({
    status: "idle",
    syncStatus: "idle",
    setStatus: (status) => set({ status }),
    setSyncStatus: (syncStatus) => set({ syncStatus }),
}));

/**
 * 带防抖的 localforage 持久化：连续输入只落盘一次，并把保存状态推给 useSaveStatusStore。
 * 数据仍只保存在本机浏览器，不做云端同步。
 */
export function createDebouncedJSONStorage<S>(delay = 400): PersistStorage<S> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { key: string; value: StorageValue<S> } | null = null;

    const flush = () => {
        timer = null;
        const next = pending;
        pending = null;
        if (!next) return;
        void Promise.resolve(localForageStorage.setItem(next.key, JSON.stringify(next.value)))
            .then(() => useSaveStatusStore.getState().setStatus("saved"))
            .catch(() => useSaveStatusStore.getState().setStatus("error"));
    };

    return {
        getItem: async (name) => {
            const { value: raw } = await readAccountStorage(name);
            if (!raw) return null;
            try {
                return JSON.parse(raw) as StorageValue<S>;
            } catch {
                return null;
            }
        },
        setItem: (name, value) => {
            // 落盘键在入队时定好：防抖期间切换账号也要写回原账号分区。
            pending = { key: accountStorageKey(name), value };
            useSaveStatusStore.getState().setStatus("saving");
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, delay);
        },
        removeItem: (name) => {
            pending = null;
            if (timer) clearTimeout(timer);
            useSaveStatusStore.getState().setStatus("idle");
            return localForageStorage.removeItem(accountStorageKey(name));
        },
    };
}
