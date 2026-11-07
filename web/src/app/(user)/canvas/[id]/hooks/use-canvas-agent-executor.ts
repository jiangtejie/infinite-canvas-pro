"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { nanoid } from "nanoid";

import { isGlmTtsModel } from "@/lib/audio-generation";
import { isGeminiConfig, isGeminiTtsModel } from "@/lib/gemini";
import { isGrok2APITtsConfig } from "@/lib/grok-tts";
import { isMiniMaxTtsConfig } from "@/lib/minimax-tts";
import { supportsVideoAudioGeneration } from "@/lib/video-model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import { getNodeSpec } from "../../constants";
import { useCanvasStore } from "../../stores/use-canvas-store";
import { CanvasNodeType, type CanvasAgentState, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { buildCanvasAgentContext } from "../../agent/canvas-agent-context";
import type { CanvasAgentAction, CanvasAgentToolResult } from "../../agent/canvas-agent-tools";
import { canvasAgentNodeSummary, canvasAgentTaskSummary, canvasAgentVideoDurationHint, validateCanvasAgentVideoSeconds } from "../lib/canvas-agent-summary";
import { NODE_STATUS_ERROR, NODE_STATUS_SUCCESS } from "../lib/canvas-node-constants";
import { applyNodeConfigPatch } from "../lib/canvas-node-builders";
import { createCanvasNode } from "../lib/canvas-node-factory";
import { buildGenerationConfig } from "../lib/canvas-generation-config";

const AGENT_PRIMARY_SCRIPT_NODE_SIZE = { width: 550, height: 600 };

type CanvasStoreState = ReturnType<typeof useCanvasStore.getState>;

type UseCanvasAgentExecutorOptions = {
    projectId: string;
    projectTitle: string;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    agentEffectiveConfig: AiConfig;
    autoGenerateMedia: boolean;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    getCanvasCenter: () => Position;
    handleGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>;
    selectMany: (ids: Iterable<string>) => void;
    setSelectedConnectionId: (id: string | null) => void;
    deleteNodes: (ids: Set<string>) => void;
    deleteConnection: (connectionId: string) => void;
    createGroupFromSelection: (nodeIds?: string[]) => string | null;
    renameProject: CanvasStoreState["renameProject"];
    updateProject: CanvasStoreState["updateProject"];
};

/**
 * Agent（含 Codex）画布工具执行：读取画布上下文、校验并执行工具、回传结构化结果。
 */
export function useCanvasAgentExecutor({
    projectId,
    projectTitle,
    nodesRef,
    connectionsRef,
    selectedNodeIdsRef,
    setNodes,
    setConnections,
    agentEffectiveConfig,
    autoGenerateMedia,
    isAiConfigReady,
    getCanvasCenter,
    handleGenerateNode,
    selectMany,
    setSelectedConnectionId,
    deleteNodes,
    deleteConnection,
    createGroupFromSelection,
    renameProject,
    updateProject,
}: UseCanvasAgentExecutorOptions) {
    const getCanvasAgentContext = useCallback(
        (agentState: CanvasAgentState) =>
            buildCanvasAgentContext({
                projectId,
                projectTitle: projectTitle,
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                selectedNodeIds: selectedNodeIdsRef.current,
                config: agentEffectiveConfig,
                autoGenerateMedia: autoGenerateMedia,
                agentState,
            }),
        [agentEffectiveConfig, projectTitle, projectId, autoGenerateMedia, selectedNodeIdsRef, connectionsRef, nodesRef],
    );

    const executeCanvasAgentAction = useCallback(
        async (action: CanvasAgentAction, messageReferenceNodeIds: string[]): Promise<CanvasAgentToolResult> => {
            const args = action.arguments;
            const stringValue = (key: string) => (typeof args[key] === "string" ? (args[key] as string).trim() : "");
            const stringValues = (key: string) =>
                Array.isArray(args[key])
                    ? [...new Set((args[key] as unknown[]).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
                    : [];
            const getNode = (nodeId: string) => nodesRef.current.find((node) => node.id === nodeId);
            const missingNodeResult = (nodeId: string): CanvasAgentToolResult => ({ ok: false, code: "node_not_found", message: "找不到节点 " + nodeId });
            const validateNodeIds = (nodeIds: string[]) => nodeIds.find((nodeId) => !getNode(nodeId)) || "";
            const selectOnly = (nodeId: string) => {
                const nextSelection = new Set([nodeId]);
                selectedNodeIdsRef.current = nextSelection;
                selectMany(nextSelection);
                setSelectedConnectionId(null);
            };
            const commitNodes = (nextNodes: CanvasNodeData[]) => {
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            };
            const commitConnections = (nextConnections: CanvasConnection[]) => {
                connectionsRef.current = nextConnections;
                setConnections(nextConnections);
            };
            const nextNodeCenter = (type: CanvasNodeType, sourceNodes: CanvasNodeData[], sizeOverride?: { width: number; height: number }) => {
                const spec = sizeOverride ? { ...getNodeSpec(type), ...sizeOverride } : getNodeSpec(type);
                const gapX = 72;
                const gapY = 72;
                const columns = 3;
                const fallbackNodes = nodesRef.current.filter(
                    (node) =>
                        node.type !== CanvasNodeType.Group &&
                        node.type !== CanvasNodeType.Config &&
                        node.type !== CanvasNodeType.Director &&
                        !node.metadata?.groupId &&
                        !node.metadata?.excludeUpstreamText,
                );
                const candidates = sourceNodes.length ? sourceNodes : fallbackNodes;
                const source = candidates.length
                    ? candidates.reduce((rightmost, node) => (node.position.x + node.width > rightmost.position.x + rightmost.width ? node : rightmost))
                    : null;
                const canvasCenter = getCanvasCenter();
                const startX = source ? source.position.x + source.width + 96 + spec.width / 2 : canvasCenter.x;
                const startY = source ? source.position.y + spec.height / 2 : canvasCenter.y;
                const collides = (x: number, y: number) => {
                    const left = x - spec.width / 2;
                    const right = x + spec.width / 2;
                    const top = y - spec.height / 2;
                    const bottom = y + spec.height / 2;
                    return nodesRef.current.some(
                        (node) =>
                            left < node.position.x + node.width + gapX &&
                            right + gapX > node.position.x &&
                            top < node.position.y + node.height + gapY &&
                            bottom + gapY > node.position.y,
                    );
                };
                const maxSlots = Math.max(30, (nodesRef.current.length + 1) * columns * 2);

                for (let slot = 0; slot < maxSlots; slot += 1) {
                    const x = startX + (slot % columns) * (spec.width + gapX);
                    const y = startY + Math.floor(slot / columns) * (spec.height + gapY);
                    if (!collides(x, y)) return { x, y };
                }

                return {
                    x: startX,
                    y: Math.max(canvasCenter.y, ...nodesRef.current.map((node) => node.position.y + node.height + gapY + spec.height / 2)),
                };
            };

            const isAgentWriteAction = action.name === "generate_image" || action.name === "edit_image" || action.name === "generate_video" || action.name === "generate_audio" || action.name === "create_text_node" || action.name === "update_text_node" || action.name === "update_node" || action.name === "delete_node" || action.name === "create_connection" || action.name === "delete_connection" || action.name === "create_group" || action.name === "arrange_nodes";
            const autoTitlePending = useCanvasStore.getState().projects.find((project) => project.id === projectId)?.autoTitlePending === true;
            if (autoTitlePending && action.name !== "create_primary_script_node" && isAgentWriteAction) {
                updateProject(projectId, { autoTitlePending: false });
            }

            try {
                if (action.name === "set_agent_state") {
                    const referencedNodeIds = [...stringValues("approvedNodeIds"), ...stringValues("referenceNodeIds")];
                    const missingNodeId = validateNodeIds(referencedNodeIds);
                    return missingNodeId ? missingNodeResult(missingNodeId) : { ok: true };
                }

                if (action.name === "get_canvas_summary") {
                    return {
                        ok: true,
                        project: { id: projectId, title: projectTitle },
                        selectedNodeIds: Array.from(selectedNodeIdsRef.current),
                        nodes: nodesRef.current.slice(0, 120).map(canvasAgentNodeSummary),
                        connections: connectionsRef.current.slice(0, 240),
                    };
                }

                if (action.name === "get_selected_nodes") {
                    return { ok: true, nodes: nodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id)).map(canvasAgentNodeSummary) };
                }

                if (action.name === "query_canvas_nodes") {
                    const nodeId = stringValue("nodeId");
                    const keyword = stringValue("keyword").toLowerCase();
                    const type = stringValue("type");
                    const page = Math.max(1, Math.floor(Number(args.page) || 1));
                    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(args.pageSize) || 20)));
                    const filtered = nodesRef.current.filter((node) => {
                        if (nodeId && node.id !== nodeId) return false;
                        if (type && node.type !== type) return false;
                        if (!keyword) return true;
                        const content = isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio ? "" : node.metadata?.content || "";
                        return `${node.title} ${content} ${node.metadata?.prompt || ""}`.toLowerCase().includes(keyword);
                    });
                    return {
                        ok: true,
                        items: filtered.slice((page - 1) * pageSize, page * pageSize).map((node) => ({
                            id: node.id,
                            type: node.type,
                            title: node.title,
                            status: node.metadata?.status,
                            groupId: node.metadata?.groupId,
                        })),
                        total: filtered.length,
                        page,
                        pageSize,
                    };
                }

                if (action.name === "get_generation_config") {
                    const videoModel = agentEffectiveConfig.videoModel || agentEffectiveConfig.model;
                    const audioModel = agentEffectiveConfig.audioModel;
                    const audioConfig = { ...agentEffectiveConfig, model: audioModel, activeChannelId: agentEffectiveConfig.audioChannelId || agentEffectiveConfig.activeChannelId };
                    const grokTts = isGrok2APITtsConfig(audioConfig, audioModel);
                    const miniMaxTts = isMiniMaxTtsConfig(audioConfig, audioModel);
                    return {
                        ok: true,
                        models: {
                            text: agentEffectiveConfig.textModel || agentEffectiveConfig.model,
                            image: agentEffectiveConfig.imageModel || agentEffectiveConfig.model,
                            video: videoModel,
                            audio: agentEffectiveConfig.audioModel,
                        },
                        imageQuality: agentEffectiveConfig.quality,
                        imageSize: agentEffectiveConfig.size,
                        videoQuality: agentEffectiveConfig.vquality,
                        videoSize: agentEffectiveConfig.videoSize,
                        autoGenerateMedia: autoGenerateMedia,
                        imageCount: 1,
                        videoSeconds: agentEffectiveConfig.videoSeconds,
                        videoGenerateAudio: agentEffectiveConfig.videoGenerateAudio,
                        videoSupportsAudio: supportsVideoAudioGeneration(videoModel),
                        videoDuration: canvasAgentVideoDurationHint(videoModel),
                        audioVoice: isGeminiTtsModel(audioModel) && isGeminiConfig(audioConfig, audioModel) ? agentEffectiveConfig.geminiTtsVoice : miniMaxTts ? agentEffectiveConfig.miniMaxTtsVoice : isGlmTtsModel(audioModel) ? agentEffectiveConfig.glmTtsVoice : grokTts ? agentEffectiveConfig.grokTtsVoice : agentEffectiveConfig.audioVoice,
                        audioLanguage: grokTts ? agentEffectiveConfig.grokTtsLanguage : "",
                        audioFormat: miniMaxTts ? agentEffectiveConfig.miniMaxTtsFormat : isGlmTtsModel(audioModel) ? agentEffectiveConfig.glmTtsFormat : grokTts ? agentEffectiveConfig.grokTtsFormat : agentEffectiveConfig.audioFormat,
                        audioSpeed: miniMaxTts ? agentEffectiveConfig.miniMaxTtsSpeed : isGlmTtsModel(audioModel) ? agentEffectiveConfig.glmTtsSpeed : grokTts ? agentEffectiveConfig.grokTtsSpeed : agentEffectiveConfig.audioSpeed,
                    };
                }

                if (action.name === "get_node") {
                    const nodeId = stringValue("nodeId");
                    const node = getNode(nodeId);
                    return node ? { ok: true, node: canvasAgentNodeSummary(node) } : missingNodeResult(nodeId);
                }

                if (action.name === "get_upstream_nodes" || action.name === "get_downstream_nodes" || action.name === "get_connected_nodes") {
                    const nodeId = stringValue("nodeId");
                    if (!getNode(nodeId)) return missingNodeResult(nodeId);
                    const upstreamIds = connectionsRef.current.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
                    const downstreamIds = connectionsRef.current.filter((connection) => connection.fromNodeId === nodeId).map((connection) => connection.toNodeId);
                    const upstream = nodesRef.current.filter((node) => upstreamIds.includes(node.id)).map(canvasAgentNodeSummary);
                    const downstream = nodesRef.current.filter((node) => downstreamIds.includes(node.id)).map(canvasAgentNodeSummary);
                    if (action.name === "get_upstream_nodes") return { ok: true, nodes: upstream };
                    if (action.name === "get_downstream_nodes") return { ok: true, nodes: downstream };
                    return { ok: true, upstream, downstream };
                }

                if (action.name === "get_generation_task" || action.name === "get_media_task_status") {
                    const nodeId = stringValue("nodeId");
                    const node = getNode(nodeId);
                    if (!node) return missingNodeResult(nodeId);
                    if (![CanvasNodeType.Image, CanvasNodeType.Panorama, CanvasNodeType.Video, CanvasNodeType.Audio].includes(node.type)) {
                        return { ok: false, code: "not_media_node", message: "节点 " + nodeId + " 不是媒体节点" };
                    }
                    return { ok: true, ...canvasAgentTaskSummary(node) };
                }

                if (action.name === "create_primary_script_node" || action.name === "create_text_node") {
                    const sourceNodeIds = stringValues("sourceNodeIds");
                    const missingNodeId = validateNodeIds(sourceNodeIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const sourceNodes = sourceNodeIds.map((nodeId) => getNode(nodeId)!);
                    const content = stringValue("content");
                    const nodeSize = action.name === "create_primary_script_node" ? AGENT_PRIMARY_SCRIPT_NODE_SIZE : undefined;
                    const nodeCenter = nextNodeCenter(CanvasNodeType.Text, sourceNodes, nodeSize);
                    const node = createCanvasNode(CanvasNodeType.Text, nodeCenter, {
                        content,
                        prompt: content,
                        status: NODE_STATUS_SUCCESS,
                    });
                    if (nodeSize) {
                        node.position = { x: nodeCenter.x - nodeSize.width / 2, y: nodeCenter.y - nodeSize.height / 2 };
                        node.width = nodeSize.width;
                        node.height = nodeSize.height;
                    }
                    node.title = stringValue("title") || content.slice(0, 32) || "文本";
                    const createdConnections = sourceNodeIds.map((sourceNodeId) => ({ id: nanoid(), fromNodeId: sourceNodeId, toNodeId: node.id }));
                    commitNodes([...nodesRef.current, node]);
                    commitConnections([...connectionsRef.current, ...createdConnections]);
                    selectOnly(node.id);
                    const projectTitle = stringValue("projectTitle");
                    if (action.name === "create_primary_script_node" && autoTitlePending) {
                        renameProject(projectId, projectTitle);
                    }
                    return { ok: true, nodeId: node.id, connectionIds: createdConnections.map((connection) => connection.id), node: canvasAgentNodeSummary(node) };
                }

                if (action.name === "update_text_node") {
                    const nodeId = stringValue("nodeId");
                    const node = getNode(nodeId);
                    if (!node) return missingNodeResult(nodeId);
                    if (node.type !== CanvasNodeType.Text) return { ok: false, code: "invalid_node_type", message: "只能用 update_text_node 修改文本节点" };
                    const title = stringValue("title");
                    const content = stringValue("content");
                    const nextNodes = nodesRef.current.map((item) =>
                        item.id === nodeId
                            ? {
                                ...item,
                                title: title || item.title,
                                metadata: content ? { ...item.metadata, content, prompt: content, status: NODE_STATUS_SUCCESS, errorDetails: undefined } : item.metadata,
                            }
                            : item,
                    );
                    commitNodes(nextNodes);
                    return { ok: true, nodeId, node: canvasAgentNodeSummary(nextNodes.find((item) => item.id === nodeId)!) };
                }

                if (action.name === "update_node") {
                    const nodeId = stringValue("nodeId");
                    if (!getNode(nodeId)) return missingNodeResult(nodeId);
                    const nextNodes = nodesRef.current.map((node) => (node.id === nodeId ? { ...node, title: stringValue("title") || node.title } : node));
                    commitNodes(nextNodes);
                    return { ok: true, nodeId, node: canvasAgentNodeSummary(nextNodes.find((node) => node.id === nodeId)!) };
                }

                if (action.name === "delete_node") {
                    const nodeId = stringValue("nodeId");
                    if (!getNode(nodeId)) return missingNodeResult(nodeId);
                    const beforeNodeIds = nodesRef.current.map((node) => node.id);
                    deleteNodes(new Set([nodeId]));
                    const remainingNodeIds = new Set(nodesRef.current.map((node) => node.id));
                    return { ok: true, deletedNodeIds: beforeNodeIds.filter((id) => !remainingNodeIds.has(id)) };
                }

                if (action.name === "create_connection") {
                    const fromNodeId = stringValue("fromNodeId");
                    const toNodeId = stringValue("toNodeId");
                    const fromNode = getNode(fromNodeId);
                    const toNode = getNode(toNodeId);
                    if (!fromNode) return missingNodeResult(fromNodeId);
                    if (!toNode) return missingNodeResult(toNodeId);
                    if (fromNodeId === toNodeId) return { ok: false, code: "self_connection", message: "节点不能连接到自身" };
                    if (fromNode.type === CanvasNodeType.Config && toNode.type === CanvasNodeType.Config) {
                        return { ok: false, code: "invalid_connection", message: "配置节点之间不能连接" };
                    }
                    const existing = connectionsRef.current.find((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId);
                    if (existing) return { ok: true, connectionId: existing.id, alreadyExists: true };
                    const connection = { id: nanoid(), fromNodeId, toNodeId };
                    commitConnections([...connectionsRef.current, connection]);
                    return { ok: true, connectionId: connection.id };
                }

                if (action.name === "delete_connection") {
                    const connectionId = stringValue("connectionId");
                    if (!connectionsRef.current.some((connection) => connection.id === connectionId)) {
                        return { ok: false, code: "connection_not_found", message: "找不到连线 " + connectionId };
                    }
                    deleteConnection(connectionId);
                    return { ok: true, deletedConnectionId: connectionId };
                }

                if (action.name === "create_group") {
                    const nodeIds = stringValues("nodeIds");
                    const missingNodeId = validateNodeIds(nodeIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const groupId = createGroupFromSelection(nodeIds);
                    if (!groupId) return { ok: false, code: "invalid_group", message: "分组至少需要两个未分组的普通节点" };
                    const title = stringValue("title");
                    if (title) {
                        const nextNodes = nodesRef.current.map((node) => (node.id === groupId ? { ...node, title } : node));
                        commitNodes(nextNodes);
                    }
                    return { ok: true, groupId, nodeIds };
                }

                if (action.name === "arrange_nodes") {
                    const requestedIds = stringValues("nodeIds");
                    const missingNodeId = validateNodeIds(requestedIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const targetNodes = requestedIds.length
                        ? requestedIds.map((nodeId) => getNode(nodeId)!)
                        : nodesRef.current.filter((node) => !node.metadata?.groupId && !node.metadata?.batchRootId);
                    if (!targetNodes.length) return { ok: true, arrangedNodeIds: [] };
                    const startX = Math.min(...targetNodes.map((node) => node.position.x));
                    const startY = Math.min(...targetNodes.map((node) => node.position.y));
                    const positions = new Map<string, Position>();
                    let x = startX;
                    let y = startY;
                    let rowHeight = 0;
                    targetNodes.forEach((node, index) => {
                        if (index > 0 && index % 4 === 0) {
                            x = startX;
                            y += rowHeight + 72;
                            rowHeight = 0;
                        }
                        positions.set(node.id, { x, y });
                        x += node.width + 72;
                        rowHeight = Math.max(rowHeight, node.height);
                    });
                    targetNodes
                        .filter((node) => node.type === CanvasNodeType.Group)
                        .forEach((group) => {
                            const groupPosition = positions.get(group.id);
                            if (!groupPosition) return;
                            const offsetX = groupPosition.x - group.position.x;
                            const offsetY = groupPosition.y - group.position.y;
                            nodesRef.current
                                .filter((node) => node.metadata?.groupId === group.id && !positions.has(node.id))
                                .forEach((node) => positions.set(node.id, { x: node.position.x + offsetX, y: node.position.y + offsetY }));
                        });
                    const nextNodes = nodesRef.current.map((node) => (positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node));
                    commitNodes(nextNodes);
                    return { ok: true, arrangedNodeIds: targetNodes.map((node) => node.id) };
                }

                if (action.name === "generate_image" || action.name === "edit_image" || action.name === "generate_video" || action.name === "generate_audio") {
                    const mode: CanvasNodeGenerationMode = action.name === "generate_video" ? "video" : action.name === "generate_audio" ? "audio" : "image";
                    const targetType = mode === "video" ? CanvasNodeType.Video : mode === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image;
                    const sourceNodeIds = Object.prototype.hasOwnProperty.call(args, "sourceNodeIds")
                        ? stringValues("sourceNodeIds")
                        : messageReferenceNodeIds;
                    const missingNodeId = validateNodeIds(sourceNodeIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const sourceNodes = sourceNodeIds.map((nodeId) => getNode(nodeId)!);
                    if (action.name === "edit_image" && !sourceNodes.some((node) => isCanvasImageNodeType(node.type) && Boolean(node.metadata?.content))) {
                        return { ok: false, code: "image_reference_required", message: "图片编辑需要至少一个已有内容的图片节点" };
                    }

                    const generationConfig = buildGenerationConfig(agentEffectiveConfig, undefined, mode);
                    const agentWorkflowRef = mode === "image" ? agentEffectiveConfig.imageWorkflowRef : mode === "video" ? agentEffectiveConfig.videoWorkflowRef : agentEffectiveConfig.audioWorkflowRef;
                    if (!agentWorkflowRef && (!generationConfig.model || !isAiConfigReady(generationConfig, generationConfig.model))) {
                        return { ok: false, code: "model_not_configured", message: "请先在全局配置中完成" + (mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片") + "模型配置" };
                    }
                    if (agentWorkflowRef && !useUserStore.getState().token) return { ok: false, code: "login_required", message: "工作流生成需要先登录" };

                    const prompt = stringValue("prompt");
                    const metadata: CanvasNodeMetadata = {
                        prompt,
                        excludeUpstreamText: true,
                        status: "idle",
                        model: generationConfig.model,
                        workflowRef: agentWorkflowRef,
                        channelId: mode === "video" ? generationConfig.videoChannelId : mode === "audio" ? generationConfig.audioChannelId : generationConfig.imageChannelId,
                        size: stringValue("size") || generationConfig.size,
                    };
                    if (mode === "image") {
                        metadata.quality = generationConfig.quality;
                        metadata.count = typeof args.count === "number" ? Math.max(1, Math.floor(args.count)) : 1;
                    }
                    if (mode === "video") {
                        metadata.vquality = generationConfig.vquality;
                        const seconds = typeof args.seconds === "number" ? args.seconds : Number(generationConfig.videoSeconds);
                        const durationError = agentWorkflowRef ? "" : validateCanvasAgentVideoSeconds(generationConfig.model, seconds);
                        if (durationError) return { ok: false, code: "unsupported_duration", message: durationError, supported: canvasAgentVideoDurationHint(generationConfig.model) };
                        const generateAudio = typeof args.generateAudio === "boolean" ? args.generateAudio : generationConfig.videoGenerateAudio === "true";
                        if (!agentWorkflowRef && generateAudio && !supportsVideoAudioGeneration(generationConfig.model)) {
                            return { ok: false, code: "video_audio_not_supported", message: "当前全局视频模型不支持视频原生声音" };
                        }
                        metadata.seconds = String(seconds);
                        metadata.generateAudio = String(generateAudio);
                    }
                    if (mode === "audio") {
                        if (isGeminiTtsModel(generationConfig.model) && isGeminiConfig(generationConfig, generationConfig.model)) {
                            metadata.geminiTtsVoice = stringValue("voice") || generationConfig.geminiTtsVoice;
                        } else if (isMiniMaxTtsConfig(generationConfig, generationConfig.model)) {
                            metadata.miniMaxTtsVoice = stringValue("voice") || generationConfig.miniMaxTtsVoice;
                            metadata.miniMaxTtsFormat = generationConfig.miniMaxTtsFormat;
                            metadata.miniMaxTtsSpeed = generationConfig.miniMaxTtsSpeed;
                        } else if (isGlmTtsModel(generationConfig.model)) {
                            metadata.glmTtsVoice = stringValue("voice") || generationConfig.glmTtsVoice;
                            metadata.glmTtsFormat = generationConfig.glmTtsFormat;
                            metadata.glmTtsSpeed = generationConfig.glmTtsSpeed;
                        } else if (isGrok2APITtsConfig(generationConfig, generationConfig.model)) {
                            metadata.grokTtsVoice = stringValue("voice") || generationConfig.grokTtsVoice;
                            metadata.grokTtsLanguage = generationConfig.grokTtsLanguage;
                            metadata.grokTtsFormat = generationConfig.grokTtsFormat;
                            metadata.grokTtsSpeed = generationConfig.grokTtsSpeed;
                        } else {
                            metadata.audioVoice = stringValue("voice") || generationConfig.audioVoice;
                            metadata.audioInstructions = stringValue("instructions") || generationConfig.audioInstructions;
                        }
                    }

                    const layoutSourceNodes = mode === "image" ? [] : mode === "video" ? nodesRef.current.filter((node) => !node.metadata?.groupId && (node.type === CanvasNodeType.Text || isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Group)) : sourceNodes;
                    let node = createCanvasNode(targetType, nextNodeCenter(targetType, layoutSourceNodes), metadata);
                    if (mode === "video") node = applyNodeConfigPatch(node, { size: generationConfig.size });
                    node.title = stringValue("title") || prompt.slice(0, 32) || (mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片");
                    const createdConnections = sourceNodeIds.map((sourceNodeId) => ({ id: nanoid(), fromNodeId: sourceNodeId, toNodeId: node.id }));
                    commitNodes([...nodesRef.current, node]);
                    commitConnections([...connectionsRef.current, ...createdConnections]);
                    selectOnly(node.id);

                    if (!autoGenerateMedia) {
                        return {
                            ok: true,
                            message: "媒体节点已创建并完成参数配置，尚未提交生成",
                            submitted: false,
                            nodeId: node.id,
                            createdNodeIds: [node.id],
                            connectionIds: createdConnections.map((connection) => connection.id),
                            type: node.type,
                            status: "idle",
                        };
                    }

                    await handleGenerateNode(node.id, mode, prompt);
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    const generatedNode = getNode(node.id) || node;
                    const createdNodeIds = [
                        node.id,
                        ...connectionsRef.current.filter((connection) => connection.fromNodeId === node.id).map((connection) => connection.toNodeId),
                    ].filter((nodeId, index, values) => values.indexOf(nodeId) === index && Boolean(getNode(nodeId)));
                    const task = canvasAgentTaskSummary(generatedNode);
                    if (generatedNode.metadata?.status === NODE_STATUS_ERROR) {
                        return {
                            ok: false,
                            code: "generation_failed",
                            message: generatedNode.metadata.errorDetails || "生成失败",
                            nodeId: node.id,
                            createdNodeIds,
                            connectionIds: createdConnections.map((connection) => connection.id),
                            ...task,
                        };
                    }
                    return {
                        ok: true,
                        submitted: true,
                        nodeId: node.id,
                        createdNodeIds,
                        connectionIds: createdConnections.map((connection) => connection.id),
                        ...task,
                    };
                }

                return { ok: false, code: "unsupported_tool", message: "未实现工具 " + action.name };
            } catch (error) {
                return { ok: false, code: "tool_error", message: error instanceof Error ? error.message : "画布工具执行失败" };
            }
        },
        [agentEffectiveConfig, createGroupFromSelection, projectTitle, deleteConnection, deleteNodes, getCanvasCenter, handleGenerateNode, isAiConfigReady, projectId, renameProject, autoGenerateMedia, updateProject, selectMany, selectedNodeIdsRef, setSelectedConnectionId, connectionsRef, nodesRef, setConnections, setNodes],
    );

    return { getCanvasAgentContext, executeCanvasAgentAction };
}
