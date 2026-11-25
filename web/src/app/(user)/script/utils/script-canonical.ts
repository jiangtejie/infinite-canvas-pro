function canonicalValue(value: unknown): unknown {
    if (typeof value === "string") return value.toWellFormed();
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map((item) => item === undefined ? null : canonicalValue(item));
    if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
            const item = (value as Record<string, unknown>)[key];
            if (item !== undefined) result[key.toWellFormed()] = canonicalValue(item);
        }
        return result;
    }
    return value;
}

export function scriptDataHash(value: unknown): string {
    const text = JSON.stringify(canonicalValue(value)) ?? "null";
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(text)) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}
