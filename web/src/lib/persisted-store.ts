import { create } from "zustand";
import type { PersistStorage, StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type SaveStatusState = {
    status: SaveStatus;
    setStatus: (status: SaveStatus) => void;
};

/** 全局保存状态：影剧 / 剧本 / 角色库共用，页面顶栏据此显示真实的保存进度。 */
export const useSaveStatusStore = create<SaveStatusState>((set) => ({
    status: "idle",
    setStatus: (status) => set({ status }),
}));

/**
 * 带防抖的 localforage 持久化：连续输入只落盘一次，并把保存状态推给 useSaveStatusStore。
 * 数据仍只保存在本机浏览器，不做云端同步。
 */
export function createDebouncedJSONStorage<S>(delay = 400): PersistStorage<S> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { name: string; value: StorageValue<S> } | null = null;

    const flush = () => {
        timer = null;
        const next = pending;
        pending = null;
        if (!next) return;
        void Promise.resolve(localForageStorage.setItem(next.name, JSON.stringify(next.value)))
            .then(() => useSaveStatusStore.getState().setStatus("saved"))
            .catch(() => useSaveStatusStore.getState().setStatus("error"));
    };

    return {
        getItem: async (name) => {
            const raw = await localForageStorage.getItem(name);
            if (!raw) return null;
            try {
                return JSON.parse(raw) as StorageValue<S>;
            } catch {
                return null;
            }
        },
        setItem: (name, value) => {
            pending = { name, value };
            useSaveStatusStore.getState().setStatus("saving");
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, delay);
        },
        removeItem: (name) => {
            pending = null;
            if (timer) clearTimeout(timer);
            useSaveStatusStore.getState().setStatus("idle");
            return localForageStorage.removeItem(name);
        },
    };
}
