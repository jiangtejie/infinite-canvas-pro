"use client";

import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { nanoid } from "nanoid";

import { isGlmTtsModel } from "@/lib/audio-generation";
import { isGeminiConfig, isGeminiTtsModel } from "@/lib/gemini";
import { isGrok2APITtsConfig } from "@/lib/grok-tts";
import { isMiniMaxTtsConfig } from "@/lib/minimax-tts";
import { supportsVideoAudioGeneration } from "@/lib/video-model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import { useCanvasStore } from "../../stores/use-canvas-store";
import { CanvasNodeType, type CanvasAgentState, type CanvasConnection, type CanvasNodeData, type Position } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { buildCanvasAgentContext } from "../../agent/canvas-agent-context";
import type { CanvasAgentAction, CanvasAgentToolResult } from "../../agent/canvas-agent-tools";
import { canvasAgentClearsAutoTitle } from "../../agent/canvas-agent-registry";
import { nextAgentNodeCenter } from "../lib/canvas-agent-layout";
import { agentNodeNeighbors, isAgentMediaNodeType, queryAgentCanvasNodes } from "../lib/canvas-agent-read-tools";
import { canvasAgentNodeSummary, canvasAgentTaskSummary, canvasAgentVideoDurationHint } from "../lib/canvas-agent-summary";
import { NODE_STATUS_ERROR } from "../lib/canvas-node-constants";
import { applyNodeConfigPatch } from "../lib/canvas-node-builders";
import { createCanvasNode } from "../lib/canvas-node-factory";
import { buildAgentMediaPlan } from "../lib/canvas-agent-media";
import { AGENT_PRIMARY_SCRIPT_NODE_SIZE, planArrangeNodes, planCreateConnection, planCreateTextNode, planUpdateNodeTitle, planUpdateTextNode } from "../lib/canvas-agent-write-tools";
import { applySourceRemixPlan, collectRemixImageNodeIds, collectSourceMaterialNodes, parseSourceRemixPlan, planSourceRemix, sourceRemixImagesReady } from "../lib/canvas-source-remix";
import type { CanvasBatchRunResult } from "./use-canvas-batch-generation";
import type { CanvasGenerateNodeOptions } from "./use-canvas-generation";
import { errorMessage } from "@/lib/utils";

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
    handleGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasGenerateNodeOptions) => Promise<void>;
    startBatch: (nodeIds: Iterable<string>, options?: { label?: string; overwrite?: boolean }) => Promise<CanvasBatchRunResult>;
    createSourcePublishNode: (sourceId: string) => string | null;
    handleExpandSource: (sourceId: string) => { ok: boolean; reason?: string; removed?: number };
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
    startBatch,
    createSourcePublishNode,
    handleExpandSource,
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

    const batchSnapshotRef = useRef<{ nodes: CanvasNodeData[]; connections: CanvasConnection[]; selectedNodeIds: string[] } | null>(null);

    /** 批次开始前记录画布结构，供失败时整体回滚。 */
    const beginCanvasAgentBatch = useCallback(() => {
        batchSnapshotRef.current = {
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            selectedNodeIds: Array.from(selectedNodeIdsRef.current),
        };
    }, [connectionsRef, nodesRef, selectedNodeIdsRef]);

    const endCanvasAgentBatch = useCallback(
        (summary: { rolledBack: boolean }) => {
            const snapshot = batchSnapshotRef.current;
            batchSnapshotRef.current = null;
            if (!snapshot || !summary.rolledBack) return;
            nodesRef.current = snapshot.nodes;
            setNodes(snapshot.nodes);
            connectionsRef.current = snapshot.connections;
            setConnections(snapshot.connections);
            const nextSelection = new Set(snapshot.selectedNodeIds);
            selectedNodeIdsRef.current = nextSelection;
            selectMany(nextSelection);
            setSelectedConnectionId(null);
        },
        [connectionsRef, nodesRef, selectMany, selectedNodeIdsRef, setConnections, setNodes, setSelectedConnectionId],
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
            const nextNodeCenter = (type: CanvasNodeType, sourceNodes: CanvasNodeData[], sizeOverride?: { width: number; height: number }) =>
                nextAgentNodeCenter({ nodes: nodesRef.current, type, sourceNodes, canvasCenter: getCanvasCenter(), sizeOverride });

            const autoTitlePending = useCanvasStore.getState().projects.find((project) => project.id === projectId)?.autoTitlePending === true;
            if (autoTitlePending && canvasAgentClearsAutoTitle(action.name)) {
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
                    return queryAgentCanvasNodes({
                        nodes: nodesRef.current,
                        nodeId: stringValue("nodeId"),
                        keyword: stringValue("keyword"),
                        type: stringValue("type"),
                        page: Number(args.page) || 1,
                        pageSize: Number(args.pageSize) || 20,
                    });
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
                    const { upstream, downstream } = agentNodeNeighbors({ nodes: nodesRef.current, connections: connectionsRef.current, nodeId });
                    if (action.name === "get_upstream_nodes") return { ok: true, nodes: upstream };
                    if (action.name === "get_downstream_nodes") return { ok: true, nodes: downstream };
                    return { ok: true, upstream, downstream };
                }

                if (action.name === "get_generation_task" || action.name === "get_media_task_status") {
                    const nodeId = stringValue("nodeId");
                    const node = getNode(nodeId);
                    if (!node) return missingNodeResult(nodeId);
                    if (!isAgentMediaNodeType(node.type)) {
                        return { ok: false, code: "not_media_node", message: "节点 " + nodeId + " 不是媒体节点" };
                    }
                    return { ok: true, ...canvasAgentTaskSummary(node) };
                }

                if (action.name === "create_primary_script_node" || action.name === "create_text_node") {
                    const sourceNodeIds = stringValues("sourceNodeIds");
                    const sourceNodes = sourceNodeIds.flatMap((nodeId) => nodesRef.current.filter((node) => node.id === nodeId));
                    const nodeSize = action.name === "create_primary_script_node" ? AGENT_PRIMARY_SCRIPT_NODE_SIZE : undefined;
                    const plan = planCreateTextNode({
                        actionName: action.name,
                        nodes: nodesRef.current,
                        connections: connectionsRef.current,
                        center: nextNodeCenter(CanvasNodeType.Text, sourceNodes, nodeSize),
                        title: stringValue("title"),
                        content: stringValue("content"),
                        sourceNodeIds,
                    });
                    if (!plan.ok) return plan;
                    commitNodes(plan.nodes);
                    commitConnections(plan.connections);
                    selectOnly(plan.node.id);
                    if (action.name === "create_primary_script_node" && autoTitlePending) {
                        renameProject(projectId, stringValue("projectTitle"));
                    }
                    return { ok: true, nodeId: plan.node.id, connectionIds: plan.createdConnectionIds, node: canvasAgentNodeSummary(plan.node) };
                }

                if (action.name === "update_text_node") {
                    const plan = planUpdateTextNode({ nodes: nodesRef.current, nodeId: stringValue("nodeId"), title: stringValue("title"), content: stringValue("content") });
                    if (!plan.ok) return plan;
                    commitNodes(plan.nodes);
                    return { ok: true, nodeId: plan.node.id, node: canvasAgentNodeSummary(plan.node) };
                }

                if (action.name === "update_node") {
                    const plan = planUpdateNodeTitle({ nodes: nodesRef.current, nodeId: stringValue("nodeId"), title: stringValue("title") });
                    if (!plan.ok) return plan;
                    commitNodes(plan.nodes);
                    return { ok: true, nodeId: plan.node.id, node: canvasAgentNodeSummary(plan.node) };
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
                    const plan = planCreateConnection({ nodes: nodesRef.current, connections: connectionsRef.current, fromNodeId: stringValue("fromNodeId"), toNodeId: stringValue("toNodeId") });
                    if (!plan.ok) return plan;
                    if (!plan.alreadyExists) commitConnections(plan.connections);
                    return { ok: true, connectionId: plan.connectionId, ...(plan.alreadyExists ? { alreadyExists: true } : {}) };
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
                    const plan = planArrangeNodes({ nodes: nodesRef.current, nodeIds: stringValues("nodeIds") });
                    if (!plan.ok) return plan;
                    if (!plan.positions.length) return { ok: true, arrangedNodeIds: [] };
                    const positions = new Map(plan.positions.map((item) => [item.id, item.position]));
                    commitNodes(nodesRef.current.map((node) => (positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node)));
                    return { ok: true, arrangedNodeIds: plan.arrangedNodeIds };
                }

                if (action.name === "generate_image" || action.name === "edit_image" || action.name === "generate_video" || action.name === "generate_audio") {
                    const mode: CanvasNodeGenerationMode = action.name === "generate_video" ? "video" : action.name === "generate_audio" ? "audio" : "image";
                    const sourceNodeIds = Object.prototype.hasOwnProperty.call(args, "sourceNodeIds")
                        ? stringValues("sourceNodeIds")
                        : messageReferenceNodeIds;
                    const missingNodeId = validateNodeIds(sourceNodeIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const sourceNodes = sourceNodeIds.map((nodeId) => getNode(nodeId)!);
                    if (action.name === "edit_image" && !sourceNodes.some((node) => isCanvasImageNodeType(node.type) && Boolean(node.metadata?.content))) {
                        return { ok: false, code: "image_reference_required", message: "图片编辑需要至少一个已有内容的图片节点" };
                    }

                    const prompt = stringValue("prompt");
                    const plan = buildAgentMediaPlan({
                        mode,
                        requestId: action.id,
                        config: agentEffectiveConfig,
                        isAiConfigReady,
                        hasToken: Boolean(useUserStore.getState().token),
                        prompt,
                        title: stringValue("title") || undefined,
                        size: stringValue("size") || undefined,
                        count: typeof args.count === "number" ? args.count : undefined,
                        seconds: typeof args.seconds === "number" ? args.seconds : undefined,
                        generateAudio: typeof args.generateAudio === "boolean" ? args.generateAudio : undefined,
                        voice: stringValue("voice") || undefined,
                        instructions: stringValue("instructions") || undefined,
                    });
                    if (!plan.ok) return plan;
                    const duplicateNode = nodesRef.current.find((candidate) => candidate.metadata?.agentRequestId === action.id);
                    if (duplicateNode) {
                        const duplicateTask = canvasAgentTaskSummary(duplicateNode);
                        return { ok: duplicateNode.metadata?.status !== NODE_STATUS_ERROR, code: "duplicate_request", message: duplicateNode.metadata?.status === NODE_STATUS_ERROR ? "该 Agent 媒体请求已失败；请用新的请求重新提交" : "相同 Agent 媒体请求已存在，复用现有节点", nodeId: duplicateNode.id, createdNodeIds: [duplicateNode.id], submitted: Boolean(duplicateNode.metadata?.clientTaskId), ...duplicateTask };
                    }
                    const layoutSourceNodes = mode === "image" ? [] : mode === "video" ? nodesRef.current.filter((node) => !node.metadata?.groupId && (node.type === CanvasNodeType.Text || isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Group)) : sourceNodes;
                    let node = createCanvasNode(plan.targetType, nextNodeCenter(plan.targetType, layoutSourceNodes), plan.metadata);
                    if (mode === "video") node = applyNodeConfigPatch(node, { size: plan.generationConfig.size });
                    node.title = plan.title;
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

                if (action.name === "expand_source") {
                    const sourceId = stringValue("sourceNodeId");
                    const source = getNode(sourceId);
                    if (!source) return missingNodeResult(sourceId);
                    if (source.type !== CanvasNodeType.Source) return { ok: false, code: "not_source_node", message: "节点 " + sourceId + " 不是素材源" };
                    const result = handleExpandSource(sourceId);
                    if (!result.ok) return { ok: false, code: "source_not_expandable", message: result.reason };
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    const material = collectSourceMaterialNodes(nodesRef.current, sourceId);
                    return { ok: true, sourceNodeId: sourceId, materialTextNodeId: material.materialText?.id, materialImageNodeIds: material.materialImages.map((node) => node.id), removedNodeCount: result.removed || 0 };
                }

                if (action.name === "plan_source_remix") {
                    const sourceId = stringValue("sourceNodeId");
                    const source = getNode(sourceId);
                    if (!source) return missingNodeResult(sourceId);
                    if (source.type !== CanvasNodeType.Source) return { ok: false, code: "not_source_node", message: "节点 " + sourceId + " 不是素材源" };
                    if (!collectSourceMaterialNodes(nodesRef.current, sourceId).materialImages.length) {
                        return { ok: false, code: "material_not_expanded", message: "素材源还没有展开出原图节点，请先调用 expand_source" };
                    }
                    const scaffold = planSourceRemix({ source, nodes: nodesRef.current, connections: connectionsRef.current, copy: stringValue("copy"), instruction: stringValue("instruction") });
                    commitNodes(scaffold.nodes);
                    commitConnections(scaffold.connections);
                    selectOnly(scaffold.planNodeId);
                    const createdNodeIds = [scaffold.copyNodeId, scaffold.planNodeId, ...scaffold.imageNodeIds];
                    const scaffoldResult = { nodeId: scaffold.planNodeId, createdNodeIds, copyNodeId: scaffold.copyNodeId, planNodeId: scaffold.planNodeId, imageNodeIds: scaffold.imageNodeIds };

                    let planText = "";
                    await handleGenerateNode(scaffold.planNodeId, "text", scaffold.planPrompt, { overwrite: true, onText: (text) => { planText = text; } });
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    if (!planText.trim()) {
                        return { ok: false, code: "remix_plan_empty", message: "策划没有产出内容，请检查文本模型配置后重新策划", ...scaffoldResult };
                    }
                    const plan = await parseSourceRemixPlan(planText, scaffold.imageNodeIds.length).catch(() => null);
                    if (!plan) {
                        return { ok: false, code: "remix_plan_invalid", message: "策划输出不是完整的整组 JSON，请重新调用 plan_source_remix", ...scaffoldResult };
                    }
                    // 文本生成会把节点标题改写成提示词前缀，策划节点要保留可读标题。
                    commitNodes(applySourceRemixPlan(nodesRef.current, scaffold.imageNodeIds, plan).map((node) => (node.id === scaffold.planNodeId ? { ...node, title: "复刻策划" } : node)));
                    return { ok: true, ...scaffoldResult, shared: plan.shared, images: plan.images };
                }

                if (action.name === "generate_remix_images") {
                    const sourceId = stringValue("sourceNodeId");
                    if (!getNode(sourceId)) return missingNodeResult(sourceId);
                    const imageNodeIds = collectRemixImageNodeIds(nodesRef.current, sourceId);
                    if (!imageNodeIds.length) return { ok: false, code: "remix_not_planned", message: "还没有复刻配图节点，请先用 plan_source_remix 做整组策划" };
                    if (!sourceRemixImagesReady(nodesRef.current, sourceId)) {
                        return { ok: false, code: "remix_plan_required", message: "整组策划未完成或配图提示词未写齐，必须先用 plan_source_remix 完成策划", imageNodeIds };
                    }
                    if (!autoGenerateMedia) {
                        return { ok: true, submitted: false, message: "复刻配图提示词已写齐；未开启自动生成，请让用户手动批量生成", imageNodeIds };
                    }
                    // 批量组根节点代表一组结果，不能当单张槽位重跑；整组拒绝并指明是哪几张，
                    // 不静默少生成一张后报成功。
                    const expandedSlotIds = imageNodeIds.filter((id) => getNode(id)?.metadata?.isBatchRoot);
                    if (expandedSlotIds.length) {
                        return { ok: false, code: "remix_slot_expanded", message: `复刻配图 ${expandedSlotIds.join("、")} 已被手动展开成多结果批量组，无法整组重跑；请让用户先在这些节点上决定保留哪一张`, imageNodeIds, expandedSlotIds };
                    }
                    // 复刻配图是组内固定槽位，必须原地覆盖：全局「生成到新节点」会让旧图留在原节点、
                    // 新图落到组外的兄弟节点上，发布节点仍会取到旧图。
                    const batch = await startBatch(imageNodeIds, { label: "复刻配图", overwrite: true });
                    if (batch.status === "cancelled" || batch.status === "busy" || batch.status === "unavailable") {
                        return {
                            ok: false,
                            code: "remix_batch_not_started",
                            message: batch.status === "cancelled" ? "用户取消了复刻配图生成" : batch.status === "busy" ? "已有批量生成在进行中，请等它结束后重试" : "图片模型未配置或没有可生成的复刻配图",
                            imageNodeIds,
                        };
                    }
                    const publishNodeId = batch.completed > 0 ? createSourcePublishNode(sourceId) : null;
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    return {
                        ok: batch.status === "success",
                        ...(batch.status === "success" ? {} : { code: "remix_batch_incomplete", message: `复刻配图${batch.status === "stopped" ? "已停止" : "未全部成功"}：成功 ${batch.completed} 张，失败 ${batch.failed} 张` }),
                        submitted: true,
                        imageNodeIds,
                        publishNodeId: publishNodeId || undefined,
                        ...batch,
                    };
                }

                return { ok: false, code: "unsupported_tool", message: "未实现工具 " + action.name };
            } catch (error) {
                return { ok: false, code: "tool_error", message: errorMessage(error, "画布工具执行失败") };
            }
        },
        [agentEffectiveConfig, createGroupFromSelection, createSourcePublishNode, handleExpandSource, projectTitle, deleteConnection, deleteNodes, getCanvasCenter, handleGenerateNode, isAiConfigReady, projectId, renameProject, autoGenerateMedia, startBatch, updateProject, selectMany, selectedNodeIdsRef, setSelectedConnectionId, connectionsRef, nodesRef, setConnections, setNodes],
    );

    return { getCanvasAgentContext, executeCanvasAgentAction, beginCanvasAgentBatch, endCanvasAgentBatch };
}
