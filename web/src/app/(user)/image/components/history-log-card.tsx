"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Image, Input, Tag } from "antd";
import { AlertCircle, Brush, CloudUpload, Download, FolderPlus, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";

import { FailureDetailModal, ReferenceThumbnailOverlay, TaskErrorLine, TaskPromptBlock, formatTaskTime } from "@/components/workbench/task-result";
import { formatDuration } from "@/lib/image-utils";
import { previewUrlFor } from "@/services/image-storage";
import type { GeneratedImage, GenerationCategory, GenerationLog } from "../history";

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
        <div className={`overflow-hidden rounded-lg border bg-background transition-[border-color,box-shadow] hover:shadow-sm ${active ? "border-foreground" : "border-border hover:border-border/70"}`}>
            <div className="relative aspect-[4/3] bg-muted">
                <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-1 shadow-sm">
                    <Checkbox checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} />
                    {selected ? <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={onDelete} /> : null}
                </div>
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    {firstImage && !firstImage.storageKey?.startsWith("server:") ? <Tag className="m-0 text-[10px]" color="gold">临时URL</Tag> : null}
                    <Tag className="m-0 text-[10px]" color={log.status === "生成中" ? "processing" : log.failCount ? "red" : "blue"}>
                        {log.status === "生成中" ? "生成中" : log.failCount ? `失败 ${log.failCount}` : "成功"}
                    </Tag>
                    <Tag className="m-0 text-[10px]">{log.imageCount} 张</Tag>
                </div>
                {firstImage ? (
                    <Image src={previewUrlFor(`image-result:${firstImage.id}`, firstImage.storageKey || firstImage.dataUrl) || firstImage.dataUrl} preview={{ src: firstImage.dataUrl }} alt={`历史结果 ${index + 1}`} className="aspect-[4/3] object-cover" />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 p-5 text-center text-sm text-red-500">
                        <AlertCircle className="size-7" />
                        <span>{log.errors[0] || "没有可显示的图片"}</span>
                    </div>
                )}
                {displayImages.length > 1 ? (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1 overflow-hidden">
                        {displayImages.slice(0, 4).map((image) => (
                            <img loading="lazy" decoding="async" key={image.id} src={previewUrlFor(`image-result:${image.id}`, image.storageKey || image.dataUrl) || image.dataUrl} alt="" className="size-8 shrink-0 rounded border border-border object-cover shadow-sm" />
                        ))}
                    </div>
                ) : null}
                <ReferenceThumbnailOverlay references={log.references} className="bottom-1.5 right-1.5" />
            </div>
            <div className="space-y-2 border-t border-border p-2.5 text-xs">
                <TaskPromptBlock prompt={log.prompt} onCopyPrompt={onCopyPrompt} />
                <div className="flex flex-wrap gap-1">
                    {logCategories.length ? (
                        logCategories.map((category) => (
                            <Tag key={category.id} className="m-0 text-[10px]" color="purple">
                                {category.name}
                            </Tag>
                        ))
                    ) : (
                        <Tag className="m-0 text-[10px]">未分类</Tag>
                    )}
                    {log.workflowName ? (
                        <Tag className="m-0 text-[10px]" color="cyan">
                            工作流 {log.workflowName}
                        </Tag>
                    ) : null}
                    <Tag className="m-0 text-[10px]">{formatTaskTime(log.createdAt)}</Tag>
                    <Tag className="m-0 text-[10px]">{log.model}</Tag>
                    <Tag className="m-0 text-[10px]">{log.config.apiMode === "chat" ? "Chat" : log.config.apiMode === "responses" ? "Responses" : "Images"}</Tag>
                    <Tag className="m-0 text-[10px]">{log.config.size || "auto"}</Tag>
                    <Tag className="m-0 text-[10px]">{log.config.quality || "auto"}</Tag>
                    {log.config.apiMode !== "chat" && log.config.streamImages ? <Tag className="m-0 text-[10px]">流式 {log.config.streamPartialImages || "1"}</Tag> : null}
                    <Tag className="m-0 text-[10px]">{formatDuration(log.durationMs)}</Tag>
                </div>
                {log.errors[0] ? <TaskErrorLine error={log.errors[0]} onDetail={() => setDetailOpen(true)} /> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border px-2.5 py-2">
                <div ref={categoryMenuRef} className="relative flex flex-wrap gap-1 2xl:w-full 2xl:flex-nowrap 2xl:[&>.ant-btn]:!gap-1 2xl:[&>.ant-btn]:!px-1">
                    <Button size="small" onClick={() => closeThen(onPreview)}>
                        载入
                    </Button>
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => closeThen(onRetry)}>
                        重试
                    </Button>
                    <Button size="small" icon={<Brush className="size-3.5" />} onClick={() => closeThen(() => onMaskEdit(firstImage))}>
                        局部重绘
                    </Button>
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setCategoryOpen((value) => !value)}>
                        分类
                    </Button>
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
                    <div className="flex shrink-0 gap-1">
                        <Button size="small" title="同步到云端存储" aria-label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={firstImage.storageKey?.startsWith("server:")} onClick={() => closeThen(() => onSync(firstImage))} />
                        <Button size="small" aria-label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => closeThen(() => void onSaveAsset(firstImage, index))} />
                        <Button size="small" aria-label="继续编辑" icon={<PenLine className="size-3.5" />} onClick={() => closeThen(() => void onEdit(firstImage, index))} />
                        <Button size="small" aria-label="下载图片" icon={<Download className="size-3.5" />} onClick={() => closeThen(() => onDownload(firstImage, index))} />
                    </div>
                ) : null}
            </div>
            <FailureDetailModal open={detailOpen} detail={log.errorDetails?.[0] || log.errors[0] || ""} onClose={() => setDetailOpen(false)} />
        </div>
    );
}
