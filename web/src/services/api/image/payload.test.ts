import assert from "node:assert/strict";
import test from "node:test";

import { geminiDirectHeaders, isTeamorouterBaseUrl } from "@/lib/gemini";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";

import { createGeminiImageBody } from "./payload";
import type { ImageRequestParams } from "./types";

function geminiConfig(size: string): AiConfig {
    return {
        ...defaultConfig,
        channelMode: "local",
        baseUrl: "https://api.teamorouter.ai",
        model: "gemini-3.1-flash-image",
        imageModel: "gemini-3.1-flash-image",
        quality: "auto",
        size,
        localChannels: [{
            id: "teamorouter",
            protocol: "gemini",
            name: "Teamorouter",
            baseUrl: "https://api.teamorouter.ai",
            apiKey: "sk-teamo-test",
            models: ["gemini-3.1-flash-image"],
        }],
        activeChannelId: "teamorouter",
        imageChannelId: "teamorouter",
    };
}

function params(size: string): ImageRequestParams {
    return { n: 1, quality: "auto", size, timeoutSeconds: 600, streamPartialImages: 0 };
}

test("TeamoRouter 走 Bearer 鉴权，Google 仍走 x-goog-api-key", () => {
    const config = geminiConfig("512x512");
    assert.equal(isTeamorouterBaseUrl("https://api.teamorouter.ai"), true);
    assert.deepEqual(geminiDirectHeaders(config), { "Content-Type": "application/json", Authorization: "Bearer sk-teamo-test" });
    const google = { ...config, localChannels: [{ ...config.localChannels[0], baseUrl: "https://generativelanguage.googleapis.com" }] };
    assert.deepEqual(geminiDirectHeaders(google), { "Content-Type": "application/json", "x-goog-api-key": "sk-teamo-test" });
});

test("请求使用 Gemini 原生 contents / generationConfig 结构", async () => {
    const body = await createGeminiImageBody(geminiConfig("512x512"), "生成一张海报", [], params("512x512"));
    assert.equal(body.contents[0].role, "user");
    assert.match(String(body.contents[0].parts[0].text), /生成一张海报/);
    assert.deepEqual(body.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
    assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "1:1", imageSize: "512" });
});

for (const [size, ratio] of [["512x2048", "1:4"], ["2048x512", "4:1"], ["512x4096", "1:8"], ["1024x1280", "4:5"]] as const) {
    test(`自定义尺寸 ${size} 映射为 Gemini 比例 ${ratio}`, async () => {
        const body = await createGeminiImageBody(geminiConfig(size), "test", [], params(size));
        assert.equal(body.generationConfig.imageConfig.aspectRatio, ratio);
    });
}
