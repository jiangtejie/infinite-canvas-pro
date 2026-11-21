export type CanvasDenoiseParams = {
    /** 推理前缩小比例，越小越平滑。 */
    down: number;
    /** L0 平滑强度，0 为关闭。 */
    lam: number;
};

export type CanvasDenoiseResult = {
    blob: Blob;
    width: number;
    height: number;
    elapsed: number;
};

const MODEL_URL = process.env.NEXT_PUBLIC_DENOISE_MODEL_URL || "/models/esrgan.onnx";
const SEGMENT_MODEL_URL = process.env.NEXT_PUBLIC_DENOISE_SEGMENT_MODEL_URL || "";
let serial = 0;

export function isCanvasDenoiseSupported() {
    return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

export function runCanvasDenoise(blob: Blob, params: CanvasDenoiseParams, onProgress: (stage: string) => void) {
    const worker = new Worker(new URL("../workers/canvas-denoise.worker.ts", import.meta.url), { type: "module" });
    const id = ++serial;
    let settled = false;
    let rejectRequest: ((reason?: unknown) => void) | null = null;

    const promise = new Promise<CanvasDenoiseResult>((resolve, reject) => {
        rejectRequest = reject;
        worker.onmessage = (event: MessageEvent<{ id: number; stage?: string; blob?: Blob; width?: number; height?: number; elapsed?: number; error?: string }>) => {
            const data = event.data;
            if (data.id !== id) return;
            if (data.stage) {
                onProgress(data.stage);
                return;
            }
            settled = true;
            worker.terminate();
            if (data.error) reject(new Error(data.error));
            else resolve({ blob: data.blob as Blob, width: data.width as number, height: data.height as number, elapsed: data.elapsed as number });
        };
        worker.onerror = (event) => {
            settled = true;
            worker.terminate();
            reject(new Error(event.message || "降噪线程启动失败"));
        };
        worker.postMessage({ id, blob, down: params.down, lam: params.lam, modelUrl: MODEL_URL });
    });

    const cancel = () => {
        if (settled) return;
        settled = true;
        worker.terminate();
        rejectRequest?.(new DOMException("已取消", "AbortError"));
    };

    return { promise, cancel };
}

export function runCanvasSegment(blob: Blob, onProgress: (stage: string) => void) {
    const worker = new Worker(new URL("../workers/canvas-segment.worker.ts", import.meta.url), { type: "module" });
    const id = ++serial;
    let settled = false;
    let rejectRequest: ((reason?: unknown) => void) | null = null;

    const promise = new Promise<{ blob: Blob; share: number }>((resolve, reject) => {
        rejectRequest = reject;
        worker.onmessage = (event: MessageEvent<{ id: number; stage?: string; blob?: Blob; share?: number; error?: string }>) => {
            const data = event.data;
            if (data.id !== id) return;
            if (data.stage) {
                onProgress(data.stage);
                return;
            }
            settled = true;
            worker.terminate();
            if (data.error) reject(new Error(data.error));
            else resolve({ blob: data.blob as Blob, share: data.share as number });
        };
        worker.onerror = (event) => {
            settled = true;
            worker.terminate();
            reject(new Error(event.message || "人物识别线程启动失败"));
        };
        worker.postMessage({ id, blob, modelUrl: SEGMENT_MODEL_URL || undefined });
    });

    const cancel = () => {
        if (settled) return;
        settled = true;
        worker.terminate();
        rejectRequest?.(new DOMException("已取消", "AbortError"));
    };

    return { promise, cancel };
}

export function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
