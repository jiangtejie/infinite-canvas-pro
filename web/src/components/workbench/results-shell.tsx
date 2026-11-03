"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import { CheckSquare, Download, History, Plus, Trash2 } from "lucide-react";

export function ResultsPanelShell({ className = "", title, count, pendingCount, actions, empty, children }: {
    className?: string;
    title: string;
    count: number;
    pendingCount: number;
    actions?: ReactNode;
    empty?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <section className={`thin-scrollbar punk-panel rounded-xl p-4 lg:min-h-0 lg:overflow-y-auto lg:p-5 ${className}`}>
            <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card px-4 pb-3 pt-0.5 lg:-mx-5 lg:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
                    <span className="chip chip-acid">{count}</span>
                    {pendingCount ? (
                        <span className="chip" role="status" aria-live="polite">
                            {pendingCount} 生成中
                        </span>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
            </div>
            {children}
            {count ? null : empty}
        </section>
    );
}

export function ResultsToolbarActions({ onNew, newLabel = "新建", onToggleSelectAll, selectAllLabel, selectAllDisabled, onDownload, downloadDisabled, onDelete, deleteDisabled }: {
    onNew: () => void;
    newLabel?: string;
    onToggleSelectAll: () => void;
    selectAllLabel: string;
    selectAllDisabled: boolean;
    onDownload: () => void;
    downloadDisabled: boolean;
    onDelete: () => void;
    deleteDisabled: boolean;
}) {
    return (
        <>
            <Button size="small" icon={<Plus className="size-3.5" />} onClick={onNew}>
                {newLabel}
            </Button>
            <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={selectAllDisabled} onClick={onToggleSelectAll}>
                {selectAllLabel}
            </Button>
            <Button size="small" icon={<Download className="size-3.5" />} disabled={downloadDisabled} onClick={onDownload}>
                下载
            </Button>
            <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={deleteDisabled} onClick={onDelete}>
                删除
            </Button>
        </>
    );
}
