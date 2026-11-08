import assert from "node:assert/strict";
import test from "node:test";

import { modelCreditCost, requestCreditCost } from "./credits";

const costs = [
    { model: "image-model", credits: 2 },
    { model: "video-model", credits: 3 },
    { model: "video-model", resolution: "1080p", credits: 5 },
];

test("本地渠道不计积分", () => {
    assert.equal(requestCreditCost({ channelMode: "local", modelCosts: costs, model: "video-model", seconds: "5" }), 0);
});

test("图片按数量计费", () => {
    assert.equal(requestCreditCost({ channelMode: "remote", modelCosts: costs, model: "image-model", count: 4 }), 8);
});

test("视频按分辨率与秒数计费", () => {
    assert.equal(requestCreditCost({ channelMode: "remote", modelCosts: costs, model: "video-model", resolution: "1080P", seconds: "5" }), 25);
    assert.equal(requestCreditCost({ channelMode: "remote", modelCosts: costs, model: "video-model", resolution: "720p", seconds: "5" }), 15);
});

test("自动时长按 15 秒估算，缺省数量至少为 1", () => {
    assert.equal(requestCreditCost({ channelMode: "remote", modelCosts: costs, model: "video-model", seconds: "-1" }), 45);
    assert.equal(requestCreditCost({ channelMode: "remote", modelCosts: costs, model: "image-model", count: 0 }), 2);
});

test("未配置单价的模型返回 0", () => {
    assert.equal(modelCreditCost(costs, "unknown"), 0);
    assert.equal(requestCreditCost({ channelMode: "remote", modelCosts: costs, model: "unknown", count: 2 }), 0);
});
