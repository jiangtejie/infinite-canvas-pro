"use client";

import { Button, Tag } from "antd";
import { Sparkles, X } from "lucide-react";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { REMIX_PLACEMENTS, type RemixRun } from "../remix-types";
import type { CanvasNodeData } from "../types";

export function RemixPlanSummary({ run }: { run: RemixRun }) {
    const plan = run.plan;
    if (!plan) return <p>{run.error || "尚未完成整组策划"}</p>;
    return <div className="space-y-4 text-left text-sm leading-6">
        <div><strong>{plan.copy.title}</strong><div className="mt-2 whitespace-pre-wrap">{plan.copy.body}</div><div className="mt-1 opacity-60">{plan.copy.tags.map((tag) => `#${tag}`).join(" ")}</div></div>
        <div className="border-t border-current/15 pt-3"><div className="font-medium">结构与植入</div><p>{plan.sourcePattern.type} · {plan.sourcePattern.preserve.join("；")}</p><p>{plan.marketingPlacement.reason}</p>{plan.marketingPlacement.cta ? <p>行动引导：{plan.marketingPlacement.cta}</p> : null}</div>
        {run.input.marketing ? <div><div className="font-medium">本次经营资料</div><p>{run.input.marketing.brand.name} / {run.input.marketing.location.name} · {run.input.marketing.location.city || "未指定城市"}</p><p>{run.input.marketing.offerings.map((item) => item.name).join("、")}</p><p className="text-xs opacity-60">当地特点：{run.input.marketing.location.localContext || "未提供，不推测"}</p></div> : null}
        <details><summary className="cursor-pointer font-medium">逐张配图（{plan.visual.images.length} 张）</summary><div className="mt-2 space-y-3">{plan.visual.images.map((image, index) => <div key={index}><div className="font-medium">{index + 1}. {image.role}</div><p className="whitespace-pre-wrap">{image.prompt}</p><p className="text-xs opacity-60">营销参考：{image.referenceAssetIds.map((id) => run.input.marketing?.assets.find((asset) => asset.assetId === id)?.title || id).join("、") || "无"}</p></div>)}</div></details>
        {run.input.marketing ? <details><summary className="cursor-pointer font-medium">已使用的营销事实（{plan.factsUsed.length} 项）</summary><div className="mt-2 space-y-2">{plan.factsUsed.map((use) => {
            const fact = run.input.marketing!.facts.find((item) => item.id === use.factId)!;
            return <div key={use.factId}><strong>{fact.label}</strong>：{fact.value}<div className="text-xs opacity-60">依据：{fact.source} · {use.usedIn.join("、")}</div></div>;
        })}<p className="text-xs opacity-60">引用校验不能代替语义审核，请核对主张与图中文字是否准确。</p></div></details> : null}
    </div>;
}

export function CanvasRemixPlanPanel({ node, nodes, onGenerate, onReplan, onClose }: { node: CanvasNodeData; nodes: CanvasNodeData[]; onGenerate: (runId: string) => void; onReplan: (sourceId: string) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const run = node.metadata!.remixRun!;
    const images = nodes.filter((item) => item.metadata?.remixRunId === run.id && item.metadata.remixRole === "image");
    const running = images.some((image) => image.metadata?.status === "loading" || image.metadata?.status === "stopping");
    const completed = images.filter((image) => image.metadata?.status === "success" && image.metadata.content).length;
    const status = run.binding === "detached" ? "需重新绑定资料" : node.metadata?.status === "loading" ? "策划中" : run.error ? "策划失败" : !run.plan ? "准备中" : running ? "配图生成中" : completed === images.length && images.length ? "已完成" : completed ? "部分完成" : run.approvedKey ? "已审阅" : "待审阅";
    return <div data-canvas-no-zoom className="rounded-xl border p-4" style={{ background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.toolbar.border }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2"><span className="text-sm font-semibold">复刻策划 · {status}</span><Button type="text" size="small" aria-label="关闭复刻策划" icon={<X className="size-4" />} onClick={onClose} /></div>
        <div className="mb-3 flex flex-wrap gap-1"><Tag>{run.input.settings.mode === "content" ? "内容复刻" : REMIX_PLACEMENTS[run.input.settings.placement]}</Tag><span className="text-xs opacity-60">{run.input.settings.goal}</span></div>
        <div className="thin-scrollbar max-h-[50dvh] overflow-y-auto pr-1"><RemixPlanSummary run={run} /></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button type="primary" icon={<Sparkles className="size-4" />} disabled={!run.plan || running || run.binding !== "active"} onClick={() => onGenerate(run.id)}>审阅并生成配图</Button><Button disabled={running || node.metadata?.status === "loading"} onClick={() => onReplan(run.input.sourceNodeId)}>另做一版</Button></div>
    </div>;
}
