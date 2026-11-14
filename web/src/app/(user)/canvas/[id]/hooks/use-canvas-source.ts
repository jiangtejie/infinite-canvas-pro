"use client";

import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

import { parseContentSource } from "@/services/api/content";
import { fitSourceNodeSize } from "../../utils/canvas-node-size";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../../types";
import { planSourceMaterialSync, pruneSourceDerivedNodes } from "../lib/canvas-source-plan";
import { errorMessage } from "@/lib/utils";

export type CanvasSourceActionResult = { ok: boolean; reason?: string; removed?: number; blocked?: number; blockedNodeIds?: string[]; needsSync?: boolean; updated?: boolean };

type UseCanvasSourceOptions = {
    nodesRef: RefObject<CanvasNodeData[]>;
    connectionsRef: RefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
};

type ParseSnapshot = {
    nodeId: string;
    status: CanvasNodeMetadata["sourceStatus"];
    error?: string;
    hasMaterial: boolean;
};

function hasSourceMaterial(metadata?: CanvasNodeMetadata) {
    return Boolean(
        metadata?.sourceTitle?.trim() ||
        metadata?.sourceText?.trim() ||
        metadata?.sourceImages?.length ||
        metadata?.sourceCoverUrl?.trim(),
    );
}

function fallbackSuccessStatus(status: CanvasNodeMetadata["sourceStatus"]) {
    return status === "success" || status === "loading" ? "success" : status;
}

/**
 * 画布素材源：解析抖音链接、展开真实素材节点、重置派生节点。
 * 复刻由创作 Agent 的 plan_source_remix / generate_remix_images 完成，不在这里建复刻骨架。
 */
