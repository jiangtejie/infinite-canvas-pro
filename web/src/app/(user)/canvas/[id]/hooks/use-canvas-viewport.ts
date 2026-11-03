"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { CanvasNodeData, ViewportTransform } from "../../types";

type UseCanvasViewportOptions = {
    containerRef: RefObject<HTMLDivElement | null>;
    size: { width: number; height: number };
    onBeforeChange?: () => void;
};

/**
 * 画布视口：状态、坐标换算、缩放、适配节点与动画。
 */
export function useCanvasViewport({ containerRef, size, onBeforeChange }: UseCanvasViewportOptions) {
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const viewportRef = useRef(viewport);
    const focusAnimationRef = useRef<number | null>(null);

    useLayoutEffect(() => {
        viewportRef.current = viewport;
    }, [viewport]);
    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, [containerRef, viewportRef]);

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
            viewportRef.current = next;
            setViewport(next);
            focusAnimationRef.current = progress < 1 ? requestAnimationFrame(step) : null;
        };
        step(startedAt);
    }, [focusAnimationRef, onBeforeChange, setViewport, viewportRef]);

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
        viewportRef.current = next;
        setViewport(next);
        onBeforeChange?.();
    }, [containerRef, focusAnimationRef, onBeforeChange, setViewport, size.height, size.width, viewportRef]);

    return { viewport, setViewport, viewportRef, focusAnimationRef, screenToCanvas, animateViewport, fitNodesToView, setZoomScale };
}
