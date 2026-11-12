import type { ReferenceImage } from "@/types/image";

import { buildNodeGenerationInputs } from "../../components/canvas-node-generation";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasPublishDraft, type CanvasPublishRecord } from "../../types";

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
/** 发布图片拖拽排序：把 fromNodeId 移到 toNodeId 的位置；索引无效时返回原数组。 */
export function reorderPublishImageIds(imageNodeIds: string[], fromNodeId: string, toNodeId: string) {
    const fromIndex = imageNodeIds.indexOf(fromNodeId);
    const toIndex = imageNodeIds.indexOf(toNodeId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return imageNodeIds;
    const next = [...imageNodeIds];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
}

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

const SOURCE_PUBLISH_GAP = 96;

/** 复刻流程创建的发布节点：按 metadata.publishSourceId 复用，避免重复创建。 */
export function findSourcePublishNode(nodes: CanvasNodeData[], sourceId: string) {
    if (!sourceId) return undefined;
    return nodes.find((node) => node.type === CanvasNodeType.Publish && node.metadata?.publishSourceId === sourceId);
}

/** 发布节点尚未建立的上游连接（去重、保持传入顺序）。 */
export function planPublishNodeConnections(publishNodeId: string, upstreamNodeIds: Iterable<string>, connections: CanvasConnection[]) {
    const linked = new Set(connections.filter((connection) => connection.toNodeId === publishNodeId).map((connection) => connection.fromNodeId));
    return Array.from(new Set(upstreamNodeIds)).filter((nodeId) => Boolean(nodeId) && !linked.has(nodeId));
}

/** 发布节点放在复刻文案/配图包围盒右侧居中；返回节点中心点，与 createCanvasNode 入参一致。 */
export function getPublishNodePlacement(nodes: CanvasNodeData[], upstreamNodeIds: Iterable<string>) {
    const ids = new Set(upstreamNodeIds);
    const upstream = nodes.filter((node) => ids.has(node.id));
    if (!upstream.length) return null;
    const right = Math.max(...upstream.map((node) => node.position.x + node.width));
    const top = Math.min(...upstream.map((node) => node.position.y));
    const bottom = Math.max(...upstream.map((node) => node.position.y + node.height));
    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Publish];
    return { x: right + SOURCE_PUBLISH_GAP + spec.width / 2, y: (top + bottom) / 2 };
}

export type CanvasSourcePublishPlan = {
    upstreamNodeIds: string[];
    existingPublishNodeId: string | null;
    createPosition: { x: number; y: number } | null;
    connectNodeIds: string[];
};

/** 复刻流程 Step3：优先复用已有发布节点并补齐连接，否则给出新节点位置与待连接上游。 */
export function planSourcePublishNode(nodes: CanvasNodeData[], connections: CanvasConnection[], sourceId: string, textNodeId: string | null, imageNodeIds: string[]): CanvasSourcePublishPlan {
    const upstreamNodeIds = [textNodeId, ...imageNodeIds].filter((nodeId): nodeId is string => Boolean(nodeId));
    const existing = findSourcePublishNode(nodes, sourceId);
    if (existing) {
        return { upstreamNodeIds, existingPublishNodeId: existing.id, createPosition: null, connectNodeIds: planPublishNodeConnections(existing.id, upstreamNodeIds, connections) };
    }
    const createPosition = getPublishNodePlacement(nodes, upstreamNodeIds);
    return { upstreamNodeIds, existingPublishNodeId: null, createPosition, connectNodeIds: createPosition ? upstreamNodeIds : [] };
}

/** 二维码是否已过期；时间解析失败时按未过期处理，交给后端预检兜底。 */
export function publishQrExpired(record?: CanvasPublishRecord, now = Date.now()) {
    if (!record?.expiresAt) return false;
    const time = Date.parse(record.expiresAt);
    return Number.isFinite(time) ? time <= now : false;
}

/** 把画布图片节点内容读成 Blob，并统一为抖音发布支持的 JPG/PNG。 */
export async function canvasImageBlob(image: { url?: string; storageKey?: string }): Promise<Blob> {
    const storageKey = image.storageKey || "";
    const { getImageBlob, getProxyUrl, resolveImageUrl } = await import("@/services/image-storage");
    if (storageKey.startsWith("image:")) {
        const blob = await getImageBlob(storageKey).catch(() => null);
        if (blob) return publishImageBlob(blob);
    }
    const resolved = await resolveImageUrl(storageKey, image.url || "");
    const target = resolved || image.url || "";
    if (!target) throw new Error("图片内容为空，无法上传");
    const response = await fetch(getProxyUrl(target)).catch(() => {
        throw new Error("图片读取失败，请检查网络后重试");
    });
    if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
    return publishImageBlob(await response.blob());
}

/** 后端发布转存只接受 JPG/PNG，WebP、GIF 等格式在浏览器内转码，避免上传被拒。 */
async function publishImageBlob(blob: Blob): Promise<Blob> {
    if (blob.type === "image/jpeg" || blob.type === "image/png") return blob;
    const bitmap = await createImageBitmap(blob).catch(() => {
        throw new Error("图片格式无法解析，请改用 JPG/PNG 后重试");
    });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片转码失败，请改用 JPG/PNG 后重试");
    // JPEG 没有透明通道，先铺白底，避免透明区域转码后变黑。
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const converted = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!converted) throw new Error("图片转码失败，请改用 JPG/PNG 后重试");
    return converted;
}

export function publishImageFileName(title: string, mimeType: string, index: number) {
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const base = (title || "image").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 24) || "image";
    return `${base}-${index + 1}.${ext}`;
}
