"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import { CheckSquare, Download, History, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/ui/state-panel";

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
        <section className={`thin-scrollbar punk-panel min-h-0 overflow-y-auto rounded-2xl p-4 lg:p-5 ${className}`}>
            <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/95 px-4 pb-3.5 pt-0.5 backdrop-blur-md lg:-mx-5 lg:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
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

export function ResultsEmptyState({ icon, title, description, examples, onUseExample }: { icon: ReactNode; title: string; description: string; examples: string[]; onUseExample: (prompt: string) => void }) {
    return (
        <EmptyState
            className="min-h-[320px] lg:min-h-[520px]"
            icon={icon}
            title={title}
            description={description}
            action={
                <div className="flex max-w-lg flex-wrap justify-center gap-2">
                    {examples.map((prompt) => (
                        <Button key={prompt} size="small" className="!h-auto !whitespace-normal !px-3 !py-1.5 !text-left !text-[11px]" onClick={() => onUseExample(prompt)}>
                            {prompt}
                        </Button>
                    ))}
                </div>
            }
        />
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
            <Button size="small" className="!h-8 pointer-coarse:!h-10 !px-2.5" icon={<Plus className="size-3.5" />} onClick={onNew}>
                {newLabel}
            </Button>
            <Button size="small" type="text" className="!h-8 pointer-coarse:!h-10 !px-2.5 !text-muted-foreground hover:!text-foreground" icon={<CheckSquare className="size-3.5" />} disabled={selectAllDisabled} onClick={onToggleSelectAll}>
                {selectAllLabel}
            </Button>
            <Button size="small" type="text" className="!h-8 pointer-coarse:!h-10 !px-2.5 !text-muted-foreground hover:!text-foreground" icon={<Download className="size-3.5" />} disabled={downloadDisabled} onClick={onDownload}>
                下载
            </Button>
            <Button size="small" type="text" danger className="!h-8 pointer-coarse:!h-10 !px-2.5" icon={<Trash2 className="size-3.5" />} disabled={deleteDisabled} onClick={onDelete}>
                删除
            </Button>
        </>
    );
}
