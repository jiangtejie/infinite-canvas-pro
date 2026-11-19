import { apiGet } from "@/services/api/request";

export type StorageConfig = {
    mode: string;
    allowUserProvider: boolean;
    allowUserGlobalProvider: boolean;
    autoSyncAllAssets: boolean;
};

let storageConfigPromise: Promise<StorageConfig> | null = null;

export function loadStorageConfig() {
    storageConfigPromise ||= apiGet<StorageConfig>("/api/storage/config").catch((error) => {
        storageConfigPromise = null;
        throw error;
    });
    return storageConfigPromise;
}

export function clearStorageConfigCache() {
    storageConfigPromise = null;
}
