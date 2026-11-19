export type HydratableStore = {
    persist: {
        hasHydrated: () => boolean;
        onFinishHydration: (listener: () => void) => () => void;
    };
};

export async function waitForStoreHydration(store: HydratableStore) {
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
