const MEDIA_DATA_PREFIXES = ["data:image/", "data:video/", "data:audio/"];

/** 日志落盘前替换图片 / 视频 / 音频的 data URL 与长 base64，避免把整段媒体写进日志。 */
export function redactLogMedia(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
        value.forEach(redactLogMedia);
        return;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        const item = record[key];
        if (typeof item === "string" && (MEDIA_DATA_PREFIXES.some((prefix) => item.includes(prefix)) || item.length > 2048 && looksLikeBase64(item))) {
            record[key] = `[redacted media/string len=${item.length}]`;
            continue;
        }
        redactLogMedia(item);
    }
}

function looksLikeBase64(value: string) {
    return /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 200));
}
