"use client";

import { memo, useEffect, useState } from "react";
import { Checkbox, Tag } from "antd";
import { AlertCircle, CloudUpload, Download, FolderPlus, RotateCcw, Square, Trash2 } from "lucide-react";

import { FailedResultCard, FailureDetailModal, MediaResultCard, PendingMediaCard, ReferenceThumbnailOverlay, TaskActionButton, TaskErrorLine, TaskIconButton, TaskProgressState, TaskPromptBlock, TaskResultInfo, TaskStatusTag, formatTaskTime } from "@/components/workbench/task-result";
import { formatBytes, formatDuration } from "@/lib/image-utils";

import { isCloudVideo, type GeneratedVideo, type GenerationLog, type GenerationResult } from "../history";

export function ResultVideoCard({ result, video, syncing, onCopyPrompt, onDownload, onSync, onSaveAsset }: { result: GenerationResult; video: GeneratedVideo; index: number; syncing: boolean; onCopyPrompt: (text: string) => void | Promise<void>; onDownload: (video: GeneratedVideo) => void; onSync: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    return (
        <MediaResultCard
            mediaClassName="aspect-video"
            mediaBackgroundClassName="bg-black"
            overlay={
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    <VideoSourceTag video={video} />
                    <TaskStatusTag status="success" />
                </div>
            }
            references={result.references}
            prompt={result.prompt}
            tags={<TaskMetaLine item={result} />}
            meta={
                <>
                    <span>
                        {video.width}x{video.height}
                    </span>
                    {video.bytes ? <span>{formatBytes(video.bytes)}</span> : <span>远端地址</span>}
                    <span>{formatDuration(video.durationMs)}</span>
                </>
            }
            actions={
                <>
                    <TaskIconButton label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={isCloudVideo(video)} onClick={() => onSync(video)} />
                    <TaskIconButton label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)} />
                    <TaskIconButton label="下载视频" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)} />
                </>
            }
            onCopyPrompt={onCopyPrompt}
            media={<video src={video.url} controls className="size-full object-contain" />}
        />
    );
}

export function PendingVideoCard({ result, onCopyPrompt, onStop, onRetry, onDelete }: { result: GenerationResult; onCopyPrompt: (text: string) => void | Promise<void>; onStop: () => void; onRetry: () => void; onDelete: () => void }) {
    const stopping = result.status === "stopping";
    const stopped = result.status === "stopped";
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (stopping || stopped) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [stopping, stopped]);
    const durationMs = stopping || stopped ? result.durationMs || 0 : Math.max(0, now - result.createdAt);
    return (
        <PendingMediaCard
            mediaClassName="aspect-video"
            prompt={result.prompt}
            tags={<TaskMetaLine item={{ ...result, durationMs }} />}
            onCopyPrompt={onCopyPrompt}
        >
            <TaskProgressState
                status={stopped ? "stopped" : stopping ? "stopping" : "pending"}
                elapsedMs={durationMs}
                progress={result.progress}
                stoppingError={Boolean(result.error)}
                action={
                    <TaskActionButton
                        type={stopped ? "default" : "primary"}
                        danger={!stopped}
                        loading={stopping && !result.error}
                        disabled={stopping && !result.error}
                        onClick={stopped ? onRetry : onStop}
                        aria-label={stopped ? "重新生成" : stopping ? result.error ? "重试停止" : "停止中" : "停止"}
                        className="!min-w-12 !rounded-full !px-3"
                    >
                        {stopped ? <RotateCcw className="size-3" /> : <Square className="size-3" fill="currentColor" />}
                        {stopped ? "重新生成" : null}
                    </TaskActionButton>
                }
            />
            {stopped || stopping && result.error ? <TaskIconButton label="删除结果" danger className="!absolute right-1.5 top-1.5 z-10" icon={<Trash2 className="size-3.5" />} onClick={onDelete} /> : null}
        </PendingMediaCard>
    );
}

export function FailedVideoCard({ result, error, onCopyPrompt, onPreview, onRetry }: { result: GenerationResult; error: string; onCopyPrompt: (text: string) => void | Promise<void>; onPreview: () => void; onRetry: () => void }) {
    return (
        <FailedResultCard
            mediaClassName="aspect-video"
            references={result.references}
            error={error}
            detail={result.errorDetail || error}
            info={<TaskResultInfo prompt={result.prompt} tags={<TaskMetaLine item={result} />} error={error} onCopyPrompt={onCopyPrompt} />}
            extraActions={<TaskActionButton onClick={onPreview}>载入</TaskActionButton>}
            onRetry={onRetry}
        />
    );
}

