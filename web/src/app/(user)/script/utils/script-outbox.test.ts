import assert from "node:assert/strict";
import test from "node:test";

import { fixtureDocument } from "@/test/script-fixtures";
import { installScriptMemoryDriver } from "@/test/script-memory-driver";
import { createSyncBaseline, type ScriptOutbox } from "./script-merge";

const clearStorage = await installScriptMemoryDriver();
const { clearScriptOutbox, readScriptOutbox, scriptOutboxKey, writeScriptOutbox } = await import("./script-outbox");

test("outbox 往返保存最新文档、基线、冲突和选择", async () => {
    await clearStorage();
    const document = fixtureDocument("p1");
    const outbox: ScriptOutbox = {
        document,
        base: createSyncBaseline(document, 3),
        conflicts: [{ scope: "header", local: null, remote: null }],
        resolutions: [{ scope: "header", choice: "local" }],
    };

    await writeScriptOutbox("account-1", "p1", outbox);
    assert.deepEqual(await readScriptOutbox("account-1", "p1"), outbox);
    assert.equal(await readScriptOutbox("account-2", "p1"), null);
    assert.equal(scriptOutboxKey("account-1", "p1"), "infinite-canvas:script:v2:outbox:account-1:p1");

    const latest = { ...outbox, document: { ...document, title: "最新本地稿" } };
    await writeScriptOutbox("account-1", "p1", latest);
    assert.deepEqual(await readScriptOutbox("account-1", "p1"), latest);

    await clearScriptOutbox("account-1", "p1");
    assert.equal(await readScriptOutbox("account-1", "p1"), null);
});
