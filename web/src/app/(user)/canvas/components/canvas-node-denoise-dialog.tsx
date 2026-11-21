"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Alert, Button, Modal, Progress, Segmented, Switch } from "antd";
import { Brush, Check, Eraser, Eye, EyeOff, GripVertical, ImagePlus, LoaderCircle, Lock, ScanFace, Trash2, Undo2, Wand2 } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";
import { blobToDataUrl, isCanvasDenoiseSupported, runCanvasDenoise, runCanvasSegment, type CanvasDenoiseParams } from "../utils/canvas-denoise-client";

const strengthOptions = [
    { value: 0.8, label: "轻度", description: "保留细节，轻微去噪" },
    { value: 0.6, label: "标准", description: "均衡去噪与细节" },
    { value: 0.45, label: "强力", description: "重度平滑，适合噪点明显的图" },
];

const smoothOptions = [
    { value: 0, label: "关闭" },
    { value: 0.001, label: "轻度" },
    { value: 0.005, label: "强力" },
];

const brushSizeOptions = [
    { value: 0.04, label: "小" },
    { value: 0.07, label: "中" },
    { value: 0.11, label: "大" },
];

const DEFAULT_PARAMS: CanvasDenoiseParams = { down: 0.6, lam: 0.001 };

type ProtectStroke = { mode: "paint" | "erase"; size: number; points: { x: number; y: number }[] };
type CompareMode = "split" | "original" | "result" | "diff";

function drawStroke(context: CanvasRenderingContext2D, stroke: ProtectStroke, width: number, height: number, color: string) {
    if (!stroke.points.length) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(1, stroke.size * width);
    context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = color;
    context.fillStyle = color;
    const [first, ...rest] = stroke.points;
    if (!rest.length) {
        context.beginPath();
        context.arc(first.x * width, first.y * height, Math.max(0.5, (stroke.size * width) / 2), 0, Math.PI * 2);
        context.fill();
    } else {
        context.beginPath();
        context.moveTo(first.x * width, first.y * height);
        for (const point of rest) context.lineTo(point.x * width, point.y * height);
        context.stroke();
    }
    context.restore();
}

export function CanvasNodeDenoiseDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (resultDataUrl: string, mode: "new" | "replace") => void }) {
    const [params, setParams] = useState<CanvasDenoiseParams>(DEFAULT_PARAMS);
    const [supported, setSupported] = useState(true);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [running, setRunning] = useState(false);
    const [stage, setStage] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const [result, setResult] = useState<{ dataUrl: string; elapsed: number; timings: { model: number; infer: number; l0: number; encode: number } } | null>(null);
    const [resultVersion, setResultVersion] = useState(0);
    const [compareMode, setCompareMode] = useState<CompareMode>("split");
    const [split, setSplit] = useState(50);
    const [splitDragging, setSplitDragging] = useState(false);
    const [holdingOriginal, setHoldingOriginal] = useState(false);
    const [zoom, setZoom] = useState<"fit" | "actual">("fit");
    const [error, setError] = useState("");
    const [brushEnabled, setBrushEnabled] = useState(false);
    const [brushMode, setBrushMode] = useState<"paint" | "erase">("paint");
    const [brushSize, setBrushSize] = useState(0.07);
    const [altPressed, setAltPressed] = useState(false);
    const [showMask, setShowMask] = useState(true);
    const [strokes, setStrokes] = useState<ProtectStroke[]>([]);
    const [personMask, setPersonMask] = useState<HTMLCanvasElement | null>(null);
    const [personTint, setPersonTint] = useState<HTMLCanvasElement | null>(null);
    const [personShare, setPersonShare] = useState(0);
    const [personEnabled, setPersonEnabled] = useState(false);
    const [segmenting, setSegmenting] = useState(false);
    const [segmentStage, setSegmentStage] = useState("");
    const [segmentError, setSegmentError] = useState("");
    const [outputMode, setOutputMode] = useState<"new" | "replace">("new");
    const cancelRef = useRef<(() => void) | null>(null);
    const segmentCancelRef = useRef<(() => void) | null>(null);
    const baseImageRef = useRef<HTMLImageElement>(null);
    const outputRef = useRef<HTMLCanvasElement>(null);
    const diffCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskOverlayRef = useRef<HTMLCanvasElement>(null);
    const brushCursorRef = useRef<HTMLDivElement>(null);
    const resultImageRef = useRef<HTMLImageElement | null>(null);
    const activeStrokeRef = useRef<ProtectStroke | null>(null);

    useEffect(() => {
        setSupported(isCanvasDenoiseSupported());
    }, []);

    useEffect(() => {
        if (!open) return;
        setParams(DEFAULT_PARAMS);
        setImage(null);
        setResult(null);
        setResultVersion(0);
        setCompareMode("split");
        setSplit(50);
        setSplitDragging(false);
        setHoldingOriginal(false);
        setZoom("fit");
        setError("");
        setStage("");
        setBrushEnabled(false);
        setBrushMode("paint");
        setBrushSize(0.07);
        setAltPressed(false);
        setShowMask(true);
        setOutputMode("new");
        setStrokes([]);
        setPersonMask(null);
        setPersonTint(null);
        setPersonShare(0);
        setPersonEnabled(false);
        setSegmentError("");
        setSegmentStage("");
        activeStrokeRef.current = null;
        resultImageRef.current = null;
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!running) return;
        setElapsed(0);
        const timer = window.setInterval(() => setElapsed((value) => value + 0.1), 100);
        return () => window.clearInterval(timer);
    }, [running]);

    useEffect(() => {
        if (!open) return;
        const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        const handleDown = (event: KeyboardEvent) => {
            if (isTyping(event.target)) return;
            if (event.code === "Space" && result && !event.repeat) {
                event.preventDefault();
                setHoldingOriginal(true);
            }
            if (event.key === "Alt") setAltPressed(true);
        };
        const handleUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setHoldingOriginal(false);
            if (event.key === "Alt") setAltPressed(false);
        };
        const handleBlur = () => {
            setHoldingOriginal(false);
            setAltPressed(false);
        };
        window.addEventListener("keydown", handleDown);
        window.addEventListener("keyup", handleUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleDown);
            window.removeEventListener("keyup", handleUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, [open, result]);

    useEffect(() => {
        if (!open || compareMode !== "diff" || resultVersion === 0) return;
        const diffCanvas = diffCanvasRef.current;
        const base = baseImageRef.current;
        const resultImage = resultImageRef.current;
        if (!diffCanvas || !base || !resultImage || !image) return;
        const width = image.width;
        const height = image.height;
        if (diffCanvas.width !== width) diffCanvas.width = width;
        if (diffCanvas.height !== height) diffCanvas.height = height;
        const diffContext = diffCanvas.getContext("2d", { willReadFrequently: true });
        if (!diffContext) return;
        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = width;
        originalCanvas.height = height;
        const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
        const resultCanvas = document.createElement("canvas");
        resultCanvas.width = width;
        resultCanvas.height = height;
        const resultContext = resultCanvas.getContext("2d", { willReadFrequently: true });
        if (!originalContext || !resultContext) return;
        originalContext.drawImage(base, 0, 0, width, height);
        resultContext.drawImage(resultImage, 0, 0, width, height);
        const originalPixels = originalContext.getImageData(0, 0, width, height).data;
        const resultPixels = resultContext.getImageData(0, 0, width, height).data;
        const diff = diffContext.createImageData(width, height);
        for (let i = 0; i < originalPixels.length; i += 4) {
            const value = Math.min(255, (Math.abs(originalPixels[i] - resultPixels[i]) + Math.abs(originalPixels[i + 1] - resultPixels[i + 1]) + Math.abs(originalPixels[i + 2] - resultPixels[i + 2])) / 3 * 3);
            diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = value;
            diff.data[i + 3] = 255;
        }
        diffContext.putImageData(diff, 0, 0);
    }, [compareMode, image, open, resultVersion]);

    useEffect(() => {
        if (!result) {
            resultImageRef.current = null;
            return;
        }
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            resultImageRef.current = img;
            setResultVersion((version) => version + 1);
        };
        img.src = result.dataUrl;
        return () => {
            cancelled = true;
            img.onload = null;
        };
    }, [result]);

    useEffect(() => {
        if (open) return;
        cancelRef.current?.();
        cancelRef.current = null;
        segmentCancelRef.current?.();
        segmentCancelRef.current = null;
        setSegmenting(false);
    }, [open]);

    useEffect(() => () => {
        cancelRef.current?.();
        segmentCancelRef.current?.();
    }, []);

    const painting = brushEnabled && Boolean(result) && !running;
    const showMaskOverlay = painting || (personEnabled && Boolean(personMask));
    const stageProgressMatch = stage.match(/(\d+)\s*\/\s*(\d+)/);
    const stageProgress = stageProgressMatch ? Math.min(100, Math.round((Number(stageProgressMatch[1]) / Number(stageProgressMatch[2])) * 100)) : null;

    const updateBrushCursor = (event: ReactPointerEvent<HTMLElement>) => {
        const cursor = brushCursorRef.current;
        const base = baseImageRef.current;
        if (!cursor || !base) return;
        const rect = base.getBoundingClientRect();
        const size = Math.max(4, brushSize * rect.width);
        cursor.style.display = "block";
        cursor.style.width = `${size}px`;
        cursor.style.height = `${size}px`;
        cursor.style.transform = `translate(${event.clientX - rect.left - size / 2}px, ${event.clientY - rect.top - size / 2}px)`;
    };

    const redrawMask = useCallback(() => {
        const overlay = maskOverlayRef.current;
        const base = baseImageRef.current;
        if (!overlay || !base) return;
        const width = Math.round(base.clientWidth);
        const height = Math.round(base.clientHeight);
        if (!width || !height) return;
        if (overlay.width !== width) overlay.width = width;
        if (overlay.height !== height) overlay.height = height;
        const context = overlay.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, width, height);
        if (personEnabled && personTint) context.drawImage(personTint, 0, 0, width, height);
        for (const stroke of strokes) drawStroke(context, stroke, width, height, "rgba(255,92,64,0.42)");
        if (activeStrokeRef.current) drawStroke(context, activeStrokeRef.current, width, height, "rgba(255,92,64,0.42)");
    }, [personEnabled, personTint, strokes]);

    const composeOutput = useCallback(() => {
        const output = outputRef.current;
        const base = baseImageRef.current;
        const resultImage = resultImageRef.current;
        if (!output || !base || !image || !resultImage) return;
        const width = image.width;
        const height = image.height;
        if (output.width !== width) output.width = width;
        if (output.height !== height) output.height = height;
        const context = output.getContext("2d");
        if (!context) return;
        context.filter = "none";
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, width, height);
        context.drawImage(resultImage, 0, 0, width, height);
        if (!strokes.length && !(personEnabled && personMask)) return;
        // 在自然分辨率重建蒙版：先叠加 AI 人物蒙版，再叠画笔（橡皮可修正人物边缘），
        // 最后用 destination-in 把原图像素贴回受保护区域。
        const mask = document.createElement("canvas");
        mask.width = width;
        mask.height = height;
        const maskContext = mask.getContext("2d");
        if (!maskContext) return;
        if (personEnabled && personMask) maskContext.drawImage(personMask, 0, 0, width, height);
        for (const stroke of strokes) drawStroke(maskContext, stroke, width, height, "#fff");
        const masked = document.createElement("canvas");
        masked.width = width;
        masked.height = height;
        const maskedContext = masked.getContext("2d");
        if (!maskedContext) return;
        maskedContext.drawImage(base, 0, 0, width, height);
        maskedContext.globalCompositeOperation = "destination-in";
        maskedContext.filter = "blur(2px)";
        maskedContext.drawImage(mask, 0, 0);
        context.drawImage(masked, 0, 0);
    }, [image, personEnabled, personMask, strokes]);

    useEffect(() => {
        if (!open) return;
        composeOutput();
        redrawMask();
    }, [composeOutput, open, redrawMask, resultVersion, zoom, showMaskOverlay]);

    const start = async () => {
        if (running) return;
        setError("");
        setRunning(true);
        setStage("准备中");
        try {
            const source = await (await fetch(dataUrl)).blob();
            const handle = runCanvasDenoise(source, params, setStage);
            cancelRef.current = handle.cancel;
            const output = await handle.promise;
            const resultUrl = await blobToDataUrl(output.blob);
            setResult({ dataUrl: resultUrl, elapsed: output.elapsed, timings: output.timings });
            setCompareMode("split");
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "降噪失败");
        } finally {
            cancelRef.current = null;
            setRunning(false);
            setStage("");
        }
    };

    const recognizePerson = async () => {
        if (segmenting || running || !result || !image) return;
        setSegmentError("");
        setSegmenting(true);
        setSegmentStage("准备中");
        try {
            const source = await (await fetch(dataUrl)).blob();
            const handle = runCanvasSegment(source, setSegmentStage);
            segmentCancelRef.current = handle.cancel;
            const output = await handle.promise;
            if (output.share < 0.005) {
                setSegmentError("没有认出人物：自动识别只支持二次元风格人物");
                return;
            }
            const url = URL.createObjectURL(output.blob);
            try {
                const maskImage = new Image();
                await new Promise<void>((resolve, reject) => {
                    maskImage.onload = () => resolve();
                    maskImage.onerror = () => reject(new Error("人物蒙版读取失败"));
                    maskImage.src = url;
                });
                const width = image.width;
                const height = image.height;
                const alpha = document.createElement("canvas");
                alpha.width = width;
                alpha.height = height;
                const alphaContext = alpha.getContext("2d");
                if (!alphaContext) throw new Error("无法创建人物蒙版");
                alphaContext.drawImage(maskImage, 0, 0, width, height);
                const pixels = alphaContext.getImageData(0, 0, width, height);
                for (let i = 0; i < pixels.data.length; i += 4) {
                    const value = pixels.data[i];
                    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
                    pixels.data[i + 3] = value;
                }
                alphaContext.putImageData(pixels, 0, 0);
                const tint = document.createElement("canvas");
                tint.width = width;
                tint.height = height;
                const tintContext = tint.getContext("2d");
                if (!tintContext) throw new Error("无法创建人物蒙版");
                tintContext.drawImage(alpha, 0, 0);
                tintContext.globalCompositeOperation = "source-in";
                tintContext.fillStyle = "rgba(80,150,255,0.28)";
                tintContext.fillRect(0, 0, width, height);
                setPersonMask(alpha);
                setPersonTint(tint);
                setPersonShare(output.share);
                setPersonEnabled(true);
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setSegmentError(err instanceof Error ? err.message : "人物识别失败");
        } finally {
            segmentCancelRef.current = null;
            setSegmenting(false);
            setSegmentStage("");
        }
    };

    const clearPerson = () => {
        setPersonMask(null);
        setPersonTint(null);
        setPersonShare(0);
        setPersonEnabled(false);
        setSegmentError("");
    };

    const imagePoint = (event: ReactPointerEvent<HTMLElement>) => {
        const rect = baseImageRef.current?.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) return null;
        return {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        };
    };

    const updateSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setSplit(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)));
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={1080} centered destroyOnHidden mask={{ closable: !running }} closable={!running}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold">图片降噪</h2>
                        <p className="mt-1 text-sm opacity-55">WebGPU 本地处理，图片不会离开当前设备</p>
                    </div>
                    <div className="flex items-center gap-2 pr-9 text-xs">
                        <span className="rounded-full border px-2.5 py-1 opacity-70">本地 · WebGPU</span>
                        <span className="rounded-full border px-2.5 py-1 opacity-70">{image ? `${image.width} × ${image.height}` : "读取尺寸中"}</span>
                    </div>
                </div>

                {!supported ? <Alert type="warning" showIcon message="当前浏览器不支持 WebGPU" description="本地降噪需要较新的 Chrome / Edge 并通过 HTTPS 访问；iOS Safari 暂不支持。" /> : null}

                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="overflow-hidden rounded-xl border">
                        <div className={`relative h-[480px] bg-[#101010] max-sm:h-[360px] ${zoom === "fit" ? "overflow-hidden" : "overflow-auto"}`}>
                            <div className="flex h-full w-full items-center justify-center p-4">
                                <div
                                    className={`relative m-auto select-none ${painting ? "cursor-crosshair touch-none" : result && compareMode === "split" ? "cursor-col-resize" : ""}`}
                                    onDoubleClick={() => {
                                        if (!painting) setZoom((current) => (current === "fit" ? "actual" : "fit"));
                                    }}
                                    onPointerLeave={() => {
                                        if (brushCursorRef.current) brushCursorRef.current.style.display = "none";
                                    }}
                                    onPointerDown={(event) => {
                                        if (painting) {
                                            const point = imagePoint(event);
                                            if (!point) return;
                                            event.currentTarget.setPointerCapture(event.pointerId);
                                            activeStrokeRef.current = { mode: altPressed ? "erase" : brushMode, size: brushSize, points: [point] };
                                            redrawMask();
                                            return;
                                        }
                                        if (!result || compareMode !== "split") return;
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        setSplitDragging(true);
                                        updateSplit(event);
                                    }}
                                    onPointerMove={(event) => {
                                        if (painting) updateBrushCursor(event);
                                        if (activeStrokeRef.current && event.buttons === 1) {
                                            const point = imagePoint(event);
                                            if (!point) return;
                                            const stroke = activeStrokeRef.current;
                                            const last = stroke.points[stroke.points.length - 1];
                                            if (last.x !== point.x || last.y !== point.y) {
                                                stroke.points.push(point);
                                                redrawMask();
                                            }
                                            return;
                                        }
                                        if (!result || painting || compareMode !== "split" || event.buttons !== 1) return;
                                        updateSplit(event);
                                    }}
                                    onPointerUp={() => {
                                        setSplitDragging(false);
                                        const stroke = activeStrokeRef.current;
                                        if (!stroke) return;
                                        activeStrokeRef.current = null;
                                        setStrokes((previous) => [...previous, stroke]);
                                    }}
                                    onPointerCancel={() => {
                                        setSplitDragging(false);
                                        const stroke = activeStrokeRef.current;
                                        if (!stroke) return;
                                        activeStrokeRef.current = null;
                                        setStrokes((previous) => [...previous, stroke]);
                                    }}
                                >
                                    <img
                                        ref={baseImageRef}
                                        src={dataUrl}
                                        alt="原图"
                                        draggable={false}
                                        className={zoom === "fit" ? "block max-h-[448px] max-w-full select-none object-contain" : "block max-w-none select-none"}
                                        style={zoom === "actual" && image ? { width: `${image.width}px` } : undefined}
                                    />
                                    {result ? (
                                        <>
                                            <canvas
                                                ref={outputRef}
                                                className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                                                style={{ display: compareMode === "original" || compareMode === "diff" || holdingOriginal ? "none" : undefined, clipPath: compareMode === "split" ? `inset(0 0 0 ${split}%)` : undefined }}
                                            />
                                            <canvas
                                                ref={diffCanvasRef}
                                                className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                                                style={{ display: compareMode === "diff" && !holdingOriginal ? undefined : "none" }}
                                            />
                                        </>
                                    ) : null}
                                    {showMaskOverlay && showMask ? <canvas ref={maskOverlayRef} className="pointer-events-none absolute inset-0 h-full w-full select-none" /> : null}
                                    {painting ? (
                                        <div
                                            ref={brushCursorRef}
                                            className={`pointer-events-none absolute left-0 top-0 z-20 rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${altPressed || brushMode === "erase" ? "border-amber-300" : "border-white/90"}`}
                                            style={{ display: "none" }}
                                        />
                                    ) : null}
                                    {result && compareMode === "split" && !painting && !holdingOriginal ? (
                                        <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/80" style={{ left: `${split}%` }}>
                                            <span className="absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-white text-black shadow-md">
                                                <GripVertical className="size-4" />
                                            </span>
                                            {splitDragging ? <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow">{Math.round(split)}%</span> : null}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {!result && !running ? (
                                <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center">
                                    <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm">左侧原图 · 开始降噪后可拖动分割线对比</span>
                                </div>
                            ) : null}
                            {painting ? (
                                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                                    <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm">
                                        涂抹要保留的区域 · {altPressed ? "橡皮（Alt）" : brushMode === "paint" ? "画笔" : "橡皮"} · {strokes.length ? `已保护 ${strokes.length} 笔` : "尚未涂抹"}
                                    </span>
                                </div>
                            ) : null}
                            {result && holdingOriginal ? (
                                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                                    <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm">松开空格恢复对比</span>
                                </div>
                            ) : null}
                            {result && compareMode === "diff" && !holdingOriginal ? (
                                <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur-sm">差异视图 · 越亮表示去噪改动越大（3× 增幅）</div>
                            ) : null}
                            {running ? (
                                <div className="absolute inset-0 z-20 grid place-items-center bg-black/45 backdrop-blur-[2px]">
                                    <div className="w-72 rounded-xl border border-white/10 bg-black/60 px-4 py-3.5 text-white shadow-xl">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <LoaderCircle className="size-4 animate-spin" />
                                            {stage || "处理中"}
                                        </div>
                                        <Progress
                                            percent={stageProgress ?? 100}
                                            showInfo={stageProgress !== null}
                                            status="active"
                                            size="small"
                                            strokeColor="#fff"
                                            railColor="rgba(255,255,255,0.22)"
                                            format={(value) => <span className="text-[11px] text-white/70">{value}%</span>}
                                        />
                                        <div className="flex items-center justify-between text-xs text-white/70">
                                            <span className="tabular-nums">{elapsed.toFixed(1)}s</span>
                                            <button type="button" className="cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-white/15" onClick={() => cancelRef.current?.()}>
                                                取消处理
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div className="flex h-11 items-center justify-between gap-2 border-t px-3">
                            <div className="flex min-w-0 items-center gap-2">
                                {result ? (
                                    <Segmented
                                        size="small"
                                        value={compareMode}
                                        options={[
                                            { label: "原图", value: "original" },
                                            { label: "分屏", value: "split" },
                                            { label: "效果", value: "result" },
                                            { label: "差异", value: "diff" },
                                        ]}
                                        onChange={(value) => setCompareMode(value as CompareMode)}
                                    />
                                ) : (
                                    <span className="text-xs opacity-55">源图预览</span>
                                )}
                                {result ? <span className="hidden truncate text-xs opacity-45 md:inline">按住空格对比原图</span> : null}
                            </div>
                            <div className="flex items-center gap-1">
                                {result ? (
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!size-7 !min-w-7 !p-0"
                                        title={showMask ? "隐藏保护蒙版" : "显示保护蒙版"}
                                        aria-label={showMask ? "隐藏保护蒙版" : "显示保护蒙版"}
                                        icon={showMask ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                        onClick={() => setShowMask((value) => !value)}
                                    />
                                ) : null}
                                <Segmented
                                    size="small"
                                    value={zoom}
                                    options={[
                                        { label: "适应", value: "fit" },
                                        { label: "1:1", value: "actual" },
                                    ]}
                                    onChange={(value) => setZoom(value as "fit" | "actual")}
                                    disabled={!image}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="thin-scrollbar max-h-[524px] space-y-4 overflow-y-auto pr-1">
                        <div className="rounded-xl border p-3.5">
                            <div className="mb-2 text-sm font-medium opacity-75">去噪强度</div>
                            <div className="grid gap-2">
                                {strengthOptions.map((item) => {
                                    const selected = params.down === item.value;
                                    return (
                                        <button
                                            key={item.value}
                                            type="button"
                                            disabled={running}
                                            onClick={() => setParams((current) => ({ ...current, down: item.value }))}
                                            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${selected ? "border-primary bg-primary/5" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
                                        >
                                            <span>
                                                <span className="block text-sm font-medium">{item.label}</span>
                                                <span className="block text-xs opacity-55">{item.description}</span>
                                            </span>
                                            <span className={`grid size-4 shrink-0 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "opacity-30"}`}>{selected ? <Check className="size-3" /> : null}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-xl border p-3.5">
                            <div className="mb-2 text-sm font-medium opacity-75">结构平滑（L0）</div>
                            <Segmented block value={params.lam} disabled={running} options={smoothOptions.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setParams((current) => ({ ...current, lam: Number(value) }))} />
                            <div className="mt-2 text-xs leading-5 opacity-55">减少色块噪点，但可能丢失细线，按画面取舍。</div>
                        </div>

                        <div className="rounded-xl border p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-medium opacity-75">保护区域</div>
                                <Switch
                                    size="small"
                                    checked={brushEnabled}
                                    disabled={!result || running}
                                    onChange={(checked) => {
                                        setBrushEnabled(checked);
                                        if (checked) setCompareMode("result");
                                    }}
                                />
                            </div>
                            {!result ? (
                                <div className="mt-2 text-xs leading-5 opacity-55">先完成一次降噪，再涂抹需要保留原图像素的区域。</div>
                            ) : brushEnabled ? (
                                <div className="mt-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Segmented
                                            size="small"
                                            value={brushMode}
                                            options={[
                                                { label: <span className="flex items-center gap-1"><Brush className="size-3.5" />画笔</span>, value: "paint" },
                                                { label: <span className="flex items-center gap-1"><Eraser className="size-3.5" />橡皮</span>, value: "erase" },
                                            ]}
                                            onChange={(value) => setBrushMode(value as "paint" | "erase")}
                                        />
                                        <Segmented size="small" value={brushSize} options={brushSizeOptions} onChange={(value) => setBrushSize(Number(value))} />
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="opacity-55">{strokes.length ? `已保护 ${strokes.length} 笔` : "在左侧画布涂抹"}</span>
                                        <div className="flex items-center gap-1">
                                            <Button size="small" type="text" icon={<Undo2 className="size-3.5" />} disabled={!strokes.length} onClick={() => setStrokes((previous) => previous.slice(0, -1))}>
                                                撤销
                                            </Button>
                                            <Button size="small" type="text" icon={<Trash2 className="size-3.5" />} disabled={!strokes.length} onClick={() => setStrokes([])}>
                                                清空
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-2 text-xs leading-5 opacity-55">开启后在左侧涂抹，受保护区域会保留原图像素；按住 Alt 临时切换橡皮。</div>
                            )}
                        </div>

                        <div className="rounded-xl border p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-medium opacity-75">AI 人物保护</div>
                                {personMask ? <Switch size="small" checked={personEnabled} disabled={running} onChange={setPersonEnabled} /> : null}
                            </div>
                            {!result ? (
                                <div className="mt-2 text-xs leading-5 opacity-55">先完成一次降噪，再识别二次元人物。</div>
                            ) : personMask ? (
                                <div className="mt-2 space-y-2">
                                    <div className="text-xs leading-5 opacity-55">已识别人物 · 约占画面 {Math.round(personShare * 100)}%，开启后人物保持原图像素，可用橡皮修正边缘。</div>
                                    <div className="flex items-center gap-1">
                                        <Button size="small" icon={<ScanFace className="size-3.5" />} loading={segmenting} disabled={running} onClick={() => void recognizePerson()}>
                                            重新识别
                                        </Button>
                                        <Button size="small" type="text" disabled={running} onClick={clearPerson}>
                                            清除
                                        </Button>
                                    </div>
                                    {segmenting ? <div className="text-xs opacity-55">{segmentStage}</div> : null}
                                </div>
                            ) : (
                                <div className="mt-2 space-y-2">
                                    <Button size="small" icon={<ScanFace className="size-3.5" />} loading={segmenting} disabled={running || !image} onClick={() => void recognizePerson()}>
                                        识别人物
                                    </Button>
                                    <div className="text-xs leading-5 opacity-55">{segmenting ? segmentStage : "首次需下载约 176MB 模型（仅一次），只支持二次元人物。"}</div>
                                </div>
                            )}
                            {segmentError ? <div className="mt-2 text-xs font-medium text-destructive">{segmentError}</div> : null}
                        </div>

                        <div className="rounded-xl border text-sm">
                            <div className="flex items-center justify-between px-3.5 py-2">
                                <span className="opacity-55">输出尺寸</span>
                                <span className="font-medium">{image ? `${image.width} × ${image.height}` : "读取中"}</span>
                            </div>
                            <div className="flex items-center justify-between border-t px-3.5 py-2">
                                <span className="opacity-55">推理设备</span>
                                <span className="font-medium">WebGPU · 本地</span>
                            </div>
                            <div className="flex items-center justify-between border-t px-3.5 py-2">
                                <span className="opacity-55">模型</span>
                                <span className="font-medium">Real-ESRGAN · 17MB</span>
                            </div>
                            {result ? (
                                <div className="flex items-center justify-between border-t px-3.5 py-2">
                                    <span className="opacity-55">上次耗时</span>
                                    <span className="font-medium tabular-nums">{result.elapsed.toFixed(1)}s</span>
                                </div>
                            ) : null}
                            {result ? (
                                <div className="border-t px-3.5 py-2 text-xs tabular-nums opacity-55">
                                    模型 {result.timings.model.toFixed(1)}s · 推理 {result.timings.infer.toFixed(1)}s · 平滑 {result.timings.l0.toFixed(1)}s · 编码 {result.timings.encode.toFixed(1)}s
                                </div>
                            ) : null}
                        </div>

                        {error ? <Alert type="error" showIcon message="降噪失败" description={error} action={<Button size="small" onClick={() => void start()}>重试</Button>} /> : null}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <div className="flex items-center gap-1.5 text-xs opacity-55">
                        <Lock className="size-3.5" />
                        图片在本地推理，不会上传；首轮需下载 17MB 模型，之后走浏览器缓存
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                            size="small"
                            value={outputMode}
                            options={[
                                { label: "新节点", value: "new" },
                                { label: "替换原图", value: "replace" },
                            ]}
                            onChange={(value) => setOutputMode(value as "new" | "replace")}
                            disabled={running || !result}
                        />
                        {outputMode === "replace" ? <span className="text-xs font-medium text-amber-500">将覆盖原图像素</span> : null}
                        <Button disabled={running} onClick={onClose}>
                            关闭
                        </Button>
                        <Button icon={<Wand2 className="size-4" />} loading={running} disabled={!supported || running} onClick={() => void start()}>
                            {result ? "重新降噪" : "开始降噪"}
                        </Button>
                        <Button
                            type="primary"
                            icon={<ImagePlus className="size-4" />}
                            disabled={!result || running || !resultVersion}
                            onClick={() => {
                                const output = outputRef.current;
                                if (output) onConfirm(output.toDataURL("image/png"), outputMode);
                            }}
                        >
                            {outputMode === "replace" ? "替换原图" : "生成图片节点"}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
