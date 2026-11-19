import assert from "node:assert/strict";
import test from "node:test";

import { publicHttpUrl } from "./public-url";

test("publicHttpUrl 接受公网地址并拒绝本地媒体", () => {
    assert.equal(publicHttpUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
    assert.equal(publicHttpUrl("http://localhost:3000/a.png"), "");
    assert.equal(publicHttpUrl("http://127.0.0.1/a.png"), "");
    assert.equal(publicHttpUrl("blob:https://cdn.example.com/id"), "");
    assert.equal(publicHttpUrl("data:image/png;base64,AAAA"), "");
});

test("publicHttpUrl 无站点上下文时拒绝相对地址", () => {
    assert.equal(publicHttpUrl("/api/files/a.png"), "");
});
