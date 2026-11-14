import { isGlmTtsModel } from "@/lib/audio-generation";
import { isGrok2APITtsConfig } from "@/lib/grok-tts";
import { isGeminiConfig, isGeminiTtsModel } from "@/lib/gemini";
import { supportsVideoAudioGeneration } from "@/lib/video-model-capabilities";
import { type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasAgentState, type CanvasConnection, type CanvasNodeData } from "../types";
import { canvasNodeDisplayStatus, publishDraftText, sourceNodeText } from "../[id]/lib/canvas-node-meta";
import { canvasRecoverableTaskId } from "../[id]/lib/canvas-task-helpers";
import { collectSourceMaterialNodes } from "../[id]/lib/canvas-source-remix";

export type CanvasAgentContextNode = {
    id: string;
    type: CanvasNodeType;
    title: string;
    text?: string;
    sourceImageCount?: number;
    mediaUrl?: string;
    hasMedia?: boolean;
    status?: string;
    prompt?: string;
    model?: string;
    size?: string;
    seconds?: string;
    generateAudio?: string;
    taskId?: string;
    error?: string;
    groupId?: string;
    remixRunId?: string;
    remixRole?: string;
};

export type CanvasAgentContext = {
    project: {
        id: string;
        title: string;
        nodeCount: number;
        connectionCount: number;
    };
    agentState: CanvasAgentState;
    selectedNodeIds: string[];
    nodes: CanvasAgentContextNode[];
    connections: CanvasConnection[];
    /** 焦点素材源的整组原图，按原图顺序随消息附带，供 Agent 读懂组内关系后再策划。 */
    remixImages: Array<{ nodeId: string; title: string; url: string }>;
    generation: {
        autoGenerateMedia: boolean;
        textModel: string;
        imageModel: string;
        videoModel: string;
        audioModel: string;
        imageQuality: string;
        imageSize: string;
        videoQuality: string;
        videoSize: string;
        imageCount: string;
        videoSeconds: string;
        videoGenerateAudio: string;
        videoSupportsAudio: boolean;
        audioVoice: string;
        audioLanguage: string;
        audioFormat: string;
        audioSpeed: string;
    };
    tasks: Array<{
        nodeId: string;
        type: CanvasNodeType;
        status: string;
        taskId: string;
        progress?: number;
        error?: string;
    }>;
};

type BuildCanvasAgentContextInput = {
    projectId: string;
    projectTitle: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Iterable<string>;
    config: AiConfig;
    autoGenerateMedia: boolean;
    agentState: CanvasAgentState;
};

const MAX_CONTEXT_NODES = 120;
const MAX_TEXT_LENGTH = 4000;

