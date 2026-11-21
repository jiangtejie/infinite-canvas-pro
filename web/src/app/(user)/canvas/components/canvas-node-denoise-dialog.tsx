"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Progress, Segmented } from "antd";
import { ImagePlus, LoaderCircle, Sparkles } from "lucide-react";

import { blobToDataUrl, isCanvasDenoiseSupported, runCanvasDenoise, type CanvasDenoiseParams } from "../utils/canvas-denoise-client";

const strengthOptions = [
    { value: 0.8, label: "轻度", description: "保留细节" },
    { value: 0.6, label: "标准", description: "均衡去噪" },
    { value: 0.45, label: "强力", description: "重度平滑" },
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
    const [running, setRunning] = useState(false);
    const [stage, setStage] = useState("");
    const [result, setResult] = useState<{ dataUrl: string; elapsed: number } | null>(null);
    const [showOriginal, setShowOriginal] = useState(false);
    const [error, setError] = useState("");
    const cancelRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        setSupported(isCanvasDenoiseSupported());
    }, []);

    useEffect(() => {
        if (!open) return;
        setParams(DEFAULT_PARAMS);
        setResult(null);
        setShowOriginal(false);
        setError("");
        setStage("");
    }, [dataUrl, open]);

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
        setResult(null);
        setRunning(true);
        setStage("准备中");
        try {
            const source = await (await fetch(dataUrl)).blob();
            const handle = runCanvasDenoise(source, params, setStage);
            cancelRef.current = handle.cancel;
            const output = await handle.promise;
            const resultUrl = await blobToDataUrl(output.blob);
            setResult({ dataUrl: resultUrl, elapsed: output.elapsed });
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "降噪失败");
        } finally {
            cancelRef.current = null;
            setRunning(false);
            setStage("");
        }
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden mask={{ closable: !running }} closable={!running}>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">图片降噪</h2>
                    <p className="mt-1 text-sm opacity-60">在浏览器本地用 WebGPU 处理，图片不会离开当前设备。</p>
                </div>
                {!supported ? <Alert type="warning" showIcon message="当前浏览器不支持 WebGPU" description="本地降噪需要较新的 Chrome / Edge 并通过 HTTPS 访问；iOS Safari 暂不支持。" /> : null}
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_340px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5">
                            <img decoding="async" src={result && !showOriginal ? result.dataUrl : dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
                        </div>
                        <div className="mt-3 flex h-6 items-center justify-between text-sm">
                            {result ? (
                                <Segmented
                                    size="small"
                                    value={showOriginal ? "original" : "result"}
                                    options={[
                                        { label: "原图", value: "original" },
                                        { label: "效果", value: "result" },
                                    ]}
                                    onChange={(value) => setShowOriginal(value === "original")}
                                />
                            ) : (
                                <span className="opacity-60">源图</span>
                            )}
                            {result ? <span className="text-xs opacity-60">耗时 {result.elapsed.toFixed(1)}s</span> : <span className="text-xs opacity-60">输出保持原尺寸</span>}
                        </div>
                    </div>
                    <div className="space-y-6 py-2">
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">去噪强度</div>
                            <Segmented
                                block
                                value={params.down}
                                disabled={running}
                                options={strengthOptions.map((item) => ({
                                    value: item.value,
                                    label: (
                                        <span className="flex min-h-12 flex-col justify-center text-left leading-5">
                                            <span className="font-medium">{item.label}</span>
                                            <span className="text-xs opacity-55">{item.description}</span>
                                        </span>
                                    ),
                                }))}
                                onChange={(value) => setParams((current) => ({ ...current, down: Number(value) }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">结构平滑（L0）</div>
                            <Segmented block value={params.lam} disabled={running} options={smoothOptions.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setParams((current) => ({ ...current, lam: Number(value) }))} />
                            <div className="text-xs opacity-55">平滑能减少色块噪点，但可能丢失细线。</div>
                        </div>
                        {running ? (
                            <div className="space-y-2 rounded-xl border px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <LoaderCircle className="size-4 animate-spin" />
                                    {stage || "处理中"}
                                </div>
                                <Progress percent={100} showInfo={false} status="active" size="small" />
                            </div>
                        ) : null}
                        {error ? <div className="text-sm font-medium text-destructive">{error}</div> : null}
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    {running ? <Button onClick={() => cancelRef.current?.()}>取消处理</Button> : null}
                    <Button size="large" icon={<Sparkles className="size-4" />} disabled={!supported || running} onClick={() => void start()}>
                        {result ? "重新降噪" : "开始降噪"}
                    </Button>
                    <Button type="primary" size="large" icon={<ImagePlus className="size-4" />} disabled={!result || running} onClick={() => result && onConfirm(result.dataUrl)}>
                        生成降噪图
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
