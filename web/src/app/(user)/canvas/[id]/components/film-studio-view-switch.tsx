"use client";

import { useEffect } from "react";
import { Boxes, Clapperboard, FileText, Layers, Play, ShieldCheck } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmStudioView } from "../lib/film-studio-types";

const VIEWS: Array<[FilmStudioView, string]> = [
    ["board", "导演板"],
    ["table", "镜头表"],
    ["storyboard", "故事板"],
    ["assets", "上下文"],
];

export function FilmStudioViewSwitch({ view, onChange, onReview, onOpenScript, onOpenVersions, onPreview, onOpenProduction, onOpenGroups, previewDisabled, reviewBadge, versionBadge, groupCount }: {
    view: FilmStudioView;
    onChange: (view: FilmStudioView) => void;
    onReview?: () => void;
    onOpenScript?: () => void;
    onOpenVersions?: () => void;
    onPreview?: () => void;
    onOpenProduction?: () => void;
    onOpenGroups?: () => void;
    previewDisabled?: boolean;
    reviewBadge?: { errors: number; warnings: number; stale: boolean };
    versionBadge?: number;
    groupCount?: number;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const reviewIssueCount = reviewBadge ? reviewBadge.errors + reviewBadge.warnings : 0;
    const reviewTitle = onReview ? [
        "检查 (C)",
        reviewIssueCount ? `${reviewIssueCount} 个问题` : "未发现问题",
        reviewBadge?.stale ? "AI 结果已过期" : "",
    ].filter(Boolean).join(" · ") : "";
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
            const index = Number(event.key);
            if (Number.isInteger(index) && index >= 1 && index <= VIEWS.length) {
                event.preventDefault();
                onChange(VIEWS[index - 1][0]);
                return;
            }
            const key = event.key.toLowerCase();
            if (key === "s" && onOpenScript) {
                event.preventDefault();
                onOpenScript();
            } else if (key === "p" && onPreview && !previewDisabled) {
                event.preventDefault();
                onPreview();
            } else if (key === "m" && onOpenProduction) {
                event.preventDefault();
                onOpenProduction();
            } else if (key === "o" && onOpenGroups) {
                event.preventDefault();
                onOpenGroups();
            } else if (key === "c" && onReview) {
                event.preventDefault();
                onReview();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onChange, onOpenGroups, onOpenProduction, onOpenScript, onPreview, onReview, previewDisabled]);
    return (
        <div className="absolute inset-x-0 top-16 flex h-11 items-center gap-2 border-b px-3" style={{ zIndex: CANVAS_Z.hoverToolbar, background: theme.canvas.background, borderColor: theme.node.stroke }}>
            <div className="thin-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
                {VIEWS.map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
                        style={{ background: view === value ? theme.toolbar.activeBg : undefined, color: view === value ? theme.node.text : theme.node.muted }}
                        onClick={() => onChange(value)}
                        title={`${label} (${VIEWS.findIndex(([item]) => item === value) + 1})`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {onOpenScript ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs" style={{ color: theme.node.muted }} onClick={onOpenScript} title="剧本 (S)">
                        <FileText className="size-3.5" />剧本
                    </button>
                ) : null}
                {onPreview ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs disabled:opacity-40" style={{ color: theme.node.muted }} onClick={onPreview} disabled={previewDisabled} title={previewDisabled ? "有镜头后可预演" : "分镜预演 (P)"}>
                        <Play className="size-3.5" />预演
                    </button>
                ) : null}
                {onOpenProduction ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs" style={{ color: theme.node.muted }} onClick={() => onOpenProduction()} title="制作中心 (M)">
                        <Clapperboard className="size-3.5" />制作
                    </button>
                ) : null}
                {onOpenGroups ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs" style={{ color: theme.node.muted }} onClick={onOpenGroups} title="镜头组 (O)">
                        <Boxes className="size-3.5" />组
                        {groupCount ? <span className="font-mono text-[10px] tabular-nums">· {groupCount}</span> : null}
                    </button>
                ) : null}
                {onOpenVersions ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs" style={{ color: theme.node.muted }} onClick={onOpenVersions} title="版本评审">
                        <Layers className="size-3.5" />版本
                        {versionBadge ? <span className="font-mono text-[10px] tabular-nums">· {versionBadge}</span> : null}
                    </button>
                ) : null}
                {onReview ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs" style={{ color: theme.node.muted }} onClick={onReview} title={reviewTitle}>
                        <ShieldCheck className="size-3.5" />检查
                        {reviewIssueCount ? <span className="font-mono text-[10px] tabular-nums" style={{ color: reviewBadge?.errors ? canvasStatusColors.error : canvasStatusColors.loading }}>· {reviewIssueCount}</span> : null}
                        {reviewBadge?.stale ? <span className="size-1.5 rounded-full" style={{ background: canvasStatusColors.loading }} aria-label="AI 结果已过期" /> : null}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
