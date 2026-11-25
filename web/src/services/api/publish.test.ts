import assert from "node:assert/strict";
import test from "node:test";

import { useUserStore } from "@/stores/use-user-store";

import { fetchPublishChannels } from "./publish";

test("未登录获取发布渠道返回 Promise 拒绝，而不是同步抛错", async () => {
    const originalToken = useUserStore.getState().token;
    useUserStore.setState({ token: "", user: null });
    try {
        await assert.rejects(fetchPublishChannels(), /请先登录后再发布/);
    } finally {
        useUserStore.setState({ token: originalToken });
    }
});
