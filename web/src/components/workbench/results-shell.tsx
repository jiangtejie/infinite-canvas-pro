"use client";

import type { ReactNode } from "react";
import { Button, Tag } from "antd";
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
        <section className={`thin-scrollbar rounded-lg border border-border bg-card p-4 shadow-sm lg:min-h-0 lg:overflow-y-auto lg:p-5 ${className}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <h2 className="truncate text-xl font-semibold">{title}</h2>
                    <Tag className="m-0">{count}</Tag>
                    {pendingCount ? (
                        <Tag className="m-0 px-2 py-1" role="status" aria-live="polite">
                            {pendingCount} 个生成中
                        </Tag>
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
