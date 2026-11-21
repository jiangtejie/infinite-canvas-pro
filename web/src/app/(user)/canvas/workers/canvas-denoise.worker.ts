// 浏览器本地 AI 降噪：WebGPU 跑 Real-ESRGAN 分块超分 + 可选 L0 平滑。
// 移植自 GPT-anime-denoise-web（MIT），模型许可见 docs/overview/features.md 的归属说明。
import * as ort from "onnxruntime-web/webgpu";
import { gpuL0SmoothLarge } from "./canvas-denoise-l0";

const MODEL_SHA256 = "80b3a3b92d69ab457220925f5deb5b9c8b113cb41b075603139a4234c912344d";
const MODEL_CACHE = "canvas-anime-model-v1";
const MAX_PIXELS = 16_777_216;
const TILE = 128;
const HALO = 96;

ort.env.wasm.wasmPaths = "/denoise/";
ort.env.wasm.numThreads = 1;

export type CanvasDenoiseRequest = { id: number; blob: Blob; down: number; lam: number; modelUrl: string };

const workerScope = self as unknown as {
    addEventListener: (type: "message", listener: (event: MessageEvent<CanvasDenoiseRequest>) => void) => void;
    postMessage: (message: unknown) => void;
};

let session: ort.InferenceSession | null = null;
let cachedResult: { key: string; rgb: Float32Array } | null = null;

async function detectHash(bytes: ArrayBuffer) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadModel(modelUrl: string) {
    if (session) return session;
    if (!navigator.gpu) throw new Error("当前浏览器没有 WebGPU，请使用支持 WebGPU 的浏览器并通过 HTTPS 访问");
    const storage = await caches.open(MODEL_CACHE);
    let response = await storage.match(modelUrl);
    if (!response) {
        response = await fetch(modelUrl);
        if (!response.ok) throw new Error("降噪模型下载失败");
        await storage.put(modelUrl, response.clone());
    }
    const bytes = await response.arrayBuffer();
    const digest = await detectHash(bytes);
    if (digest !== MODEL_SHA256) {
        await storage.delete(modelUrl);
        throw new Error("降噪模型校验失败，请重新下载");
    }
    session = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
    return session;
}

function canvas2d(width: number, height: number) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建离屏画布");
    return { canvas, context };
}

