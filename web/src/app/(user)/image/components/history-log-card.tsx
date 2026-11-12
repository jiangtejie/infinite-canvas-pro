"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Image, Input, Tag } from "antd";
import { AlertCircle, Brush, CloudUpload, Download, FolderPlus, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";

import { FailureDetailModal, ReferenceThumbnailOverlay, TaskErrorLine, TaskPromptBlock, formatTaskTime } from "@/components/workbench/task-result";
import { formatDuration } from "@/lib/image-utils";
import { ImageMetaLine } from "./image-card-parts";
import { useImagePreviewUrl } from "./use-preview-url";
import type { GeneratedImage, GenerationCategory, GenerationLog } from "../history";

function HistoryPreviewImage({ image, preview = false, alt, className }: { image: GeneratedImage; preview?: boolean; alt: string; className: string }) {
    const src = useImagePreviewUrl(`image-result:${image.id}`, image.storageKey || image.dataUrl, image.dataUrl);
    return preview ? <Image loading="lazy" src={src} preview={{ src: image.dataUrl }} alt={alt} width={image.width || undefined} height={image.height || undefined} className={className} /> : <img loading="lazy" decoding="async" src={src} alt={alt} width={image.width || undefined} height={image.height || undefined} className={className} />;
}

export function HistoryLogCard({
    log,
    categories,
    index,
    selected,
    active,
    onSelectedChange,
    onDelete,
    onToggleCategory,
    onClearCategories,
    onCreateCategory,
    onPreview,
    onRetry,
    onCopyPrompt,
    onEdit,
    onMaskEdit,
    onDownload,
    onSaveAsset,
    syncing,
    onSync,
}: {
    log: GenerationLog;
    categories: GenerationCategory[];
    index: number;
    selected: boolean;
    active: boolean;
    onSelectedChange: (checked: boolean) => void;
    onDelete: () => void;
    onToggleCategory: (categoryId: string) => void;
    onClearCategories: () => void;
    onCreateCategory: (name: string) => Promise<GenerationCategory | null>;
    onPreview: () => void;
    onRetry: () => void;
    onCopyPrompt: (text: string) => void | Promise<void>;
    onEdit: (image: GeneratedImage, index: number) => void;
    onMaskEdit: (image: GeneratedImage) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    syncing: boolean;
    onSync: (image: GeneratedImage) => void;
}) {
    const displayImages = log.images.filter((image) => Boolean(image.dataUrl));
    const firstImage = displayImages[0];
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [categoryName, setCategoryName] = useState("");
    const [detailOpen, setDetailOpen] = useState(false);
    const categoryMenuRef = useRef<HTMLDivElement>(null);
    const logCategories = categories.filter((category) => log.categoryIds.includes(category.id));
    const createCategory = async () => {
        const category = await onCreateCategory(categoryName);
        if (!category) return;
        setCategoryName("");
        onToggleCategory(category.id);
        setCategoryOpen(false);
    };
    const closeThen = (action: () => void) => {
        setCategoryOpen(false);
        action();
    };

    useEffect(() => {
        if (!categoryOpen) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!categoryMenuRef.current?.contains(event.target as Node)) setCategoryOpen(false);
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer);
        return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
    }, [categoryOpen]);

    return (
        <div className={`group flex h-full flex-col overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow] duration-200 hover:shadow-sm ${active ? "border-acid/60 shadow-sm" : "border-border/70 hover:border-acid/40"}`}>
            <div className="relative aspect-[4/3] shrink-0 bg-muted">
                <div className={`absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-1 shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 ${selected ? "sm:opacity-100" : ""}`}>
                    <Checkbox checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} />
                    {selected ? <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={onDelete} /> : null}
                </div>
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    {firstImage && !firstImage.storageKey?.startsWith("server:") ? <Tag className="m-0 !text-[10px]" color="gold">临时URL</Tag> : null}
                    {log.status === "生成中" || log.status === "停止中" ? (
                        <Tag className="m-0 !text-[10px]" color="processing">
                            生成中
                        </Tag>
                    ) : log.status === "已停止" ? (
                        <Tag className="m-0 !text-[10px]">已停止</Tag>
                    ) : log.failCount ? (
                        <Tag className="m-0 !text-[10px]" color="red">
                            失败 {log.failCount}
                        </Tag>
                    ) : log.imageCount > 1 ? (
                        <Tag className="m-0 !text-[10px]">{log.imageCount} 张</Tag>
                    ) : null}
                </div>
                {firstImage ? (
                    <HistoryPreviewImage image={firstImage} preview alt={`历史结果 ${index + 1}`} className="aspect-[4/3] object-cover" />
                ) : log.status === "已停止" || log.status === "停止中" ? (
                    <div className="flex size-full flex-col items-center justify-center gap-2 p-5 text-center">
                        <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            <AlertCircle className="size-4" aria-hidden />
                        </span>
                        <span className="text-[13px] text-muted-foreground">{log.status === "停止中" ? "正在停止" : "已停止生成"}</span>
                    </div>
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 p-5 text-center">
                        <span className="flex size-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                            <AlertCircle className="size-4" aria-hidden />
                        </span>
                        <span className="text-[13px] text-destructive">{log.errors[0] || "没有可显示的图片"}</span>
                    </div>
                )}
                {displayImages.length > 1 ? (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1 overflow-hidden">
                        {displayImages.slice(0, 4).map((image) => (
                            <HistoryPreviewImage key={image.id} image={image} alt="" className="size-8 shrink-0 rounded border border-border object-cover shadow-sm" />
                        ))}
                    </div>
                ) : null}
                <ReferenceThumbnailOverlay references={log.references} className="bottom-1.5 right-1.5" />
            </div>
            <div className="flex-1 space-y-2 border-t border-border/70 p-3 text-xs">
                <TaskPromptBlock compact prompt={log.prompt} onCopyPrompt={onCopyPrompt} />
                {logCategories.length ? (
                    <div className="flex flex-wrap gap-1">
                        {logCategories.slice(0, 3).map((category) => (
                            <Tag key={category.id} className="m-0 !text-[10px]" color="purple">
                                {category.name}
                            </Tag>
                        ))}
                        {logCategories.length > 3 ? <Tag className="m-0 !text-[10px]">+{logCategories.length - 3}</Tag> : null}
                    </div>
                ) : null}
                {log.errors[0] ? <TaskErrorLine error={log.errors[0]} onDetail={() => setDetailOpen(true)} /> : null}
                <ImageMetaLine
                    title={[formatTaskTime(log.createdAt), log.model, log.workflowName ? `工作流 ${log.workflowName}` : "", log.config.apiMode === "chat" ? "Chat" : log.config.apiMode === "responses" ? "Responses" : "Images", log.config.size || "auto", `质量 ${log.config.quality || "auto"}`, log.config.apiMode !== "chat" && log.config.streamImages ? `流式 ${log.config.streamPartialImages || "1"}` : "", formatDuration(log.durationMs)].filter(Boolean).join(" · ")}
                    items={[formatTaskTime(log.createdAt), log.model, log.workflowName ? `工作流 ${log.workflowName}` : "", log.config.size || "auto", formatDuration(log.durationMs)]}
                />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 px-3 py-2.5">
                <div ref={categoryMenuRef} className="relative flex items-center gap-1">
                    <Button size="small" onClick={() => closeThen(onPreview)}>
                        载入
                    </Button>
                    <Button size="small" title="重试" aria-label="重试" icon={<RotateCcw className="size-3.5" />} onClick={() => closeThen(onRetry)} />
                    <Button size="small" title="局部重绘" aria-label="局部重绘" icon={<Brush className="size-3.5" />} disabled={!firstImage} onClick={() => closeThen(() => firstImage ? onMaskEdit(firstImage) : undefined)} />
                    <Button size="small" title="分类" aria-label="分类" icon={<FolderPlus className="size-3.5" />} onClick={() => setCategoryOpen((value) => !value)} />
                    {categoryOpen ? (
                        <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-lg border border-border bg-popover p-2 shadow-xl">
                            <div className="max-h-44 space-y-1 overflow-y-auto">
                                {categories.map((category) => (
                                    <label key={category.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent">
                                        <Checkbox checked={log.categoryIds.includes(category.id)} onChange={() => closeThen(() => onToggleCategory(category.id))} />
                                        <span className="truncate">{category.name}</span>
                                    </label>
                                ))}
                                {!categories.length ? <div className="px-2 py-3 text-center text-xs text-muted-foreground">暂无分类</div> : null}
                            </div>
                            <div className="mt-2 flex gap-1 border-t border-border pt-2">
                                <Input size="small" value={categoryName} placeholder="新分类" onChange={(event) => setCategoryName(event.target.value)} onPressEnter={() => void createCategory()} />
                                <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => void createCategory()} />
                            </div>
                            <Button size="small" type="link" className="!mt-1 !h-auto !p-0 text-xs" onClick={() => closeThen(onClearCategories)}>
                                移至未分类
                            </Button>
                        </div>
                    ) : null}
                </div>
                {firstImage ? (
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                        <Button size="small" title="同步到云端存储" aria-label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={firstImage.storageKey?.startsWith("server:")} onClick={() => closeThen(() => onSync(firstImage))} />
                        <Button size="small" title="保存到我的素材" aria-label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => closeThen(() => void onSaveAsset(firstImage, index))} />
                        <Button size="small" title="继续编辑" aria-label="继续编辑" icon={<PenLine className="size-3.5" />} onClick={() => closeThen(() => void onEdit(firstImage, index))} />
                        <Button size="small" title="下载图片" aria-label="下载图片" icon={<Download className="size-3.5" />} onClick={() => closeThen(() => onDownload(firstImage, index))} />
                    </div>
                ) : null}
            </div>
            <FailureDetailModal open={detailOpen} detail={log.errorDetails?.[0] || log.errors[0] || ""} onClose={() => setDetailOpen(false)} />
        </div>
    );
}
