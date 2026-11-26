"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { CanvasNodeData } from "../../types";
import type { FilmNodeSummary } from "../lib/film-node-summary";

export type FilmNodeShellAction = {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
};

type FilmNodeShellProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
    summary: FilmNodeSummary;
    onTitleChange?: (nodeId: string, title: string) => void;
    actions?: FilmNodeShellAction[];
    children: ReactNode;
};

const STATUS_LABELS: Record<NonNullable<FilmNodeDataStatus>, string> = {
    idle: "待处理",
    success: "已就绪",
    loading: "生成中",
    stopping: "正在停止",
    stopped: "已停止",
    error: "失败",
};

type FilmNodeDataStatus = NonNullable<CanvasNodeData["metadata"]>["status"];

export function FilmNodeShell({ node, theme, summary, onTitleChange, actions = [], children }: FilmNodeShellProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(node.title);
    useEffect(() => setTitleDraft(node.title), [node.title]);

    const status = summary.status;
    const visibleStatus = status === "idle" ? null : status;
    const statusColor = status === "error" ? canvasStatusColors.error : status === "loading" || status === "stopping" ? canvasStatusColors.loading : status === "success" ? canvasStatusColors.success : theme.node.muted;

    return (
        <section className="flex h-full w-full flex-col overflow-hidden rounded-[inherit]" style={{ color: theme.node.text, "--film-shell-hover": theme.toolbar.itemHover } as CSSProperties}>
            <header className="flex min-h-11 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                {editingTitle ? (
                    <input
                        autoFocus
                        value={titleDraft}
                        maxLength={64}
                        className="min-w-0 flex-1 border-0 border-b border-dashed bg-transparent text-sm font-semibold outline-none"
                        style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onBlur={() => {
                            setEditingTitle(false);
                            const title = titleDraft.trim() || node.title;
                            setTitleDraft(title);
                            if (title !== node.title) onTitleChange?.(node.id, title);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") {
                                setTitleDraft(node.title);
                                setEditingTitle(false);
                            }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                    />
                ) : (
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold" title="双击修改名称" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); setEditingTitle(true); }}>
                        {node.title || summary.label}
                    </button>
                )}
                {visibleStatus ? <span className="shrink-0 text-[10px]" style={{ color: statusColor }}>{STATUS_LABELS[visibleStatus]}</span> : null}
                {summary.needsRefresh ? <span className="shrink-0 rounded border px-1 py-0.5 text-[9px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>需更新</span> : null}
                <button type="button" className="grid size-6 shrink-0 place-items-center rounded hover:bg-[var(--film-shell-hover)]" title={collapsed ? "展开节点" : "折叠节点"} aria-label={collapsed ? "展开节点" : "折叠节点"} onPointerDown={(event) => event.stopPropagation()} onClick={() => setCollapsed((value) => !value)} style={{ color: theme.node.muted }}>
                    {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                </button>
            </header>
            {!collapsed ? <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => { const el = event.currentTarget; if (el.scrollHeight <= el.clientHeight + 1) return; const atTop = el.scrollTop <= 0; const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1; if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) event.stopPropagation(); }}>{children}</div> : (
                <div className="min-h-0 flex-1 overflow-hidden px-3 py-2 text-xs" style={{ color: theme.node.muted }}>
                    <div className="line-clamp-2 break-words">{summary.description || "暂无摘要"}</div>
                </div>
            )}
            {actions.length ? <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }} onPointerDown={(event) => event.stopPropagation()}>
                {actions.map((action) => <button key={action.label} type="button" className={`rounded border px-2 py-1 text-[11px] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${action.primary ? "font-medium" : ""}`} style={{ borderColor: action.primary ? theme.canvas.selectionStroke : "transparent", color: action.primary ? theme.node.text : theme.node.muted, background: action.primary ? theme.canvas.selectionSoft : "transparent" }} disabled={action.disabled} onClick={action.onClick}>{action.label}</button>)}
            </footer> : null}
        </section>
    );
}
