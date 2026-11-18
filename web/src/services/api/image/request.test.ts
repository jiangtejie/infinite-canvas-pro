import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import { requestImages } from "./request";

test("TeamoRouter 4K Upscale 的编辑请求走 JSON image，而不是 multipart", async () => {
    const model = "gpt-image-2.6-sunburst-4k-upscale";
    const config: AiConfig = {
        ...defaultConfig,
        channelMode: "remote",
        model,
        imageModel: model,
        activeChannelId: "teamo",
        imageChannelId: "teamo",
        publicChannels: [{ id: "teamo", protocol: "openai", baseUrl: "https://api.teamorouter.ai/v1", models: [model] }],
    };
    const originalFetch = globalThis.fetch;
    const originalToken = useUserStore.getState().token;
    const originalWindow = (globalThis as { window?: Window & typeof globalThis }).window;
    (globalThis as { window?: Window & typeof globalThis }).window = { setTimeout, clearTimeout } as unknown as Window & typeof globalThis;
    useUserStore.setState({ token: "test-token" });
    const captured: Array<{ url: string; contentType: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = async (input, init) => {
        captured.push({
            url: String(input),
            contentType: new Headers(init?.headers).get("content-type") || "",
            body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ created: 1, data: [{ url: "https://example.com/out.png" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
        const images = await requestImages(config, "只改蓝色区域", [{ id: "r1", name: "r1", type: "image/png", dataUrl: "data:image/png;base64,AAAA" }]);
        assert.equal(images.length, 1);
        const request = captured[0];
        assert.ok(request);
        assert.equal(request.url, "/api/v1/images/edits");
        assert.equal(request.contentType, "application/json");
        assert.equal(request.body.model, model);
        assert.equal(request.body.image, "data:image/png;base64,AAAA");
    } finally {
        globalThis.fetch = originalFetch;
        (globalThis as { window?: Window & typeof globalThis }).window = originalWindow;
        useUserStore.setState({ token: originalToken });
    }
});
