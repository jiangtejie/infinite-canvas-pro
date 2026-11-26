import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { createFilmAsset } from "./film-asset-factory";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmSceneNodeData, type FilmShotNodeData } from "../../types";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-21T00:00:00.000Z" });
const withConcept = (asset: FilmAsset, id: string) => ({ ...asset, concept: appendSlotImage(asset.concept, image(id)) });
const assetNode = (id: string, asset: FilmAsset, role: "character" | "location" | "prop" | "style"): CanvasNodeData => {
    const type = {
        character: CanvasNodeType.FilmCharacter,
        location: CanvasNodeType.FilmLocation,
        prop: CanvasNodeType.FilmProp,
        style: CanvasNodeType.FilmStyle,
    }[role];
    const metadata = role === "character" ? { filmCharacter: { asset } }
        : role === "location" ? { filmLocation: { asset } }
            : role === "prop" ? { filmProp: { asset } }
                : { filmStyle: { asset } };
    return { id, type, title: asset.name, position: { x: 0, y: 0 }, width: 200, height: 200, metadata };
};
const shotNode = (id: string, payload: Partial<FilmShotNodeData> & { description: string; prompt: string; imageUrl?: string }): CanvasNodeData => ({
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
            dialogue: "",
            audio: "",
            ...payload,
        },
    },
});
const sceneNode = (id: string, patch: Partial<FilmSceneNodeData> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmScene,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "天台对峙", location: "旧城区天台", time: "深夜", mood: "暴雨压迫", notes: "霓虹灯牌忽明忽暗", ...patch } },
});

const character = {
    ...createFilmAsset("character", 1),
    name: "沈迟",
    description: "落魄调查记者",
    visualPrompt: "深色风衣，短发",
};
character.character = { ...character.character!, board: appendSlotImage(character.character!.board, image("char-board")) };
const location = { ...withConcept(createFilmAsset("location", 1), "loc-concept"), name: "雨夜天台", description: "暴雨霓虹" };
const prop = { ...withConcept(createFilmAsset("prop", 1), "prop-concept"), name: "录音笔" };
const style = { ...withConcept(createFilmAsset("style", 1), "style-concept"), name: "冷峻电影感", visualPrompt: "冷调、低饱和、霓虹边缘光" };

const nodes: CanvasNodeData[] = [
    assetNode("char", character, "character"),
    assetNode("loc", location, "location"),
    assetNode("prop", prop, "prop"),
    assetNode("style", style, "style"),
    shotNode("shot-prev", { description: "主角站在天台边缘", prompt: "雨夜天台远景", imageUrl: "https://example.com/prev.png" }),
    shotNode("shot", { description: "主角回头", prompt: "雨夜天台，主角半侧身回头" }),
];
const connections: CanvasConnection[] = [
    { id: "seq", fromNodeId: "shot-prev", toNodeId: "shot", kind: "sequence" },
    { id: "bc", fromNodeId: "char", toNodeId: "shot", kind: "context", data: { role: "character", source: "manual", continuity: { emotion: "压抑" } } },
    { id: "bl", fromNodeId: "loc", toNodeId: "shot", kind: "context", data: { role: "location", source: "manual" } },
    { id: "bp", fromNodeId: "prop", toNodeId: "shot", kind: "context", data: { role: "prop", source: "manual" } },
];

test("compiles a shot from graph nodes and edges", () => {
    const context = buildFilmShotGenerationFromGraph(nodes, connections, "shot", { medium: "image", maxReferences: 10 });
    assert.ok(context);
    assert.equal(context!.characters[0]?.characterId, character.id);
    assert.ok(context!.references.some((ref) => ref.role === "character-package"));
    assert.ok(context!.references.some((ref) => ref.role === "location"));
    assert.ok(context!.references.some((ref) => ref.role === "prop"));
    assert.ok(context!.references.some((ref) => ref.role === "previous-shot"));
    assert.ok(context!.prompt.includes("落魄调查记者"));
    assert.ok(context!.prompt.includes("雨夜天台"));
    assert.ok(context!.prompt.includes("冷调、低饱和"));
});

test("applies project style preset and director style when the style bible text is empty", () => {
    const emptyStyle = assetNode("style-empty", { ...createFilmAsset("style", 1), name: "风格圣经 1", visualPrompt: "" }, "style");
    const styledShot = shotNode("styled-shot", { description: "主角回头", prompt: "" });
    const context = buildFilmShotGenerationFromGraph([emptyStyle, styledShot], [], styledShot.id, {
        medium: "image",
        maxReferences: 6,
        stylePresetId: "cinematic",
        directorStyleId: "cinematic-classic",
    });
    assert.ok(context);
    assert.match(context.prompt, /电影感画面/);
    assert.match(context.prompt, /自然低饱和/);
    assert.doesNotMatch(context.prompt, /\[object Object\]/);
});

