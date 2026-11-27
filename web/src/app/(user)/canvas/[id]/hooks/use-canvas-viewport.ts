"use client";

import { useCallback, useEffect, useRef, useState, type RefObject, type SetStateAction } from "react";

import type { CanvasNodeData, ViewportTransform } from "../../types";

type UseCanvasViewportOptions = {
    containerRef: RefObject<HTMLDivElement | null>;
    size: { width: number; height: number };
    onBeforeChange?: () => void;
};

/** 视口提交到 React 的最小间隔：平移/缩放期间世界层直接写 transform，UI 只按这个频率跟随。 */
const COMMIT_INTERVAL = 80;

/**
 * 画布视口：状态、坐标换算、缩放、适配节点与动画。
 * 视口是唯一每帧变化的量，因此以 ref 为准，React state 只保留节流快照。
 */
export function useCanvasViewport({ containerRef, size, onBeforeChange }: UseCanvasViewportOptions) {
    const [viewport, setViewportState] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const viewportRef = useRef(viewport);
    const focusAnimationRef = useRef<number | null>(null);
    const listenersRef = useRef(new Set<(viewport: ViewportTransform) => void>());
    const commitTimerRef = useRef<number | null>(null);
    const lastCommitRef = useRef(Number.NEGATIVE_INFINITY);

    const setViewport = useCallback((action: SetStateAction<ViewportTransform>) => {
        const next = typeof action === "function" ? action(viewportRef.current) : action;
        // 调用方可能已经先写过 viewportRef（平移/滚轮路径），所以这里无条件通知，不做等值提前返回。
        viewportRef.current = next;
        listenersRef.current.forEach((listener) => listener(next));
        // 首帧立即提交（打开项目定位不会空一帧），之后的连续变化按间隔合并成一次。
        const now = performance.now();
        if (now - lastCommitRef.current >= COMMIT_INTERVAL) {
            lastCommitRef.current = now;
            setViewportState(next);
            return;
        }
        if (commitTimerRef.current != null) return;
        commitTimerRef.current = window.setTimeout(() => {
            commitTimerRef.current = null;
            lastCommitRef.current = performance.now();
            setViewportState(viewportRef.current);
        }, COMMIT_INTERVAL);
    }, []);

    /** 世界层订阅实时视口，自己在 rAF 里写 transform，不经过 React 提交。 */
    const subscribeViewport = useCallback((listener: (viewport: ViewportTransform) => void) => {
        listenersRef.current.add(listener);
        return () => {
            listenersRef.current.delete(listener);
        };
    }, []);

    useEffect(
        () => () => {
            if (commitTimerRef.current != null) window.clearTimeout(commitTimerRef.current);
            if (focusAnimationRef.current != null) cancelAnimationFrame(focusAnimationRef.current);
        },
        [],
    );

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, [containerRef]);

    const animateViewport = useCallback((target: ViewportTransform) => {
        if (focusAnimationRef.current) cancelAnimationFrame(focusAnimationRef.current);
        onBeforeChange?.();
        const start = { ...viewportRef.current };
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300;
        const startedAt = performance.now();
        const step = (now: number) => {
            const progress = duration ? Math.min(1, (now - startedAt) / duration) : 1;
            const eased = 1 - Math.pow(1 - progress, 3);
            const next = { x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased, k: start.k + (target.k - start.k) * eased };
            setViewport(next);
            focusAnimationRef.current = progress < 1 ? requestAnimationFrame(step) : null;
        };
        step(startedAt);
    }, [focusAnimationRef, onBeforeChange, setViewport]);

    const fitNodesToView = useCallback((targets: CanvasNodeData[]) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        // Side panels occupy flex space; measure the canvas itself to avoid subtracting them twice.
        const top = 88;
        const bottom = window.matchMedia("(max-width: 639px)").matches ? 172 : 96;
        const centerX = width / 2;
        const centerY = top + Math.max(1, height - top - bottom) / 2;
        if (!targets.length) {
            animateViewport({ x: centerX, y: centerY, k: 1 });
            return;
        }
        const left = Math.min(...targets.map((node) => node.position.x));
        const right = Math.max(...targets.map((node) => node.position.x + node.width));
        const upper = Math.min(...targets.map((node) => node.position.y));
        const lower = Math.max(...targets.map((node) => node.position.y + node.height));
        const k = Math.min(1, Math.max(0.05, Math.min(Math.max(1, width - 80) / Math.max(1, right - left), Math.max(1, height - top - bottom) / Math.max(1, lower - upper))));
        animateViewport({ x: centerX - (left + right) / 2 * k, y: centerY - (upper + lower) / 2 * k, k });
    }, [animateViewport, containerRef, size.height, size.width]);

    const setZoomScale = useCallback((scale: number) => {
        const nextScale = Math.min(Math.max(scale, 0.05), 5);
        if (focusAnimationRef.current) cancelAnimationFrame(focusAnimationRef.current);
        focusAnimationRef.current = null;
        const rect = containerRef.current?.getBoundingClientRect();
        const centerX = (rect?.width || size.width) / 2;
        const centerY = (rect?.height || size.height) / 2;
        const current = viewportRef.current;
        const next = { x: centerX - ((centerX - current.x) / current.k) * nextScale, y: centerY - ((centerY - current.y) / current.k) * nextScale, k: nextScale };
        setViewport(next);
        onBeforeChange?.();
    }, [containerRef, focusAnimationRef, onBeforeChange, setViewport, size.height, size.width]);

    return { viewport, setViewport, viewportRef, subscribeViewport, focusAnimationRef, screenToCanvas, animateViewport, fitNodesToView, setZoomScale };
}
