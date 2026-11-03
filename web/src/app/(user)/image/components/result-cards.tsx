"use client";

import { Button, Image, Tag } from "antd";
import { CloudUpload, Download, FolderPlus, LoaderCircle, PenLine } from "lucide-react";

import { FailedResultCard, MediaResultCard, PendingMediaCard, TaskResultInfo, formatTaskTime } from "@/components/workbench/task-result";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { useImagePreviewUrl } from "./use-preview-url";

import type { GeneratedImage, GenerationResult } from "../history";

export function ResultImageCard({
    result,
    image,
    index,
    onCopyPrompt,
    onEdit,
    onDownload,
    onSaveAsset,
    syncing,
    onSync,
}: {
    result: GenerationResult;
    image: GeneratedImage;
    index: number;
    onCopyPrompt: (text: string) => void | Promise<void>;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    syncing: boolean;
    onSync: (image: GeneratedImage) => void;
}) {
    const previewUrl = useImagePreviewUrl(`image-result:${image.id}`, image.storageKey || image.dataUrl, image.dataUrl);

    return (
        <MediaResultCard
            mediaClassName="aspect-[4/3]"
            overlay={
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    {!image.storageKey?.startsWith("server:") ? <Tag className="m-0 text-[10px]" color="gold">临时URL</Tag> : null}
                    <Tag className="m-0 text-[10px]" color="blue">新生成</Tag>
                </div>
            }
            references={result.references}
            prompt={result.prompt}
            tags={<TaskTags item={result} />}
            meta={
                <>
                    <span>
                        {image.width}x{image.height}
                    </span>
                    <span>{formatBytes(image.bytes)}</span>
                    <span>{formatDuration(image.durationMs)}</span>
                </>
            }
            actions={
                <>
                    <Button size="small" title="同步到云端存储" aria-label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={image.storageKey?.startsWith("server:")} onClick={() => onSync(image)} />
                    <Button size="small" aria-label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)} />
                    <Button size="small" aria-label="继续编辑" icon={<PenLine className="size-3.5" />} onClick={() => void onEdit(image, index)} />
                    <Button size="small" aria-label="下载图片" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)} />
                </>
            }
            onCopyPrompt={onCopyPrompt}
            media={<Image src={previewUrl} preview={{ src: image.dataUrl }} alt={`生成结果 ${index + 1}`} width={image.width || undefined} height={image.height || undefined} className="aspect-[4/3] object-cover" />}
        />
    );
}

export function PendingImageCard({ result, now, onCopyPrompt }: { result: GenerationResult; now: number; onCopyPrompt: (text: string) => void | Promise<void> }) {
    return (
        <PendingMediaCard
            mediaClassName="aspect-[4/3]"
            prompt={result.prompt}
            tags={<TaskTags item={{ ...result, durationMs: Math.max(0, now - result.createdAt) }} />}
            onCopyPrompt={onCopyPrompt}
        >
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground">
                <LoaderCircle className="size-6 animate-spin" />
                <span>生成中</span>
                <span className="rounded-full bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">{formatDuration(Math.max(0, now - result.createdAt))}</span>
            </div>
        </PendingMediaCard>
    );
}

export function FailedImageCard({ result, error, onCopyPrompt, onRetry }: { result: GenerationResult; error: string; onCopyPrompt: (text: string) => void | Promise<void>; onRetry: () => void }) {
    return (
        <FailedResultCard
            mediaClassName="aspect-[4/3]"
            references={result.references}
            error={error}
            detail={result.errorDetail || error}
            info={<TaskResultInfo prompt={result.prompt} tags={<TaskTags item={result} />} error={error} onCopyPrompt={onCopyPrompt} />}
            onRetry={onRetry}
        />
    );
}

export function TaskTags({ item }: { item: GenerationResult }) {
    return (
        <>
            {item.workflowName ? (
                <Tag className="m-0" color="cyan">
                    工作流 {item.workflowName}
                </Tag>
            ) : null}
            <Tag className="m-0">{formatTaskTime(item.createdAt)}</Tag>
            <Tag className="m-0">{item.model}</Tag>
            <Tag className="m-0">{item.config.apiMode === "chat" ? "Chat" : item.config.apiMode === "responses" ? "Responses" : "Images"}</Tag>
            <Tag className="m-0">{item.config.size || "auto"}</Tag>
            <Tag className="m-0">{item.config.quality || "auto"}</Tag>
            {item.config.apiMode !== "chat" && item.config.streamImages ? <Tag className="m-0">流式 {item.config.streamPartialImages || "1"}</Tag> : null}
            {item.durationMs ? <Tag className="m-0">{formatDuration(item.durationMs)}</Tag> : null}
        </>
    );
}
