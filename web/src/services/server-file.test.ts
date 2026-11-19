import assert from "node:assert/strict";
import test from "node:test";

import { deleteServerObject, postServerFile } from "./server-file";

function mockFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
    const original = globalThis.fetch;
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        return handler(url, init);
    }) as typeof fetch;
    return { calls, restore: () => { globalThis.fetch = original; } };
}

test("postServerFile 发送文件与存储 provider", async () => {
    const mocked = mockFetch(() => new Response(JSON.stringify({ code: 0, data: { url: "https://cdn/a.png", storageKey: "server:a.png", bytes: 1, mimeType: "image/png" } }), { status: 200 }));
    try {
        const uploaded = await postServerFile<{ url: string; storageKey: string }>(new Blob(["x"]), "a.png", { type: "s3", bucket: "b" }, "token-1", "上传失败");
        assert.equal(uploaded.storageKey, "server:a.png");
        assert.equal(mocked.calls.length, 1);
        assert.equal(mocked.calls[0].url, "/api/v1/files");
        const form = mocked.calls[0].init?.body as FormData;
        assert.equal(form.get("provider"), JSON.stringify({ type: "s3", bucket: "b" }));
        assert.equal((mocked.calls[0].init?.headers as Record<string, string>).Authorization, "Bearer token-1");
    } finally {
        mocked.restore();
    }
});

test("postServerFile 失败时优先使用服务端消息", async () => {
    const mocked = mockFetch(() => new Response(JSON.stringify({ code: 1, msg: "存储空间已满" }), { status: 200 }));
    try {
        await assert.rejects(() => postServerFile(new Blob(["x"]), "a.png", null, "token-1", "上传失败"), /存储空间已满/);
    } finally {
        mocked.restore();
    }
});

test("deleteServerObject 发送 provider 并接受成功响应", async () => {
    const mocked = mockFetch(() => new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    try {
        await deleteServerObject("webdav:a.png", { type: "webdav" }, "token-1", "删除失败");
        assert.equal(mocked.calls[0].init?.method, "DELETE");
        assert.deepEqual(JSON.parse(String(mocked.calls[0].init?.body)), { provider: { type: "webdav" } });
    } finally {
        mocked.restore();
    }
});

test("deleteServerObject 失败时抛出服务端消息", async () => {
    const mocked = mockFetch(() => new Response(JSON.stringify({ code: 1, msg: "没有权限" }), { status: 200 }));
    try {
        await assert.rejects(() => deleteServerObject("a.png", null, "token-1", "删除失败"), /没有权限/);
    } finally {
        mocked.restore();
    }
});
