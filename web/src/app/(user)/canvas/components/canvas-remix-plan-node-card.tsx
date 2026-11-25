"use client";

import { Button, Dropdown } from "antd";
import { ClipboardCheck, Ellipsis, Eye, RefreshCw, Send, Sparkles } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { getRemixRunAction } from "../[id]/lib/canvas-remix-actions";
import type { RemixRun } from "../remix-types";
import { REMIX_PLACEMENTS } from "../remix-types";
import { canvasStatusColors } from "../lib/canvas-palette";
import type { CanvasNodeData } from "../types";

type CanvasRemixPlanNodeCardProps = {
    node: CanvasNodeData;
    images: CanvasNodeData[];
    isLatest: boolean;
    onOpen: () => void;
    onGenerate: () => void;
    onReplan: () => void;
    onPublish: () => void;
    hasPublishNode: boolean;
};

/**
 * 复刻策划节点：把运行状态、文案摘要、配图进度和常用动作放进卡片，
 * 完整策划仍双击打开面板查看。
 */
export function CanvasRemixPlanNodeCard({ node, images, isLatest, onOpen, onGenerate, onReplan, onPublish, hasPublishNode }: CanvasRemixPlanNodeCardProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const run = node.metadata?.remixRun;
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();
    if (!run) {
        return <div className="flex h-full w-full items-center justify-center p-4 text-sm" style={{ color: theme.node.muted }}>复刻运行记录缺失</div>;
    }
    const plan = run.plan;
    const running = images.some((image) => !image.metadata?.imageTaskUnknown && (image.metadata?.status === "loading" || image.metadata?.status === "stopping"));
    const completed = images.filter((image) => image.metadata?.status === "success" || image.metadata?.content).length;
    const status = planStatus(run, images, node, running, completed);
    const statusColor = status.color;
    if (!isLatest) {
        return (
            <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-3.5 text-left" style={{ color: theme.node.text }}>
                <div className="flex items-center gap-2 text-[10px]">
                    <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>历史版本</span>
                    <span className="ml-auto tabular-nums" style={{ color: theme.node.placeholder }}>{formatRunTime(run.createdAt)}</span>
                </div>
                <div className="line-clamp-2 text-sm font-medium leading-5">{plan?.copy.title || (run.error ? "策划失败" : "正在生成组级策划…")}</div>
                <div className="mt-auto flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                    <span>{status.label} · {completed}/{images.length}</span>
                    <Button size="small" icon={<Eye className="size-3.5" />} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onOpen(); }}>查看版本</Button>
                </div>
            </div>
        );
    }
    const action = getRemixRunAction(run, images, hasPublishNode);
    const actionIcon = {
        review: <ClipboardCheck className="size-3.5" />,
        generate: <Sparkles className="size-3.5" />,
        retry: <Sparkles className="size-3.5" />,
        view: <Eye className="size-3.5" />,
        publish: <Send className="size-3.5" />,
        replan: <RefreshCw className="size-3.5" />,
    }[action.kind];
    const canReplan = !running && node.metadata?.status !== "loading";
    const modeLabel = run.input.settings.mode === "content" ? "内容复刻" : REMIX_PLACEMENTS[run.input.settings.placement];
    const marketing = run.input.marketing;
    const target = marketing ? [marketing.workspace.name, marketing.brand?.name, marketing.location?.name, ...marketing.offerings.map((item) => item.name)].filter(Boolean).join(" / ") : "";

    return (
        <div className="flex h-full w-full flex-col gap-2.5 overflow-hidden p-3.5 text-left" style={{ color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${statusColor}1f`, color: statusColor }}>{status.label}</span>
                <span className="text-[10px] font-medium" style={{ color: theme.node.activeStroke }}>最新</span>
                <span className="ml-auto shrink-0 text-[10px] tabular-nums" style={{ color: theme.node.placeholder }}>{formatRunTime(run.createdAt)}</span>
            </div>

            <div className="line-clamp-2 text-sm font-medium leading-5">{plan?.copy.title || (run.error ? "策划失败，请重新策划" : "正在生成组级策划…")}</div>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px]" style={{ color: theme.node.muted }}>
                <span className="rounded px-1.5 py-0.5" style={{ background: theme.toolbar.itemHover }}>{modeLabel}</span>
                {target ? <span className="truncate">{target}</span> : null}
                {plan?.copy.tags.length ? <span className="truncate">{plan.copy.tags.map((tag) => `#${tag}`).join(" ")}</span> : null}
            </div>

            {run.error ? <div className="line-clamp-2 text-[11px] leading-4" style={{ color: canvasStatusColors.error }}>{run.error}</div> : null}

            <div className="mt-auto space-y-1.5">
                <div className="flex items-center justify-between text-[11px]" style={{ color: theme.node.muted }}>
                    <span>已完成 {completed}/{images.length || 0}</span>
                </div>
            </div>

            <div className="flex items-center gap-1.5">
                <Button
                    block
                    size="small"
                    type={action.kind === "view" ? "default" : "primary"}
                    icon={actionIcon}
                    onPointerDown={stopPointer}
                    onMouseDown={stopPointer}
                    onClick={(event) => {
                        event.stopPropagation();
                        if (action.kind === "generate" || action.kind === "retry") onGenerate();
                        else if (action.kind === "publish") onPublish();
                        else if (action.kind === "replan") onReplan();
                        else onOpen();
                    }}
                >
                    {action.label}
                </Button>
                <Dropdown
                    trigger={["click"]}
                    destroyOnHidden
                    menu={{
                        items: [
                            { key: "review", label: "查看完整策划", icon: <ClipboardCheck className="size-3.5" />, onClick: onOpen },
                            { key: "replan", label: "另做一版", icon: <RefreshCw className="size-3.5" />, disabled: !canReplan, onClick: onReplan },
                        ],
                    }}
                >
                    <Button
                        size="small"
                        aria-label="更多复刻操作"
                        icon={<Ellipsis className="size-4" />}
                        onPointerDown={stopPointer}
                        onMouseDown={stopPointer}
                        onClick={(event) => event.stopPropagation()}
                    />
                </Dropdown>
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

function formatRunTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
