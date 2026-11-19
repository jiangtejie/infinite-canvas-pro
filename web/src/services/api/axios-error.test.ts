import assert from "node:assert/strict";
import test from "node:test";

import { axiosErrorInfo } from "./axios-error";

test("解析 axios 服务端消息、状态与原始响应", () => {
    const info = axiosErrorInfo({ isAxiosError: true, message: "Request failed", response: { status: 400, data: { msg: "额度不足" } } });
    assert.deepEqual(info, { status: 400, payload: { msg: "额度不足" }, message: "额度不足", axiosMessage: "Request failed" });
    assert.equal(axiosErrorInfo(new Error("plain")), null);
});
