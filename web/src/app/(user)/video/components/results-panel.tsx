"use client";

import type { CSSProperties } from "react";
import { VideoIcon } from "lucide-react";

import { EmptyState } from "@/components/ui/state-panel";
import { ResultsPanelShell, ResultsToolbarActions } from "@/components/workbench/results-shell";

import type { GeneratedVideo, GenerationLog, GenerationResult } from "../history";
import { videoLogIdentityKeys, videoResultIdentityKeys } from "../history";
import { FailedVideoCard, HistoryLogCard, PendingVideoCard, ResultVideoCard } from "./result-cards";

export function ResultsPanel({
    className = "",
    results,
    logs,
    pendingCount,
    now,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onDeleteLog,
    onPreviewLog,
    onRetryLog,
    onPreviewResult,
    onRetryResult,
    onStopResult,
    onCopyPrompt,
    onDownload,
    onSyncResult,
    onSyncLog,
    onSaveAsset,
    syncingVideoIds,
}: {
    className?: string;
    results: GenerationResult[];
    logs: GenerationLog[];
    pendingCount: number;
    now: number;
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onDeleteLog: (log: GenerationLog) => void;
    onPreviewLog: (log: GenerationLog) => void;
    onRetryLog: (log: GenerationLog) => void;
    onPreviewResult: (result: GenerationResult) => void;
    onRetryResult: (result: GenerationResult) => void;
    onStopResult: (result: GenerationResult) => void;
    onCopyPrompt: (text: string) => void | Promise<void>;
    onDownload: (video: GeneratedVideo) => void;
    onSyncResult: (resultId: string, video: GeneratedVideo, index: number) => void;
    onSyncLog: (log: GenerationLog, video: GeneratedVideo, index: number) => void;
    onSaveAsset: (video: GeneratedVideo) => void;
    syncingVideoIds: string[];
}) {
    const visibleResults = results.filter((result) => result.status !== "failed" || pendingCount > 0);
    const liveResultKeys = new Set(visibleResults.flatMap(videoResultIdentityKeys));
    const liveLogIds = new Set(visibleResults.flatMap((result) => [result.taskLogId, result.id]).filter((id): id is string => Boolean(id)));
    const visibleLogs = logs.filter((log) => !liveLogIds.has(log.id) && !videoLogIdentityKeys(log).some((key) => liveResultKeys.has(key)));
    const totalCount = visibleResults.length + visibleLogs.length;
    const allSelected = Boolean(visibleLogs.length) && visibleLogs.every((log) => selectedLogIds.includes(log.id));
    const selectedVideos = visibleLogs.flatMap((log) => (selectedLogIds.includes(log.id) && log.video ? [log.video] : []));
    const toggleVisibleLogs = () => onSelectedLogIdsChange(allSelected ? selectedLogIds.filter((id) => !visibleLogs.some((log) => log.id === id)) : Array.from(new Set([...selectedLogIds, ...visibleLogs.map((log) => log.id)])));

    return (
        <ResultsPanelShell
            className={className}
            title="全部成果"
            count={totalCount}
            pendingCount={pendingCount}
            actions={
                <ResultsToolbarActions
                    onNew={onCreateSession}
                    onToggleSelectAll={toggleVisibleLogs}
                    selectAllLabel={allSelected ? "取消" : "全选"}
                    selectAllDisabled={!visibleLogs.length}
                    onDownload={() => selectedVideos.forEach(onDownload)}
                    downloadDisabled={!selectedVideos.length}
                    onDelete={onDeleteSelected}
                    deleteDisabled={!selectedLogIds.length}
                />
            }
            empty={
                <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border lg:min-h-[520px]">
                    <EmptyState icon={<VideoIcon className="size-6" />} title="还没有生成视频" description="填写提示词并开始创作，生成的视频会出现在这里。" />
                </div>
            }
        >
            {totalCount ? (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {visibleResults.map((result, index) => (
                        <div key={result.id} className="enter-up" style={{ "--enter-index": Math.min(index, 8) } as CSSProperties}>
                            {result.status === "success" && result.video ? (
                                <ResultVideoCard
                                    result={result}
                                    video={result.video}
                                    index={index}
                                    syncing={syncingVideoIds.includes(result.video.id)}
                                    onCopyPrompt={onCopyPrompt}
                                    onDownload={onDownload}
                                    onSync={(video) => onSyncResult(result.id, video, index)}
                                    onSaveAsset={onSaveAsset}
                                />
                            ) : result.status === "failed" ? (
                                <FailedVideoCard result={result} error={result.error || "生成失败"} onCopyPrompt={onCopyPrompt} onPreview={() => onPreviewResult(result)} onRetry={() => onRetryResult(result)} />
                            ) : (
                                <PendingVideoCard
                                    result={result}
                                    now={now}
                                    onCopyPrompt={onCopyPrompt}
                                    onStop={() => onStopResult(result)}
                                    onRetry={() => onRetryResult(result)}
                                    onDelete={() => {
                                        const log = logs.find((item) => item.id === (result.taskLogId || result.id));
                                        if (log) onDeleteLog(log);
                                    }}
                                />
                            )}
                        </div>
                    ))}
                    {visibleLogs.map((log, index) => (
                        <div key={log.id} className="enter-up" style={{ "--enter-index": Math.min(index + visibleResults.length, 8) } as CSSProperties}>
                            <HistoryLogCard
                                log={log}
                                index={index}
                                selected={selectedLogIds.includes(log.id)}
                                active={activeLogId === log.id}
                                syncing={Boolean(log.video && syncingVideoIds.includes(log.video.id))}
                                onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                                onDelete={() => onDeleteLog(log)}
                                onPreview={() => onPreviewLog(log)}
                                onRetry={() => onRetryLog(log)}
                                onCopyPrompt={onCopyPrompt}
                                onDownload={onDownload}
                                onSync={(video) => onSyncLog(log, video, index)}
                                onSaveAsset={onSaveAsset}
                            />
                        </div>
                    ))}
                </div>
            ) : null}
        </ResultsPanelShell>
    );
}
