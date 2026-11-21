"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "../types";
import { CANVAS_Z } from "../[id]/lib/canvas-layer";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import type { CanvasAlignmentGuides } from "../utils/canvas-alignment";

/** 静态噪点纹理：消除大色块的平面塑料感，固定不随画布平移。 */
const GRAIN_TEXTURE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

type CanvasMotion =
    | { kind: "pan"; vx: number; vy: number; last: ViewportTransform }
    | { kind: "zoom"; targetK: number; worldX: number; worldY: number; anchorX: number; anchorY: number; last: ViewportTransform };

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    tool: "select" | "pan";
    backgroundMode?: CanvasBackgroundMode;
    alignmentGuides?: CanvasAlignmentGuides;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function InfiniteCanvas({ containerRef, viewport, tool, backgroundMode = "lines", alignmentGuides = {}, onViewportChange, onCanvasMouseDown, onCanvasDeselect, onCanvasDoubleClick, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const wheelMode = useCanvasUiStore((state) => state.wheelMode);
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
        startedOnBackground: false,
    });
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const motionRef = useRef<{ motion: CanvasMotion; raf: number; time: number; emit: (viewport: ViewportTransform) => void } | null>(null);
    const zoomTargetRef = useRef<number | null>(null);
    const panSamplesRef = useRef<{ t: number; x: number; y: number }[]>([]);
    const reducedMotionRef = useRef(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    useEffect(() => {
        scaleRef.current = viewport.k;
        viewportRef.current = viewport;
    }, [viewport]);

    useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        reducedMotionRef.current = query.matches;
        const handleChange = () => {
            reducedMotionRef.current = query.matches;
        };
        query.addEventListener("change", handleChange);
        return () => query.removeEventListener("change", handleChange);
    }, []);

    const stopMotion = useCallback(() => {
        if (motionRef.current) cancelAnimationFrame(motionRef.current.raf);
        motionRef.current = null;
        zoomTargetRef.current = null;
    }, []);

    const startMotion = useCallback((motion: CanvasMotion, emit: (viewport: ViewportTransform) => void) => {
        if (motionRef.current) cancelAnimationFrame(motionRef.current.raf);
        const entry = { motion, raf: 0, time: performance.now(), emit };
        motionRef.current = entry;
        const step = (now: number) => {
            if (motionRef.current !== entry) return;
            const dt = Math.min(64, now - entry.time);
            entry.time = now;
            // 外部视口变更（聚焦飞行、小地图、缩放按钮）立即接管，停止惯性。
            if (viewportRef.current !== entry.motion.last) {
                motionRef.current = null;
                zoomTargetRef.current = null;
                return;
            }
            const current = entry.motion.last;
            let next: ViewportTransform;
            if (entry.motion.kind === "pan") {
                const decay = Math.exp(-dt / 240);
                entry.motion.vx *= decay;
                entry.motion.vy *= decay;
                if (Math.hypot(entry.motion.vx, entry.motion.vy) < 0.01) {
                    motionRef.current = null;
                    return;
                }
                next = { x: current.x + entry.motion.vx * dt, y: current.y + entry.motion.vy * dt, k: current.k };
            } else {
                const m = entry.motion;
                const k = current.k + (m.targetK - current.k) * (1 - Math.exp(-dt / 90));
                if (Math.abs(m.targetK - k) < 0.001) {
                    next = { x: m.anchorX - m.worldX * m.targetK, y: m.anchorY - m.worldY * m.targetK, k: m.targetK };
                    entry.motion.last = next;
                    viewportRef.current = next;
                    entry.emit(next);
                    motionRef.current = null;
                    zoomTargetRef.current = null;
                    return;
                }
                next = { x: m.anchorX - m.worldX * k, y: m.anchorY - m.worldY * k, k };
            }
            entry.motion.last = next;
            viewportRef.current = next;
            entry.emit(next);
            entry.raf = requestAnimationFrame(step);
        };
        entry.raf = requestAnimationFrame(step);
    }, []);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (motionRef.current) cancelAnimationFrame(motionRef.current.raf);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space" || event.defaultPrevented || event.isComposing) return;
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],button,a,[role='button'],[role='menu'],.ant-modal,[data-canvas-no-zoom]")) return;
            event.preventDefault();
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setIsSpacePressed(false);
        };

        const handleBlur = () => {
            setIsSpacePressed(false);
            panState.current.isPanning = false;
            setIsPanning(false);
            stopMotion();
            document.body.style.cursor = "";
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, [stopMotion]);

    const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement> | WheelEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;
        if (event instanceof WheelEvent) {
            if (!event.ctrlKey || !containerRef.current?.contains(target)) return;
            event.preventDefault();
            event.stopPropagation();
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const current = viewportRef.current;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
        if (wheelMode === "pan" && !event.ctrlKey && !event.metaKey) {
            stopMotion();
            const next = { ...current, x: current.x - event.deltaX * unit, y: current.y - event.deltaY * unit };
            viewportRef.current = next;
            onViewportChange(next);
            return;
        }
        const baseK = zoomTargetRef.current ?? current.k;
        const newScale = Math.min(Math.max(baseK * Math.pow(1.1, -event.deltaY * unit / 100), 0.05), 5);
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        if (reducedMotionRef.current) {
            stopMotion();
            const next = { x: mouseX - ((mouseX - current.x) / current.k) * newScale, y: mouseY - ((mouseY - current.y) / current.k) * newScale, k: newScale };
            viewportRef.current = next;
            onViewportChange(next);
            return;
        }
        const worldX = (mouseX - current.x) / current.k;
        const worldY = (mouseY - current.y) / current.k;
        stopMotion();
        zoomTargetRef.current = newScale;
        startMotion({ kind: "zoom", targetK: newScale, worldX, worldY, anchorX: mouseX, anchorY: mouseY, last: current }, onViewportChange);
    }, [containerRef, onViewportChange, startMotion, stopMotion, wheelMode]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        const temporaryTool = isSpacePressed;
        const activeTool = temporaryTool ? "pan" : tool;
        if (activeTool === "pan" && (!target || !event.currentTarget.contains(target))) return;
        if (target?.closest("[data-canvas-no-zoom]") && activeTool !== "pan") return;
        if (target?.closest("[data-connection-create-menu]")) return;
        stopMotion();
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        const touchPan = event.pointerType === "touch" && activeTool === "select" && isBackgroundClick;
        const shouldPan = event.button === 1 || (event.button === 0 && (activeTool === "pan" || touchPan));
        if (event.button === 0 && isBackgroundClick && document.activeElement instanceof HTMLElement && (document.activeElement.isContentEditable || document.activeElement instanceof HTMLMediaElement)) document.activeElement.blur();

        if (shouldPan) {
            event.preventDefault();
            if (activeTool === "pan") event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            panSamplesRef.current = [{ t: performance.now(), x: event.clientX, y: event.clientY }];
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewport.x,
                initialY: viewport.y,
                hasMoved: false,
                startedOnBackground: isBackgroundClick,
            };
            setIsPanning(true);
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0 && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],[data-node-id],[data-connection-id],[data-connection-create-menu]")) return;
        onCanvasDoubleClick?.(event);
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;
            if (event.buttons === 0) {
                panState.current.isPanning = false;
                setIsPanning(false);
                document.body.style.cursor = "";
                return;
            }
            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            const t = performance.now();
            const samples = panSamplesRef.current;
            samples.push({ t, x: event.clientX, y: event.clientY });
            while (samples.length > 1 && t - samples[0].t > 100) samples.shift();

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
            });
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved && panState.current.startedOnBackground) {
                onCanvasDeselect?.();
            }
            const shouldGlide = panState.current.hasMoved && !reducedMotionRef.current;
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
            if (!shouldGlide) return;
            const samples = panSamplesRef.current;
            if (samples.length < 2) return;
            const first = samples[0];
            const last = samples[samples.length - 1];
            const dt = last.t - first.t;
            // 松手前已经停住的手指不产生惯性。
            if (dt <= 0 || performance.now() - last.t > 80) return;
            let vx = (last.x - first.x) / dt;
            let vy = (last.y - first.y) / dt;
            const speed = Math.hypot(vx, vy);
            if (speed < 0.08) return;
            const cap = Math.min(1, 3 / speed);
            vx *= cap;
            vy *= cap;
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            nextViewportRef.current = null;
            startMotion({ kind: "pan", vx, vy, last: viewportRef.current }, onViewportChange);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            document.body.style.cursor = "";
        };
    }, [onCanvasDeselect, onViewportChange, startMotion]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        // 捕获阶段统一截停惯性：节点拖拽/连线会 stopPropagation，冒泡阶段收不到。
        const stop = () => stopMotion();
        container.addEventListener("pointerdown", stop, true);
        return () => container.removeEventListener("pointerdown", stop, true);
    }, [containerRef, stopMotion]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventWheelScroll = (event: WheelEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
        return () => {
            container.removeEventListener("wheel", preventWheelScroll);
            document.removeEventListener("wheel", handleWheel, true);
        };
    }, [containerRef, handleWheel]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const pointers = new Map<number, { x: number; y: number }>();
        let start: { distance: number; scale: number; midX: number; midY: number; x: number; y: number } | null = null;

        const handleTouchDown = (event: PointerEvent) => {
            if (event.pointerType !== "touch") return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size !== 2) return;
            stopMotion();
            const [a, b] = Array.from(pointers.values());
            const current = viewportRef.current;
            start = {
                distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                scale: current.k,
                midX: (a.x + b.x) / 2,
                midY: (a.y + b.y) / 2,
                x: current.x,
                y: current.y,
            };
            panState.current.isPanning = false;
            setIsPanning(false);
        };

        const handleTouchMove = (event: PointerEvent) => {
            if (!pointers.has(event.pointerId)) return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (!start || pointers.size < 2) return;
            const [a, b] = Array.from(pointers.values());
            const rect = container.getBoundingClientRect();
            const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const scale = Math.min(5, Math.max(0.05, start.scale * (distance / start.distance)));
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const originX = start.midX - rect.left;
            const originY = start.midY - rect.top;
            const worldX = (originX - start.x) / start.scale;
            const worldY = (originY - start.y) / start.scale;
            onViewportChange({ x: originX + (midX - start.midX) - worldX * scale, y: originY + (midY - start.midY) - worldY * scale, k: scale });
        };

        const handleTouchUp = (event: PointerEvent) => {
            pointers.delete(event.pointerId);
            if (pointers.size < 2) start = null;
        };

        container.addEventListener("pointerdown", handleTouchDown, { capture: true });
        window.addEventListener("pointermove", handleTouchMove, { passive: true });
        window.addEventListener("pointerup", handleTouchUp);
        window.addEventListener("pointercancel", handleTouchUp);
        return () => {
            container.removeEventListener("pointerdown", handleTouchDown, true);
            window.removeEventListener("pointermove", handleTouchMove);
            window.removeEventListener("pointerup", handleTouchUp);
            window.removeEventListener("pointercancel", handleTouchUp);
        };
    }, [containerRef, onViewportChange, stopMotion]);

    const temporaryTool = isSpacePressed;
    const activeTool = temporaryTool ? "pan" : tool;
    const cursor = isPanning ? "grabbing" : activeTool === "pan" ? "grab" : undefined;

    return (
        <div
            ref={containerRef}
            className={`relative h-full w-full select-none overflow-hidden ${activeTool === "pan" || isPanning ? "[&_*]:!cursor-[inherit]" : ""}`}
            style={{ background: theme.canvas.background, cursor, touchAction: "none" }}
            onPointerDown={activeTool === "pan" ? undefined : handlePointerDown}
            onPointerDownCapture={activeTool === "pan" ? handlePointerDown : undefined}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} />
            <div
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: `radial-gradient(85% 70% at 50% 38%, ${theme.canvas.ambient}, transparent 72%), radial-gradient(120% 95% at 50% 42%, transparent 55%, ${theme.canvas.vignette} 100%)` }}
            />
            <div className="pointer-events-none absolute inset-0" style={{ opacity: theme.canvas.grain, backgroundImage: GRAIN_TEXTURE, backgroundSize: "180px 180px" }} />
            {typeof alignmentGuides.vertical === "number" ? (
                <div
                    className="pointer-events-none absolute inset-y-0 w-px opacity-[.48]"
                    style={{
                        left: viewport.x + alignmentGuides.vertical * viewport.k,
                        backgroundImage: `repeating-linear-gradient(to bottom, ${theme.canvas.guideStroke} 0 5px, transparent 5px 10px)`,
                        zIndex: CANVAS_Z.guide,
                    }}
                />
            ) : null}
            {typeof alignmentGuides.horizontal === "number" ? (
                <div
                    className="pointer-events-none absolute inset-x-0 h-px opacity-[.48]"
                    style={{
                        top: viewport.y + alignmentGuides.horizontal * viewport.k,
                        backgroundImage: `repeating-linear-gradient(to right, ${theme.canvas.guideStroke} 0 5px, transparent 5px 10px)`,
                        zIndex: CANVAS_Z.guide,
                    }}
                />
            ) : null}
            <div
                className="absolute origin-top-left"
                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`, "--canvas-inverse-scale": 1 / viewport.k } as React.CSSProperties}
            >
                {children}
            </div>
        </div>
    );
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    // 拉远时网格连续渐隐，远视图只剩内容；近视图恢复参考网格。
    const gridOpacity = theme.canvas.gridOpacity * Math.min(1, Math.max(0, (viewport.k - 0.1) / 0.25));
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="canvas-grid-layer pointer-events-none absolute inset-0"
            style={{
                opacity: gridOpacity,
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
