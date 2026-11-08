"use client";

import { Button, Image, Tag } from "antd";
import { Ban, CloudUpload, Download, FolderPlus, LoaderCircle, PenLine } from "lucide-react";

import { FailedResultCard, ReferenceThumbnailOverlay, formatTaskTime } from "@/components/workbench/task-result";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { ImageMetaLine, ImagePromptBlock } from "./image-card-parts";
import { useImagePreviewUrl } from "./use-preview-url";

import type { GeneratedImage, GenerationResult } from "../history";

function metaItems(item: GenerationResult) {
    return [formatTaskTime(item.createdAt), item.model, item.workflowName ? `工作流 ${item.workflowName}` : "", item.config.size || "auto", item.durationMs ? formatDuration(item.durationMs) : ""];
}

function metaTitle(item: GenerationResult) {
    return [
        formatTaskTime(item.createdAt),
        item.model,
        item.workflowName ? `工作流 ${item.workflowName}` : "",
        item.config.apiMode === "chat" ? "Chat" : item.config.apiMode === "responses" ? "Responses" : "Images",
        item.config.size || "auto",
        `质量 ${item.config.quality || "auto"}`,
        item.config.apiMode !== "chat" && item.config.streamImages ? `流式 ${item.config.streamPartialImages || "1"}` : "",
        item.durationMs ? formatDuration(item.durationMs) : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

function ResultBadges({ storageKey }: { storageKey?: string }) {
    if (storageKey?.startsWith("server:")) return null;
    return (
        <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
            <Tag className="m-0 text-[10px]" color="gold">临时URL</Tag>
        </div>
    );
}

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
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-background transition-[border-color,box-shadow] duration-200 hover:border-acid/40 hover:shadow-sm">
            <div className="relative aspect-[4/3] shrink-0 bg-muted">
                <ResultBadges storageKey={image.storageKey} />
                <ReferenceThumbnailOverlay references={result.references} className="left-1.5 top-1.5" />
                <Image src={previewUrl} preview={{ src: image.dataUrl }} alt={`生成结果 ${index + 1}`} width={image.width || undefined} height={image.height || undefined} className="aspect-[4/3] object-cover" />
            </div>
            <div className="flex-1 space-y-2 p-3">
                <ImagePromptBlock prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                <ImageMetaLine title={metaTitle(result)} items={[...metaItems(result), image.width ? `${image.width}x${image.height}` : "", image.bytes ? formatBytes(image.bytes) : ""]} />
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-border/70 px-3 py-2.5">
                <Button size="small" title="同步到云端存储" aria-label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={image.storageKey?.startsWith("server:")} onClick={() => onSync(image)} />
                <Button size="small" title="保存到我的素材" aria-label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)} />
                <Button size="small" title="继续编辑" aria-label="继续编辑" icon={<PenLine className="size-3.5" />} onClick={() => void onEdit(image, index)} />
                <Button size="small" title="下载图片" aria-label="下载图片" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)} />
            </div>
        </div>
    );
}

export function PendingImageCard({ result, now, onCopyPrompt, onStop, stopping }: { result: GenerationResult; now: number; onCopyPrompt: (text: string) => void | Promise<void>; onStop?: () => void; stopping?: boolean }) {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-dashed border-border/70 bg-muted/40">
            <div className="relative aspect-[4/3] shrink-0">
                <div
                    className="absolute inset-0 opacity-60"
                    style={{
                        backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--foreground) 12%, transparent) 1.4px, transparent 1.6px)",
                        backgroundSize: "16px 16px",
                    }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-6 animate-spin" />
                    <span>{stopping ? "停止中" : "生成中"}</span>
                    <span className="rounded-full bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">{formatDuration(Math.max(0, now - result.createdAt))}</span>
                    {onStop ? (
                        <Button size="small" loading={stopping} onClick={onStop}>
                            {stopping ? "停止中…" : "停止"}
                        </Button>
                    ) : null}
                </div>
            </div>
            <div className="flex-1 space-y-2 border-t border-border/70 p-3">
                <ImagePromptBlock prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                <ImageMetaLine items={metaItems({ ...result, durationMs: Math.max(0, now - result.createdAt) })} />
            </div>
        </div>
    );
}

export function StoppedImageCard({ result, onCopyPrompt, onRetry }: { result: GenerationResult; onCopyPrompt: (text: string) => void | Promise<void>; onRetry: () => void }) {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-dashed border-border/70 bg-muted/40">
            <div className="relative flex aspect-[4/3] shrink-0 flex-col items-center justify-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Ban className="size-4" aria-hidden />
                </span>
                <span className="text-[13px] text-muted-foreground">已停止生成</span>
                <Button size="small" onClick={onRetry}>
                    重新生成
                </Button>
            </div>
            <div className="flex-1 space-y-2 border-t border-border/70 p-3">
                <ImagePromptBlock prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                <ImageMetaLine items={metaItems(result)} />
            </div>
        </div>
    );
}

export function FailedImageCard({ result, error, onCopyPrompt, onRetry }: { result: GenerationResult; error: string; onCopyPrompt: (text: string) => void | Promise<void>; onRetry: () => void }) {
    return (
        <FailedResultCard
            mediaClassName="aspect-[4/3]"
            references={result.references}
            error={error}
            detail={result.errorDetail || error}
            info={
                <div className="space-y-2 border-t border-red-200/70 p-3.5 text-xs dark:border-red-950">
                    <ImagePromptBlock prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                    <ImageMetaLine items={metaItems(result)} />
                </div>
            }
            onRetry={onRetry}
        />
    );
}
