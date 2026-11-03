"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * 画布选择状态：节点选中集合、连接选中与同步 ref。
 * 先收状态与常用操作，后续把框选 / 批量删除等交互逐步搬进来。
 */
export function useCanvasSelection() {
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const selectedNodeIdsRef = useRef(selectedNodeIds);

    useLayoutEffect(() => {
        selectedNodeIdsRef.current = selectedNodeIds;
    }, [selectedNodeIds]);

    const selectOnly = useCallback((id: string) => {
        setSelectedNodeIds(new Set([id]));
    }, []);

    const selectMany = useCallback((ids: Iterable<string>) => {
        setSelectedNodeIds(new Set(ids));
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedNodeIds(new Set());
    }, []);

    return { selectedNodeIds, setSelectedNodeIds, selectedConnectionId, setSelectedConnectionId, selectedNodeIdsRef, selectOnly, selectMany, clearSelection };
}
