import assert from "node:assert/strict";
import test from "node:test";

import type { AiConfig } from "@/stores/use-config-store";

import { buildCanvasAgentRequestConfig, canvasAgentJsonFallbackKey, resolveCanvasAgentSkillContents } from "./canvas-agent-request";

const config = (patch: Record<string, unknown> = {}) => ({ model: "base-model", textModel: "gpt-5", textChannelId: "c-text", activeChannelId: "c-active", baseUrl: "https://api.example.com", apiMode: "chat", ...patch }) as unknown as AiConfig;

const skill = (patch: Record<string, unknown> = {}) => ({ id: "s1", source: "system" as const, name: "分镜", content: "规则正文", enabled: true, ...patch });

test("request config prefers text model and falls back to active channel", () => {
    const request = buildCanvasAgentRequestConfig(config({ textChannelId: "" }), { textApiMode: "responses", textStreaming: true, textReasoningEnabled: true });
    assert.equal(request.model, "gpt-5");
    assert.equal(request.apiMode, "responses");
    assert.equal(request.textStreaming, true);
    assert.equal(request.textReasoningEnabled, true);
    assert.equal(request.activeChannelId, "c-active");
});

test("request config keeps base model when no text model is set", () => {
    const request = buildCanvasAgentRequestConfig(config({ textModel: "" }), { textApiMode: "chat" });
    assert.equal(request.model, "base-model");
    assert.equal(request.textStreaming, false);
    assert.equal(request.textReasoningEnabled, false);
});

test("json fallback key follows the resolved mode, channel and model", () => {
    assert.equal(canvasAgentJsonFallbackKey(buildCanvasAgentRequestConfig(config(), { textApiMode: "chat" })), "chat|c-text|gpt-5");
    assert.equal(canvasAgentJsonFallbackKey(buildCanvasAgentRequestConfig(config({ textChannelId: "", textModel: "" }), { textApiMode: "responses" })), "responses|c-active|base-model");
});

test("skill resolution returns contents for available skills", () => {
    const result = resolveCanvasAgentSkillContents([{ id: "s1", name: "分镜", source: "system" }], [skill({ hasFiles: true })]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.contents, [{ id: "s1", source: "system", name: "分镜", content: "规则正文", hasFiles: true }]);
});

test("skill resolution reports disabled or missing skills", () => {
    const disabled = resolveCanvasAgentSkillContents([{ id: "s1", name: "分镜", source: "system" }], [skill({ enabled: false })]);
    assert.equal(disabled.ok, false);
    if (disabled.ok) return;
    assert.match(disabled.message, /分镜/);
    const missing = resolveCanvasAgentSkillContents([{ id: "s9", name: "角色", source: "user" }], [skill()]);
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.message, /角色/);
});
