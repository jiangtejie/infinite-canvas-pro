import assert from "node:assert/strict";
import test from "node:test";

import axios from "axios";
import localforage from "localforage";
import { mediaStore } from "@/services/file-storage";
import { createVideoGenerationTask, pollCreatedVideoGenerationTask } from "../tasks";
import { useChannelTranslationStore } from "@/stores/use-channel-translation-store";
import { useUserStore } from "@/stores/use-user-store";
import type { AiConfig } from "@/stores/use-config-store";
import { filterChannelModelsByCapability } from "@/stores/use-config-store";
import { createTeamoVideoRequestBody, isTeamoVideoConfig, teamoVideoSeconds, teamoVideoSize } from "./teamo";
import { aiVideoPollUrl, createVideoRequestBody } from "./request";
import type { VideoReferenceInput, VideoResponse } from "../types";

const config = (overrides: Partial<AiConfig> = {}): AiConfig => ({
    channelMode: "local",
    baseUrl: "https://api.teamorouter.ai",
    apiKey: "sk-teamo",
    model: "seedance-2-0-mini-text-to-video-basic",
    videoModel: "seedance-2-0-mini-text-to-video-basic",
    size: "16:9",
    vquality: "720p",
    videoSeconds: "5",
    localChannels: [],
    ...overrides,
} as AiConfig);

const emptyInput: Required<VideoReferenceInput> = { references: [], videoReferences: [], audioReferences: [], firstFrame: null, lastFrame: null };

test("识别 TeamoRouter 视频渠道，排除 Google 与普通 OpenAI", () => {
    assert.equal(isTeamoVideoConfig(config()), true);
    assert.equal(isTeamoVideoConfig(config({ baseUrl: "https://generativelanguage.googleapis.com" })), false);
    assert.equal(isTeamoVideoConfig(config({ baseUrl: "https://api.openai.com" })), false);
});

test("TeamoRouter 云端渠道按选中的公开渠道识别", async () => {
    const remote = config({
        channelMode: "remote",
        baseUrl: "https://api.openai.com",
        activeChannelId: "teamo",
        videoChannelId: "teamo",
        publicChannels: [
            { id: "other", protocol: "openai", baseUrl: "https://api.openai.com", models: [config().model] },
            { id: "teamo", protocol: "openai", baseUrl: "https://api.teamorouter.ai/v1", models: [config().model] },
        ],
    });
    assert.equal(isTeamoVideoConfig(remote), true);
    assert.deepEqual(await createVideoRequestBody(remote, remote.model, "p", emptyInput), {
        model: remote.model, prompt: "p", seconds: "5", size: "1280x720",
    });
    assert.equal(isTeamoVideoConfig({ ...remote, activeChannelId: "other", videoChannelId: "other" }), false);
});

test("TeamoRouter Gemini 渠道直连创建保留必填 model", async () => {
    const originalAdapter = axios.defaults.adapter;
    const originalAccounts = useChannelTranslationStore.getState().accounts;
    useChannelTranslationStore.setState({ accounts: { [useUserStore.getState().user?.id || "guest"]: {} } });
    let sent: { url?: string; body?: Record<string, unknown> } = {};
    axios.defaults.adapter = async (request) => {
        sent = { url: request.url, body: JSON.parse(request.data) };
        return { data: { id: "video_1", object: "video", status: "queued" }, status: 200, statusText: "OK", headers: {}, config: request };
    };
    try {
        const local = config({ systemPrompts: { image: "", video: "", text: "", workflow: "", workflowAgent: "" }, systemPrompt: "", localChannels: [{ id: "teamo", protocol: "gemini", name: "teamo", baseUrl: "https://api.teamorouter.ai", apiKey: "unused", models: [config().model] }] });
        await createVideoGenerationTask(local, "p");
        assert.equal(sent.url, "https://api.teamorouter.ai/v1/videos");
        assert.equal(sent.body?.model, local.model);
    } finally {
        axios.defaults.adapter = originalAdapter;
        useChannelTranslationStore.setState({ accounts: originalAccounts });
    }
});

test("TeamoRouter Gemini 渠道按视频模型轮询和下载", async () => {
    const originalAdapter = axios.defaults.adapter;
    const originalFetch = globalThis.fetch;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalDocument = globalThis.document;
    const requests: Array<{ url?: string; params?: Record<string, unknown> }> = [];
    await localforage.defineDriver({
        _driver: "teamo-test-memory",
        _initStorage: () => Promise.resolve(),
        _support: () => Promise.resolve(true),
        clear: () => Promise.resolve(),
        getItem: () => Promise.resolve(null),
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
        key: () => Promise.resolve(""),
        keys: () => Promise.resolve([]),
        length: () => Promise.resolve(0),
        iterate: () => Promise.resolve(),
    } as unknown as Parameters<typeof localforage.defineDriver>[0]);
    await mediaStore.setDriver("teamo-test-memory");
    (mediaStore as unknown as { _driverSet: Promise<unknown> })._driverSet = Promise.resolve();
    URL.createObjectURL = () => "blob:teamo-test";
    URL.revokeObjectURL = () => {};
    globalThis.document = { createElement: () => ({ set src(_value: string) { queueMicrotask(() => this.onerror?.()); }, onerror: null as null | (() => void), onloadedmetadata: null, videoWidth: 0, videoHeight: 0 }) } as unknown as Document;
    axios.defaults.adapter = async (request) => {
        requests.push({ url: request.url, params: request.params });
        return { data: { id: "video_1", object: "video", status: "completed" }, status: 200, statusText: "OK", headers: {}, config: request };
    };
    globalThis.fetch = async (input) => {
        requests.push({ url: String(input) });
        return new Response(new Uint8Array([0, 0, 0, 24]), { status: 200, headers: { "Content-Type": "video/mp4" } });
    };
    try {
        const local = config({ model: "gemini-3.1-flash-image", videoModel: config().model, localChannels: [{ id: "teamo", protocol: "gemini", name: "teamo", baseUrl: "https://api.teamorouter.ai", apiKey: "unused", models: [config().model] }] });
        await pollCreatedVideoGenerationTask(local, { id: "video_1", task_id: "video_1", object: "video", status: "queued" } as VideoResponse, { initialDelayMs: 0 });
        assert.equal(requests[0]?.url, "https://api.teamorouter.ai/v1/videos/video_1");
        assert.equal(requests[1]?.url, "https://api.teamorouter.ai/v1/videos/video_1/content?model=seedance-2-0-mini-text-to-video-basic");
    } finally {
        axios.defaults.adapter = originalAdapter;
        globalThis.fetch = originalFetch;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        globalThis.document = originalDocument;
    }
});

