import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmBeatNodeData, type FilmSceneNodeData, type FilmShotNodeData } from "../../types";
import { createFilmBeatNode, filmBeatFrameCount, filmBeatHasContent, filmBeatIsBusy, filmBeatPrompt, parseFilmBeatFrames, selectFilmBeatContexts, selectFilmBeatPreviewShotId, updateFilmBeatFrame, updateFilmBeatPreview, updateFilmBeatPrompt, updateFilmBeatTitle } from "./film-beat";
import { resetInterruptedGeneration } from "./canvas-task-updates";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";

const beatPayload = (patch: Partial<FilmBeatNodeData> = {}): FilmBeatNodeData => ({
    title: "动作节拍",
    mode: "grid9",
    prompt: "",
    frames: Array.from({ length: 9 }, () => ""),
    status: "idle",
    progress: 0,
    ...patch,
});

const beatNode = (id: string, patch: Partial<FilmBeatNodeData> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmBeat,
    title: "动作节拍",
    position: { x: 0, y: 0 },
    width: 480,
    height: 420,
    metadata: { filmBeat: beatPayload(patch) },
});

const asset = (id: string, name: string): FilmAsset => ({ id, name } as FilmAsset);

const contextNode = (id: string, kind: "character" | "location" | "prop" | "style", name: string): CanvasNodeData => {
    const metadata = kind === "character" ? { filmCharacter: { asset: asset(id, name) } }
        : kind === "location" ? { filmLocation: { asset: asset(id, name) } }
            : kind === "prop" ? { filmProp: { asset: asset(id, name) } }
                : { filmStyle: { asset: asset(id, name) } };
    const type = {
        character: CanvasNodeType.FilmCharacter,
        location: CanvasNodeType.FilmLocation,
        prop: CanvasNodeType.FilmProp,
        style: CanvasNodeType.FilmStyle,
    }[kind];
    return { id, type, title: name, position: { x: 0, y: 0 }, width: 200, height: 200, metadata };
};

const sceneNode = (id: string, patch: Partial<FilmSceneNodeData> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmScene,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "天台对峙", location: "旧城区天台", time: "深夜", mood: "暴雨", ...patch } },
});

const shotNode = (id: string, patch: Partial<FilmShotNodeData> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmShot,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        filmShot: {
            shotNo: id,
            shotType: "中景",
            cameraMovement: "推近",
            duration: 4,
            description: `${id} 画面`,
            dialogue: "",
            audio: "",
            prompt: `${id} 补充`,
            ...patch,
        },
    },
});

test("creates a grid9 beat node with nine editable frames by default", () => {
    const node = createFilmBeatNode({ x: 100, y: 50 }, undefined, "beat-1");

    assert.equal(node.id, "beat-1");
    assert.equal(node.type, CanvasNodeType.FilmBeat);
    assert.equal(node.metadata?.filmBeat?.mode, "grid9");
    assert.equal(node.metadata?.filmBeat?.frames.length, 9);
    assert.deepEqual(node.metadata?.filmBeat?.frames, Array.from({ length: 9 }, () => ""));
    assert.equal(node.metadata?.filmBeat?.status, "idle");
    assert.equal(node.metadata?.filmBeat?.progress, 0);
    assert.equal(node.position.x, 100 - node.width / 2);
    assert.equal(node.position.y, 50 - node.height / 2);
    assert.equal(filmBeatFrameCount("grid9"), 9);
    assert.equal(filmBeatFrameCount("grid4"), 4);
});

test("preview success writes the image and syncs node metadata status", () => {
    const node = beatNode("beat", { status: "loading", progress: 40, errorMessage: "旧错误" });
    const loading = { ...node, metadata: { ...node.metadata, status: "loading" as const, progress: 40, errorDetails: "旧错误" } };
    const next = updateFilmBeatPreview(loading, { id: "image-1", url: "https://example.com/beat.png" });

    assert.notEqual(next, loading);
    assert.equal(next.metadata?.status, "success");
    assert.equal(next.metadata?.progress, 100);
    assert.equal(next.metadata?.errorDetails, undefined);
    assert.equal(next.metadata?.filmBeat?.status, "success");
    assert.equal(next.metadata?.filmBeat?.progress, 100);
    assert.equal(next.metadata?.filmBeat?.errorMessage, undefined);
    assert.equal(next.metadata?.filmBeat?.preview?.images[0]?.url, "https://example.com/beat.png");
});

test("busy state follows node metadata instead of a stale filmBeat status", () => {
    const node = beatNode("beat", { status: "loading" });
    const loading = { ...node, metadata: { ...node.metadata, status: "loading" as const } };
    const stopping = { ...node, metadata: { ...node.metadata, status: "stopping" as const } };
    const reset = { ...node, metadata: { ...node.metadata, status: "error" as const } };

    assert.equal(filmBeatIsBusy(loading), true);
    assert.equal(filmBeatIsBusy(stopping), true);
    assert.equal(filmBeatIsBusy(reset), false);
    assert.equal(filmBeatIsBusy(node), false);
    assert.equal(filmBeatIsBusy(undefined), false);
});

