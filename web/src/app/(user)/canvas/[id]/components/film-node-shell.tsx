"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { CanvasNodeData, Position } from "../../types";
import type { FilmNodeSummary } from "../lib/film-node-summary";

export type FilmNodeShellAction = {
    label: string;
    onClick: () => void;
    disabled?: boolean;
};

type FilmNodeShellProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
    summary: FilmNodeSummary;
    onTitleChange?: (nodeId: string, title: string) => void;
    onResize?: (nodeId: string, width: number, height: number, position?: Position) => void;
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

export function FilmNodeShell({ node, theme, summary, onTitleChange, onResize, actions = [], children }: FilmNodeShellProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(node.title);
    useEffect(() => setTitleDraft(node.title), [node.title]);

    const status = summary.status;
    const statusColor = status === "error" ? canvasStatusColors.error : status === "loading" || status === "stopping" ? canvasStatusColors.loading : status === "success" ? canvasStatusColors.success : theme.node.muted;
    const resize = (delta: number) => onResize?.(node.id, Math.max(280, Math.min(720, node.width + delta)), node.height);

    return (
        <section className="flex h-full w-full flex-col overflow-hidden rounded-[inherit]" style={{ color: theme.node.text, "--film-shell-hover": theme.toolbar.itemHover } as CSSProperties}>
            <header className="flex min-h-11 items-center gap-2 border-b px-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
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
                {status ? <span className="shrink-0 text-[10px]" style={{ color: statusColor }}>{STATUS_LABELS[status]}</span> : null}
                {summary.needsRefresh ? <span className="shrink-0 rounded border px-1 py-0.5 text-[9px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>需更新</span> : null}
                <div className="flex shrink-0 items-center gap-0.5" onPointerDown={(event) => event.stopPropagation()}>
                    <button type="button" className="grid size-6 place-items-center rounded hover:bg-[var(--film-shell-hover)]" title="缩窄节点" aria-label="缩窄节点" onClick={() => resize(-40)}><Minus className="size-3" /></button>
                    <button type="button" className="grid size-6 place-items-center rounded hover:bg-[var(--film-shell-hover)]" title="加宽节点" aria-label="加宽节点" onClick={() => resize(40)}><Plus className="size-3" /></button>
                    <button type="button" className="grid size-6 place-items-center rounded hover:bg-[var(--film-shell-hover)]" title={collapsed ? "展开节点" : "折叠节点"} aria-label={collapsed ? "展开节点" : "折叠节点"} onClick={() => setCollapsed((value) => !value)}>
                        {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                    </button>
                </div>
            </header>
            {!collapsed ? <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div> : (
                <div className="min-h-0 flex-1 overflow-hidden px-3 py-2 text-xs" style={{ color: theme.node.muted }}>
                    <div className="line-clamp-2 break-words">{summary.description || "暂无摘要"}</div>
                    {summary.needsRefresh ? <div className="mt-1" style={{ color: canvasStatusColors.loading }}>需更新</div> : null}
                </div>
            )}
            {actions.length ? <footer className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }} onPointerDown={(event) => event.stopPropagation()}>
                {actions.map((action) => <button key={action.label} type="button" className="rounded border px-2 py-1 text-[11px] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={action.disabled} onClick={action.onClick}>{action.label}</button>)}
            </footer> : null}
        </section>
    );
}
