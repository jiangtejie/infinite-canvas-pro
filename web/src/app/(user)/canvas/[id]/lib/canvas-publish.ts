import type { ReferenceImage } from "@/types/image";

import { buildNodeGenerationInputs } from "../../components/canvas-node-generation";
import type { CanvasConnection, CanvasNodeData, CanvasPublishDraft, CanvasPublishRecord } from "../../types";

export const PUBLISH_TITLE_LIMIT = 20;
export const PUBLISH_TAGS_LIMIT = 5;
export const PUBLISH_MAX_IMAGES = 35;

export type CanvasPublishInputImage = {
    nodeId: string;
    title: string;
    image: ReferenceImage;
};

export type CanvasPublishInputs = {
    text: string;
    textNodeIds: string[];
    images: CanvasPublishInputImage[];
};

const HASHTAG_PATTERN = /#([^\s#]+)/g;

const CHANNEL_REASON_TEXT: Record<string, string> = {
    NEED_CREDENTIALS: "请先在后台配置抖音 Client Key / Client Secret",
    NEED_PUBLIC_BASE_URL: "请先在后台配置发布域名 publicBaseUrl",
    NEED_HTTPS: "发布域名必须是公网 HTTPS 地址",
};

/**
 * 收集发布节点上游的文案与图片输入：只取文本/图片，按连线顺序去重；
 * 复用画布生成输入收集逻辑，保证素材源展开出的节点同样可用。
 */
export function collectPublishInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasPublishInputs {
    const seen = new Set<string>();
    const textNodeIds: string[] = [];
    const texts: string[] = [];
    const images: CanvasPublishInputImage[] = [];
    for (const input of buildNodeGenerationInputs(nodeId, nodes, connections)) {
        if (seen.has(input.nodeId)) continue;
        seen.add(input.nodeId);
        if (input.type === "text") {
            const text = (input.text || "").trim();
            if (!text) continue;
            textNodeIds.push(input.nodeId);
            texts.push(text);
        } else if (input.type === "image" && input.image) {
            images.push({ nodeId: input.nodeId, title: input.title, image: input.image });
        }
    }
    return { text: texts.join("\n\n"), textNodeIds, images };
}

export type CanvasPublishDraftValues = {
    title: string;
    body: string;
    tags: string[];
    imageNodeIds: string[];
};

/** 默认发布草稿：上游文案首行截 20 字作为标题，正文去掉话题标记，最多提取 5 个话题。 */
export function buildDefaultPublishDraft(inputs: CanvasPublishInputs): CanvasPublishDraftValues {
    const text = inputs.text.trim();
    const tags = extractPublishTags(text);
    const firstLine = text.split("\n").find((line) => line.trim()) || "";
    return {
        title: stripPublishTags(firstLine).slice(0, PUBLISH_TITLE_LIMIT),
        body: stripPublishTags(text.replace(HASHTAG_PATTERN, "\n")).replace(/\n{3,}/g, "\n\n").trim(),
        tags,
        imageNodeIds: inputs.images.map((item) => item.nodeId),
    };
}

export function extractPublishTags(text: string): string[] {
    const tags: string[] = [];
    for (const match of text.matchAll(HASHTAG_PATTERN)) {
        const tag = match[1].trim();
        if (!tag || tags.includes(tag)) continue;
        tags.push(tag);
        if (tags.length >= PUBLISH_TAGS_LIMIT) break;
    }
    return tags;
}

function stripPublishTags(text: string) {
    return text.replace(HASHTAG_PATTERN, " ").replace(/[ \t]+\n/g, "\n").trim();
}

export function publishChannelReasonText(reason?: string) {
    return CHANNEL_REASON_TEXT[reason || ""] || "发布渠道暂不可用，请检查后台发布配置";
}

/** 发布草稿签名：比较生成二维码时的快照与当前草稿是否一致。 */
export function publishDraftSignature(draft?: CanvasPublishDraft) {
    return JSON.stringify({
        title: (draft?.title || "").trim(),
        body: (draft?.body || "").trim(),
        tags: (draft?.tags || []).map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean),
        imageNodeIds: draft?.imageNodeIds || [],
    });
}

/**
 * 当前二维码是否对应旧内容：标题/正文/话题/图片或顺序与生成快照不一致时返回 true。
 * 已确认发布或没有快照的旧记录不再提示，避免误伤。
 */
export function isPublishDraftDirty(record: CanvasPublishRecord | undefined, draft: CanvasPublishDraft | undefined, snapshot: CanvasPublishDraft | undefined) {
    if (!record || record.status === "confirmed" || !snapshot) return false;
    return publishDraftSignature(draft) !== publishDraftSignature(snapshot);
}

/** 二维码是否已过期；时间解析失败时按未过期处理，交给后端预检兜底。 */
export function publishQrExpired(record?: CanvasPublishRecord, now = Date.now()) {
    if (!record?.expiresAt) return false;
    const time = Date.parse(record.expiresAt);
    return Number.isFinite(time) ? time <= now : false;
}

/** 把画布图片节点内容读成 Blob，供发布媒体转存上传使用。 */
export async function canvasImageBlob(image: { url?: string; storageKey?: string }): Promise<Blob> {
    const storageKey = image.storageKey || "";
    const { getImageBlob, getProxyUrl, resolveImageUrl } = await import("@/services/image-storage");
    if (storageKey.startsWith("image:")) {
        const blob = await getImageBlob(storageKey).catch(() => null);
        if (blob) return blob;
    }
    const resolved = await resolveImageUrl(storageKey, image.url || "");
    const target = resolved || image.url || "";
    if (!target) throw new Error("图片内容为空，无法上传");
    const response = await fetch(getProxyUrl(target)).catch(() => {
        throw new Error("图片读取失败，请检查网络后重试");
    });
    if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
    return response.blob();
}

export function publishImageFileName(title: string, mimeType: string, index: number) {
    const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : mimeType.includes("gif") ? "gif" : mimeType.includes("bmp") ? "bmp" : "png";
    const base = (title || "image").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 24) || "image";
    return `${base}-${index + 1}.${ext}`;
}
