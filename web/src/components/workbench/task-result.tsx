"use client";

import { useState, type ReactNode } from "react";
import { Button, Modal, Tag, Typography, type ButtonProps, type TagProps } from "antd";
import { AlertCircle, Ban, ChevronDown, ChevronUp, Copy, LoaderCircle } from "lucide-react";

import { formatDuration } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import type { ReferenceImage } from "@/types/image";

export function formatTaskTime(value: number) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function TaskActionButton({ className, ...props }: ButtonProps) {
    return <Button size="small" className={cn("!h-8 !px-2.5 pointer-coarse:!h-10", className)} {...props} />;
}

export function TaskIconButton({ label, className, ...props }: ButtonProps & { label: string }) {
    return <TaskActionButton {...props} type={props.type ?? "text"} title={label} aria-label={label} className={cn("!size-8 pointer-coarse:!size-10 !p-0", className)} />;
}

export function TaskStatusTag({ status, label, className }: { status: "pending" | "stopping" | "stopped" | "success" | "failed" | "partial" | "生成中" | "停止中" | "已停止" | "成功" | "失败"; label?: string; className?: string }) {
    const config: Record<typeof status, { label: string; color?: TagProps["color"] }> = {
        pending: { label: "生成中", color: "processing" },
        stopping: { label: "停止中", color: "processing" },
        stopped: { label: "已停止" },
        success: { label: "成功", color: "blue" },
        failed: { label: "失败", color: "red" },
        partial: { label: "部分失败", color: "red" },
        生成中: { label: "生成中", color: "processing" },
        停止中: { label: "停止中", color: "processing" },
        已停止: { label: "已停止" },
        成功: { label: "成功", color: "blue" },
        失败: { label: "失败", color: "red" },
    };
    const current = config[status];
    return <Tag className={cn("m-0 !text-[10px]", className)} color={current.color}>{label || current.label}</Tag>;
}

export function TaskProgressState({ status, elapsedMs, progress, stoppingError = false, action }: { status: "pending" | "stopping" | "stopped"; elapsedMs: number; progress?: number | null; stoppingError?: boolean; action?: ReactNode }) {
    const safeProgress = typeof progress === "number" ? Math.max(0, Math.min(100, Math.floor(progress))) : null;
    const stopped = status === "stopped";
    const label = stopped ? "已停止" : status === "stopping" ? stoppingError ? "停止未确认" : "停止中" : safeProgress !== null ? `正在创作 ${safeProgress}%` : "生成中";
    return (
        <>
            <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--foreground) 12%, transparent) 1.4px, transparent 1.6px)", backgroundSize: "16px 16px" }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                {stopped ? <span className="flex size-9 items-center justify-center rounded-xl bg-muted"><Ban className="size-4" aria-hidden /></span> : <LoaderCircle className="size-6 animate-spin" aria-hidden />}
                <span role="status" aria-live="polite">{label}</span>
                <span className="rounded-full bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">{formatDuration(Math.max(0, elapsedMs))}</span>
                {action}
            </div>
            {safeProgress !== null && !stopped ? (
                <div className="absolute inset-x-4 bottom-4 z-10 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                        <span>当前创作进度</span>
                        <span>{safeProgress}%</span>
                    </div>
                    <div role="progressbar" aria-label="生成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeProgress} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-acid shadow-[0_0_8px_-2px_var(--acid)] transition-[width] duration-300" style={{ width: `${safeProgress}%` }} />
                    </div>
                </div>
            ) : null}
        </>
    );
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

