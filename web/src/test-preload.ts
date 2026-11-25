import localforage from "localforage";

const driverName = "bun-test-memory";
await localforage.defineDriver({
    _driver: driverName,
    _initStorage: () => Promise.resolve(),
    _support: () => Promise.resolve(true),
    clear: async () => undefined,
    getItem: async () => null,
    setItem: async (_key: string, value: unknown) => value,
    removeItem: async () => undefined,
    key: async () => null,
    keys: async () => [],
    length: async () => 0,
    iterate: async () => undefined,
} as unknown as Parameters<typeof localforage.defineDriver>[0]);

const createInstance = localforage.createInstance;
localforage.createInstance = (options = {}) => createInstance.call(localforage, { ...options, driver: driverName });
await localforage.setDriver(driverName);
