"use client";

import { useState } from "react";
import { Button, Checkbox, Tag } from "antd";
import { AlertCircle, CloudUpload, Download, FolderPlus, LoaderCircle, RotateCcw, Square, Trash2 } from "lucide-react";

import { FailedResultCard, FailureDetailModal, MediaResultCard, PendingMediaCard, ReferenceThumbnailOverlay, TaskErrorLine, TaskPromptBlock, TaskResultInfo, formatTaskTime } from "@/components/workbench/task-result";
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
                    <Tag className="m-0 !text-[10px]" color="blue">成功</Tag>
                </div>
            }
            references={result.references}
            prompt={result.prompt}
            tags={<TaskTags item={result} />}
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
                    <Button size="small" title="同步到云端存储" aria-label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={isCloudVideo(video)} onClick={() => onSync(video)} />
                    <Button size="small" aria-label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)} />
                    <Button size="small" aria-label="下载视频" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)} />
                </>
            }
            onCopyPrompt={onCopyPrompt}
            media={<video src={video.url} controls className="size-full object-contain" />}
        />
    );
}

export function PendingVideoCard({ result, now, onCopyPrompt, onStop, onRetry, onDelete }: { result: GenerationResult; now: number; onCopyPrompt: (text: string) => void | Promise<void>; onStop: () => void; onRetry: () => void; onDelete: () => void }) {
    const progress = typeof result.progress === "number" ? Math.max(0, Math.min(100, Math.floor(result.progress))) : null;
    const stopping = result.status === "stopping";
    const stopped = result.status === "stopped";
    const durationMs = stopping || stopped ? result.durationMs || 0 : Math.max(0, now - result.createdAt);
    return (
        <PendingMediaCard
            mediaClassName="aspect-video"
            prompt={result.prompt}
            tags={<TaskTags item={{ ...result, durationMs }} />}
            onCopyPrompt={onCopyPrompt}
        >
            <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--foreground) 12%, transparent) 1.4px, transparent 1.6px)", backgroundSize: "16px 16px" }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                {stopped ? <span className="flex size-9 items-center justify-center rounded-xl bg-muted"><Square className="size-4" /></span> : <LoaderCircle className="size-6 animate-spin" />}
                {stopped || stopping ? <span>{stopped ? "已停止" : result.error ? "停止未确认" : "停止中"}</span> : progress !== null ? <span className="animate-pulse font-semibold text-sky-500">正在创作 {progress}%</span> : <span>生成中</span>}
                <span className="rounded-full bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">{formatDuration(durationMs)}</span>
                <Button type={stopped ? "default" : "primary"} danger={!stopped} disabled={stopping && !result.error} onClick={stopped ? onRetry : onStop} aria-label={stopped ? "重新生成" : stopping ? result.error ? "重试停止" : "停止中" : "停止"} className="!h-6 !min-w-12 !rounded-full !px-3">
                    {stopped ? <RotateCcw className="size-3" /> : stopping && !result.error ? <LoaderCircle className="size-3.5 animate-spin" /> : <Square className="size-3" fill="currentColor" />}
                    {stopped ? "重新生成" : null}
                </Button>
            </div>
            {progress !== null && !stopped ? (
                <div className="absolute inset-x-4 bottom-4 z-10 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                        <span>当前创作进度</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)] transition-[width] duration-300" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            ) : null}
            {stopped || stopping && result.error ? <Button size="small" type="text" danger title="删除" aria-label="删除结果" className="!absolute right-1.5 top-1.5 z-10 !h-6 !w-6 !p-0" icon={<Trash2 className="size-3.5" />} onClick={onDelete} /> : null}
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
            info={<TaskResultInfo prompt={result.prompt} tags={<TaskTags item={result} />} error={error} onCopyPrompt={onCopyPrompt} />}
            extraActions={<Button size="small" onClick={onPreview}>载入</Button>}
            onRetry={onRetry}
        />
    );
}

