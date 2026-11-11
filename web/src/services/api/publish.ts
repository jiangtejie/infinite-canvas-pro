import { apiGet, apiPost } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

export type PublishImageInput = {
    url: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
};

export type PublishMedia = {
    id: string;
    url: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

export type PublishChannel = {
    id: string;
    label: string;
    available: boolean;
    reason: string;
    mock: boolean;
};

export type PublishChannels = {
    channels: PublishChannel[];
    publicBaseUrl: string;
    configured: boolean;
    mock: boolean;
};

export type PublishIssue = {
    level: "error" | "warn";
    code: string;
    message: string;
    params?: Record<string, unknown>;
};

export type PublishPreflight = {
    passed: boolean;
    errors: number;
    warnings: number;
    issues: PublishIssue[];
};

export type PublishPackage = {
    platform: string;
    kind: string;
    title: string;
    body: string;
    tags: string[];
    images: PublishImageInput[];
};

export type PublishRecord = {
    id: string;
    channel: string;
    status: "issued" | "confirmed";
    mock: boolean;
    qrText: string;
    expiresAt: string;
    expiresInSeconds: number;
    expired: boolean;
    createdAt: string;
    publishedUrl: string;
    title: string;
    imageCount: number;
    package: PublishPackage;
    preflight: PublishPreflight;
};

export type PublishInput = {
    title: string;
    body: string;
    tags: string[];
    images: PublishImageInput[];
    source?: string;
    sourceId?: string;
    nodeId?: string;
};

function publishToken() {
    const token = useUserStore.getState().token;
    if (!token) throw new Error("请先登录后再发布");
    return token;
}

export function fetchPublishChannels() {
    return apiGet<PublishChannels>("/api/v1/publish/channels", undefined, publishToken());
}

export async function uploadPublishMedia(blob: Blob, filename: string): Promise<PublishMedia> {
    const token = publishToken();
    const formData = new FormData();
    formData.append("file", blob, filename);
    const response = await fetch("/api/v1/publish/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    }).catch(() => {
        throw new Error("图片上传失败，请检查网络后重试");
    });
    const payload = (await response.json().catch(() => null)) as { code?: number; msg?: string; data?: PublishMedia } | null;
    if (!response.ok || payload?.code !== 0 || !payload.data) throw new Error(payload?.msg || "图片上传失败");
    return payload.data;
}

export function preflightPublish(input: PublishInput) {
    return apiPost<{ package: PublishPackage; preflight: PublishPreflight }>("/api/v1/publish/preflight", input, publishToken());
}

export function createPublishRecord(input: PublishInput) {
    return apiPost<{ record: PublishRecord }>("/api/v1/publish/records", input, publishToken());
}

export function getPublishRecord(id: string) {
    return apiGet<{ record: PublishRecord }>(`/api/v1/publish/records/${encodeURIComponent(id)}`, undefined, publishToken());
}

export function confirmPublishRecord(id: string, publishedUrl: string) {
    return apiPost<{ record: PublishRecord }>(`/api/v1/publish/records/${encodeURIComponent(id)}/confirm`, { publishedUrl }, publishToken());
}