export const HistoryLogCard = memo(function HistoryLogCard({ log, index, selected, active, syncing, onToggleSelect, onDelete, onPreview, onRetry, onCopyPrompt, onDownload, onSync, onSaveAsset }: { log: GenerationLog; index: number; selected: boolean; active: boolean; syncing: boolean; onToggleSelect: (logId: string, checked: boolean) => void; onDelete: (log: GenerationLog) => void; onPreview: (log: GenerationLog) => void; onRetry: (log: GenerationLog) => void; onCopyPrompt: (text: string) => void | Promise<void>; onDownload: (video: GeneratedVideo) => void; onSync: (log: GenerationLog, video: GeneratedVideo, index: number) => void; onSaveAsset: (video: GeneratedVideo, prompt: string) => void }) {
    const [detailOpen, setDetailOpen] = useState(false);
    return (
        <div className={`group overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow] duration-200 hover:shadow-sm ${active ? "border-acid/60 shadow-sm" : "border-border/70 hover:border-acid/40"}`}>
            <div className="relative aspect-video bg-muted">
                <div className={`absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-1 shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 ${selected ? "sm:opacity-100" : ""}`}>
                    <Checkbox checked={selected} onChange={(event) => onToggleSelect(log.id, event.target.checked)} />
                    {selected ? <TaskIconButton label="删除视频结果" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(log)} /> : null}
                </div>
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    {log.video ? <VideoSourceTag video={log.video} /> : null}
                    <TaskStatusTag status={log.status} />
                </div>
                {log.video ? <video src={log.video.url} controls className="size-full bg-black object-contain" /> : log.status === "已停止" ? <div className="flex size-full flex-col items-center justify-center gap-2 text-sm"><Square className="size-7" /><span>已停止</span></div> : <div className="flex size-full flex-col items-center justify-center gap-2 p-5 text-center text-sm text-destructive"><AlertCircle className="size-7" /><span>{log.error || "没有可显示的视频"}</span></div>}
                <ReferenceThumbnailOverlay references={log.references} className="bottom-1.5 right-1.5" />
            </div>
            <div className="space-y-2 border-t border-border/70 p-3 text-xs">
                <TaskPromptBlock prompt={log.prompt} onCopyPrompt={onCopyPrompt} />
                <MetaLine items={[formatTaskTime(log.createdAt), log.model, log.size, `${log.resolution}p`, `${log.seconds}s`, log.taskCount && log.taskCount > 1 ? `数量 ${log.taskCount}` : "", formatDuration(log.durationMs)]} />
                {log.error ? <TaskErrorLine error={log.error} onDetail={() => setDetailOpen(true)} /> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border/70 px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                    <TaskActionButton onClick={() => onPreview(log)}>载入</TaskActionButton>
                    <TaskActionButton icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(log)}>重试</TaskActionButton>
                </div>
                {log.video ? <div className="flex shrink-0 gap-1"><TaskIconButton label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={isCloudVideo(log.video)} onClick={() => onSync(log, log.video!, index)} /><TaskIconButton label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(log.video!, log.prompt)} /><TaskIconButton label="下载视频" icon={<Download className="size-3.5" />} onClick={() => onDownload(log.video!)} /></div> : null}
            </div>
            <FailureDetailModal open={detailOpen} detail={log.errorDetail || log.error || ""} onClose={() => setDetailOpen(false)} />
        </div>
    );
});

export function VideoSourceTag({ video }: { video: GeneratedVideo }) {
    const cloud = isCloudVideo(video);
    return <Tag className="m-0 !text-[10px]" color={cloud ? "green" : video.storageKey ? "default" : "gold"}>{cloud ? "云端" : video.storageKey ? "本地缓存" : "AI 临时URL"}</Tag>;
}

function MetaLine({ items }: { items: Array<string | undefined | null | false> }) {
    const text = items.filter((item): item is string => Boolean(item)).join(" · ");
    if (!text) return null;
    return <div className="line-clamp-2 w-full break-words text-[11px] leading-4 text-muted-foreground/90">{text}</div>;
}

function TaskMetaLine({ item }: { item: GenerationResult }) {
    return <MetaLine items={[formatTaskTime(item.createdAt), item.model, item.config.size || "auto", `${item.config.vquality || "720"}p`, `${item.config.videoSeconds || "6"}s`, item.taskCount && item.taskCount > 1 ? `数量 ${item.taskCount}` : "", item.durationMs ? formatDuration(item.durationMs) : ""]} />;
}