export function HistoryLogCard({ log, selected, active, syncing, onSelectedChange, onDelete, onPreview, onRetry, onCopyPrompt, onDownload, onSync, onSaveAsset }: { log: GenerationLog; index: number; selected: boolean; active: boolean; syncing: boolean; onSelectedChange: (checked: boolean) => void; onDelete: () => void; onPreview: () => void; onRetry: () => void; onCopyPrompt: (text: string) => void | Promise<void>; onDownload: (video: GeneratedVideo) => void; onSync: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const [detailOpen, setDetailOpen] = useState(false);
    return (
        <div className={`overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow] duration-200 hover:shadow-sm ${active ? "border-acid/60 shadow-sm" : "border-border/70 hover:border-acid/40"}`}>
            <div className="relative aspect-video bg-muted">
                <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-1 shadow-sm">
                    <Checkbox checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} />
                    <Button size="small" type="text" danger title="删除" aria-label="删除视频结果" className="!h-6 !w-6 !p-0" icon={<Trash2 className="size-3.5" />} onClick={onDelete} />
                </div>
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    {log.video ? <VideoSourceTag video={log.video} /> : null}
                    <Tag className="m-0 !text-[10px]" color={log.status === "成功" ? "blue" : log.status === "生成中" || log.status === "停止中" ? "processing" : log.status === "已停止" ? undefined : "red"}>{log.status}</Tag>
                </div>
                {log.video ? <video src={log.video.url} controls className="size-full bg-black object-contain" /> : log.status === "已停止" ? <div className="flex size-full flex-col items-center justify-center gap-2 text-sm"><Square className="size-7" /><span>已停止</span></div> : <div className="flex size-full flex-col items-center justify-center gap-2 p-5 text-center text-sm text-red-500"><AlertCircle className="size-7" /><span>{log.error || "没有可显示的视频"}</span></div>}
                <ReferenceThumbnailOverlay references={log.references} className="bottom-1.5 right-1.5" />
            </div>
            <div className="space-y-2 border-t border-border/70 p-3 text-xs">
                <TaskPromptBlock prompt={log.prompt} onCopyPrompt={onCopyPrompt} />
                <div className="flex flex-wrap gap-1">
                    <Tag className="m-0 !text-[10px]">{formatTaskTime(log.createdAt)}</Tag>
                    <Tag className="m-0 !text-[10px]">{log.model}</Tag>
                    <Tag className="m-0 !text-[10px]">{log.size}</Tag>
                    <Tag className="m-0 !text-[10px]">{log.resolution}p</Tag>
                    <Tag className="m-0 !text-[10px]">{log.seconds}s</Tag>
                    <Tag className="m-0 !text-[10px]">数量 {log.taskCount || 1}</Tag>
                    <Tag className="m-0 !text-[10px]">{formatDuration(log.durationMs)}</Tag>
                </div>
                {log.error ? <TaskErrorLine error={log.error} onDetail={() => setDetailOpen(true)} /> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border/70 px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                    <Button size="small" onClick={onPreview}>载入</Button>
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>重试</Button>
                </div>
                {log.video ? <div className="flex shrink-0 gap-1"><Button size="small" title="同步到云端存储" aria-label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={isCloudVideo(log.video)} onClick={() => onSync(log.video!)} /><Button size="small" aria-label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(log.video!)} /><Button size="small" aria-label="下载视频" icon={<Download className="size-3.5" />} onClick={() => onDownload(log.video!)} /></div> : null}
            </div>
            <FailureDetailModal open={detailOpen} detail={log.errorDetail || log.error || ""} onClose={() => setDetailOpen(false)} />
        </div>
    );
}

export function VideoSourceTag({ video }: { video: GeneratedVideo }) {
    return <Tag className="m-0 !text-[10px]" color={video.storageKey ? "default" : "gold"}>{video.storageKey ? "本地缓存" : "AI 临时URL"}</Tag>;
}

export function TaskTags({ item }: { item: GenerationResult }) {
    return (
        <>
            <Tag className="m-0 !text-[10px]">{formatTaskTime(item.createdAt)}</Tag>
            <Tag className="m-0 !text-[10px]">{item.model}</Tag>
            <Tag className="m-0 !text-[10px]">{item.config.size || "auto"}</Tag>
            <Tag className="m-0 !text-[10px]">{item.config.vquality || "720"}p</Tag>
            <Tag className="m-0 !text-[10px]">{item.config.videoSeconds || "6"}s</Tag>
            <Tag className="m-0 !text-[10px]">数量 {item.taskCount || 1}</Tag>
            {item.durationMs ? <Tag className="m-0 !text-[10px]">{formatDuration(item.durationMs)}</Tag> : null}
        </>
    );
}
