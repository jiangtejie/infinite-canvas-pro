import assert from "node:assert/strict";
import test from "node:test";

import type { WorkflowGenerationTask } from "@/services/api/workflow-generation";
import { useUserStore } from "@/stores/use-user-store";

import { workflowAudioTask, workflowImageTask, workflowVideoTask } from "./canvas-workflow-tasks";

const COMFY_URL = "http://127.0.0.1:8189/outputs/abcdef0123456789";
const COMFY_KEY = "comfy:abcdef0123456789";

const task = (patch: Partial<WorkflowGenerationTask>): WorkflowGenerationTask => ({ id: "wf-1", status: "succeeded", progress: 100, urls: [], ...patch });

useUserStore.setState({ token: "test-token" });

test("workflow image task maps successful comfy outputs without uploading", async () => {
    const result = await workflowImageTask(task({ urls: [COMFY_URL] }), "test-token");
    assert.equal(result.id, "wf-1");
    assert.equal(result.source, "workflow");
    assert.equal(result.status, "completed");
    assert.equal(result.image_url, COMFY_URL);
    assert.deepEqual(result.image_urls, [COMFY_URL]);
    assert.equal(result.storageKey, COMFY_KEY);
    assert.equal(result.mimeType, "image/png");
});

test("workflow video task keeps the comfy storage key", async () => {
    const result = await workflowVideoTask(task({ urls: [COMFY_URL] }), "test-token");
    assert.equal(result.task_id, "wf-1");
    assert.equal(result.status, "completed");
    assert.equal(result.video_url, COMFY_URL);
    assert.equal(result.storageKey, COMFY_KEY);
});

test("workflow audio task keeps the comfy storage key", async () => {
    const result = await workflowAudioTask(task({ urls: [COMFY_URL] }), "test-token");
    assert.equal(result.status, "completed");
    assert.equal(result.audio_url, COMFY_URL);
    assert.equal(result.storageKey, COMFY_KEY);
    assert.equal(result.mimeType, "audio/mpeg");
});

test("workflow tasks reject a stale token", async () => {
    await assert.rejects(() => workflowImageTask(task({ urls: [COMFY_URL] }), "other-token"), /登录状态已变化/);
});

test("workflow task failures keep the error and skip output uploads", async () => {
    const result = await workflowImageTask(task({ status: "failed", urls: [COMFY_URL], error: "工作流失败" }), "test-token");
    assert.equal(result.status, "failed");
    assert.deepEqual(result.image_urls, []);
    assert.equal(result.error?.message, "工作流失败");
});