async function handleRequest(m: CanvasDenoiseRequest) {
    const progress = (stage: string) => workerScope.postMessage({ id: m.id, stage });
    try {
        const startedAt = performance.now();
        const bitmap = await createImageBitmap(m.blob);
        const width = bitmap.width;
        const height = bitmap.height;
        if (width < 16 || height < 16 || Math.max(width, height) > 16384 || width * height > MAX_PIXELS) {
            bitmap.close();
            throw new Error("图片尺寸超出范围：最多 1677 万像素，单边不超过 16384");
        }
        const { canvas: original, context: originalContext } = canvas2d(width, height);
        originalContext.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = originalContext.getImageData(0, 0, width, height);

        const cacheKey = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await m.blob.arrayBuffer()))).join(",") + m.down;
        let rgb: Float32Array;
        if (cachedResult?.key === cacheKey) {
            rgb = cachedResult.rgb.slice();
        } else {
            progress("下载 / 加载 GPU 模型");
            const net = await loadModel(m.modelUrl);
            cachedResult = null;
            const smallWidth = Math.max(1, Math.round(width * m.down));
            const smallHeight = Math.max(1, Math.round(height * m.down));
            const { canvas: small, context: smallContext } = canvas2d(smallWidth, smallHeight);
            smallContext.drawImage(original, 0, 0, smallWidth, smallHeight);
            const input = smallContext.getImageData(0, 0, smallWidth, smallHeight).data;
            rgb = new Float32Array(width * height * 3);
            const total = Math.ceil(smallWidth / TILE) * Math.ceil(smallHeight / TILE);
            let done = 0;
            for (let y = 0; y < smallHeight; y += TILE) for (let x = 0; x < smallWidth; x += TILE) {
                progress(`GPU 分块增强 ${++done}/${total}`);
                const x0 = Math.max(0, x - HALO);
                const y0 = Math.max(0, y - HALO);
                const x1 = Math.min(smallWidth, x + TILE + HALO);
                const y1 = Math.min(smallHeight, y + TILE + HALO);
                const tileWidth = x1 - x0;
                const tileHeight = y1 - y0;
                const count = tileWidth * tileHeight;
                const data = new Float32Array(count * 3);
                for (let j = 0; j < tileHeight; j++) for (let i = 0; i < tileWidth; i++) for (let c = 0; c < 3; c++) data[c * count + j * tileWidth + i] = input[((j + y0) * smallWidth + i + x0) * 4 + c] / 255;
                const tensor = new ort.Tensor("float32", data, [1, 3, tileHeight, tileWidth]);
                let outputs: ort.InferenceSession.OnnxValueMapType | undefined;
                try {
                    outputs = await net.run({ input: tensor });
                    const output = outputs.output;
                    const out = output.data as Float32Array;
                    const dims = output.dims;
                    const outWidth = Number(dims[3]);
                    const outHeight = Number(dims[2]);
                    // 用全局像素坐标采样，拼块之间保持同一映射，不产生接缝。
                    const left = Math.round(x * width / smallWidth);
                    const right = Math.round(Math.min(smallWidth, x + TILE) * width / smallWidth);
                    const top = Math.round(y * height / smallHeight);
                    const bottom = Math.round(Math.min(smallHeight, y + TILE) * height / smallHeight);
                    for (let j = top; j < bottom; j++) for (let i = left; i < right; i++) {
                        const sx = Math.max(0, Math.min(outWidth - 1, (i + 0.5) * smallWidth * 4 / width - 0.5 - x0 * 4));
                        const sy = Math.max(0, Math.min(outHeight - 1, (j + 0.5) * smallHeight * 4 / height - 0.5 - y0 * 4));
                        const ix = Math.floor(sx);
                        const iy = Math.floor(sy);
                        const fx = sx - ix;
                        const fy = sy - iy;
                        for (let c = 0; c < 3; c++) {
                            const base = c * outWidth * outHeight;
                            const get = (px: number, py: number) => Math.max(0, Math.min(1, out[base + py * outWidth + px]));
                            rgb[(j * width + i) * 3 + c] = (get(ix, iy) * (1 - fx) + get(Math.min(ix + 1, outWidth - 1), iy) * fx) * (1 - fy) + (get(ix, Math.min(iy + 1, outHeight - 1)) * (1 - fx) + get(Math.min(ix + 1, outWidth - 1), Math.min(iy + 1, outHeight - 1)) * fx) * fy;
                        }
                    }
                } finally {
                    tensor.dispose();
                    if (outputs) for (const value of Object.values(outputs)) value.dispose();
                }
            }
            small.width = 1;
            // 最多缓存 96 MiB，避免常见 4K 图重复推理。
            cachedResult = rgb.byteLength <= 96 * 1024 * 1024 ? { key: cacheKey, rgb: rgb.slice() } : null;
        }

        if (m.lam > 0) {
            progress("图片平滑（WebGPU）");
            rgb = await gpuL0SmoothLarge(rgb, width, height, m.lam, progress);
        }
        for (let i = 0; i < width * height; i++) for (let c = 0; c < 3; c++) pixels.data[i * 4 + c] = Math.round(Math.max(0, Math.min(1, rgb[i * 3 + c])) * 255);
        originalContext.putImageData(pixels, 0, 0);
        const blob = await original.convertToBlob({ type: "image/png" });
        workerScope.postMessage({ id: m.id, blob, width, height, elapsed: (performance.now() - startedAt) / 1000 });
    } catch (error) {
        workerScope.postMessage({ id: m.id, error: error instanceof Error ? error.message : String(error) });
    }
}

workerScope.addEventListener("message", (event) => {
    void handleRequest(event.data);
});
