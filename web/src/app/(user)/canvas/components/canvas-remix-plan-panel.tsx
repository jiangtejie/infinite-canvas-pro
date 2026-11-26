"use client";

import { useState } from "react";
import { Button, Modal, Tag } from "antd";
import { CircleAlert, ClipboardCheck, Eye, ImageIcon, LoaderCircle, LocateFixed, RefreshCw, Send, Sparkles } from "lucide-react";
import { canvasThemes, type CanvasColorTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { getRemixRunAction } from "../[id]/lib/canvas-remix-actions";
import { collectRemixRunIssues, remixBatchGenerationNodeIds, remixBatchResumeBlockReason } from "../[id]/lib/canvas-remix-batch";
import { collectSourceRemixHistory, findRemixRunNode } from "../[id]/lib/canvas-source-remix";
import { canvasStatusColors } from "../lib/canvas-palette";
import { REMIX_PLACEMENTS, type RemixRun } from "../remix-types";
import type { CanvasNodeData } from "../types";
import { CANVAS_DIALOG_SIZE } from "../utils/canvas-dialog-size";

const SCOPE_LABELS = { workspace: "企业", brand: "品牌", location: "门店", offering: "商品", listing: "门店商品" } as const;

export function RemixPlanSummary({ run }: { run: RemixRun }) {
    const plan = run.plan;
    if (!plan) return <p>{run.error || "尚未完成整组策划"}</p>;
    return <div className="space-y-5 text-left text-sm leading-6">
        <div>
            <div className="text-base font-semibold leading-6">{plan.copy.title}</div>
            <div className="mt-2 whitespace-pre-wrap">{plan.copy.body}</div>
            <div className="mt-2 text-xs opacity-60">{plan.copy.tags.map((tag) => `#${tag}`).join(" ")}</div>
        </div>
        <div className="space-y-1.5 border-t border-current/15 pt-4">
            <div className="text-[13px] font-semibold">结构与植入</div>
            <p>{plan.sourcePattern.type} · {plan.sourcePattern.preserve.join("；")}</p>
            <p>{plan.marketingPlacement.reason}</p>
            {plan.marketingPlacement.cta ? <p>行动引导：{plan.marketingPlacement.cta}</p> : null}
        </div>
        {run.input.marketing ? <div className="space-y-1.5 border-t border-current/15 pt-4">
            <div className="text-[13px] font-semibold">本次经营资料</div>
            <p>{SCOPE_LABELS[run.input.marketing.scope]} · {[run.input.marketing.workspace.name, run.input.marketing.brand?.name, run.input.marketing.location?.name, ...run.input.marketing.offerings.map((item) => item.name)].filter(Boolean).join(" / ")}</p>
            {run.input.marketing.location ? <p className="text-xs opacity-60">当地特点：{run.input.marketing.location.localContext || "未提供，不推测"}</p> : null}
        </div> : null}
        <details className="rounded-lg border border-current/15 px-3 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold">逐张配图（{plan.visual.images.length} 张）</summary>
            <div className="mt-3 space-y-4">{plan.visual.images.map((image, index) => <div key={index}><div className="font-medium">{index + 1}. {image.role}</div><p className="mt-1 whitespace-pre-wrap">{image.prompt}</p><p className="mt-1 text-xs opacity-60">营销参考：{image.referenceAssetIds.map((id) => run.input.marketing?.assets.find((asset) => asset.assetId === id)?.title || id).join("、") || "无"}</p></div>)}</div>
        </details>
        {run.input.marketing ? <details className="rounded-lg border border-current/15 px-3 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold">已使用的营销事实（{plan.factsUsed.length} 项）</summary>
            <div className="mt-3 space-y-2">{plan.factsUsed.map((use) => {
                const fact = run.input.marketing!.facts.find((item) => item.id === use.factId)!;
                return <div key={use.factId}><strong>{fact.label}</strong>：{fact.value}<div className="text-xs opacity-60">来源：{fact.subject} · {SCOPE_LABELS[fact.scope]} · 依据：{fact.source} · {use.usedIn.join("、")}</div></div>;
            })}<p className="text-xs opacity-60">引用校验不能代替语义审核，请核对主张与图中文字是否准确。</p></div>
        </details> : null}
    </div>;
}

export function RemixGenerationSummary({ scopes, count, model, credits }: { scopes: Array<{ run: RemixRun; images: CanvasNodeData[] }>; count: number; model: string; credits: number }) {
    const single = scopes.length === 1 && scopes[0].images.length === 1;
    return <div className="space-y-3 text-left">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs">
            <span>模型：{model}</span>
            {credits > 0 ? <span>预计 {credits.toLocaleString()} 算力点</span> : null}
            <span className="text-muted-foreground sm:ml-auto">已完成的结果会保留</span>
        </div>
        {scopes.map(({ run, images }) => {
            const image = images[0];
            const index = image?.metadata?.remixIndex || 0;
            const role = run.plan?.visual.images[index - 1]?.role;
            return <div key={run.id} className="rounded-xl border border-border/70 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 text-[13px] font-medium"><span>{single ? `本次重做 · 第 ${index} 张${role ? ` ${role}` : ""}` : run.plan?.copy.title || "复刻配图"}</span><span className="shrink-0 text-xs font-normal text-muted-foreground">{images.length} 张</span></div>
                {single && image ? <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">{image.metadata?.prompt}</p> : null}
            </div>;
        })}
        <p className="text-xs leading-5 text-muted-foreground">完整策划请在复刻策划节点查看。本次确认只提交上述 {count} 张图片，不重复成功、状态未知或仍可恢复中的任务。</p>
    </div>;
}

type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
type RemixWorkbenchContentProps = {
    theme: CanvasTheme;
    selectedRunId: string;
    onSelectRun: (runId: string) => void;
    nodes: CanvasNodeData[];
    onGenerate: (runId: string) => void;
    onReplan: (sourceId: string) => void;
    onPublish: (runId: string) => void;
    onFocusNode: (nodeId: string) => void;
};

export function CanvasRemixWorkbench({ node, nodes, onGenerate, onReplan, onPublish, onFocusNode, onClose }: Omit<RemixWorkbenchContentProps, "theme" | "selectedRunId" | "onSelectRun"> & { node: CanvasNodeData; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [selectedRunId, setSelectedRunId] = useState(node.metadata?.remixRun?.id || "");
    return (
        <Modal
            open
            title="复刻版本工作台"
            width={CANVAS_DIALOG_SIZE.lg}
            centered
            mask={{ closable: true }}
            onCancel={onClose}
            footer={null}
            destroyOnHidden
            styles={{ root: { background: theme.node.panel, border: `1px solid ${theme.toolbar.border}`, overflow: "hidden" }, body: { padding: 0, background: theme.node.panel } }}
        >
            <RemixWorkbenchContent
                theme={theme}
                selectedRunId={selectedRunId}
                onSelectRun={setSelectedRunId}
                nodes={nodes}
                onGenerate={onGenerate}
                onReplan={onReplan}
                onPublish={onPublish}
                onFocusNode={onFocusNode}
            />
        </Modal>
    );
}

export function RemixWorkbenchContent({ theme, selectedRunId, onSelectRun, nodes, onGenerate, onReplan, onPublish, onFocusNode }: RemixWorkbenchContentProps) {
    const sourceId = findRemixRunNode(nodes, selectedRunId)?.metadata?.remixSourceId || nodes.find((item) => item.metadata?.remixRole === "plan")?.metadata?.remixSourceId || "";
    const history = collectSourceRemixHistory(nodes, sourceId);
    const selected = history.find((item) => item.runId === selectedRunId) || history[0];
    if (!selected) return <div className="p-8 text-center text-sm" style={{ color: theme.node.muted }}>复刻版本不存在</div>;
    const planNode = findRemixRunNode(nodes, selected.runId)!;
    const run = planNode.metadata!.remixRun!;
    const images = nodes.filter((item) => item.metadata?.remixRunId === run.id && item.metadata.remixRole === "image").sort((a, b) => (a.metadata?.remixIndex || 0) - (b.metadata?.remixIndex || 0));
    const completed = images.filter((image) => image.metadata?.status === "success" || image.metadata?.content).length;
    const running = images.some((image) => !image.metadata?.imageTaskUnknown && ["loading", "stopping"].includes(image.metadata?.status || ""));
    const status = workbenchStatus(run, planNode, images, running, completed);
    const issues = collectRemixRunIssues(run, nodes);
    const issueIds = new Set([...issues.failedNodeIds, ...issues.unknownNodeIds, ...issues.remainingNodeIds]);
    const failedIds = new Set(issues.failedNodeIds);
    const unknownIds = new Set(issues.unknownNodeIds);
    const remainingIds = new Set(issues.remainingNodeIds);
    const hasPublishNode = nodes.some((item) => item.metadata?.remixRunId === run.id && item.metadata.remixRole === "publish");
    const action = getRemixRunAction(run, nodes, hasPublishNode);
    const generating = action.kind === "review" || action.kind === "generate" || action.kind === "retry";
    const resumeBlockReason = remixBatchResumeBlockReason(run, nodes);
    const generationIds = remixBatchGenerationNodeIds(run, nodes);
    const actionDisabled = generating && (!run.plan || running || run.binding !== "active" || Boolean(resumeBlockReason) || !generationIds.length);
    const actionLabel = generating && resumeBlockReason ? resumeBlockReason : action.label;
    const issueTotal = issueIds.size;

    function runPrimaryAction() {
        if (action.kind === "publish") onPublish(run.id);
        else if (action.kind === "replan") onReplan(run.input.sourceNodeId);
        else if (action.kind === "view") onFocusNode(selected.planNodeId);
        else onGenerate(run.id);
    }

    return (
        <div data-canvas-no-zoom className="grid h-[min(760px,76dvh)] min-h-[520px] grid-cols-1 overflow-hidden md:grid-cols-[248px_minmax(0,1fr)]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>
            <aside className="thin-scrollbar flex min-h-0 flex-col border-b md:border-b-0 md:border-r" style={{ borderColor: theme.toolbar.border }}>
                <div className="shrink-0 px-4 pb-3 pt-4">
                    <div className="text-sm font-semibold">复刻版本</div>
                    <p className="mt-1 text-xs" style={{ color: theme.node.muted }}>共 {history.length} 版，切换版本不会改动画布数据</p>
                </div>
                <div className="thin-scrollbar flex min-h-0 gap-2 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-y-auto">
                    {history.map((entry, index) => {
                        const entryNode = findRemixRunNode(nodes, entry.runId)!;
                        const entryImages = nodes.filter((item) => item.metadata?.remixRunId === entry.runId && item.metadata.remixRole === "image");
                        const entryCompleted = entryImages.filter((item) => item.metadata?.status === "success" || item.metadata?.content).length;
                        const entryStatus = workbenchStatus(entryNode.metadata!.remixRun!, entryNode, entryImages, entryImages.some((item) => !item.metadata?.imageTaskUnknown && ["loading", "stopping"].includes(item.metadata?.status || "")), entryCompleted);
                        const active = entry.runId === selected.runId;
                        return (
                            <button
                                key={entry.runId}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onSelectRun(entry.runId)}
                                className="w-[220px] shrink-0 rounded-xl border px-3 py-3 text-left transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:w-full"
                                style={{ background: active ? theme.toolbar.activeBg : "transparent", borderColor: active ? theme.node.activeStroke : theme.toolbar.border, color: theme.node.text, outlineColor: theme.node.activeStroke }}
                            >
                                <span className="block truncate text-[13px] font-medium">版本 {history.length - index} · {entry.title}</span>
                                <span className="mt-1.5 flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                    <span style={{ color: entryStatus.color }}>{entryStatus.label}</span>
                                    <span className="tabular-nums">{entryCompleted}/{entryImages.length}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-col">
                <header className="shrink-0 border-b px-5 py-4" style={{ borderColor: theme.toolbar.border }}>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${status.color}1f`, color: status.color }}>{status.label}</span>
                        <Tag className="m-0">{run.input.settings.mode === "content" ? "内容复刻" : REMIX_PLACEMENTS[run.input.settings.placement]}</Tag>
                        <span className="text-xs" style={{ color: theme.node.muted }}>{run.input.settings.goal}</span>
                        <Button size="small" type="text" className="ml-auto" icon={<LocateFixed className="size-4" />} onClick={() => onFocusNode(selected.planNodeId)}>定位版本</Button>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold leading-7">{run.plan?.copy.title || selected.title}</h2>
                    {run.error ? <p className="mt-1 text-xs" style={{ color: canvasStatusColors.error }}>{run.error}</p> : null}
                </header>

                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    <section>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">完整策划</h3>
                            <span className="text-xs" style={{ color: theme.node.muted }}>文案、结构与逐张提示词</span>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: theme.toolbar.border, background: theme.node.panel }}>
                            <RemixPlanSummary run={run} />
                        </div>
                    </section>

                    <section className="mt-6">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold">配图结果</h3>
                            <span className="text-xs tabular-nums" style={{ color: theme.node.muted }}>已完成 {completed}/{images.length}</span>
                        </div>
                        {issueTotal ? (
                            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                                <span className="flex items-center gap-1.5 font-medium"><CircleAlert className="size-3.5" style={{ color: canvasStatusColors.loading }} />待处理 {issueTotal} 项</span>
                                {issues.failedNodeIds.length ? <span style={{ color: canvasStatusColors.error }}>失败 {issues.failedNodeIds.length}</span> : null}
                                {issues.remainingNodeIds.length ? <span>未提交 {issues.remainingNodeIds.length}</span> : null}
                                {issues.unknownNodeIds.length ? <span style={{ color: canvasStatusColors.loading }}>状态未知 {issues.unknownNodeIds.length}</span> : null}
                                <span className="ml-auto" style={{ color: theme.node.muted }}>成功项保留，未知任务不会自动重发</span>
                            </div>
                        ) : null}
                        {images.length ? (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                {images.map((image) => {
                                    const index = image.metadata?.remixIndex || 0;
                                    const role = run.plan?.visual.images[index - 1]?.role;
                                    const failed = failedIds.has(image.id);
                                    const unknown = unknownIds.has(image.id);
                                    const remaining = remainingIds.has(image.id);
                                    const done = image.metadata?.status === "success" || Boolean(image.metadata?.content);
                                    const label = failed ? "失败" : unknown ? "状态未知" : remaining ? "未提交" : done ? "已完成" : "生成中";
                                    const color = failed ? canvasStatusColors.error : done ? canvasStatusColors.success : canvasStatusColors.loading;
                                    return (
                                        <button key={image.id} type="button" className="group min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: theme.node.activeStroke }} onClick={() => onFocusNode(image.id)}>
                                            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.activeBg }}>
                                                {image.metadata?.content ? <img src={image.metadata.content} alt={`第 ${index} 张${role ? ` ${role}` : ""}`} draggable={false} className="size-full object-contain" /> : <div className="flex size-full flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: theme.node.muted }}><ImageIcon className="size-6 opacity-60" /><span className="text-xs">{failed ? image.metadata?.errorDetails || "生成失败" : unknown ? "任务状态待确认" : remaining ? "等待确认生成" : "等待生成结果"}</span></div>}
                                                <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: theme.toolbar.panel, color }}>{label}</span>
                                                {!image.metadata?.imageTaskUnknown && (image.metadata?.status === "loading" || image.metadata?.status === "stopping") ? <LoaderCircle className="absolute bottom-2 right-2 size-4 animate-spin" style={{ color }} /> : null}
                                            </div>
                                            <div className="mt-1.5 truncate text-xs font-medium">第 {index} 张{role ? ` · ${role}` : ""}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}>策划完成后会在这里展示配图槽位</div>}
                    </section>
                </div>

                <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t px-5 py-3.5" style={{ borderColor: theme.toolbar.border }}>
                    <div className="min-w-0 flex-1 text-xs" style={{ color: theme.node.muted }}>
                        <span>已完成 {completed}/{images.length}</span>
                        {run.batch ? <span> · {run.batch.status === "running" ? "批次生成中" : run.batch.status === "paused" ? "批次已暂停" : run.batch.status === "completed" ? "批次已完成" : "批次异常"}，详细进度在画布底部查看</span> : null}
                    </div>
                    <Button disabled={running || planNode.metadata?.status === "loading"} icon={<RefreshCw className="size-4" />} onClick={() => onReplan(run.input.sourceNodeId)}>另做一版</Button>
                    <Button type="primary" disabled={actionDisabled} icon={actionIcon(action.kind)} onClick={runPrimaryAction}>{actionLabel}</Button>
                </footer>
            </section>
        </div>
    );
}

function workbenchStatus(run: RemixRun, planNode: CanvasNodeData, images: CanvasNodeData[], running: boolean, completed: number) {
    if (run.binding === "detached") return { label: "需重新绑定资料", color: canvasStatusColors.loading };
    if (planNode.metadata?.status === "loading") return { label: "策划中", color: canvasStatusColors.loading };
    if (run.error) return { label: "策划失败", color: canvasStatusColors.error };
    if (!run.plan) return { label: "准备中", color: canvasStatusColors.loading };
    if (running) return { label: "配图生成中", color: canvasStatusColors.loading };
    if (images.length && completed === images.length) return { label: "已完成", color: canvasStatusColors.success };
    if (completed) return { label: "部分完成", color: canvasStatusColors.loading };
    return { label: run.approvedKey ? "已审阅" : "待审阅", color: run.approvedKey ? canvasStatusColors.success : canvasStatusColors.loading };
}

function actionIcon(kind: ReturnType<typeof getRemixRunAction>["kind"]) {
    if (kind === "publish") return <Send className="size-4" />;
    if (kind === "replan") return <RefreshCw className="size-4" />;
    if (kind === "view") return <Eye className="size-4" />;
    if (kind === "generate" || kind === "retry") return <Sparkles className="size-4" />;
    return <ClipboardCheck className="size-4" />;
}
