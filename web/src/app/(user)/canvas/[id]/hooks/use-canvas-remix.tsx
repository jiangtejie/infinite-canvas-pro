"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { nanoid } from "nanoid";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestCreditCost } from "@/constant/credits";
import { currentAccountId } from "@/lib/account-storage";
import { marketingSnapshotKey } from "@/lib/marketing";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { CanvasRemixSetup, type RemixSetupResult } from "../../components/canvas-remix-setup";
import { RemixPlanSummary } from "../../components/canvas-remix-plan-panel";
import { buildCanvasAgentRequestConfig } from "../../agent/canvas-agent-request";
import { assertRemixInputFresh, currentMarketingSnapshot, requestRemixPlan, resolveRemixSkills, type RemixPlanner } from "../../remix-planner";
import { REMIX_CORE_VERSION } from "../../remix-policy";
import type { RemixInput, RemixRun, RemixSkillSelection } from "../../remix-types";
import { CanvasNodeType, type CanvasAgentConfig, type CanvasConnection, type CanvasNodeData } from "../../types";
import { applySourceRemixPlan, assertRemixRunStructure, collectSourceMaterialNodes, findRemixRunNode, planSourceRemix, remixApprovalKey } from "../lib/canvas-source-remix";
import { canReuseRemixFreshness } from "../lib/remix-freshness";
import { sourceExpansionNeedsSync, sourceMaterialSignature } from "../lib/canvas-source-plan";
import { sourceNodeText } from "../lib/canvas-node-meta";
import type { CanvasSourceActionResult } from "./use-canvas-source";

type SetupRequest = { sourceTitle: string; initialSkills: RemixSkillSelection[]; instruction: string; resolve: (result: RemixSetupResult | null) => void };
type Options = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    effectiveConfig: AiConfig;
    agentConfig: CanvasAgentConfig;
    handleExpandSource: (id: string) => CanvasSourceActionResult;
    selectMany: (ids: Iterable<string>) => void;
    openPlan: (id: string) => void;
    planner?: RemixPlanner;
};

