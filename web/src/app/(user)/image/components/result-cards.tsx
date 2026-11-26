"use client";

import { Dropdown, Image, Tag } from "antd";
import { CloudUpload, Download, FolderPlus, ImagePlus, MoreHorizontal, SlidersHorizontal } from "lucide-react";

import { FailedResultCard, MediaResultCard, PendingMediaCard, TaskActionButton, TaskIconButton, TaskProgressState, TaskPromptBlock, TaskStatusTag, formatTaskTime } from "@/components/workbench/task-result";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { ImageMetaLine } from "./image-card-parts";
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
            <TaskStatusTag status="success" />
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
    onReuseConfig,
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
    onReuseConfig: (result: GenerationResult) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number, prompt: string) => void;
    syncing: boolean;
    onSync: (image: GeneratedImage) => void;
}) {
    const previewUrl = useImagePreviewUrl(`image-result:${image.id}`, image.storageKey || image.dataUrl, image.dataUrl);
    const moreItems = [
        { key: "reuse", icon: <SlidersHorizontal className="size-3.5" />, label: "复用配置" },
        ...(image.storageKey?.startsWith("server:") ? [] : [{ key: "sync", icon: <CloudUpload className="size-3.5" />, label: "同步到云端", disabled: syncing }]),
        { key: "asset", icon: <FolderPlus className="size-3.5" />, label: "保存到我的素材" },
        { key: "download", icon: <Download className="size-3.5" />, label: "下载图片" },
    ];

    return (
        <MediaResultCard
            className="flex h-full flex-col"
            mediaClassName="aspect-[4/3] shrink-0"
            overlay={<ResultBadges storageKey={image.storageKey} />}
            references={result.references}
            info={
                <div className="flex-1 space-y-2 p-3">
                    <TaskPromptBlock compact prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                    <ImageMetaLine title={metaTitle(result)} items={[...metaItems(result), image.width ? `${image.width}x${image.height}` : "", image.bytes ? formatBytes(image.bytes) : ""]} />
                </div>
            }
            actions={
                <>
                    <TaskActionButton icon={<ImagePlus className="size-3.5" />} onClick={() => void onEdit(image, index)}>
                        作为参考图
                    </TaskActionButton>
                    <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        menu={{
                            items: moreItems,
                            onClick: ({ key }) => {
                                if (key === "reuse") onReuseConfig(result);
                                else if (key === "sync") onSync(image);
                                else if (key === "asset") void onSaveAsset(image, index, result.prompt);
                                else if (key === "download") onDownload(image, index);
                            },
                        }}
                    >
                        <TaskIconButton label="更多操作" className="!text-muted-foreground hover:!text-foreground" icon={<MoreHorizontal className="size-3.5" />} />
                    </Dropdown>
                </>
            }
            media={<Image src={previewUrl} preview={{ src: image.dataUrl }} alt={`生成结果 ${index + 1}`} width={image.width || undefined} height={image.height || undefined} className="aspect-[4/3] object-cover" />}
        />
    );
}

export function PendingImageCard({ result, now, onCopyPrompt, onStop, stopping }: { result: GenerationResult; now: number; onCopyPrompt: (text: string) => void | Promise<void>; onStop?: () => void; stopping?: boolean }) {
    return (
        <PendingMediaCard
            className="flex h-full flex-col"
            mediaClassName="aspect-[4/3] shrink-0"
            info={
                <div className="flex-1 space-y-2 border-t border-border/70 p-3">
                    <TaskPromptBlock compact prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                    <ImageMetaLine items={metaItems({ ...result, durationMs: Math.max(0, now - result.createdAt) })} />
                </div>
            }
        >
            <TaskProgressState
                status={stopping ? "stopping" : "pending"}
                elapsedMs={Math.max(0, now - result.createdAt)}
                progress={result.progress}
                action={onStop ? <TaskActionButton loading={stopping} onClick={onStop}>{stopping ? "停止中…" : "停止"}</TaskActionButton> : null}
            />
        </PendingMediaCard>
    );
}

export function StoppedImageCard({ result, onCopyPrompt, onRetry }: { result: GenerationResult; onCopyPrompt: (text: string) => void | Promise<void>; onRetry: () => void }) {
    return (
        <PendingMediaCard
            className="flex h-full flex-col"
            mediaClassName="aspect-[4/3] shrink-0"
            info={
                <div className="flex-1 space-y-2 border-t border-border/70 p-3">
                    <TaskPromptBlock compact prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                    <ImageMetaLine items={metaItems(result)} />
                </div>
            }
        >
            <TaskProgressState status="stopped" elapsedMs={result.durationMs || 0} action={<TaskActionButton onClick={onRetry}>重新生成</TaskActionButton>} />
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
            info={
                <div className="space-y-2 border-t border-destructive/30 p-3.5 text-xs">
                    <TaskPromptBlock compact prompt={result.prompt} onCopyPrompt={onCopyPrompt} />
                    <ImageMetaLine items={metaItems(result)} />
                </div>
            }
            onRetry={onRetry}
        />
    );
}
