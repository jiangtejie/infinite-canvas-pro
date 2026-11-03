import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import { isMiniMaxTtsConfig } from "@/lib/minimax-tts";
import type { AiConfig } from "@/stores/use-config-store";

import type { NodeGenerationInput } from "../../components/canvas-node-generation";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasImageGenerationType, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../../types";
import { fitNodeSize, nodeSizeFromRatio } from "../../utils/canvas-node-size";
import { PANORAMA_IMAGE_SIZE, isCanvasImageNodeType, isPanoramaNodeType } from "../../utils/canvas-panorama";
import { VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "./canvas-node-constants";

export function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

export function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

export function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: "success", naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

export function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
    return { content: video.url, storageKey: video.storageKey, status: "success", naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", durationMs: video.durationMs };
}

export function buildImportedVideoNode(video: UploadedFile, title: string, center: Position): CanvasNodeData {
    const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
    return {
        id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: CanvasNodeType.Video,
        title,
        position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        width: size.width,
        height: size.height,
        metadata: videoMetadata(video),
    };
}

export function getNextDirectorOutputY(
    director: CanvasNodeData,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
) {
    return connections.reduce((y, connection) => {
        if (connection.fromNodeId !== director.id) return y;
        const output = nodes.find((node) => node.id === connection.toNodeId);
        return output?.type === CanvasNodeType.Image || output?.type === CanvasNodeType.Video
            ? Math.max(y, output.position.y + output.height + 36)
            : y;
    }, director.position.y);
}

export function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: "success", bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", durationMs: audio.durationMs };
}

export function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        generationType: type,
        model: config.model,
        channelId: config.imageChannelId || config.activeChannelId,
        size: config.size,
        quality: config.quality,
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

export function buildAudioGenerationMetadata(config: AiConfig, sourceMetadata?: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        model: config.model,
        channelId: config.audioChannelId || config.activeChannelId,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioInstructions: config.audioInstructions,
        grokTtsVoice: config.grokTtsVoice,
        grokTtsLanguage: config.grokTtsLanguage,
        grokTtsFormat: config.grokTtsFormat,
        grokTtsSpeed: config.grokTtsSpeed,
        glmTtsVoice: config.glmTtsVoice,
        glmTtsFormat: config.glmTtsFormat,
        glmTtsSpeed: config.glmTtsSpeed,
        mimoTtsVoice: config.mimoTtsVoice,
        mimoTtsFormat: config.mimoTtsFormat,
        mimoVoiceDesignPrompt: config.mimoVoiceDesignPrompt,
        geminiTtsVoice: config.geminiTtsVoice,
        ...(isMiniMaxTtsConfig(config, config.model) ? {
            miniMaxTtsVoice: config.miniMaxTtsVoice,
            miniMaxTtsFormat: config.miniMaxTtsFormat,
            miniMaxTtsSpeed: config.miniMaxTtsSpeed,
        } : {}),
        mimoVoiceCloneAudioNodeId: sourceMetadata?.mimoVoiceCloneAudioNodeId,
        referenceAudioNodeId: sourceMetadata?.referenceAudioNodeId,
    };
}

export function referenceUrl(image: ReferenceImage) {
    return image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

export function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeData["metadata"]>) {
    const safePatch = patch || {};
    const isPanorama = isPanoramaNodeType(node.type);
    const next = { ...node, metadata: { ...node.metadata, ...safePatch, ...(isPanorama ? { size: PANORAMA_IMAGE_SIZE } : {}) } };
    const mediaSide = Math.max(node.width, node.height);
    const spec = isPanorama ? NODE_DEFAULT_SIZE[CanvasNodeType.Panorama] : node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video ? { width: mediaSide, height: mediaSide } : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = !isPanorama && typeof safePatch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height) : null;
    return size && (isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Video) ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : next;
}

export function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

export function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}
