import assert from "node:assert/strict";
import test from "node:test";

import { workflowForRetry } from "./creative-workflow-model";
import type { WorkflowTask } from "./creative-workflow-types";

function task(patch: Partial<WorkflowTask>): WorkflowTask {
    return {
        id: "task-1",
        status: "failed",
        workflowId: "",
        workflowName: "跨设备任务",
        prompt: "提示词",
        inputs: {},
        references: [],
        model: "image-model",
        apiMode: "images",
        config: { model: "image-model", imageModel: "image-model", imageChannelId: "", quality: "high", size: "1024x1024", count: "1", apiMode: "images", timeout: "600", streamImages: "", streamPartialImages: "1", responseFormatB64Json: "", codexCli: "", systemPrompt: "", promptTemplate: "", negativePrompt: "" },
        count: 1,
        startedAt: 1,
        images: [],
        ...patch,
    };
}

test("缺少 workflowId 的任务也能生成临时重试模板", () => {
    const workflow = workflowForRetry(task({}));
    assert.ok(workflow);
    assert.equal(workflow.id, "recovered:task-1");
    assert.equal(workflow.editable, false);
    assert.equal(workflow.name, "跨设备任务");
    assert.equal(workflow.config.model, "image-model");
});

test("已有 workflowId 时沿用原 id", () => {
    const workflow = workflowForRetry(task({ workflowId: "workflow-1" }));
    assert.equal(workflow?.id, "workflow-1");
});
