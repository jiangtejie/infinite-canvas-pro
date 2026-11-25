import assert from "node:assert/strict";
import test from "node:test";

import { useUserStore } from "@/stores/use-user-store";

import { approveCanvasRemix } from "./canvas-remix-approval";

test("复刻审批请求携带稳定请求 ID 并映射服务端信封", async () => {
    const originalFetch = globalThis.fetch;
    const originalToken = useUserStore.getState().token;
    let request: { url: string; init?: RequestInit } = { url: "" };
    globalThis.fetch = async (url, init) => {
        request = { url: String(url), init };
        return new Response(JSON.stringify({ code: 0, data: {
            id: "approval-1", requestId: "review-1", runId: "run-1", approvalKey: "plan-1", expiresAt: "2026-11-24T00:30:00.000Z",
            slots: [{ id: "slot-1", nodeId: "image-1", model: "image-model", prompt: "最终提示词" }],
        } }), { status: 200 });
    };
    useUserStore.setState({ token: "test-token", user: { id: "account-1" } as ReturnType<typeof useUserStore.getState>["user"] });
    try {
        const result = await approveCanvasRemix({
            requestId: "review-1", runId: "run-1", approvalKey: "plan-1", sourceSignature: "source-1", coreVersion: "remix-1",
            skills: [{ id: "skill-1", hash: "hash-1" }], slots: [{ nodeId: "image-1", model: "image-model", prompt: "最终提示词" }],
        });
        assert.equal(request.url, "/api/v1/canvas/remix/approvals");
        assert.equal(new Headers(request.init?.headers).get("Authorization"), "Bearer test-token");
        const body = JSON.parse(String(request.init?.body));
        assert.equal(body.approvalRequestId, "review-1");
        assert.deepEqual(body.skills, [{ id: "skill-1", hash: "hash-1" }]);
        assert.equal(result.id, "approval-1");
        assert.equal(result.requestId, "review-1");
        assert.equal(result.ownerId, "account-1");
        assert.equal(result.slots[0].prompt, "最终提示词");
    } finally {
        globalThis.fetch = originalFetch;
        useUserStore.setState({ token: originalToken });
    }
});
