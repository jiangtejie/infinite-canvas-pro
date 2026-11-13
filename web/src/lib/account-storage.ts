import localforage from "localforage";

import { localForageStorage } from "@/lib/localforage-storage";
import { useUserStore } from "@/stores/use-user-store";

/** 本地业务数据的归属账号；未登录统一落在 guest 分区。 */
export function currentAccountId() {
    return useUserStore.getState().user?.id || "guest";
}

/** 业务数据按账号分区，避免同一浏览器换账号后读到上一个账号的本地内容。 */
export function accountStorageKey(baseKey: string) {
    return `${baseKey}:${encodeURIComponent(currentAccountId())}`;
}

async function waitForUserStoreHydration() {
    if (useUserStore.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
        const unsubscribe = useUserStore.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
        });
        if (useUserStore.persist.hasHydrated()) {
            unsubscribe();
            resolve();
        }
    });
}

/** 账号分区的 localStorage 视图：模型渠道、API Key、用户存储配置这类小配置同样按账号隔离。 */
export const accountLocalStorage = {
    getItem: (name: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(accountStorageKey(name))),
    setItem: (name: string, value: string) => {
        if (typeof window !== "undefined") window.localStorage.setItem(accountStorageKey(name), value);
    },
    removeItem: (name: string) => {
        if (typeof window !== "undefined") window.localStorage.removeItem(accountStorageKey(name));
    },
};

/**
 * 读账号分区；账号分区还没有数据时接管游客分区，保住「先本地创作、登录后同步」。
 * 先写账号分区再清游客分区，同一份游客数据不会被两个账号重复接管。
 */
export async function readAccountStorage(baseKey: string) {
    await waitForUserStoreHydration();
    const key = accountStorageKey(baseKey);
    const value = await localForageStorage.getItem(key);
    if (value || currentAccountId() === "guest") return { key, value };
    const guestKey = `${baseKey}:guest`;
    const guestValue = await localForageStorage.getItem(guestKey);
    if (!guestValue) return { key, value: null };
    await localForageStorage.setItem(key, guestValue);
    await localForageStorage.removeItem(guestKey);
    return { key, value: guestValue };
}

/**
 * 账号分区的 localforage 视图：键加账号前缀，读写只看当前账号。
 * 底层仍是同一个 store，跨账号共用的 blob 清理照常能扫到全部账号的引用。
 */
export function accountScopedStore(storeName: string) {
    const store = localforage.createInstance({ name: "infinite-canvas", storeName });
    const prefix = () => `${encodeURIComponent(currentAccountId())}:`;
    const ownedKeys = async () => (await store.keys()).filter((key) => key.startsWith(prefix()));
    return {
        getItem: <T>(key: string) => store.getItem<T>(prefix() + key),
        setItem: <T>(key: string, value: T) => store.setItem(prefix() + key, value),
        removeItem: (key: string) => store.removeItem(prefix() + key),
        keys: async () => (await ownedKeys()).map((key) => key.slice(prefix().length)),
        clear: async () => {
            await Promise.all((await ownedKeys()).map((key) => store.removeItem(key)));
        },
        iterate: <T, U>(callback: (value: T, key: string, iterationNumber: number) => U) =>
            store.iterate<T, U | undefined>((value, key, iterationNumber) =>
                key.startsWith(prefix()) ? callback(value, key.slice(prefix().length), iterationNumber) : undefined,
            ),
    };
}

/**
 * 图片 / 视频 blob 池是跨账号共用的内容寻址存储，清理前必须把其他账号分区的引用也算进来，
 * 否则会删掉只被别的账号画布或素材引用的 blob。
 */
export async function readOtherAccountStates(baseKey: string) {
    const prefix = `${baseKey}:`;
    const currentKey = accountStorageKey(baseKey);
    const keys = (await localforage.keys()).filter((key) => key.startsWith(prefix) && key !== currentKey);
    const states = await Promise.all(
        keys.map(async (key) => {
            const raw = await localforage.getItem<string>(key);
            if (!raw) return null;
            try {
                return (JSON.parse(raw) as { state?: unknown }).state ?? null;
            } catch {
                return null;
            }
        }),
    );
    return states.filter((state) => state !== null);
}