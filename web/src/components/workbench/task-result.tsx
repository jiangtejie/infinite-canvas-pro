"use client";

import { useState, type ReactNode } from "react";
import { Button, Modal, Typography } from "antd";
import { AlertCircle, ChevronDown, ChevronUp, Copy } from "lucide-react";

import type { ReferenceImage } from "@/types/image";

export function formatTaskTime(value: number) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function ReferenceThumbnailOverlay({ references, className = "" }: { references?: ReferenceImage[]; className?: string }) {
    const visibleReferences = (references || []).filter((item) => Boolean(item.dataUrl)).slice(0, 3);
    if (!visibleReferences.length) return null;
    return (
        <div className={`absolute z-10 flex items-center gap-1 rounded-md bg-black/55 p-1 shadow-sm backdrop-blur ${className}`}>
            {visibleReferences.map((item) => (
                <img loading="lazy" decoding="async" key={item.id} src={item.dataUrl} alt={item.name} className="size-7 rounded border border-white/60 object-cover" />
            ))}
            {(references || []).length > visibleReferences.length ? <span className="px-1 text-[10px] text-white">+{(references || []).length - visibleReferences.length}</span> : null}
        </div>
    );
}

export function TaskPromptBlock({ prompt, onCopyPrompt }: { prompt: string; onCopyPrompt: (text: string) => void | Promise<void> }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="rounded-md bg-muted p-2">
            <div className={`${expanded ? "" : "line-clamp-2"} whitespace-pre-wrap text-foreground/80`}>{prompt}</div>
            <div className="mt-2 flex justify-end gap-1">
                <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => void onCopyPrompt(prompt)}>
                    复制
                </Button>
                <Button size="small" type="text" icon={expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} onClick={() => setExpanded((value) => !value)}>
                    {expanded ? "收起" : "展开"}
                </Button>
            </div>
        </div>
    );
}

export function TaskResultInfo({ prompt, tags, error, onCopyPrompt }: {
    prompt: string;
    tags?: ReactNode;
    error?: string;
    onCopyPrompt: (text: string) => void | Promise<void>;
}) {
    return (
        <div className="space-y-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
            <TaskPromptBlock prompt={prompt} onCopyPrompt={onCopyPrompt} />
            {tags ? <div className="flex flex-wrap gap-1.5">{tags}</div> : null}
            {error ? <TaskErrorLine error={error} /> : null}
        </div>
    );
}

export function TaskErrorLine({ error, onDetail }: { error: string; onDetail?: () => void }) {
    return (
        <div className="flex items-start justify-between gap-2 rounded-md bg-red-100 px-2 py-1.5 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <span className="line-clamp-2 min-w-0">{error}</span>
            {onDetail ? (
                <Button size="small" type="text" className="!h-auto !p-0 text-xs" onClick={onDetail}>
                    详情
                </Button>
            ) : null}
        </div>
    );
}

export function FailureDetailModal({ open, detail, onClose }: { open: boolean; detail: string; onClose: () => void }) {
    return (
        <Modal title="失败详情" open={open} width={760} onCancel={onClose} footer={null} destroyOnHidden>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-foreground">{detail || "没有详情"}</pre>
        </Modal>
    );
}

export function FailedResultCard({ mediaClassName, references, error, detail, info, extraActions, onRetry }: {
    mediaClassName: string;
    references?: ReferenceImage[];
    error: string;
    detail?: string;
    info?: ReactNode;
    extraActions?: ReactNode;
    onRetry?: () => void;
}) {
    const [detailOpen, setDetailOpen] = useState(false);
    return (
        <div role="alert" className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className={`relative flex flex-col items-center justify-center gap-3 p-5 text-center ${mediaClassName}`}>
                <ReferenceThumbnailOverlay references={references} className="left-1.5 top-1.5" />
                <AlertCircle className="size-7 text-red-500" aria-hidden />
                <div className="text-sm font-medium text-red-600 dark:text-red-300">生成失败</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            {info}
            <div className="flex items-center justify-between gap-2 border-t border-red-200 p-3 dark:border-red-950">
                <div className="flex gap-2">{extraActions}</div>
                <div className="flex gap-2">
                    <Button size="small" onClick={() => setDetailOpen(true)}>
                        详情
                    </Button>
                    {onRetry ? (
                        <Button size="small" danger onClick={onRetry}>
                            重试
                        </Button>
                    ) : null}
                </div>
            </div>
            <FailureDetailModal open={detailOpen} detail={detail || error} onClose={() => setDetailOpen(false)} />
        </div>
    );
}

export function MediaResultCard({ media, mediaClassName, mediaBackgroundClassName = "bg-muted", overlay, references, prompt, tags, meta, actions, onCopyPrompt }: {
    media: ReactNode;
    mediaClassName: string;
    mediaBackgroundClassName?: string;
    overlay?: ReactNode;
    references?: ReferenceImage[];
    prompt: string;
    tags?: ReactNode;
    meta: ReactNode;
    actions?: ReactNode;
    onCopyPrompt: (text: string) => void | Promise<void>;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-background transition-[border-color,box-shadow] hover:border-border/70 hover:shadow-sm">
            <div className={`relative ${mediaClassName} ${mediaBackgroundClassName}`}>
                {overlay}
                <ReferenceThumbnailOverlay references={references} className="left-1.5 top-1.5" />
                {media}
            </div>
            <TaskResultInfo prompt={prompt} tags={tags} onCopyPrompt={onCopyPrompt} />
            <ResultMediaMeta meta={meta} actions={actions} />
        </div>
    );
}

export function PendingMediaCard({ mediaClassName, prompt, tags, onCopyPrompt, children }: {
    mediaClassName: string;
    prompt: string;
    tags?: ReactNode;
    onCopyPrompt: (text: string) => void | Promise<void>;
    children: ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-dashed border-border bg-muted/50">
            <div className={`relative ${mediaClassName}`}>{children}</div>
            <TaskResultInfo prompt={prompt} tags={tags} onCopyPrompt={onCopyPrompt} />
        </div>
    );
}

export function ResultMediaMeta({ meta, actions }: { meta: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border px-2.5 py-2">
            <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">{meta}</div>
            {actions ? <div className="flex shrink-0 gap-1">{actions}</div> : null}
        </div>
    );
}
