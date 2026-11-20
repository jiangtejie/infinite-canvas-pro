"use client";

import { useState } from "react";
import { Button, Image, Input, Tag } from "antd";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Copy, Download, Edit3, FilePlus2, LoaderCircle, Play, RotateCcw, Trash2 } from "lucide-react";

import { FailureDetailModal, TaskErrorLine } from "@/components/workbench/task-result";
import { formatBytes, formatDuration } from "@/lib/image-utils";

import { formatDate } from "./creative-workflow-model";
import type { CreativeWorkflow, SeriesPromptDraft, WorkflowRunResult, WorkflowTask } from "./creative-workflow-types";

export function WorkflowCard({ workflow, onRun, onEdit, onCopy, onDelete }: { workflow: CreativeWorkflow; onRun: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void }) {
    const editable = workflow.editable !== false;
    return (
        <article className="punk-card brackets group relative flex min-h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div aria-hidden className="h-[3px] w-full shrink-0 bg-[linear-gradient(90deg,var(--acid)_0_52px,transparent_52px)]" />
            <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="line-clamp-1 text-[15px] font-semibold tracking-tight">{workflow.name}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="chip">{workflow.category || "未分类"}</span>
                            <span className="chip">{workflow.mode === "multi_image_series" ? "多图" : "单图"}</span>
                            <span className="chip">{workflow.variables.length} 变量</span>
                            <span className={workflow.scope === "public" ? "chip chip-acid" : "chip"}>{workflow.scope === "public" ? "公开" : "个人"}</span>
                        </div>
                    </div>
                    <Button type="primary" size="small" icon={<Play className="size-3.5" />} onClick={onRun}>
                        运行
                    </Button>
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{workflow.description || "暂无描述"}</p>
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
                    <div className="line-clamp-4 whitespace-pre-wrap">{workflow.config.promptTemplate}</div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <span className="truncate font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                        {workflow.lastRunAt ? `RUN ${formatDate(workflow.lastRunAt)}` : `NEW ${formatDate(workflow.createdAt)}`}
                    </span>
                    <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button size="small" disabled={!editable} icon={<Edit3 className="size-3.5" />} onClick={onEdit} aria-label="编辑工作流" />
                        <Button size="small" icon={<FilePlus2 className="size-3.5" />} onClick={onCopy} aria-label="复制工作流" />
                        <Button size="small" disabled={!editable} danger icon={<Trash2 className="size-3.5" />} onClick={onDelete} aria-label="删除工作流" />
                    </div>
                </div>
            </div>
        </article>
    );
}