export function useCanvasRemix({ nodesRef, connectionsRef, setNodes, setConnections, effectiveConfig, agentConfig, handleExpandSource, selectMany, openPlan, planner = requestRemixPlan }: Options) {
    const confirm = useConfirm();
    const [setup, setSetup] = useState<SetupRequest | null>(null);
    const setupRef = useRef<SetupRequest | null>(null);
    const planningRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const reviewRef = useRef(false);
    const freshCacheRef = useRef(new Map<string, string>());
    const commit = useCallback((next: CanvasNodeData[], edges = connectionsRef.current) => {
        nodesRef.current = next;
        connectionsRef.current = edges;
        setNodes(next);
        setConnections(edges);
    }, [connectionsRef, nodesRef, setConnections, setNodes]);
    useEffect(() => {
        mountedRef.current = true;
        const freshCache = freshCacheRef.current;
        return () => { mountedRef.current = false; planningRef.current?.abort(); setupRef.current?.resolve(null); setupRef.current = null; freshCache.clear(); };
    }, []);
    const settle = useCallback((result: RemixSetupResult | null) => {
        const pending = setupRef.current;
        setupRef.current = null;
        setSetup(null);
        pending?.resolve(result);
    }, []);

    const planRemix = useCallback(async (sourceId: string, instruction = "", skills: RemixSkillSelection[] = [], signal?: AbortSignal) => {
        if (planningRef.current || setupRef.current) throw new Error("已有复刻策划正在准备或执行，请先完成或取消");
        const source = nodesRef.current.find((node) => node.id === sourceId && node.type === CanvasNodeType.Source);
        if (!source) throw new Error("素材源已不存在");
        signal?.throwIfAborted();
        const controller = new AbortController();
        planningRef.current = controller;
        const abort = () => { controller.abort(); settle(null); };
        signal?.addEventListener("abort", abort, { once: true });
        let runId = "";
        try {
            const result = await new Promise<RemixSetupResult | null>((resolve) => {
                const request = { sourceTitle: source.title, initialSkills: skills, instruction, resolve };
                setupRef.current = request;
                setSetup(request);
            });
            if (!result) return null;
            controller.signal.throwIfAborted();
            const config = buildCanvasAgentRequestConfig(effectiveConfig, agentConfig);
            if (!useConfigStore.getState().isAiConfigReady(config, config.model)) throw new Error("请先配置可读图的文本模型与渠道");
            const expanded = handleExpandSource(sourceId);
            if (!expanded.ok) throw new Error(expanded.reason || `素材同步被阻止，请处理：${expanded.blockedNodeIds?.join("、") || "引用冲突"}`);
            const live = nodesRef.current.find((node) => node.id === sourceId)!;
            if (sourceExpansionNeedsSync(live, nodesRef.current)) throw new Error("展开素材尚未同步，请更新后重试");
            const material = collectSourceMaterialNodes(nodesRef.current, sourceId);
            const ownerId = currentAccountId();
            const [marketing, resolved] = await Promise.all([result.selection ? currentMarketingSnapshot(result.selection) : undefined, resolveRemixSkills(result.settings.skills)]);
            controller.signal.throwIfAborted();
            if (ownerId !== currentAccountId()) throw new Error("账号已切换");
            const input: RemixInput = {
                ownerId, sourceNodeId: sourceId, sourceSignature: sourceMaterialSignature(live), sourceText: sourceNodeText(live),
                sourceImages: material.materialImages.map((node) => ({ nodeId: node.id, title: node.title, url: node.metadata?.content || "", storageKey: node.metadata?.storageKey, width: node.metadata?.naturalWidth, height: node.metadata?.naturalHeight, mimeType: node.metadata?.mimeType })),
                settings: structuredClone(result.settings), marketing, marketingKey: marketing ? marketingSnapshotKey(marketing) : undefined, skills: resolved.snapshots, coreVersion: REMIX_CORE_VERSION,
            };
            if (input.sourceImages.length + (marketing?.assets.length || 0) > 60) throw new Error("本次参考图超过 60 张，请减少营销图片");
            runId = nanoid();
            const run: RemixRun = { id: runId, createdAt: new Date().toISOString(), input, binding: "active" };
            const scaffold = planSourceRemix({ source: live, nodes: nodesRef.current, connections: connectionsRef.current, run });
            commit(scaffold.nodes.map((node) => node.id === scaffold.planNodeId ? { ...node, metadata: { ...node.metadata, status: "loading", startedAt: Date.now() } } : node), scaffold.connections);
            selectMany([scaffold.planNodeId]);
            openPlan(scaffold.planNodeId);
            const plan = await planner(input, resolved.content, config, controller.signal);
            controller.signal.throwIfAborted();
            await assertRemixInputFresh(input);
            controller.signal.throwIfAborted();
            const currentSource = nodesRef.current.find((node) => node.id === sourceId);
            if (!currentSource || sourceMaterialSignature(currentSource) !== input.sourceSignature) throw new Error("策划期间原素材发生变化，请重新策划");
            if (!findRemixRunNode(nodesRef.current, runId)) throw new Error("策划节点已删除，结果未写入画布");
            const applied = applySourceRemixPlan(nodesRef.current, connectionsRef.current, runId, plan);
            commit(applied.nodes, applied.connections);
            openPlan(scaffold.planNodeId);
            return { runId, planNodeId: scaffold.planNodeId, copyNodeId: scaffold.copyNodeId, imageNodeIds: scaffold.imageNodeIds };
        } catch (error) {
            if (mountedRef.current && runId) commit(nodesRef.current.map((node) => node.metadata?.remixRun?.id === runId ? { ...node, metadata: { ...node.metadata, status: "error", errorDetails: error instanceof Error ? error.message : "策划失败", remixRun: { ...node.metadata.remixRun, error: error instanceof Error ? error.message : "策划失败" } } } : node));
            throw error;
        } finally { signal?.removeEventListener("abort", abort); planningRef.current = null; }
    }, [agentConfig, commit, connectionsRef, effectiveConfig, handleExpandSource, nodesRef, openPlan, planner, selectMany, settle]);

    const freshRun = useCallback(async (id: string, cached = false) => {
        const run = assertRemixRunStructure(nodesRef.current, connectionsRef.current, id);
        const key = remixApprovalKey(run);
        if (cached && canReuseRemixFreshness(freshCacheRef.current, id, key)) return run;
        await assertRemixInputFresh(run.input);
        const current = assertRemixRunStructure(nodesRef.current, connectionsRef.current, id);
        if (key !== remixApprovalKey(current)) throw new Error("策划在校验期间已变化，请重新审阅");
        freshCacheRef.current.set(id, key);
        return current;
    }, [connectionsRef, nodesRef]);

    const reviewRuns = useCallback(async (ids: string[], count: number, cost?: number) => {
        if (reviewRef.current) throw new Error("已有复刻生成正在等待确认");
        reviewRef.current = true;
        try {
            const runs = await Promise.all([...new Set(ids)].map((id) => freshRun(id)));
            const keys = runs.map(remixApprovalKey);
            const model = effectiveConfig.imageModel || effectiveConfig.model;
            const credits = cost ?? requestCreditCost({ channelMode: effectiveConfig.channelMode, modelCosts: useConfigStore.getState().publicSettings?.modelChannel.modelCosts, model, count });
            const accepted = await confirm({
                title: `审阅策划并生成 ${count} 张配图`,
                width: "min(760px, calc(100vw - 48px))",
                stacked: true,
                description: (
                    <div className="max-h-[min(64dvh,640px)] space-y-5 overflow-y-auto pr-1">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                            <span>模型：{model}</span>
                            {credits > 0 ? <span>预计 {credits.toLocaleString()} 算力点</span> : null}
                            <span className="text-muted-foreground sm:ml-auto">已完成的结果会保留</span>
                        </div>
                        {runs.map((run) => <RemixPlanSummary key={run.id} run={run} />)}
                    </div>
                ),
                confirmText: "确认策划并生成",
                cancelText: "暂不生成",
            });
            if (!accepted || !mountedRef.current) return false;
            const current = await Promise.all(runs.map((run) => freshRun(run.id)));
            if (current.some((run, index) => remixApprovalKey(run) !== keys[index])) throw new Error("确认期间策划发生变化，请重新审阅");
            const approvals = new Map(current.map((run) => [run.id, remixApprovalKey(run)]));
            commit(nodesRef.current.map((node) => node.metadata?.remixRun && approvals.has(node.metadata.remixRun.id) ? { ...node, metadata: { ...node.metadata, remixRun: { ...node.metadata.remixRun, approvedKey: approvals.get(node.metadata.remixRun.id) } } } : node));
            return true;
        } finally { reviewRef.current = false; }
    }, [commit, confirm, effectiveConfig, freshRun, nodesRef]);

    const authorizeImage = useCallback(async (nodeId: string, mode: string, prompt: string, background: boolean) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node?.metadata?.remixRunId) return true;
        if (node.metadata.remixRole !== "image" || mode !== "image") throw new Error("复刻文案、策划与参考图由运行记录管理，请通过“另做一版”修改");
        const runId = node.metadata.remixRunId;
        const live = nodesRef.current.find((item) => item.id === nodeId);
        if (!live || live.metadata?.prompt !== prompt) throw new Error("复刻提示词已变化，请重新策划");
        if (!background) return reviewRuns([runId], 1);
        const run = await freshRun(runId, true);
        if (run.approvedKey !== remixApprovalKey(run)) throw new Error("尚未确认整组策划，请先审阅后生成");
        return true;
    }, [freshRun, nodesRef, reviewRuns]);
    const reviewBatch = useCallback(async (nodeIds: string[], cost: number): Promise<boolean | null> => {
        const targets = nodeIds.map((id) => nodesRef.current.find((node) => node.id === id));
        const ids = [...new Set(targets.flatMap((node) => node?.metadata?.remixRole === "image" && node.metadata.remixRunId ? [node.metadata.remixRunId] : []))];
        if (!ids.length) return null;
        if (targets.some((node) => !node?.metadata?.remixRunId || node.metadata.remixRole !== "image")) throw new Error("请将复刻配图与普通图片分开批量生成，以明确审阅范围");
        return reviewRuns(ids, nodeIds.length, cost);
    }, [nodesRef, reviewRuns]);

    return { planRemix, authorizeImage, reviewBatch, freshRun, setupDialog: setup ? <CanvasRemixSetup key={setup.sourceTitle} sourceTitle={setup.sourceTitle} initialSkills={setup.initialSkills} instruction={setup.instruction} onResolve={settle} /> : null };
}