test("reset interrupted generation keeps a stale filmBeat loading node retryable", () => {
    const node = beatNode("beat", { status: "loading", progress: 40 });
    const loading = { ...node, metadata: { ...node.metadata, status: "loading" as const, progress: 40 } };
    const [reset] = resetInterruptedGeneration([loading]);

    assert.equal(reset.metadata?.status, "error");
    assert.equal(reset.metadata?.filmBeat?.status, "loading");
    assert.equal(filmBeatIsBusy(reset), false);
});

test("keeps node title and beat title mirrored", () => {
    const node = beatNode("beat");
    const renamed = updateFilmBeatTitle(node, "猛地回头");

    assert.equal(renamed.title, "猛地回头");
    assert.equal(renamed.metadata?.filmBeat?.title, "猛地回头");
    assert.equal(node.title, "动作节拍");
    assert.equal(node.metadata?.filmBeat?.title, "动作节拍");
    assert.equal(updateFilmBeatTitle(renamed, "猛地回头"), renamed);
});

test("selects the first linked shot in sequence order for preview references", () => {
    const beat = beatNode("beat-1");
    const shot1 = shotNode("shot-1");
    const shot2 = shotNode("shot-2");
    const connections: CanvasConnection[] = [
        { id: "seq", fromNodeId: "shot-1", toNodeId: "shot-2", kind: "sequence" },
        { id: "beat->shot-2", fromNodeId: "beat-1", toNodeId: "shot-2", kind: "context", data: { role: "beat", source: "manual" } },
        { id: "beat->shot-1", fromNodeId: "beat-1", toNodeId: "shot-1", kind: "context", data: { role: "beat", source: "manual" } },
    ];

    assert.equal(selectFilmBeatPreviewShotId([beat, shot1, shot2], connections, "beat-1"), "shot-1");
    assert.equal(selectFilmBeatPreviewShotId([beat], [], "beat-1"), undefined);
});

test("updates one frame immutably and keeps the fixed nine-frame grid", () => {
    const frames = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const node = beatNode("beat", { frames });
    const next = updateFilmBeatFrame(node, 4, "转身");

    assert.notEqual(next, node);
    assert.equal(next.metadata?.filmBeat?.frames.length, 9);
    assert.equal(next.metadata?.filmBeat?.frames[4], "转身");
    assert.equal(node.metadata?.filmBeat?.frames[4], "五");
    assert.equal(next.metadata?.filmBeat?.frames[0], "一");

    assert.equal(updateFilmBeatFrame(node, 9, "越界"), node);
    assert.equal(updateFilmBeatFrame(node, -1, "越界"), node);
    assert.equal(updateFilmBeatFrame(node, 4, "五"), node);
});

test("pads a shorter frame list back to the grid9 size when editing", () => {
    const node = beatNode("beat", { frames: ["抬头", "停住"] });
    const next = updateFilmBeatFrame(node, 8, "收势");

    assert.equal(next.metadata?.filmBeat?.frames.length, 9);
    assert.deepEqual(next.metadata?.filmBeat?.frames.slice(0, 2), ["抬头", "停住"]);
    assert.equal(next.metadata?.filmBeat?.frames[8], "收势");
});

test("updates the total prompt without mutating the source node", () => {
    const node = beatNode("beat");
    const next = updateFilmBeatPrompt(node, "从静止到猛地回头");

    assert.equal(next.metadata?.filmBeat?.prompt, "从静止到猛地回头");
    assert.equal(node.metadata?.filmBeat?.prompt, "");
    assert.equal(updateFilmBeatPrompt(next, "从静止到猛地回头"), next);
});

test("composes title, total prompt and non-empty frames in frame order", () => {
    const beat = beatPayload({
        title: "猛地回头",
        prompt: "从静止到回头",
        frames: ["停顿", "", "肩动", "转头", "", "", "", "", ""],
    });
    assert.equal(filmBeatPrompt(beat), [
        "动作节拍「猛地回头」",
        "动作过程：从静止到回头",
        "节拍 1：停顿",
        "节拍 3：肩动",
        "节拍 4：转头",
    ].join("\n"));
    assert.equal(filmBeatPrompt(beatPayload({ frames: ["停住"] })), "节拍 1：停住");
    assert.equal(filmBeatPrompt(beatPayload()), "");
    assert.equal(filmBeatPrompt(undefined), "");
    assert.equal(filmBeatHasContent(beatPayload()), false);
    assert.equal(filmBeatHasContent(beatPayload({ title: "猛地回头" })), true);
    assert.equal(filmBeatHasContent(beatPayload({ frames: ["停住"] })), true);
});

