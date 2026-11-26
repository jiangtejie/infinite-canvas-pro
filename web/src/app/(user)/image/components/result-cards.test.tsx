import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { defaultConfig } from "@/stores/use-config-store";

import { PendingImageCard, StoppedImageCard } from "./result-cards";
import type { GenerationResult } from "../history";

const result: GenerationResult = {
    id: "image-result-1",
    status: "pending",
    createdAt: 0,
    prompt: "测试提示词",
    model: "test-image",
    config: defaultConfig,
    references: [],
};

test("pending image progress uses the shared accessible state", () => {
    const markup = renderToStaticMarkup(<PendingImageCard result={{ ...result, progress: 42 }} now={12000} onCopyPrompt={() => {}} />);
    assert.ok(markup.includes("正在创作 42%"));
    assert.ok(markup.includes('role="progressbar"'));
    assert.ok(markup.includes('aria-valuenow="42"'));
});

test("stopped image state shares the task status wording", () => {
    const markup = renderToStaticMarkup(<StoppedImageCard result={{ ...result, status: "stopped" }} onCopyPrompt={() => {}} onRetry={() => {}} />);
    assert.ok(markup.includes("已停止"));
    assert.ok(!markup.includes("已停止生成"));
});
