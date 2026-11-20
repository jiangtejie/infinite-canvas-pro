import assert from "node:assert/strict";
import test from "node:test";

import { resolveSystemPrompts } from "./system-prompts";

test("本地系统提示词优先，空值回退后台配置", () => {
    const resolved = resolveSystemPrompts(
        { image: "本地生图", video: "", text: "" },
        { image: "后台生图", video: "后台视频", text: "后台文本", workflow: "后台工作流", workflowAgent: "后台 Agent" },
    );
    assert.equal(resolved.image, "本地生图");
    assert.equal(resolved.video, "后台视频");
    assert.equal(resolved.text, "后台文本");
    assert.equal(resolved.workflow, "后台工作流");
    assert.equal(resolved.workflowAgent, "后台 Agent");
});

test("后台配置缺失时返回本地或空串", () => {
    const resolved = resolveSystemPrompts({ image: "本地" }, undefined);
    assert.equal(resolved.image, "本地");
    assert.equal(resolved.video, "");
});
