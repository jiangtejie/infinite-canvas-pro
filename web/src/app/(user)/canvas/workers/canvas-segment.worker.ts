// 二次元人物分割（SkyTNT anime-seg isnetis）：WebGPU 本地推理，输出与原图同尺寸的灰度蒙版。
// 模型默认从 Hugging Face 官方固定提交下载，约 176MB，缓存到 Cache Storage 并校验 SHA-256。
import * as ort from "onnxruntime-web/webgpu";

const MODEL_SHA256 = "f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99";
const OFFICIAL_MODEL_URL = "https://huggingface.co/skytnt/anime-seg/resolve/a0a563c41338cbe0d23dfb4bfc3e243c518e5768/isnetis.onnx";
const MODEL_CACHE = "canvas-anime-seg-v1";
const INPUT_SIZE = 1024;

ort.env.wasm.wasmPaths = "/denoise/";
ort.env.wasm.numThreads = 1;

export type CanvasSegmentRequest = { id: number; blob: Blob; modelUrl?: string };

const workerScope = self as unknown as {
    addEventListener: (type: "message", listener: (event: MessageEvent<CanvasSegmentRequest>) => void) => void;
    postMessage: (message: unknown) => void;
};

let session: ort.InferenceSession | null = null;

async function loadModel(modelUrl: string) {
    if (session) return session;
    if (!navigator.gpu) throw new Error("人物识别需要 WebGPU");
    const storage = await caches.open(MODEL_CACHE);
    let response: Response | undefined = await storage.match(modelUrl);
    if (!response) {
        const fetched = await fetch(modelUrl).catch(() => null);
        if (!fetched?.ok) throw new Error("人物模型下载失败，请检查网络后重试");
        response = fetched;
        await storage.put(modelUrl, response.clone());
    }
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    if (digest !== MODEL_SHA256) {
        await storage.delete(modelUrl);
        throw new Error("人物模型校验失败，请检查下载地址后重试");
    }
    session = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"] });
    return session;
}

async function handleRequest(m: CanvasSegmentRequest) {
    const progress = (stage: string) => workerScope.postMessage({ id: m.id, stage });
    try {
        progress("下载 / 加载人物模型");
        const net = await loadModel(m.modelUrl || OFFICIAL_MODEL_URL);
        progress("识别人物");
        const bitmap = await createImageBitmap(m.blob);
        const width = bitmap.width;
        const height = bitmap.height;
        const scale = INPUT_SIZE / Math.max(width, height);
        const resizedWidth = Math.max(1, Math.round(width * scale));
        const resizedHeight = Math.max(1, Math.round(height * scale));
        const offsetX = Math.floor((INPUT_SIZE - resizedWidth) / 2);
        const offsetY = Math.floor((INPUT_SIZE - resizedHeight) / 2);
        const inputCanvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
        const inputContext = inputCanvas.getContext("2d");
        if (!inputContext) throw new Error("无法创建离屏画布");
        inputContext.fillStyle = "black";
        inputContext.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
        inputContext.drawImage(bitmap, offsetX, offsetY, resizedWidth, resizedHeight);
        const pixels = inputContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
        const data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
        for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) for (let channel = 0; channel < 3; channel++) data[channel * INPUT_SIZE * INPUT_SIZE + i] = pixels[i * 4 + channel] / 255;
        const input = new ort.Tensor("float32", data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
        let outputs: ort.InferenceSession.OnnxValueMapType | undefined;
        try {
            outputs = await net.run({ img: input });
            const values = outputs.mask.data as Float32Array;
            const mask = new ImageData(INPUT_SIZE, INPUT_SIZE);
            for (let i = 0; i < values.length; i++) {
                const value = Math.round(255 * Math.max(0, Math.min(1, values[i])));
                mask.data[i * 4] = mask.data[i * 4 + 1] = mask.data[i * 4 + 2] = value;
                mask.data[i * 4 + 3] = 255;
            }
            inputContext.putImageData(mask, 0, 0);
            const result = new OffscreenCanvas(width, height);
            const resultContext = result.getContext("2d");
            if (!resultContext) throw new Error("无法创建离屏画布");
            resultContext.drawImage(inputCanvas, offsetX, offsetY, resizedWidth, resizedHeight, 0, 0, width, height);
            // 叠加原图透明度，统计人物占画面比例（透明边缘不计入）。
            const alphaCanvas = new OffscreenCanvas(width, height);
            const alphaContext = alphaCanvas.getContext("2d");
            if (!alphaContext) throw new Error("无法创建离屏画布");
            alphaContext.drawImage(bitmap, 0, 0);
            const alphaPixels = alphaContext.getImageData(0, 0, width, height).data;
            const maskPixels = resultContext.getImageData(0, 0, width, height);
            let share = 0;
            for (let i = 0; i < width * height; i++) {
                const value = Math.round(maskPixels.data[i * 4] * alphaPixels[i * 4 + 3] / 255);
                maskPixels.data[i * 4] = maskPixels.data[i * 4 + 1] = maskPixels.data[i * 4 + 2] = value;
                share += value / 255;
            }
            resultContext.putImageData(maskPixels, 0, 0);
            workerScope.postMessage({ id: m.id, blob: await result.convertToBlob({ type: "image/png" }), share: share / (width * height) });
        } finally {
            bitmap.close();
            input.dispose();
            if (outputs) for (const value of Object.values(outputs)) value.dispose();
        }
    } catch (error) {
        workerScope.postMessage({ id: m.id, error: error instanceof Error ? error.message : String(error) });
    }
}

workerScope.addEventListener("message", (event) => {
    void handleRequest(event.data);
});
