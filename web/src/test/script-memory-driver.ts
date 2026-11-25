import localforage from "localforage";

let driverCount = 0;

export async function installScriptMemoryDriver() {
    const driverName = `script-test-memory-${++driverCount}`;
    const values = new Map<string, unknown>();
    await localforage.defineDriver({
        _driver: driverName,
        _initStorage: () => Promise.resolve(),
        _support: () => Promise.resolve(true),
        clear: async () => { values.clear(); },
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: unknown) => {
            values.set(key, value);
            return value;
        },
        removeItem: async (key: string) => { values.delete(key); },
        key: async (index: number) => Array.from(values.keys())[index] ?? null,
        keys: async () => Array.from(values.keys()),
        length: async () => values.size,
        iterate: async (callback: (value: unknown, key: string, index: number) => unknown) => {
            for (const [index, [key, value]] of Array.from(values.entries()).entries()) {
                if (callback(value, key, index) === false) break;
            }
        },
    } as unknown as Parameters<typeof localforage.defineDriver>[0]);
    await localforage.setDriver(driverName);
    return async () => { values.clear(); };
}
