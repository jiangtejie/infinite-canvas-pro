#!/usr/bin/env node
// 准备画布本地降噪所需的静态资产：ORT WebGPU wasm 与 esrgan.onnx 模型。
// 两者都是大文件，不入库；首次开发或部署前运行 `bun run denoise:assets`。
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const MODEL_SHA256 = "80b3a3b92d69ab457220925f5deb5b9c8b113cb41b075603139a4234c912344d";
const MODEL_URL = "https://github.com/hhxki/GPT-anime-denoise-web/releases/download/models-v1/esrgan.onnx";
const ORT_ASSETS = ["ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.asyncify.mjs"];
const root = resolve(import.meta.dirname, "..");

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

const denoiseDir = resolve(root, "public/denoise");
const modelDir = resolve(root, "public/models");
await mkdir(denoiseDir, { recursive: true });
await mkdir(modelDir, { recursive: true });

for (const asset of ORT_ASSETS) {
    const target = resolve(denoiseDir, asset);
    if (!(await exists(target))) {
        await copyFile(resolve(root, "node_modules/onnxruntime-web/dist", asset), target);
        console.log(`copied ${asset}`);
    } else {
        console.log(`${asset} already present`);
    }
}

const modelTarget = resolve(modelDir, "esrgan.onnx");
if (await exists(modelTarget)) {
    console.log("esrgan.onnx already present");
} else {
    console.log(`downloading esrgan.onnx from ${MODEL_URL}`);
    const response = await fetch(MODEL_URL, { redirect: "follow" });
    if (!response.ok) throw new Error(`model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== MODEL_SHA256) throw new Error(`model checksum mismatch: ${digest}`);
    await mkdir(dirname(modelTarget), { recursive: true });
    await writeFile(modelTarget, bytes);
    console.log(`esrgan.onnx saved (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
}
