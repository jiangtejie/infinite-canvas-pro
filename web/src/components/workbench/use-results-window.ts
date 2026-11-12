"use client";

import { useEffect, useState } from "react";

/**
 * 结果窗口：live 结果与历史记录去重、48 条分批展示、加载更多、全选联动。
 * 身份键与去重条件由调用方传入，生图/视频两页各自保持原有行为。
 */
export function useResultsWindow<TResult, TLog extends { id: string }>({
    results,
    logs,
    selectedLogIds,
    onSelectedLogIdsChange,
    resultIdentityKeys,
    resultIds,
    isLogLive,
    filterLogs,
    resetKey,
}: {
    results: TResult[];
    logs: TLog[];
    selectedLogIds: string[];
    onSelectedLogIdsChange: (ids: string[]) => void;
    resultIdentityKeys: (result: TResult) => string[];
    resultIds?: (result: TResult) => Array<string | undefined>;
    isLogLive: (log: TLog, liveKeys: Set<string>, liveIds: Set<string>) => boolean;
    filterLogs?: (logs: TLog[]) => TLog[];
    resetKey?: string;
}) {
    const liveKeys = new Set<string>();
    for (const result of results) for (const key of resultIdentityKeys(result)) if (key) liveKeys.add(key);
    const liveIds = new Set<string>();
    if (resultIds) for (const result of results) for (const id of resultIds(result)) if (id) liveIds.add(id);

    const baseVisibleLogs = logs.filter((log) => !isLogLive(log, liveKeys, liveIds));
    const visibleLogs = filterLogs ? filterLogs(baseVisibleLogs) : baseVisibleLogs;
    const [visibleLogCount, setVisibleLogCount] = useState(48);
    useEffect(() => {
        setVisibleLogCount(48);
    }, [resetKey]);

    const displayedLogs = visibleLogs.slice(0, visibleLogCount);
    const allSelected = Boolean(visibleLogs.length) && visibleLogs.every((log) => selectedLogIds.includes(log.id));
    const toggleVisibleLogs = () => onSelectedLogIdsChange(allSelected ? selectedLogIds.filter((id) => !visibleLogs.some((log) => log.id === id)) : Array.from(new Set([...selectedLogIds, ...visibleLogs.map((log) => log.id)])));
    return {
        baseVisibleLogs,
        visibleLogs,
        displayedLogs,
        hasMore: visibleLogs.length > displayedLogs.length,
        loadMore: () => setVisibleLogCount((value) => value + 48),
        allSelected,
        toggleVisibleLogs,
    };
}
