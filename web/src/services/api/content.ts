import { useUserStore } from "@/stores/use-user-store";

export type ContentSourceStats = {
    likes: number;
    collects: number;
    comments: number;
    shares: number;
};

export type ContentSourceImage = {
    url: string;
    storageKey?: string;
    width?: number;
    height?: number;
    mimeType?: string;
};

export type ContentSource = {
    platform: string;
    sourceId: string;
    kind: "image" | "video" | "text";
    title: string;
    text: string;
    tags: string[];
    author: string;
    stats: ContentSourceStats | null;
    images: ContentSourceImage[];
    videoUrl: string;
    coverUrl: string;
    shareUrl: string;
};

type ContentSourceParsePayload = {
    code?: number;
    msg?: string;
    data?: { source?: ContentSource; warnings?: string[] };
};

export async function parseContentSource(input: string, signal?: AbortSignal): Promise<{ source: ContentSource; warnings: string[] }> {
    const token = useUserStore.getState().token;
    if (!token) throw new Error("请先登录后再解析");

    const response = await fetch("/api/v1/content/sources/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ input, platform: "douyin" }),
        signal,
    }).catch((error: unknown) => {
        if (signal?.aborted) throw error;
        throw new Error("网络异常，请稍后重试");
    });
    const payload = (await response.json().catch(() => null)) as ContentSourceParsePayload | null;
    const source = payload?.data?.source;
    if (!response.ok || payload?.code !== 0 || !source) throw new Error(payload?.msg || "解析失败");

    return {
        source: {
            ...source,
            tags: source.tags || [],
            images: source.images || [],
            stats: source.stats ?? null,
        },
        warnings: payload?.data?.warnings || [],
    };
}