test("warns when neither a style preset nor style bible text is available", () => {
    const emptyStyle = assetNode("style-empty", { ...createFilmAsset("style", 1), name: "风格圣经 1", visualPrompt: "" }, "style");
    const styledShot = shotNode("styled-shot", { description: "主角回头", prompt: "" });
    const context = buildFilmShotGenerationFromGraph([emptyStyle, styledShot], [], styledShot.id, {
        medium: "image",
        maxReferences: 6,
        stylePresetId: "custom",
    });
    assert.ok(context?.warnings.some((warning) => warning.includes("风格")));
});

test("uses the single project style bible for every shot, independently of board relationship edges", () => {
    const withoutEdge = buildFilmShotGenerationFromGraph(nodes, connections, "shot", { medium: "image", maxReferences: 10 });
    const withStyleEdge: CanvasConnection[] = [...connections, {
        id: "style-context",
        fromNodeId: "style",
        toNodeId: "shot",
        kind: "context",
        data: { role: "style", source: "manual" },
    }];
    const withEdge = buildFilmShotGenerationFromGraph(nodes, withStyleEdge, "shot", { medium: "image", maxReferences: 10 });
    assert.ok(withoutEdge?.prompt.includes("冷调、低饱和"));
    assert.ok(withoutEdge?.references.some((ref) => ref.role === "style"));
    assert.equal(withEdge?.prompt, withoutEdge?.prompt);
    assert.deepEqual(withEdge?.references, withoutEdge?.references);
});

test("uses the assigned scene context in image and video generation prompts and signatures", () => {
    const scene = sceneNode("scene", { episodeTitle: "第 3 集", name: "天台对峙", location: "旧城区高楼", time: "深夜", mood: "暴雨压迫", notes: "霓虹灯牌忽明忽暗" });
    const shot = shotNode("scene-shot", { description: "主角回头", prompt: "主角在雨夜回头" });
    const graphNodes = [scene, sceneNode("unrelated-scene", { name: "无关仓库" }), shot];
    const graphConnections: CanvasConnection[] = [{ id: "composition", fromNodeId: "scene", toNodeId: shot.id, kind: "composition" }];
    const imageContext = buildFilmShotGenerationFromGraph(graphNodes, graphConnections, shot.id, { medium: "image", maxReferences: 10 });
    const videoContext = buildFilmShotGenerationFromGraph(graphNodes, graphConnections, shot.id, { medium: "video", maxReferences: 10, videoMode: "reference" });
    assert.ok(imageContext?.prompt.includes("场次：第 3 集 · 天台对峙"));
    assert.ok(imageContext?.prompt.includes("地点：旧城区高楼"));
    assert.ok(imageContext?.prompt.includes("时间：深夜"));
    assert.ok(imageContext?.prompt.includes("氛围：暴雨压迫"));
    assert.ok(imageContext?.prompt.includes("场次备注：霓虹灯牌忽明忽暗"));
    assert.ok(!imageContext?.prompt.includes("无关仓库"));
    assert.ok(videoContext?.prompt.includes("场次：第 3 集 · 天台对峙"));

    const changedScene = sceneNode("scene", { episodeTitle: "第 3 集", name: "天台对峙", location: "旧城区高楼", time: "深夜", mood: "雨过天晴", notes: "霓虹灯牌忽明忽暗" });
    const changedSceneNodes = [changedScene, ...graphNodes.filter((node) => node.id !== scene.id)];
    const changedContext = buildFilmShotGenerationFromGraph(changedSceneNodes, graphConnections, shot.id, { medium: "image", maxReferences: 10 });
    assert.notEqual(changedContext?.inputSignature, imageContext?.inputSignature);
});

