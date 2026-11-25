import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { createCanvasImageTask } from "./tasks";

const remixApproval = { approvalId: "approval-1", slotId: "slot-1" };

function proxyConfig(patch: Partial<AiConfig> = {}): AiConfig {
    return {
        ...defaultConfig,
        channelMode: "local",
        model: "image-model",
        imageModel: "image-model",
        baseUrl: "https://example.com/v1",
        apiKey: "test-key",
        localChannels: [{ id: "local-1", name: "测试渠道", protocol: "openai", baseUrl: "https://example.com/v1", apiKey: "test-key", models: ["image-model"] }],
        activeChannelId: "local-1",
        imageChannelId: "local-1",
        ...patch,
    };
}

async function captureTask(config: AiConfig, references: Parameters<typeof createCanvasImageTask>[2] = []) {
    const originalFetch = globalThis.fetch;
    let headers = new Headers();
    globalThis.fetch = async (_input, init) => {
        headers = new Headers(init?.headers);
        return new Response(JSON.stringify({ code: 0, data: { id: "task-1", status: "queued" } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
        await createCanvasImageTask(config, "最终提示词", references, { nodeId: "image-1", clientTaskId: "client-1", remixApproval });
    } finally {
        globalThis.fetch = originalFetch;
    }
    return headers;
}

test("普通 JSON 图片任务携带复刻审批信封", async () => {
    const originalToken = useUserStore.getState().token;
    useUserStore.setState({ token: "test-token" });
    try {
        const headers = await captureTask(proxyConfig());
        assert.equal(headers.get("X-Canvas-Remix-Approval-ID"), "approval-1");
        assert.equal(headers.get("X-Canvas-Remix-Slot-ID"), "slot-1");
    } finally {
        useUserStore.setState({ token: originalToken });
    }
});

test("multipart 图片任务携带复刻审批信封", async () => {
    const originalToken = useUserStore.getState().token;
    useUserStore.setState({ token: "test-token" });
    try {
        const headers = await captureTask(proxyConfig(), [{ id: "ref-1", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,AAAA" }]);
        assert.equal(headers.get("X-Canvas-Remix-Approval-ID"), "approval-1");
        assert.equal(headers.get("X-Canvas-Remix-Slot-ID"), "slot-1");
    } finally {
        useUserStore.setState({ token: originalToken });
    }
});

test("参数翻译图片任务携带复刻审批信封", async () => {
    const originalToken = useUserStore.getState().token;
    useUserStore.setState({ token: "test-token", user: { id: "account-1" } as ReturnType<typeof useUserStore.getState>["user"] });
    try {
        const headers = await captureTask(proxyConfig({
            channelMode: "remote",
            publicChannels: [{ id: "public-1", name: "翻译渠道", protocol: "openai", baseUrl: "https://example.com/v1", models: ["image-model"], parameterTranslationModels: ["image-model"] }],
        }));
        assert.equal(headers.get("X-Canvas-Remix-Approval-ID"), "approval-1");
        assert.equal(headers.get("X-Canvas-Remix-Slot-ID"), "slot-1");
    } finally {
        useUserStore.setState({ token: originalToken });
    }
});