test("TeamoRouter 尺寸映射为 WIDTHxHEIGHT", () => {
    assert.equal(teamoVideoSize(config({ size: "16:9" })), "1280x720");
    assert.equal(teamoVideoSize(config({ size: "9:16" })), "720x1280");
    assert.equal(teamoVideoSize(config({ size: "1:1" })), "720x720");
    assert.equal(teamoVideoSize(config({ size: "854x480" })), "854x480");
});

test("TeamoRouter 时长为整数秒并收敛范围", () => {
    assert.equal(teamoVideoSeconds(config({ videoSeconds: "5" })), "5");
    assert.equal(teamoVideoSeconds(config({ videoSeconds: "0" })), "4");
    assert.equal(teamoVideoSeconds(config({ videoSeconds: "3" })), "4");
    assert.equal(teamoVideoSeconds(config({ videoSeconds: "99" })), "30");
});

test("TeamoRouter 请求体只含 OpenAI-Videos 标准字段", async () => {
    const body = await createTeamoVideoRequestBody(config(), "seedance-2-0-mini-text-to-video-basic", "一只狗在草地跑", emptyInput);
    assert.deepEqual(Object.keys(body).sort(), ["model", "prompt", "seconds", "size"]);
    assert.equal(body.model, "seedance-2-0-mini-text-to-video-basic");
    assert.equal(body.seconds, "5");
    assert.equal(body.size, "1280x720");
});

test("TeamoRouter MiniMax 发 aspect_ratio、默认不发 resolution（目录大小写敏感）", async () => {
    const max = await createTeamoVideoRequestBody(config({ vquality: "480", size: "864x496", videoSeconds: "5" }), "minimax-h3-max-text-to-video", "p", emptyInput);
    assert.equal(max.size, undefined);
    assert.equal(max.resolution, undefined);
    assert.equal(max.aspect_ratio, "16:9");
    assert.equal(max.seconds, "5");
    const h3 = await createTeamoVideoRequestBody(config({ vquality: "2k", size: "9:16", videoSeconds: "30" }), "minimax-h3-text-to-video", "p", emptyInput);
    assert.equal(h3.size, undefined);
    assert.equal(h3.resolution, "2k");
    assert.equal(h3.aspect_ratio, "9:16");
    assert.equal(h3.seconds, "15");
    const h3Low = await createTeamoVideoRequestBody(config({ vquality: "480", size: "16:9" }), "minimax-h3-image-to-video", "p", emptyInput);
    assert.equal(h3Low.resolution, undefined);
    assert.equal(h3Low.aspect_ratio, "16:9");
    const max2k = await createTeamoVideoRequestBody(config({ vquality: "2k", size: "16:9" }), "minimax-h3-max-text-to-video", "p", emptyInput);
    assert.equal(max2k.resolution, undefined);
});

test("TeamoRouter 参考图走 input_reference.image_url", async () => {
    const input = { ...emptyInput, references: [{ id: "r1", name: "r1", type: "image/png", dataUrl: "data:image/png;base64,AAAA" }] };
    const body = await createTeamoVideoRequestBody(config(), "m", "p", input);
    assert.deepEqual(body.input_reference, { image_url: "data:image/png;base64,AAAA" });
});

test("TeamoRouter 创建/轮询走 /videos，且 dispatcher 路由到适配器", async () => {
    assert.equal(aiVideoPollUrl(config(), "m", "vid_1"), "https://api.teamorouter.ai/v1/videos/vid_1");
    const body = await createVideoRequestBody(config(), "m", "p", emptyInput);
    assert.equal(body instanceof FormData, false);
    assert.equal((body as Record<string, unknown>).size, "1280x720");
});

test("TeamoRouter 渠道的视频模型按通用名称匹配，Google Gemini 仍仅 veo", () => {
    const teamo = { protocol: "gemini" as const, baseUrl: "https://api.teamorouter.ai", models: ["seedance-2-0-mini-text-to-video-basic", "gemini-3.1-flash-image"] };
    const google = { protocol: "gemini" as const, baseUrl: "https://generativelanguage.googleapis.com", models: ["seedance-2-0-mini-text-to-video-basic", "veo-3.1-generate"] };
    assert.deepEqual(filterChannelModelsByCapability([teamo], "video"), ["seedance-2-0-mini-text-to-video-basic"]);
    assert.deepEqual(filterChannelModelsByCapability([google], "video"), ["veo-3.1-generate"]);
});