test("derives the previous shot from the global chain across scenes", () => {
    const previous = shotNode("cross-prev", { description: "前场最后一镜", prompt: "前场最后一镜", imageUrl: "https://example.com/cross-prev.png" });
    const target = shotNode("cross-target", { description: "新场第一镜", prompt: "新场第一镜" });
    const graphNodes = [
        sceneNode("scene-a", { name: "前场" }),
        sceneNode("scene-b", { name: "后场" }),
        previous,
        target,
    ];
    const graphConnections: CanvasConnection[] = [
        { id: "scene-a-comp", fromNodeId: "scene-a", toNodeId: previous.id, kind: "composition" },
        { id: "scene-b-comp", fromNodeId: "scene-b", toNodeId: target.id, kind: "composition" },
        { id: "cross-seq", fromNodeId: previous.id, toNodeId: target.id, kind: "sequence" },
    ];
    const context = buildFilmShotGenerationFromGraph(graphNodes, graphConnections, target.id, { medium: "image", maxReferences: 10 });
    assert.equal(context?.previousShotId, previous.id);
    assert.equal(context?.references.find((ref) => ref.role === "previous-shot")?.id, `previous-${previous.id}`);
});

test("chooses the deterministic chain predecessor when a malformed graph branches", () => {
    const withY = (node: CanvasNodeData, y: number) => ({ ...node, position: { x: 0, y } });
    const prevA = withY(shotNode("prev-a", { description: "分叉 A", prompt: "分叉 A", imageUrl: "https://example.com/a.png" }), 200);
    const prevB = withY(shotNode("prev-b", { description: "分叉 B", prompt: "分叉 B", imageUrl: "https://example.com/b.png" }), 100);
    const target = withY(shotNode("branch-target", { description: "目标", prompt: "目标" }), 300);
    const graphConnections: CanvasConnection[] = [
        { id: "a->target", fromNodeId: prevA.id, toNodeId: target.id, kind: "sequence" },
        { id: "b->target", fromNodeId: prevB.id, toNodeId: target.id, kind: "sequence" },
    ];
    const context = buildFilmShotGenerationFromGraph([prevA, prevB, target], graphConnections, target.id, { medium: "image", maxReferences: 10 });
    assert.equal(context?.previousShotId, prevB.id);
    assert.equal(context?.references.find((ref) => ref.role === "previous-shot")?.id, `previous-${prevB.id}`);
});

test("can skip the previous shot", () => {
    const context = buildFilmShotGenerationFromGraph(nodes, connections, "shot", { medium: "image", maxReferences: 10, includePreviousShot: false });
    assert.ok(context);
    assert.equal(context!.references.some((ref) => ref.role === "previous-shot"), false);
});

test("compiles only the first and last frames in frames mode", () => {
    const frameNodes = [...nodes, shotNode("shot-frames", {
        description: "起止画面",
        prompt: "起止画面",
        videoMode: "frames",
        firstFrame: { kind: "upload", url: "https://example.com/first.png" },
        lastFrame: { kind: "upload", url: "https://example.com/last.png" },
    })];
    const context = buildFilmShotGenerationFromGraph(frameNodes, [], "shot-frames", {
        medium: "video",
        maxReferences: 10,
        videoMode: "frames",
        includeStoryboard: false,
        includePreviousShot: false,
    });
    assert.ok(context);
    assert.deepEqual(context!.references.map((ref) => ref.role), ["first-frame", "last-frame"]);
});

test("composes beat title, total prompt and non-empty frames into the linked shot", () => {
    const beatNode = (frames: string[]): CanvasNodeData => ({
        id: "beat",
        type: CanvasNodeType.FilmBeat,
        title: "动作节拍",
        position: { x: 0, y: 0 },
        width: 480,
        height: 420,
        metadata: { filmBeat: { title: "猛地回头", mode: "grid9", prompt: "从静止到回头", frames, status: "idle", progress: 0 } },
    });
    const beatEdge: CanvasConnection = { id: "beat->shot", fromNodeId: "beat", toNodeId: "shot", kind: "context", data: { role: "beat", source: "manual" } };
    const before = buildFilmShotGenerationFromGraph([...nodes, beatNode(["停顿", "", "转头"])], [...connections, beatEdge], "shot", { medium: "image", maxReferences: 10 });
    assert.ok(before?.prompt.includes("动作节拍「猛地回头」"));
    assert.ok(before?.prompt.includes("动作过程：从静止到回头"));
    assert.ok(before?.prompt.includes("节拍 1：停顿"));
    assert.ok(before?.prompt.includes("节拍 3：转头"));
    assert.ok(!before?.prompt.includes("节拍 2："));

    const changed = buildFilmShotGenerationFromGraph([...nodes, beatNode(["屏住呼吸", "", "转头"])], [...connections, beatEdge], "shot", { medium: "image", maxReferences: 10 });
    assert.ok(changed?.prompt.includes("节拍 1：屏住呼吸"));
    assert.notEqual(changed?.inputSignature, before?.inputSignature);
});
