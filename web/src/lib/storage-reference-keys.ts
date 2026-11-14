const STORAGE_KEY_PREFIXES = ["image:", "server:", "file:", "video:", "audio:"];

export function collectImageStorageKeys(value: unknown, keys = new Set<string>(), knownUrls?: ReadonlyMap<string, string>, capturedUrls?: Map<string, string>) {
    if (typeof value === "string") {
        if (value.startsWith("image:") || value.startsWith("server:")) keys.add(value);
        const referencedKey = knownUrls?.get(value);
        if (referencedKey) keys.add(referencedKey);
        return keys;
    }
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && (value.storageKey.startsWith("image:") || value.storageKey.startsWith("server:"))) {
        keys.add(value.storageKey);
        if (capturedUrls) {
            for (const field of ["content", "url", "dataUrl"]) {
                const url = (value as Record<string, unknown>)[field];
                if (typeof url === "string" && url) capturedUrls.set(url, value.storageKey);
            }
        }
    }
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys, knownUrls, capturedUrls)) : collectImageStorageKeys(item, keys, knownUrls, capturedUrls)));
    return keys;
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

/** 图片与媒体存储键共用一份收集口径，并补上散落在日志数组里的裸 key 字符串。 */
export function collectStorageReferenceKeys(data: unknown) {
    const keys = collectMediaStorageKeys(data, collectImageStorageKeys(data, new Set<string>()));
    collectBareStorageKeys(data, keys);
    return keys;
}

function collectBareStorageKeys(value: unknown, keys: Set<string>) {
    if (typeof value === "string") {
        if (STORAGE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix))) keys.add(value);
        return;
    }
    if (!value || typeof value !== "object") return;
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectBareStorageKeys(child, keys)) : collectBareStorageKeys(item, keys)));
}