export function useCanvasSource({ nodesRef, connectionsRef, setNodes, setConnections }: UseCanvasSourceOptions) {
    const parseRequestRef = useRef(0);
    const parseControllerRef = useRef<AbortController | null>(null);
    const parseSnapshotRef = useRef<ParseSnapshot | null>(null);

    useEffect(() => () => parseControllerRef.current?.abort(), []);

    const handleParseSource = useCallback(async (nodeId: string, input: string): Promise<CanvasSourceActionResult> => {
        const value = input.trim();
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node) return { ok: false };
        if (!value) {
            setNodes((prev) => patchSourceMetadata(prev, nodeId, { sourceInput: "", sourceStatus: "error", sourceError: "请先粘贴抖音链接或分享文案" }));
            return { ok: false, reason: "请先粘贴抖音链接或分享文案" };
        }

        parseControllerRef.current?.abort();
        const controller = new AbortController();
        parseControllerRef.current = controller;
        const requestId = parseRequestRef.current + 1;
        parseRequestRef.current = requestId;
        const snapshot: ParseSnapshot = {
            nodeId,
            status: node.metadata?.sourceStatus,
            error: node.metadata?.sourceError,
            hasMaterial: hasSourceMaterial(node.metadata),
        };
        parseSnapshotRef.current = snapshot;
        setNodes((prev) => patchSourceMetadata(prev, nodeId, {
            sourceInput: value,
            sourceParsing: true,
            sourceError: undefined,
            ...(snapshot.hasMaterial || snapshot.status === "success" ? {} : { sourceStatus: "loading" as const }),
        }));

        try {
            const { source, warnings } = await parseContentSource(value, controller.signal);
            if (requestId !== parseRequestRef.current) return { ok: false };
            parseControllerRef.current = null;
            parseSnapshotRef.current = null;
            const author = source.author?.trim() || "";
            const previousSize = { width: node.width, height: node.height };
            const previewUrl = source.images.find((image) => image.url)?.url || source.coverUrl;
            setNodes((prev) =>
                prev.map((item) => {
                    if (item.id !== nodeId) return item;
                    return {
                        ...item,
                        metadata: {
                            ...item.metadata,
                            sourceInput: value,
                            sourcePlatform: source.platform || "douyin",
                            sourceStatus: "success",
                            sourceParsing: false,
                            sourceError: undefined,
                            sourceId: source.sourceId,
                            sourceKind: source.kind,
                            sourceTitle: source.title,
                            sourceText: source.text,
                            sourceTags: source.tags,
                            sourceAuthor: author,
                            sourceStats: source.stats ?? null,
                            sourceImages: source.images,
                            sourceVideoUrl: source.videoUrl,
                            sourceCoverUrl: source.coverUrl,
                            sourceWarnings: warnings,
                            sourceExpanded: item.metadata?.sourceExpanded === true,
                        },
                    };
                }),
            );
            if (previewUrl) {
                // 按首图比例定尺寸；解析期间用户已手动改过尺寸的话保留手动值。
                void measureImageSize(previewUrl).then((size) => {
                    if (!size) return;
                    const fitted = fitSourceNodeSize(size.width, size.height);
                    setNodes((prev) => prev.map((item) => {
                        if (item.id !== nodeId || item.metadata?.sourceId !== source.sourceId) return item;
                        if (item.width !== previousSize.width || item.height !== previousSize.height) return item;
                        if (item.width === fitted.width && item.height === fitted.height) return item;
                        return {
                            ...item,
                            width: fitted.width,
                            height: fitted.height,
                            position: {
                                x: item.position.x + (item.width - fitted.width) / 2,
                                y: item.position.y + (item.height - fitted.height) / 2,
                            },
                        };
                    }));
                });
            }
            return { ok: true };
        } catch (error) {
            if (requestId !== parseRequestRef.current || controller.signal.aborted) return { ok: false };
            parseControllerRef.current = null;
            parseSnapshotRef.current = null;
            const reason = errorMessage(error, "解析失败");
            if (snapshot.hasMaterial) {
                // 刷新解析失败时保留上一次结果，只提示错误，避免用户误以为素材丢了。
                setNodes((prev) => patchSourceMetadata(prev, nodeId, {
                    sourceParsing: false,
                    sourceStatus: fallbackSuccessStatus(snapshot.status),
                    sourceError: reason,
                }));
            } else {
                setNodes((prev) => patchSourceMetadata(prev, nodeId, { sourceParsing: false, sourceStatus: "error", sourceError: reason }));
            }
            return { ok: false, reason };
        }
    }, [nodesRef, setNodes]);

    const handleCancelSourceParse = useCallback((nodeId: string): CanvasSourceActionResult => {
        const snapshot = parseSnapshotRef.current;
        if (!snapshot || snapshot.nodeId !== nodeId) return { ok: false };
        parseRequestRef.current += 1;
        parseControllerRef.current?.abort();
        parseControllerRef.current = null;
        parseSnapshotRef.current = null;
        setNodes((prev) => patchSourceMetadata(prev, nodeId, {
            sourceParsing: false,
            sourceStatus: snapshot.hasMaterial ? fallbackSuccessStatus(snapshot.status) : "idle",
            sourceError: snapshot.error,
        }));
        return { ok: true };
    }, [setNodes]);

    const handleExpandSource = useCallback((nodeId: string): CanvasSourceActionResult => {
        const source = nodesRef.current.find((item) => item.id === nodeId);
        if (!source) return { ok: false, reason: "素材源节点已不存在" };
        if (!hasSourceMaterial(source.metadata)) {
            return { ok: false, reason: "还没有可展开的素材，请先解析或手动填入文字" };
        }

        const result = planSourceMaterialSync(source, nodesRef.current, connectionsRef.current);
        if (!result.ok) return { ok: false, needsSync: true, blocked: result.blockedNodeIds.length, blockedNodeIds: result.blockedNodeIds };
        nodesRef.current = result.nodes;
        connectionsRef.current = result.connections;
        setNodes(result.nodes);
        setConnections(result.connections);
        return { ok: true, removed: result.removedNodeIds.length, needsSync: result.needsSync, updated: result.needsSync };
    }, [connectionsRef, nodesRef, setConnections, setNodes]);

    /** 重置素材：删除当前素材源派生出来的素材/复刻节点；已连接到画布其他节点的保留。 */
    const handleResetSource = useCallback((nodeId: string): CanvasSourceActionResult => {
        const source = nodesRef.current.find((item) => item.id === nodeId);
        if (!source) return { ok: false, reason: "素材源节点已不存在" };
        const plan = pruneSourceDerivedNodes(source, nodesRef.current, connectionsRef.current, () => true);
        const remaining = plan.nodes.some((node) => node.id.startsWith(`${nodeId}-material-`) || node.id.startsWith(`${nodeId}-remix-`));
        setNodes(plan.nodes.map((node) => node.id === nodeId ? {
            ...node,
            metadata: {
                ...node.metadata,
                sourceExpanded: remaining,
                sourceExpandedSignature: remaining ? node.metadata?.sourceExpandedSignature : undefined,
                sourceExpandedNodeSignatures: remaining ? node.metadata?.sourceExpandedNodeSignatures : undefined,
            },
        } : node));
        setConnections(plan.connections);
        return { ok: true, removed: plan.removedNodeIds.length, blocked: plan.blockedNodeIds.length };
    }, [connectionsRef, nodesRef, setConnections, setNodes]);

    return { handleParseSource, handleCancelSourceParse, handleExpandSource, handleResetSource };
}

function patchSourceMetadata(nodes: CanvasNodeData[], nodeId: string, patch: Partial<CanvasNodeMetadata>) {
    return nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node));
}

function measureImageSize(url: string) {
    return new Promise<{ width: number; height: number } | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
        image.onerror = () => resolve(null);
        image.src = url;
    });
}