test("projects linked shots and their non-beat contexts for one beat", () => {
    const beat = beatNode("beat-1", { title: "回头", frames: ["停顿", "回头"] });
    const otherBeat = beatNode("beat-2", { title: "另一节拍" });
    const shot1 = shotNode("shot-1", { description: "主角回头" });
    const shot2 = shotNode("shot-2", { description: "", prompt: "主角握紧录音笔" });
    const scene = sceneNode("scene-1");
    const character = contextNode("char", "character", "沈迟");
    const location = contextNode("loc", "location", "雨夜天台");
    const style = contextNode("style", "style", "冷峻电影感");
    const prop = contextNode("prop", "prop", "录音笔");
    const connections: CanvasConnection[] = [
        { id: "comp-1", fromNodeId: "scene-1", toNodeId: "shot-1", kind: "composition" },
        { id: "seq", fromNodeId: "shot-1", toNodeId: "shot-2", kind: "sequence" },
        { id: "beat-1->shot-1", fromNodeId: "beat-1", toNodeId: "shot-1", kind: "context", data: { role: "beat", source: "manual" } },
        { id: "beat-1->shot-2", fromNodeId: "beat-1", toNodeId: "shot-2", kind: "context", data: { role: "beat", source: "manual" } },
        { id: "char->shot-1", fromNodeId: "char", toNodeId: "shot-1", kind: "context", data: { role: "character", source: "manual" } },
        { id: "loc->shot-1", fromNodeId: "loc", toNodeId: "shot-1", kind: "context", data: { role: "location", source: "manual" } },
        { id: "style->shot-1", fromNodeId: "style", toNodeId: "shot-1", kind: "context", data: { role: "style", source: "manual" } },
        { id: "char->shot-1-dup", fromNodeId: "char", toNodeId: "shot-1", kind: "context", data: { role: "character", source: "ai" } },
        { id: "prop->shot-2", fromNodeId: "prop", toNodeId: "shot-2", kind: "context", data: { role: "prop", source: "manual" } },
        { id: "beat-2->shot-1", fromNodeId: "beat-2", toNodeId: "shot-1", kind: "context", data: { role: "beat", source: "manual" } },
    ];

    const summary = selectFilmBeatContexts([scene, shot1, shot2, beat, otherBeat, character, location, style, prop], connections, "beat-1");

    assert.deepEqual(summary.shots.map((shot) => shot.shotId), ["shot-1", "shot-2"]);
    assert.deepEqual(summary.shots.map((shot) => shot.shotNo), ["shot-1", "shot-2"]);
    assert.equal(summary.shots[0].description, "主角回头");
    assert.equal(summary.shots[0].sceneLabel, "第 1 集 · 天台对峙");
    assert.equal(summary.shots[1].description, "主角握紧录音笔");
    assert.equal(summary.shots[1].sceneLabel, "未分场");
    assert.deepEqual(summary.contexts.map((context) => `${context.role}:${context.name}`), [
        "character:沈迟",
        "location:雨夜天台",
        "style:冷峻电影感",
        "prop:录音笔",
    ]);
});

test("beat frame edits invalidate the linked shot generation signature", () => {
    const beat = beatNode("beat-1", { title: "回头", prompt: "从静止到回头", frames: ["静止", "转头"] });
    const nodes = [sceneNode("scene-1"), shotNode("shot-1"), beat];
    const connections: CanvasConnection[] = [
        { id: "comp", fromNodeId: "scene-1", toNodeId: "shot-1", kind: "composition" },
        { id: "beat", fromNodeId: "beat-1", toNodeId: "shot-1", kind: "context", data: { role: "beat", source: "manual" } },
    ];

    const before = buildFilmShotGenerationFromGraph(nodes, connections, "shot-1", { medium: "image", maxReferences: 6 });
    assert.ok(before?.prompt.includes("动作节拍「回头」"));
    assert.ok(before?.prompt.includes("节拍 1：静止"));
    const edited = updateFilmBeatFrame(beat, 0, "屏住呼吸");
    const after = buildFilmShotGenerationFromGraph(nodes.map((node) => node.id === "beat-1" ? edited : node), connections, "shot-1", { medium: "image", maxReferences: 6 });

    assert.ok(after?.prompt.includes("节拍 1：屏住呼吸"));
    assert.ok(after?.prompt.includes("节拍 2：转头"));
    assert.ok(!after?.prompt.includes("节拍 1：静止"));
    assert.notEqual(after?.inputSignature, before?.inputSignature);
});

test("parses AI frame payloads into a fixed grid and rejects unusable output", () => {
    assert.deepEqual(parseFilmBeatFrames("```json\n[\"抬头\", \"转身\"]\n```"), ["抬头", "转身", "", "", "", "", "", "", ""]);
    assert.deepEqual(parseFilmBeatFrames('{"frames":["抬头","转身"]}', 4), ["抬头", "转身", "", ""]);
    assert.deepEqual(parseFilmBeatFrames('{"说明":"先抬头"}'), []);
    assert.deepEqual(parseFilmBeatFrames("不是 JSON"), []);
    assert.deepEqual(parseFilmBeatFrames("[]"), []);
});