export function WorkflowTaskCard({ task, now, stopping, onCopyPrompt, onDownload, onRetry, onStop }: { task: WorkflowTask; now: number; stopping: boolean; onCopyPrompt: () => void; onDownload: (image: WorkflowRunResult, index: number) => void; onRetry: () => void; onStop: () => void }) {
    const [detailOpen, setDetailOpen] = useState(false);
    const elapsedMs = task.status === "running" ? now - task.startedAt : task.durationMs || (task.endedAt || task.startedAt) - task.startedAt;
    const statusView = {
        running: { label: "运行中", color: "processing", icon: <LoaderCircle className="size-4 animate-spin" /> },
        success: { label: "成功", color: "success", icon: <CheckCircle2 className="size-4" /> },
        failed: { label: "失败", color: "error", icon: <AlertCircle className="size-4" /> },
    }[task.status];

    return (
        <article className="overflow-hidden rounded-xl border border-border/70 bg-card transition-[border-color,box-shadow] duration-200 hover:border-acid/40 hover:shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-border/70 p-3.5">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="shrink-0 text-muted-foreground">{statusView.icon}</span>
                        <div className="truncate font-medium">{task.workflowName}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                        <Tag className="m-0" color={statusView.color}>
                            {statusView.label}
                        </Tag>
                        <Tag className="m-0">{formatDuration(elapsedMs)}</Tag>
                        <Tag className="m-0">{formatDate(task.startedAt)}</Tag>
                    </div>
                </div>
                <div className="flex shrink-0 gap-1">
                    {task.status === "running" ? (
                        <Button size="small" danger loading={stopping} onClick={onStop}>
                            停止
                        </Button>
                    ) : null}
                    {task.status === "failed" && task.workflowId ? (
                        <Button size="small" danger icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>
                            重试
                        </Button>
                    ) : null}
                    <Button size="small" icon={<Copy className="size-3.5" />} onClick={onCopyPrompt}>
                        复制提示词
                    </Button>
                </div>
            </div>
            <div className="space-y-3 p-3.5">
                <div className="line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-muted-foreground">{task.prompt}</div>
                {task.workflowId ? null : (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-5 text-amber-600 dark:text-amber-300">
                        模板信息缺失，无法重试；仍可查看已生成结果或停止运行中的任务。
                    </div>
                )}
                <div className="flex flex-wrap gap-1">
                    <Tag className="m-0 text-[10px]">{task.model}</Tag>
                    <Tag className="m-0 text-[10px]">{task.apiMode === "chat" ? "Chat" : task.apiMode === "responses" ? "Responses" : "Images"}</Tag>
                    <Tag className="m-0 text-[10px]">{task.config.size || "auto"}</Tag>
                    <Tag className="m-0 text-[10px]">{task.config.quality || "auto"}</Tag>
                    <Tag className="m-0 text-[10px]">{task.images.length}/{task.count} 张</Tag>
                    {task.failedCount ? <Tag className="m-0 text-[10px]" color="error">{task.failedCount} 张失败</Tag> : null}
                    {task.apiMode !== "chat" && task.config.streamImages ? <Tag className="m-0 text-[10px]">流式 {task.config.streamPartialImages || "1"}</Tag> : null}
                </div>
                {Object.keys(task.inputs).length ? (
                    <div className="flex flex-wrap gap-1">
                        {Object.entries(task.inputs)
                            .filter(([, value]) => String(value).trim())
                            .slice(0, 6)
                            .map(([key, value]) => (
                                <Tag key={key} className="m-0 max-w-full text-[10px]">
                                    <span className="font-medium">{key}</span>: <span className="inline-block max-w-48 truncate align-bottom">{String(value)}</span>
                                </Tag>
                            ))}
                    </div>
                ) : null}
                {task.error ? <TaskErrorLine error={task.error} onDetail={() => setDetailOpen(true)} /> : null}
                {task.images.length ? (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {task.images.map((image, index) => (
                            <div key={image.id} className="overflow-hidden rounded-lg border border-border/70 bg-muted dark:bg-background">
                                <Image src={image.imageUrl} alt={`${task.workflowName} ${index + 1}`} className="aspect-[4/3] object-cover" />
                                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                                    <span className="truncate">
                                        {image.width}x{image.height} · {formatBytes(image.bytes)}
                                    </span>
                                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : task.status === "running" ? (
                    <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">生成中 {formatDuration(elapsedMs)}</div>
                ) : null}
            </div>
            <FailureDetailModal open={detailOpen} detail={task.error || ""} onClose={() => setDetailOpen(false)} />
        </article>
    );
}

export function SeriesPromptDraftCard({
    draft,
    index,
    isFirst,
    isLast,
    onChange,
    onGenerate,
    onCopy,
    onMoveUp,
    onMoveDown,
    onDelete,
}: {
    draft: SeriesPromptDraft;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    onChange: (patch: Partial<SeriesPromptDraft>) => void;
    onGenerate: () => void;
    onCopy: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDelete: () => void;
}) {
    const statusView = {
        draft: { label: "待生成", color: undefined },
        running: { label: "生成中", color: "processing" },
        success: { label: "已完成", color: "success" },
        failed: { label: "失败", color: "error" },
    }[draft.status];
    return (
        <article className="rounded-lg border border-border/70 bg-muted/40 p-3 dark:bg-background">
            <div className="mb-2 flex items-center justify-between gap-2">
                <Input value={draft.title} className="max-w-[280px]" placeholder={`第 ${index + 1} 张标题`} onChange={(event) => onChange({ title: event.target.value })} />
                <div className="flex shrink-0 items-center gap-1">
                    <Tag className="m-0" color={statusView.color}>{statusView.label}</Tag>
                    <Button size="small" icon={<Copy className="size-3.5" />} onClick={onCopy} />
                    <Button size="small" disabled={isFirst} icon={<ArrowUp className="size-3.5" />} onClick={onMoveUp} />
                    <Button size="small" disabled={isLast} icon={<ArrowDown className="size-3.5" />} onClick={onMoveDown} />
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete} />
                    <Button size="small" type="primary" loading={draft.status === "running"} disabled={draft.status === "success"} icon={<Play className="size-3.5" />} onClick={onGenerate}>
                        生成
                    </Button>
                </div>
            </div>
            <Input.TextArea value={draft.prompt} autoSize={{ minRows: 3, maxRows: 7 }} onChange={(event) => onChange({ prompt: event.target.value, status: draft.status === "success" ? "draft" : draft.status })} />
            {draft.error ? <div className="mt-2 rounded-lg border border-red-200/70 bg-red-50 px-2.5 py-1.5 text-xs text-red-600 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">{draft.error}</div> : null}
        </article>
    );
}
