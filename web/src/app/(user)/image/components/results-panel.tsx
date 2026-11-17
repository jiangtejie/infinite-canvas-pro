"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { App, Button, Input, Modal } from "antd";
import { ImagePlus } from "lucide-react";

import { EmptyState } from "@/components/ui/state-panel";
import { ResultsPanelShell, ResultsToolbarActions } from "@/components/workbench/results-shell";
import { useResultsWindow } from "@/components/workbench/use-results-window";

import { cn } from "@/lib/utils";

import type { GeneratedImage, GenerationCategory, GenerationLog, GenerationResult, ResultViewMode } from "../history";
import { imageLogIdentityKeys, imageResultIdentityKeys } from "../history";
import { CategoryCard } from "./category-card";
import { HistoryLogCard } from "./history-log-card";
import { FailedImageCard, PendingImageCard, ResultImageCard, StoppedImageCard } from "./result-cards";

const EMPTY_PROMPTS = [
    "酸性绿色背景的极简海报，中央黑色几何标志，无文字",
    "雨夜霓虹街道上的复古跑车，电影感，低机位",
    "白色背景上的透明玻璃花瓶，柔光静物",
];

export function ResultsPanel({
    className = "",
    results,
    logs,
    categories,
    resultViewMode,
    activeCategoryId,
    pendingCount,
    now,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onResultViewModeChange,
    onActiveCategoryChange,
    onCreateCategory,
    onRenameCategory,
    onDeleteCategory,
    onToggleLogCategory,
    onClearLogCategories,
    onDeleteSelected,
    onDeleteLog,
    onPreviewLog,
    onRetryLog,
    onReuseConfig,
    onCopyPrompt,
    onEdit,
    onMaskEdit,
    onDownload,
    onSaveAsset,
    syncingImageIds,
    onSyncResult,
    onSyncLog,
    onRetry,
    onStop,
    canStopResult,
    onUseExample,
}: {
    className?: string;
    results: GenerationResult[];
    logs: GenerationLog[];
    categories: GenerationCategory[];
    resultViewMode: ResultViewMode;
    activeCategoryId: string | null;
    pendingCount: number;
    now: number;
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onResultViewModeChange: (mode: ResultViewMode) => void;
    onActiveCategoryChange: (id: string | null) => void;
    onCreateCategory: (name: string) => Promise<GenerationCategory | null>;
    onRenameCategory: (category: GenerationCategory, name: string) => void;
    onDeleteCategory: (category: GenerationCategory) => void;
    onToggleLogCategory: (log: GenerationLog, categoryId: string) => void;
    onClearLogCategories: (log: GenerationLog) => void;
    onDeleteSelected: () => void;
    onDeleteLog: (log: GenerationLog) => void;
    onPreviewLog: (log: GenerationLog) => void;
    onRetryLog: (log: GenerationLog) => void;
    onReuseConfig: (result: GenerationResult) => void;
    onCopyPrompt: (text: string) => void | Promise<void>;
    onEdit: (image: GeneratedImage, index: number) => void;
    onMaskEdit: (log: GenerationLog, image: GeneratedImage) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    syncingImageIds: string[];
    onSyncResult: (resultId: string, image: GeneratedImage, index: number) => void;
    onSyncLog: (log: GenerationLog, image: GeneratedImage, index: number) => void;
    onRetry: (result: GenerationResult) => void;
    onStop: (result: GenerationResult) => void;
    canStopResult?: (result: GenerationResult) => boolean;
    onUseExample: (prompt: string) => void;
}) {
    const { message } = App.useApp();
    const [creatingCategory, setCreatingCategory] = useState(false);
    const [categoryName, setCategoryName] = useState("");
    const { baseVisibleLogs, visibleLogs, displayedLogs, hasMore, loadMore, allSelected: allVisibleLogsSelected, toggleVisibleLogs } = useResultsWindow({
        results,
        logs,
        selectedLogIds,
        onSelectedLogIdsChange,
        resultIdentityKeys: imageResultIdentityKeys,
        isLogLive: (log, liveKeys) => imageLogIdentityKeys(log).some((key) => liveKeys.has(key)) || log.images.some((image) => liveKeys.has(image.id)),
        filterLogs: (items) => (resultViewMode === "category" ? (activeCategoryId ? items.filter((log) => log.categoryIds.includes(activeCategoryId)) : items.filter((log) => !log.categoryIds.length)) : items),
        resetKey: `${resultViewMode}:${activeCategoryId ?? ""}`,
    });
    const categoryGroups = categories.map((category) => ({ category, logs: baseVisibleLogs.filter((log) => log.categoryIds.includes(category.id)) }));
    const activeCategory = activeCategoryId ? categories.find((category) => category.id === activeCategoryId) : null;
    const totalCount = results.length + (resultViewMode === "category" ? (activeCategoryId ? visibleLogs.length : categories.length + visibleLogs.length) : visibleLogs.length);
    const showLiveSection = resultViewMode === "category" && results.length > 0;
    const showArchiveGrid = Boolean(displayedLogs.length || (!showLiveSection && results.length) || (resultViewMode === "category" && !activeCategoryId && categoryGroups.length));
    const resultGridClass = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
    const selectedImages = visibleLogs.flatMap((log) => (selectedLogIds.includes(log.id) ? log.images.filter((image) => Boolean(image.dataUrl)) : []));
    const createCategory = async () => {
        const name = categoryName.trim();
        if (!name) {
            message.error("请输入分类名称");
            return;
        }
        const category = await onCreateCategory(name);
        if (!category) return;
        setCategoryName("");
        setCreatingCategory(false);
    };

    useEffect(() => {
        if (activeCategoryId && !categories.some((category) => category.id === activeCategoryId)) onActiveCategoryChange(null);
    }, [activeCategoryId, categories, onActiveCategoryChange]);

    const liveResultCards = results.map((result, index) => (
        <div key={result.id} className="enter-up h-full" style={{ "--enter-index": Math.min(index, 8) } as CSSProperties}>
            {result.status === "success" && result.image ? (
                <ResultImageCard
                    result={result}
                    image={result.image}
                    index={index}
                    onCopyPrompt={onCopyPrompt}
                    onEdit={onEdit}
                    onReuseConfig={onReuseConfig}
                    onDownload={onDownload}
                    onSaveAsset={onSaveAsset}
                    syncing={syncingImageIds.includes(result.image.id)}
                    onSync={(image) => onSyncResult(result.id, image, index)}
                />
            ) : result.status === "failed" ? (
                <FailedImageCard result={result} error={result.error || "生成失败"} onCopyPrompt={onCopyPrompt} onRetry={() => onRetry(result)} />
            ) : result.status === "stopped" ? (
                <StoppedImageCard result={result} onCopyPrompt={onCopyPrompt} onRetry={() => onRetry(result)} />
            ) : (
                <PendingImageCard result={result} now={now} onCopyPrompt={onCopyPrompt} stopping={result.status === "stopping"} onStop={canStopResult?.(result) ?? Boolean(result.task) ? () => onStop(result) : undefined} />
            )}
        </div>
    ));

    return (
        <ResultsPanelShell
            className={className}
            title={activeCategory ? activeCategory.name : "全部结果"}
            count={totalCount}
            pendingCount={pendingCount}
            actions={
                <>
                    {activeCategory ? (
                        <Button size="small" onClick={() => onActiveCategoryChange(null)}>
                            返回分类
                        </Button>
                    ) : null}
                    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
                        <button
                            type="button"
                            aria-pressed={resultViewMode === "all"}
                            className={cn("h-7 rounded-md px-2.5 text-[11px] transition-colors", resultViewMode === "all" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}
                            onClick={() => {
                                onActiveCategoryChange(null);
                                onResultViewModeChange("all");
                            }}
                        >
                            全部展示
                        </button>
                        <button
                            type="button"
                            aria-pressed={resultViewMode === "category"}
                            className={cn("h-7 rounded-md px-2.5 text-[11px] transition-colors", resultViewMode === "category" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}
                            onClick={() => onResultViewModeChange("category")}
                        >
                            分类展示
                        </button>
                    </div>
                    <ResultsToolbarActions
                        onNew={resultViewMode === "category" ? () => setCreatingCategory(true) : onCreateSession}
                        newLabel={resultViewMode === "category" ? "新建分类" : "新建"}
                        onToggleSelectAll={toggleVisibleLogs}
                        selectAllLabel={allVisibleLogsSelected ? "取消" : "全选"}
                        selectAllDisabled={!visibleLogs.length}
                        onDownload={() => selectedImages.forEach(onDownload)}
                        downloadDisabled={!selectedImages.length}
                        onDelete={onDeleteSelected}
                        deleteDisabled={!selectedLogIds.length}
                    />
                </>
            }
            empty={
                <div
                    className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border/60 bg-muted/10 lg:min-h-[520px]"
                    style={{ backgroundImage: "radial-gradient(circle at 50% 34%, var(--acid-soft), transparent 58%)" }}
                >
                    <EmptyState
                icon={<ImagePlus className="size-6" />}
                title="还没有生成图片"
                description="输入提示词并开始生成，或者先试试这些方向。"
                action={
                    <div className="flex max-w-lg flex-wrap justify-center gap-2">
                        {EMPTY_PROMPTS.map((prompt) => (
                            <Button key={prompt} size="small" className="!h-auto !whitespace-normal !px-3 !py-1.5 !text-left !text-[11px]" onClick={() => onUseExample(prompt)}>
                                {prompt}
                            </Button>
                        ))}
                    </div>
                }
            />
                </div>
            }
        >
            {showLiveSection ? (
                <section className="mb-5">
                    <div className="mb-3 flex items-center gap-2.5">
                        <span className="size-1.5 rounded-full bg-acid shadow-[0_0_10px_var(--acid)]" aria-hidden />
                        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">本次生成</h3>
                        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden />
                    </div>
                    <div className={resultGridClass}>{liveResultCards}</div>
                </section>
            ) : null}
            {showArchiveGrid ? (
                <div className={resultGridClass}>
                    {showLiveSection ? null : liveResultCards}
                    {resultViewMode === "category" && !activeCategoryId
                        ? categoryGroups.map(({ category, logs: categoryLogs }) => (
                              <CategoryCard key={category.id} category={category} logs={categoryLogs} onRename={onRenameCategory} onDelete={onDeleteCategory} onOpen={() => onActiveCategoryChange(category.id)} />
                          ))
                        : null}
                    {displayedLogs.map((log, index) => (
                        <div key={log.id} className="enter-up h-full" style={{ "--enter-index": Math.min(index + results.length, 8) } as CSSProperties}>
                            <HistoryLogCard
                                log={log}
                                categories={categories}
                                index={index}
                                selected={selectedLogIds.includes(log.id)}
                                active={activeLogId === log.id}
                                onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                                onDelete={() => onDeleteLog(log)}
                                onToggleCategory={(categoryId) => onToggleLogCategory(log, categoryId)}
                                onClearCategories={() => onClearLogCategories(log)}
                                onCreateCategory={onCreateCategory}
                                onPreview={() => onPreviewLog(log)}
                                onRetry={() => onRetryLog(log)}
                                onCopyPrompt={onCopyPrompt}
                                onEdit={onEdit}
                                onMaskEdit={(image) => onMaskEdit(log, image)}
                                onDownload={onDownload}
                                onSaveAsset={onSaveAsset}
                                syncing={syncingImageIds.includes(log.images.find((image) => Boolean(image.dataUrl))?.id || "")}
                                onSync={(image) => onSyncLog(log, image, index)}
                            />
                        </div>
                    ))}
                </div>
            ) : null}
            {hasMore ? (
                <div className="mt-4 flex justify-center">
                    <Button onClick={loadMore}>加载更多（剩余 {visibleLogs.length - displayedLogs.length}）</Button>
                </div>
            ) : null}
            <Modal title="新建分类" open={creatingCategory} onCancel={() => setCreatingCategory(false)} onOk={() => void createCategory()} okText="创建" cancelText="取消" destroyOnHidden>
                <Input value={categoryName} autoFocus placeholder="输入分类名称" onChange={(event) => setCategoryName(event.target.value)} onPressEnter={() => void createCategory()} />
            </Modal>
        </ResultsPanelShell>
    );
}