export function TaskPromptBlock({ prompt, onCopyPrompt, compact = false }: { prompt: string; onCopyPrompt: (text: string) => void | Promise<void>; compact?: boolean }) {
    const [expanded, setExpanded] = useState(false);
    if (compact) {
        return (
            <div className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
                <p className={`whitespace-pre-wrap break-words text-[12px] leading-5 text-foreground/80 ${expanded ? "" : "line-clamp-2"}`}>{prompt}</p>
                <div className="mt-1 flex justify-end gap-0.5">
                    <Button size="small" type="text" title="复制提示词" aria-label="复制提示词" className="!h-5 !px-1 !text-[10px]" icon={<Copy className="size-3" />} onClick={() => void onCopyPrompt(prompt)} />
                    <Button size="small" type="text" title={expanded ? "收起" : "展开"} aria-label={expanded ? "收起" : "展开"} className="!h-5 !px-1 !text-[10px]" icon={expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} onClick={() => setExpanded((value) => !value)} />
                </div>
            </div>
        );
    }
    return (
        <div className="rounded-lg border border-border/50 bg-muted/60 p-2.5">
            <div className={`${expanded ? "" : "line-clamp-2"} whitespace-pre-wrap text-[12px] leading-5 text-foreground/80`}>{prompt}</div>
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
        <div className="space-y-2.5 border-t border-border/70 px-3 py-3 text-xs text-muted-foreground">
            <TaskPromptBlock prompt={prompt} onCopyPrompt={onCopyPrompt} />
            {tags ? <div className="flex flex-wrap gap-1.5">{tags}</div> : null}
            {error ? <TaskErrorLine error={error} /> : null}
        </div>
    );
}

export function TaskErrorLine({ error, onDetail }: { error: string; onDetail?: () => void }) {
    return (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-destructive">
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
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/60 p-3 text-xs text-foreground">{detail || "没有详情"}</pre>
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
        <div role="alert" className="overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/10">
            <div className={`relative flex flex-col items-center justify-center gap-3 p-6 text-center ${mediaClassName}`}>
                <ReferenceThumbnailOverlay references={references} className="left-1.5 top-1.5" />
                <AlertCircle className="size-7 text-destructive" aria-hidden />
                <div className="text-sm font-medium text-destructive">生成失败</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-destructive">
                    {error}
                </Typography.Paragraph>
            </div>
            {info}
            <div className="flex items-center justify-between gap-2 border-t border-destructive/30 p-3.5">
                <div className="flex gap-2">{extraActions}</div>
                <div className="flex gap-2">
                    <TaskActionButton onClick={() => setDetailOpen(true)}>
                        详情
                    </TaskActionButton>
                    {onRetry ? (
                        <TaskActionButton danger onClick={onRetry}>
                            重试
                        </TaskActionButton>
                    ) : null}
                </div>
            </div>
            <FailureDetailModal open={detailOpen} detail={detail || error} onClose={() => setDetailOpen(false)} />
        </div>
    );
}

export function MediaResultCard({ media, mediaClassName, mediaBackgroundClassName = "bg-muted", overlay, references, prompt, tags, meta, actions, info, className = "", onCopyPrompt }: {
    media: ReactNode;
    mediaClassName: string;
    mediaBackgroundClassName?: string;
    overlay?: ReactNode;
    references?: ReferenceImage[];
    prompt?: string;
    tags?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    info?: ReactNode;
    className?: string;
    onCopyPrompt?: (text: string) => void | Promise<void>;
}) {
    return (
        <div className={`punk-card overflow-hidden rounded-2xl border border-border/70 bg-background ${className}`}>
            <div className={`relative ${mediaClassName} ${mediaBackgroundClassName}`}>
                {overlay}
                <ReferenceThumbnailOverlay references={references} className="left-1.5 top-1.5" />
                {media}
            </div>
            {info ?? (prompt && onCopyPrompt ? <TaskResultInfo prompt={prompt} tags={tags} onCopyPrompt={onCopyPrompt} /> : null)}
            <ResultMediaMeta meta={meta} actions={actions} />
        </div>
    );
}

export function PendingMediaCard({ mediaClassName, prompt, tags, info, className = "", onCopyPrompt, children }: {
    mediaClassName: string;
    prompt?: string;
    tags?: ReactNode;
    info?: ReactNode;
    className?: string;
    onCopyPrompt?: (text: string) => void | Promise<void>;
    children: ReactNode;
}) {
    return (
        <div className={`overflow-hidden rounded-2xl border border-dashed border-border/70 bg-muted/40 ${className}`}>
            <div className={`relative ${mediaClassName}`}>{children}</div>
            {info ?? (prompt && onCopyPrompt ? <TaskResultInfo prompt={prompt} tags={tags} onCopyPrompt={onCopyPrompt} /> : null)}
        </div>
    );
}

export function ResultMediaMeta({ meta, actions }: { meta?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border/70 px-3.5 py-2.5">
            <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground/90">{meta}</div>
            {actions ? <div className="flex shrink-0 gap-1.5">{actions}</div> : null}
        </div>
    );
}
