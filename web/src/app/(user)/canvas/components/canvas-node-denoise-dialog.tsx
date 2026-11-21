"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Alert, Button, Modal, Progress, Segmented } from "antd";
import { Check, GripVertical, ImagePlus, LoaderCircle, Lock, Wand2 } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";
import { blobToDataUrl, isCanvasDenoiseSupported, runCanvasDenoise, type CanvasDenoiseParams } from "../utils/canvas-denoise-client";

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

const DEFAULT_PARAMS: CanvasDenoiseParams = { down: 0.6, lam: 0.001 };

export function CanvasNodeDenoiseDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (resultDataUrl: string) => void }) {
    const [params, setParams] = useState<CanvasDenoiseParams>(DEFAULT_PARAMS);
    const [supported, setSupported] = useState(true);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [running, setRunning] = useState(false);
    const [stage, setStage] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const [result, setResult] = useState<{ dataUrl: string; elapsed: number } | null>(null);
    const [compareMode, setCompareMode] = useState<"split" | "original" | "result">("split");
    const [split, setSplit] = useState(50);
    const [zoom, setZoom] = useState<"fit" | "actual">("fit");
    const [error, setError] = useState("");
    const cancelRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        setSupported(isCanvasDenoiseSupported());
    }, []);

    useEffect(() => {
        if (!open) return;
        setParams(DEFAULT_PARAMS);
        setImage(null);
        setResult(null);
        setCompareMode("split");
        setSplit(50);
        setZoom("fit");
        setError("");
        setStage("");
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!running) return;
        setElapsed(0);
        const timer = window.setInterval(() => setElapsed((value) => value + 0.1), 100);
        return () => window.clearInterval(timer);
    }, [running]);

    useEffect(() => {
        if (open) return;
        cancelRef.current?.();
        cancelRef.current = null;
    }, [open]);

    useEffect(() => () => {
        cancelRef.current?.();
    }, []);

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
            setResult({ dataUrl: resultUrl, elapsed: output.elapsed });
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

    const updateSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setSplit(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)));
    };

    const resultVisible = result && compareMode !== "original";

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
                        <div className={`relative h-[480px] bg-[#101010] ${zoom === "fit" ? "overflow-hidden" : "overflow-auto"}`}>
                            <div className="flex h-full w-full items-center justify-center p-4">
                                <div
                                    className={`relative m-auto ${result && compareMode === "split" ? "cursor-col-resize" : ""}`}
                                    onPointerDown={(event) => {
                                        if (!result || compareMode !== "split") return;
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        updateSplit(event);
                                    }}
                                    onPointerMove={(event) => {
                                        if (!result || compareMode !== "split" || event.buttons !== 1) return;
                                        updateSplit(event);
                                    }}
                                >
                                    <img
                                        src={dataUrl}
                                        alt="原图"
                                        draggable={false}
                                        className={zoom === "fit" ? "block max-h-[448px] max-w-full select-none object-contain" : "block max-w-none select-none"}
                                        style={zoom === "actual" && image ? { width: `${image.width}px` } : undefined}
                                    />
                                    {resultVisible ? (
                                        <img
                                            src={result.dataUrl}
                                            alt="降噪效果"
                                            draggable={false}
                                            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                                            style={{ clipPath: compareMode === "split" ? `inset(0 0 0 ${split}%)` : undefined }}
                                        />
                                    ) : null}
                                    {result && compareMode === "split" ? (
                                        <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/80" style={{ left: `${split}%` }}>
                                            <span className="absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-white text-black shadow-md">
                                                <GripVertical className="size-4" />
                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {!result && !running ? (
                                <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center">
                                    <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm">左侧原图 · 开始降噪后可拖动分割线对比</span>
                                </div>
                            ) : null}
                            {running ? (
                                <div className="absolute inset-0 z-20 grid place-items-center bg-black/45 backdrop-blur-[2px]">
                                    <div className="w-72 rounded-xl border border-white/10 bg-black/60 px-4 py-3.5 text-white shadow-xl">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <LoaderCircle className="size-4 animate-spin" />
                                            {stage || "处理中"}
                                        </div>
                                        <Progress percent={100} showInfo={false} status="active" size="small" strokeColor="#fff" />
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
                            {result ? (
                                <Segmented
                                    size="small"
                                    value={compareMode}
                                    options={[
                                        { label: "原图", value: "original" },
                                        { label: "分屏对比", value: "split" },
                                        { label: "效果", value: "result" },
                                    ]}
                                    onChange={(value) => setCompareMode(value as "split" | "original" | "result")}
                                />
                            ) : (
                                <span className="text-xs opacity-55">源图预览</span>
                            )}
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

                    <div className="space-y-4">
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
                        </div>

                        {error ? <Alert type="error" showIcon message="降噪失败" description={error} /> : null}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <div className="flex items-center gap-1.5 text-xs opacity-55">
                        <Lock className="size-3.5" />
                        图片在本地推理，不会上传；首轮需下载 17MB 模型，之后走浏览器缓存
                    </div>
                    <div className="flex items-center gap-2">
                        <Button disabled={running} onClick={onClose}>
                            关闭
                        </Button>
                        <Button icon={<Wand2 className="size-4" />} loading={running} disabled={!supported || running} onClick={() => void start()}>
                            {result ? "重新降噪" : "开始降噪"}
                        </Button>
                        <Button type="primary" icon={<ImagePlus className="size-4" />} disabled={!result || running} onClick={() => result && onConfirm(result.dataUrl)}>
                            生成图片节点
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
