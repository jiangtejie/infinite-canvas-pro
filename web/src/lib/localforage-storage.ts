import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        return (await localforage.getItem<string>(name)) || null;
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.setItem(name, value);
        } catch (error) {
            console.error("[storage] 本地数据写入失败", name, error);
            throw error;
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        await localforage.removeItem(name);
    },
};
