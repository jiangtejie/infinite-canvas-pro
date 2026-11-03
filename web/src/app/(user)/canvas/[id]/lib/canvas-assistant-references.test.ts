import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasAssistantSession, type CanvasNodeData } from "../../types";
import { syncAssistantReferences } from "./canvas-assistant-references";

const node = (patch: Partial<CanvasNodeData>): CanvasNodeData => ({ id: "n1", type: CanvasNodeType.Text, title: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: {}, ...patch });

const session = (messages: unknown[]): CanvasAssistantSession[] => [{ id: "s1", messages }] as unknown as CanvasAssistantSession[];

test("interrupted assistant messages become waiting with a recovery hint", () => {
    const next = syncAssistantReferences(session([{ id: "m1", role: "assistant", status: "thinking", text: "", activity: { type: "thinking" }, references: [] }]), [], true);
    const message = next[0].messages[0];
    assert.equal(message.status, "waiting");
    assert.match(message.text || "", /上次 Agent 执行/);
    assert.equal(message.activity, undefined);
});

test("assistant references hydrate content from the current node", () => {
    const textNode = node({ type: CanvasNodeType.Text, metadata: { content: "画布里的文本" } });
    const next = syncAssistantReferences(session([{ id: "m1", role: "assistant", status: "done", text: "ok", references: [{ id: "n1" }] }]), [textNode]);
    assert.equal(next[0].messages[0].references?.[0].text, "画布里的文本");
});

test("previous node guard only refreshes references that still match", () => {
    const imageNode = node({ type: CanvasNodeType.Image, metadata: { content: "data:image/png;base64,abc", storageKey: "key-1", mimeType: "image/png" } });
    const previous = { ...imageNode, metadata: { ...imageNode.metadata } };
    const matching = syncAssistantReferences(session([{ id: "m1", role: "assistant", status: "done", text: "ok", references: [{ id: "n1", dataUrl: "data:image/png;base64,abc", storageKey: "key-1" }] }]), [imageNode], false, previous);
    assert.equal(matching[0].messages[0].references?.[0].mimeType, "image/png");
    const stale = syncAssistantReferences(session([{ id: "m1", role: "assistant", status: "done", text: "ok", references: [{ id: "n1", dataUrl: "old", storageKey: "old" }] }]), [imageNode], false, previous);
    assert.equal(stale[0].messages[0].references?.[0].mimeType, undefined);
});

test("normal messages are returned unchanged", () => {
    const next = syncAssistantReferences(session([{ id: "m1", role: "assistant", status: "done", text: "正常消息", references: [] }]), [], false);
    assert.equal(next[0].messages[0].text, "正常消息");
    assert.equal(next[0].messages[0].status, "done");
});
