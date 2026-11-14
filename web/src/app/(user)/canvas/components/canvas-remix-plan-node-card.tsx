"use client";

import { Button } from "antd";
import { ClipboardCheck, RefreshCw, Sparkles } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { RemixRun } from "../remix-types";
import { REMIX_PLACEMENTS } from "../remix-types";
import { canvasStatusColors } from "../lib/canvas-palette";
import type { CanvasNodeData } from "../types";

type CanvasRemixPlanNodeCardProps = {
    node: CanvasNodeData;
    images: CanvasNodeData[];
    onOpen: () => void;
    onGenerate: () => void;
    onReplan: () => void;
};

/**
 * 复刻策划节点：把运行状态、文案摘要、配图进度和常用动作放进卡片，
 * 完整策划仍双击打开面板查看。
 */
export function CanvasRemixPlanNodeCard({ node, images, onOpen, onGenerate, onReplan }: CanvasRemixPlanNodeCardProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const run = node.metadata?.remixRun;
    if (!run) {
        return <div className="flex h-full w-full items-center justify-center p-4 text-sm" style={{ color: theme.node.muted }}>复刻运行记录缺失</div>;
    }
    const plan = run.plan;
    const running = images.some((image) => image.metadata?.status === "loading" || image.metadata?.status === "stopping");
    const completed = images.filter((image) => image.metadata?.status === "success" && image.metadata?.content).length;
    const status = planStatus(run, images, node, running, completed);
    const statusColor = status.color;
    const canGenerate = Boolean(plan) && run.binding === "active" && !running;
    const canReplan = !running && node.metadata?.status !== "loading";
    const modeLabel = run.input.settings.mode === "content" ? "内容复刻" : REMIX_PLACEMENTS[run.input.settings.placement];
    const location = run.input.marketing?.location;
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();

    return (
        <div className="flex h-full w-full flex-col gap-2.5 overflow-hidden p-3.5 text-left" style={{ color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${statusColor}1f`, color: statusColor }}>{status.label}</span>
                <span className="ml-auto shrink-0 text-[10px] tabular-nums" style={{ color: theme.node.placeholder }}>{formatRunTime(run.createdAt)}</span>
            </div>

            <div className="line-clamp-2 text-sm font-medium leading-5">{plan?.copy.title || (run.error ? "策划失败，请重新策划" : "正在生成组级策划…")}</div>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px]" style={{ color: theme.node.muted }}>
                <span className="rounded px-1.5 py-0.5" style={{ background: theme.toolbar.itemHover }}>{modeLabel}</span>
                {location ? <span className="truncate">门店 · {location.name}</span> : null}
                {plan?.copy.tags.length ? <span className="truncate">{plan.copy.tags.map((tag) => `#${tag}`).join(" ")}</span> : null}
            </div>

            {run.error ? <div className="line-clamp-2 text-[11px] leading-4" style={{ color: canvasStatusColors.error }}>{run.error}</div> : null}

            <div className="mt-auto space-y-1.5">
                <div className="flex items-center justify-between text-[11px]" style={{ color: theme.node.muted }}>
                    <span>配图 {completed}/{images.length || 0}</span>
                    <span>{running ? "生成中" : plan ? "待生成" : "准备中"}</span>
                </div>
                <div className="flex items-center gap-1">
                    {images.map((image) => <span key={image.id} className="size-1.5 rounded-full" style={{ background: imageDotColor(image, theme) }} />)}
                </div>
            </div>

            <div className="flex items-center gap-1.5">
                <Button size="small" icon={<ClipboardCheck className="size-3.5" />} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onOpen(); }}>审阅</Button>
                {canGenerate ? <Button size="small" type="primary" icon={<Sparkles className="size-3.5" />} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onGenerate(); }}>生成配图</Button> : null}
                {canReplan ? <Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onReplan(); }}>另做一版</Button> : null}
            </div>
        </div>
    );
}

function planStatus(run: RemixRun, images: CanvasNodeData[], node: CanvasNodeData, running: boolean, completed: number) {
    if (run.binding === "detached") return { label: "需重新绑定资料", color: canvasStatusColors.loading };
    if (node.metadata?.status === "loading") return { label: "策划中", color: canvasStatusColors.loading };
    if (run.error) return { label: "策划失败", color: canvasStatusColors.error };
    if (!run.plan) return { label: "准备中", color: canvasStatusColors.loading };
    if (running) return { label: "配图生成中", color: canvasStatusColors.loading };
    if (images.length && completed === images.length) return { label: "已完成", color: canvasStatusColors.success };
    if (completed) return { label: "部分完成", color: canvasStatusColors.loading };
    return { label: run.approvedKey ? "已审阅" : "待审阅", color: run.approvedKey ? canvasStatusColors.success : canvasStatusColors.loading };
}

function imageDotColor(image: CanvasNodeData, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    const status = image.metadata?.status;
    if (status === "success" && image.metadata?.content) return canvasStatusColors.success;
    if (status === "loading" || status === "stopping") return canvasStatusColors.loading;
    if (status === "error") return canvasStatusColors.error;
    return theme.node.stroke;
}

function formatRunTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
