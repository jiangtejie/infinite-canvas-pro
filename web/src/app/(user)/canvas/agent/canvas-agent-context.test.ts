import assert from "node:assert/strict";
import test from "node:test";

import type { AiConfig } from "@/stores/use-config-store";

import { CanvasNodeType, type CanvasAgentState, type CanvasConnection, type CanvasNodeData } from "../types";
import { buildCanvasAgentContext } from "./canvas-agent-context";

const config = () => ({ textModel: "gpt-5", imageModel: "gpt-image-2", videoModel: "seedance-1-0", audioModel: "generic-tts", quality: "high", size: "1024x1024", vquality: "720p", videoSize: "16:9", videoSeconds: "5", videoGenerateAudio: "false", count: "1", canvasImageCount: "1" } as unknown as AiConfig);
const state = (patch: Partial<CanvasAgentState> = {}): CanvasAgentState => ({ phase: "intake", approvedNodeIds: [], referenceNodeIds: [], pendingTaskIds: [], completedTaskIds: [], ...patch });
const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "n1",
    type: CanvasNodeType.Text,
    title: "镜头一",
    position: { x: 0, y: 0 },
    width: 340,
    height: 240,
    metadata: { content: "开场画面描述", status: "success" },
    ...patch,
});
const build = (nodes: CanvasNodeData[], connections: CanvasConnection[] = [], agentState = state(), selected: string[] = []) =>
    buildCanvasAgentContext({ projectId: "p1", projectTitle: "项目", nodes, connections, selectedNodeIds: selected, config: config(), autoGenerateMedia: false, agentState });
const findNode = (context: ReturnType<typeof build>, id: string) => context.nodes.find((item) => item.id === id)!;

test("only prioritized nodes expose text and prompt details", () => {
    const context = build([node({ id: "selected" }), node({ id: "other", title: "未选中" })], [], state(), ["selected"]);
    assert.equal(findNode(context, "selected").text, "开场画面描述");
    const other = findNode(context, "other");
    assert.equal(other.text, undefined);
    assert.equal(other.prompt, undefined);
    assert.equal(other.title, "未选中");
    assert.equal(other.type, CanvasNodeType.Text);
    assert.equal(other.status, "success");
});

test("approved nodes and abnormal tasks stay detailed", () => {
    const nodes = [node({ id: "approved" }), node({ id: "loading", metadata: { status: "loading", prompt: "生成中提示词" } })];
    const context = build(nodes, [], state({ approvedNodeIds: ["approved"] }));
    assert.equal(findNode(context, "approved").text, "开场画面描述");
    assert.equal(findNode(context, "loading").prompt, "生成中提示词");
});

test("media urls are only exposed for prioritized nodes", () => {
    const nodes = [
        node({ id: "shown", type: CanvasNodeType.Image, metadata: { content: "https://example.com/a.png", status: "success" } }),
        node({ id: "hidden", type: CanvasNodeType.Image, metadata: { content: "https://example.com/b.png", status: "success" } }),
    ];
    const context = build(nodes, [], state(), ["shown"]);
    assert.equal(findNode(context, "shown").mediaUrl, "https://example.com/a.png");
    assert.equal(findNode(context, "hidden").mediaUrl, undefined);
    assert.equal(findNode(context, "hidden").hasMedia, true);
});

test("connections are dropped when an endpoint exceeds the node window", () => {
    const nodes = Array.from({ length: 130 }, (_, index) => node({ id: "n" + index }));
    const connections: CanvasConnection[] = [
        { id: "e1", fromNodeId: "n0", toNodeId: "n1" },
        { id: "e2", fromNodeId: "n129", toNodeId: "n128" },
    ];
    const context = build(nodes, connections);
    assert.equal(context.nodes.length, 120);
    assert.deepEqual(context.connections.map((item) => item.id), ["e1"]);
});

const sourceWithMaterial = () => [
    node({
        id: "source-1",
        type: CanvasNodeType.Source,
        title: "素材源",
        metadata: { sourceTitle: "原标题", sourceText: "原正文", sourceTags: ["话题1"], sourceImages: [{ url: "https://example.com/a.png" }, { url: "https://example.com/b.png" }] },
    }),
    node({ id: "source-1-material-image-1", type: CanvasNodeType.Image, title: "素材图 2", metadata: { content: "https://example.com/b.png", status: "success" } }),
    node({ id: "source-1-material-image-0", type: CanvasNodeType.Image, title: "素材图 1", metadata: { content: "https://example.com/a.png", status: "success" } }),
];

test("focused source exposes its text, image count and the whole material group in order", () => {
    const context = build(sourceWithMaterial(), [], state(), ["source-1"]);
    const source = findNode(context, "source-1");
    assert.equal(source.text, "原标题\n\n原正文\n\n#话题1");
    assert.equal(source.sourceImageCount, 2);
    assert.equal(source.mediaUrl, undefined);
    assert.deepEqual(context.remixImages, [
        { nodeId: "source-1-material-image-0", title: "素材图 1", url: "https://example.com/a.png" },
        { nodeId: "source-1-material-image-1", title: "素材图 2", url: "https://example.com/b.png" },
    ]);
});

test("unfocused source keeps no group vision and no detail", () => {
    const context = build(sourceWithMaterial());
    assert.deepEqual(context.remixImages, []);
    const source = findNode(context, "source-1");
    assert.equal(source.text, undefined);
    assert.equal(source.sourceImageCount, undefined);
});

test("material images without content are not attached", () => {
    const nodes = sourceWithMaterial().map((item) => item.id === "source-1-material-image-1" ? { ...item, metadata: { status: "idle" as const } } : item);
    const context = build(nodes, [], state(), ["source-1"]);
    assert.deepEqual(context.remixImages.map((image) => image.nodeId), ["source-1-material-image-0"]);
});

test("context tasks recover video tasks that only carry a video id", () => {
    const video = node({ id: "v", type: CanvasNodeType.Video, metadata: { status: "loading", videoTaskVideoId: "vid-1" } });
    const context = build([video]);
    assert.deepEqual(context.tasks.map((task) => task.taskId), ["vid-1"]);
    assert.equal(findNode(context, "v").taskId, "vid-1");
});
