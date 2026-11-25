import assert from "node:assert/strict";
import test from "node:test";

import type { RemixApproval, RemixRun } from "../../remix-types";
import { remixApprovalKey } from "./canvas-source-remix";
import { assertRemixAccountFresh, remixApprovalHeaders } from "./canvas-remix-approval";

const run: RemixRun = {
    id: "run-1",
    createdAt: "2026-11-24T00:00:00.000Z",
    binding: "active",
    input: {
        ownerId: "account-1",
        sourceNodeId: "source-1",
        sourceSignature: "source-signature",
        sourceText: "原文",
        sourceImages: [],
        settings: { mode: "content", goal: "复刻", placement: "natural", instruction: "", skills: [] },
        skills: [],
        coreVersion: "remix-1",
    },
    plan: {
        schemaVersion: 1,
        sourcePattern: { type: "图文", preserve: ["结构"] },
        copy: { title: "标题", body: "正文", tags: [] },
        marketingPlacement: { mode: "content", reason: "自然复刻", cta: "" },
        factsUsed: [],
        visual: { sharedAnchors: [], images: [{ sourceImageId: "source-image", role: "主图", prompt: "生成主图", referenceAssetIds: [] }] },
    },
};

function approval(prompt = "最终提示词"): RemixApproval {
    return {
        id: "approval-1",
        requestId: "review-1",
        ownerId: "account-1",
        approvalKey: remixApprovalKey(run),
        expiresAt: "2026-11-24T00:30:00.000Z",
        slots: [{ id: "slot-1", nodeId: "image-1", model: "image-model", prompt }],
    };
}

function approvedRun(value = approval()): RemixRun {
    return { ...run, approvedKey: remixApprovalKey(run), approval: value };
}

test("复刻审批只接受当前账号、未过期且模型与最终提示词完全匹配的槽位", () => {
    assert.deepEqual(remixApprovalHeaders(approvedRun(), "image-1", "image-model", "最终提示词", Date.parse("2026-11-24T00:10:00.000Z")), {
        approvalId: "approval-1",
        slotId: "slot-1",
    });
});

test("账号切换后不能复用缓存中的复刻审批", () => {
    assert.throws(() => assertRemixAccountFresh(approvedRun(), "account-2"), /账号已切换/);
    assert.throws(() => remixApprovalHeaders(approvedRun(), "image-1", "image-model", "最终提示词", Date.parse("2026-11-24T00:10:00.000Z"), "account-2"), /账号已切换/);
});

test("最终提示词或模型变化后必须重新审阅", () => {
    assert.throws(() => remixApprovalHeaders(approvedRun(), "image-1", "other-model", "最终提示词", Date.parse("2026-11-24T00:10:00.000Z")), /模型或最终提示词/);
    assert.throws(() => remixApprovalHeaders(approvedRun(), "image-1", "image-model", "另一段提示词", Date.parse("2026-11-24T00:10:00.000Z")), /模型或最终提示词/);
});

test("审批过期后不能继续创建任务", () => {
    assert.throws(() => remixApprovalHeaders(approvedRun(), "image-1", "image-model", "最终提示词", Date.parse("2026-11-24T00:30:00.000Z")), /审批已过期/);
});

test("策划变化或槽位已消费后不能继续创建任务", () => {
    const changed = approvedRun();
    changed.plan = { ...changed.plan!, copy: { ...changed.plan!.copy, title: "新标题" } };
    assert.throws(() => remixApprovalHeaders(changed, "image-1", "image-model", "最终提示词", Date.parse("2026-11-24T00:10:00.000Z")), /策划已变化/);
    const consumed = approval();
    consumed.slots[0].consumedByTask = "task-1";
    assert.throws(() => remixApprovalHeaders(approvedRun(consumed), "image-1", "image-model", "最终提示词", Date.parse("2026-11-24T00:10:00.000Z")), /审批槽位已使用/);
});