export function buildCanvasAgentContext(input: BuildCanvasAgentContextInput): CanvasAgentContext {
    const selectedNodeIds = Array.from(input.selectedNodeIds);
    const prioritizedIds = new Set<string>([
        ...selectedNodeIds,
        ...input.agentState.approvedNodeIds,
        ...input.agentState.referenceNodeIds,
    ]);
    input.connections.forEach((connection) => {
        if (prioritizedIds.has(connection.fromNodeId) || prioritizedIds.has(connection.toNodeId)) {
            prioritizedIds.add(connection.fromNodeId);
            prioritizedIds.add(connection.toNodeId);
        }
    });
    input.nodes.forEach((node) => {
        if (node.metadata?.status === "loading" || node.metadata?.status === "error") prioritizedIds.add(node.id);
    });

    const orderedNodes = [
        ...input.nodes.filter((node) => prioritizedIds.has(node.id)),
        ...input.nodes.filter((node) => !prioritizedIds.has(node.id)),
    ].slice(0, MAX_CONTEXT_NODES);
    const includedIds = new Set(orderedNodes.map((node) => node.id));
    // 焦点素材源的整组原图：Agent 要判断组内关系必须真的看到全部原图，只给 URL 列表读不出层次。
    const remixImages = orderedNodes
        .filter((node) => node.type === CanvasNodeType.Source && prioritizedIds.has(node.id))
        .flatMap((source) => collectSourceMaterialNodes(input.nodes, source.id).materialImages
            .map((node) => ({ nodeId: node.id, title: node.title, url: node.metadata?.content || "" }))
            .filter((image) => Boolean(image.url)));
    const videoModel = input.config.videoModel || input.config.model;
    const audioModel = input.config.audioModel;
    const audioConfig = { ...input.config, model: audioModel, activeChannelId: input.config.audioChannelId || input.config.activeChannelId };
    const grokTts = isGrok2APITtsConfig(audioConfig, audioModel);

    return {
        project: {
            id: input.projectId,
            title: input.projectTitle,
            nodeCount: input.nodes.length,
            connectionCount: input.connections.length,
        },
        agentState: input.agentState,
        selectedNodeIds,
        nodes: orderedNodes.map((node) => summarizeNode(node, prioritizedIds.has(node.id))),
        connections: input.connections.filter((connection) => includedIds.has(connection.fromNodeId) && includedIds.has(connection.toNodeId)),
        remixImages,
        generation: {
            autoGenerateMedia: input.autoGenerateMedia,
            textModel: input.config.textModel || input.config.model,
            imageModel: input.config.imageModel || input.config.model,
            videoModel,
            audioModel,
            imageQuality: input.config.quality,
            imageSize: input.config.size,
            videoQuality: input.config.vquality,
            videoSize: input.config.videoSize,
            imageCount: input.config.canvasImageCount || input.config.count,
            videoSeconds: input.config.videoSeconds,
            videoGenerateAudio: input.config.videoGenerateAudio,
            videoSupportsAudio: supportsVideoAudioGeneration(videoModel),
            audioVoice: isGeminiTtsModel(audioModel) && isGeminiConfig(audioConfig, audioModel) ? input.config.geminiTtsVoice : isGlmTtsModel(audioModel) ? input.config.glmTtsVoice : grokTts ? input.config.grokTtsVoice : input.config.audioVoice,
            audioLanguage: grokTts ? input.config.grokTtsLanguage : "",
            audioFormat: isGlmTtsModel(audioModel) ? input.config.glmTtsFormat : grokTts ? input.config.grokTtsFormat : input.config.audioFormat,
            audioSpeed: isGlmTtsModel(audioModel) ? input.config.glmTtsSpeed : grokTts ? input.config.grokTtsSpeed : input.config.audioSpeed,
        },
        tasks: orderedNodes.flatMap((node) => {
            const taskId = canvasRecoverableTaskId(node);
            if (!taskId) return [];
            return [
                {
                    nodeId: node.id,
                    type: node.type,
                    status: node.metadata?.status || "idle",
                    taskId,
                    progress: node.metadata?.progress,
                    error: node.metadata?.errorDetails,
                },
            ];
        }),
    };
}

export function serializeCanvasAgentContext(context: CanvasAgentContext) {
    return JSON.stringify(context);
}

/**
 * detailed 只给选中、已确认、正式参考、上下游与异常任务节点；
 * 其余节点只保留定位信息，正文与提示词通过 get_node / query_canvas_nodes 按需读取。
 */
function summarizeNode(node: CanvasNodeData, detailed = false): CanvasAgentContextNode {
    const content = node.metadata?.content || "";
    const isText = node.type === CanvasNodeType.Text;
    const isSource = node.type === CanvasNodeType.Source;
    const isPublish = node.type === CanvasNodeType.Publish;
    const mediaUrl = !isText && !isSource && !isPublish && content && !content.startsWith("data:") ? content : undefined;
    const base: CanvasAgentContextNode = {
        id: node.id,
        type: node.type,
        title: node.title,
        hasMedia: !isText && !isPublish ? Boolean(content) : undefined,
        status: isPublish ? canvasNodeDisplayStatus(node) : node.metadata?.status,
        groupId: node.metadata?.groupId,
        remixRunId: node.metadata?.remixRunId,
        remixRole: node.metadata?.remixRole,
    };
    if (!detailed) return base;
    return {
        ...base,
        text: isText && content ? content.slice(0, MAX_TEXT_LENGTH) : isSource ? sourceNodeText(node).slice(0, MAX_TEXT_LENGTH) : isPublish ? publishDraftText(node).slice(0, MAX_TEXT_LENGTH) : undefined,
        sourceImageCount: isSource ? (node.metadata?.sourceImages || []).filter((image) => image.url).length : undefined,
        mediaUrl,
        prompt: node.metadata?.prompt?.slice(0, MAX_TEXT_LENGTH),
        model: node.metadata?.model,
        size: node.metadata?.size,
        seconds: node.metadata?.seconds,
        generateAudio: node.metadata?.generateAudio,
        taskId: canvasRecoverableTaskId(node) || undefined,
        error: isPublish ? node.metadata?.publishError : node.metadata?.errorDetails,
    };
}
