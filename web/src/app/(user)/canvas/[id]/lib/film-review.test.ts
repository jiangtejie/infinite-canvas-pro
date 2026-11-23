import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { createEmptyCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { createFilmAsset } from "./film-asset-factory";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { filmReviewFingerprint, filmReviewIsStale, selectFilmReview, selectFilmReviewInput } from "./film-review";
import { buildFilmConsistencyContext } from "@/app/(user)/film/utils/film-ai-consistency";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id, type, title: id, position: { x: 0, y: 0 }, width: 300, height: 200, metadata,
});
const character: FilmAsset = { ...createFilmAsset("character", 1), name: "阿青" };
const nodes: CanvasNodeData[] = [
    node("script", CanvasNodeType.FilmScript, { filmScript: { text: "雨夜天台", parseSnapshots: [] } }),
    node("char", CanvasNodeType.FilmCharacter, { filmCharacter: { asset: character } }),
    node("scene", CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "天台", location: "楼顶", time: "夜", mood: "压抑" } }),
    node("shot", CanvasNodeType.FilmShot, { filmShot: { shotNo: "01", shotType: "MS", cameraMovement: "固定", duration: 4, description: "阿青回头", dialogue: "", audio: "", prompt: "阿青回头" } }),
];
const connections: CanvasConnection[] = [
    { id: "scene->shot", fromNodeId: "scene", toNodeId: "shot", kind: "composition" },
    { id: "char->shot", fromNodeId: "char", toNodeId: "shot", kind: "context", data: { role: "character", source: "manual" } },
];

test("review input contains graph shots and contexts without episodes arrays", () => {
    const input = selectFilmReviewInput(nodes, connections, undefined, "测试项目");
    assert.equal(input.shots.length, 1);
    assert.equal(input.scenes.length, 1);
    assert.equal(input.shots[0].contexts[0].role, "character");
    assert.equal(input.shots[0].contexts[0].nodeId, "char");
    assert.equal(input.shots[0].contexts[0].source, "manual");
    assert.equal(input.shots[0].contexts[0].asset?.id, character.id);
    assert.equal("episodes" in input, false);
});

test("keeps branch and legacy continuity fields out of graph review and shot data", () => {
    const input = selectFilmReviewInput(nodes, connections);
    const shot = input.shots[0].shot;
    assert.equal("branches" in shot, false);
    assert.equal("continuity" in shot, false);
    assert.equal("continuityCheck" in shot, false);
    const payload = nodes.find((node) => node.id === "shot")?.metadata?.filmShot;
    assert.equal(payload ? "branches" in payload : true, false);
    assert.equal(payload ? "continuity" in payload : true, false);
    assert.equal(payload ? "continuityCheck" in payload : true, false);
});

test("retains empty graph scenes in review input", () => {
    const emptyScene = node("scene-empty", CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "空场", location: "", time: "", mood: "" } });
    const input = selectFilmReviewInput([...nodes, emptyScene], connections);
    assert.ok(input.scenes.some((scene) => scene.id === "scene-empty" && scene.shotIds.length === 0));
});

test("includes empty scenes in AI context and reports a general issue without director style", () => {
    const emptyScene = node("scene-empty", CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "空场", location: "", time: "", mood: "" } });
    const graphNodes = [...nodes, emptyScene];
    const input = selectFilmReviewInput(graphNodes, connections);
    const context = JSON.parse(buildFilmConsistencyContext(input));
    assert.ok(Array.isArray(context.scenes));
    assert.ok(context.scenes.some((scene: { id: string; shotIds: string[] }) => scene.id === "scene-empty" && scene.shotIds.length === 0));
    const issue = selectFilmReview(graphNodes, connections).issues.find((item) => item.sceneId === "scene-empty");
    assert.equal(issue?.source, "coverage");
    assert.equal(issue?.shotId, undefined);
});

test("reports per-scene shots missing character or location context", () => {
    const secondShot = node("shot-2", CanvasNodeType.FilmShot, { filmShot: { shotNo: "02", shotType: "CU", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
    const graphNodes = [...nodes, secondShot];
    const graphConnections: CanvasConnection[] = [...connections, { id: "scene->shot-2", fromNodeId: "scene", toNodeId: "shot-2", kind: "composition" }];
    const report = selectFilmReview(graphNodes, graphConnections);
    const characters = report.issues.find((issue) => issue.id === "missing-characters-scene");
    const locations = report.issues.find((issue) => issue.id === "missing-locations-scene");
    assert.ok(characters?.message.includes("1 个镜头未绑定角色") && characters.sceneId === "scene" && characters.shotId === "shot-2");
    assert.equal(characters?.targetNodeId, "scene");
    assert.equal(characters?.targetShotId, "shot-2");
    assert.ok(locations?.message.includes("2 个镜头未绑定场景") && locations.sceneId === "scene" && locations.shotId === "shot");
    assert.equal(locations?.targetNodeId, "scene");
    assert.equal(locations?.targetShotId, "shot");
});

test("reports graph asset readiness and static issues", () => {
    const report = selectFilmReview(nodes, connections);
    assert.equal(report.shotCount, 1);
    assert.equal(report.sceneCount, 1);
    assert.equal(report.readiness.checked, 1);
    assert.equal(report.readiness.ready, 0);
    assert.equal(report.readiness.missing[0].name, "阿青");
    assert.equal(report.readiness.missing[0].contextNodeId, "char");
    assert.ok(report.issues.length > 0);
});

test("targets variant, prop and deleted-costume readiness at their context nodes", () => {
    const board = appendSlotImage(createEmptyCharacterProfile().board, { id: "board", url: "https://example.com/board.png", createdAt: "2026-11-22T00:00:00.000Z" });
    const characterAsset: FilmAsset = {
        ...createFilmAsset("character", 1),
        name: "阿青",
        character: { ...createEmptyCharacterProfile(), board, states: [{ id: "st-1", name: "正装", description: "", costumeId: "cos-gone", condition: "", heldPropIds: [], look: { images: [], locked: false } }] },
    };
    const locationAsset: FilmAsset = {
        ...createFilmAsset("location", 1),
        name: "天台",
        location: { variants: [{ id: "v-1", name: "雨夜", description: "", concept: createFilmAsset("location", 1).concept }] },
    };
    const propAsset: FilmAsset = { ...createFilmAsset("prop", 1), name: "录音笔" };
    const graphNodes: CanvasNodeData[] = [
        ...nodes.filter((item) => item.id !== "char"),
        node("char", CanvasNodeType.FilmCharacter, { filmCharacter: { asset: characterAsset } }),
        node("loc", CanvasNodeType.FilmLocation, { filmLocation: { asset: locationAsset } }),
        node("prop", CanvasNodeType.FilmProp, { filmProp: { asset: propAsset } }),
    ];
    const graphConnections: CanvasConnection[] = [
        ...connections.filter((edge) => edge.fromNodeId !== "char"),
        { id: "char->shot", fromNodeId: "char", toNodeId: "shot", kind: "context", data: { role: "character", source: "manual", stateId: "st-1" } },
        { id: "loc->shot", fromNodeId: "loc", toNodeId: "shot", kind: "context", data: { role: "location", source: "manual", variantId: "v-1" } },
        { id: "prop->shot", fromNodeId: "prop", toNodeId: "shot", kind: "context", data: { role: "prop", source: "manual" } },
    ];
    const report = selectFilmReview(graphNodes, graphConnections);
    assert.equal(report.readiness.missing.find((item) => item.kind === "costume")?.contextNodeId, "char");
    assert.equal(report.readiness.missing.find((item) => item.kind === "location")?.contextNodeId, "loc");
    assert.equal(report.readiness.missing.find((item) => item.kind === "prop")?.contextNodeId, "prop");
});

test("targets style issues at the style node and stale AI reviews at the review entry", () => {
    const styleNode = node("style", CanvasNodeType.FilmStyle, { filmStyle: { asset: { ...createFilmAsset("style", 1), name: "冷峻电影感" } } });
    const report = selectFilmReview([...nodes, styleNode], connections, {
        aspect: "16:9",
        stylePresetId: "custom",
        directorStyleId: "cinematic-classic",
        consistencyReview: { scriptHash: "", reviewedAt: "2026-11-22T00:00:00.000Z", graphFingerprint: "stale", issues: [] },
    });
    const styleIssue = report.issues.find((issue) => issue.source === "style");
    assert.equal(styleIssue?.targetContextNodeId, "style");
    assert.equal(styleIssue?.targetNodeId, "style");
    const stale = report.issues.find((issue) => issue.id === "consistency-stale");
    assert.equal(stale?.targetReview, true);
    assert.equal(stale?.level, "warning");
});

test("retains target duration and director-style checks in graph review", () => {
    const shortShot = node("shot", CanvasNodeType.FilmShot, { filmShot: { shotNo: "01", shotType: "CU", cameraMovement: "固定", duration: 4, description: "阿青回头", dialogue: "", audio: "", prompt: "普通画面" } });
    const report = selectFilmReview(nodes.map((item) => item.id === "shot" ? shortShot : item), connections, { aspect: "16:9", stylePresetId: "custom", directorStyleId: "cinematic-classic", targetDuration: 30 });
    assert.ok(report.issues.some((issue) => issue.source === "duration" && issue.message.includes("目标")));
    assert.ok(report.issues.some((issue) => issue.source === "style" && issue.message.includes("建立镜头")));
});

test("includes unassigned shots in consistency input and fingerprint", () => {
    const unassigned = node("loose", CanvasNodeType.FilmShot, { filmShot: { shotNo: "02", shotType: "CU", cameraMovement: "推近", duration: 4, description: "未分场镜头", dialogue: "", audio: "", prompt: "未分场镜头" } });
    const graphNodes = [...nodes, unassigned];
    const input = selectFilmReviewInput(graphNodes, connections, undefined, "测试项目");
    const context = JSON.parse(buildFilmConsistencyContext(input));
    assert.ok(input.shots.some((entry) => entry.id === "loose"));
    assert.ok(context.shots.some((shot: { shotNo: string }) => shot.shotNo === "02"));
    assert.notEqual(filmReviewFingerprint(input), filmReviewFingerprint(selectFilmReviewInput(nodes, connections, undefined, "测试项目")));
});

test("reviews shots in global sequence order and stable scene order", () => {
    const sceneA = node("scene-a", CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "A", location: "", time: "", mood: "" } });
    const sceneB = node("scene-b", CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "B", location: "", time: "", mood: "" } });
    const first = node("first", CanvasNodeType.FilmShot, { filmShot: { shotNo: "01", shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
    const second = node("second", CanvasNodeType.FilmShot, { filmShot: { shotNo: "02", shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
    const graphNodes = [second, sceneB, first, sceneA];
    const graphEdges: CanvasConnection[] = [
        { id: "b", fromNodeId: "scene-b", toNodeId: "second", kind: "composition" },
        { id: "a", fromNodeId: "scene-a", toNodeId: "first", kind: "composition" },
        { id: "seq", fromNodeId: "first", toNodeId: "second", kind: "sequence" },
    ];
    const input = selectFilmReviewInput(graphNodes, graphEdges);
    const context = JSON.parse(buildFilmConsistencyContext(input));
    assert.deepEqual(input.shots.map((entry) => entry.id), ["first", "second"]);
    assert.deepEqual(input.scenes.map((entry) => entry.id), ["scene-a", "scene-b"]);
    assert.deepEqual(context.shots.map((shot: { shotNo: string }) => shot.shotNo), ["01", "02"]);
});

test("review fingerprint follows review input and ignores generated media", () => {
    const input = selectFilmReviewInput(nodes, connections);
    const fingerprint = filmReviewFingerprint(input);
    assert.equal(selectFilmReview(nodes, connections).fingerprint, fingerprint);

    const edited = nodes.map((item): CanvasNodeData => {
        if (item.id !== "shot" || !item.metadata?.filmShot) return item;
        return { ...item, metadata: { ...item.metadata, filmShot: { ...item.metadata.filmShot, description: "阿青转身" } } };
    });
    assert.notEqual(filmReviewFingerprint(selectFilmReviewInput(edited, connections)), fingerprint);

    const withMedia = nodes.map((item): CanvasNodeData => {
        if (item.id !== "shot" || !item.metadata?.filmShot) return item;
        return { ...item, metadata: { ...item.metadata, filmShot: { ...item.metadata.filmShot, imageUrl: "https://example.com/shot.jpg" } } };
    });
    assert.equal(filmReviewFingerprint(selectFilmReviewInput(withMedia, connections)), fingerprint);
});

test("marks stored review stale only when its fingerprint differs", () => {
    const review = { scriptHash: "", reviewedAt: "", issues: [], graphFingerprint: "abc" };
    assert.equal(filmReviewIsStale(undefined, "abc"), false);
    assert.equal(filmReviewIsStale(review, undefined), false);
    assert.equal(filmReviewIsStale(review, "abc"), false);
    assert.equal(filmReviewIsStale(review, "def"), true);
    assert.equal(filmReviewIsStale({ ...review, graphFingerprint: undefined }, "abc"), true);
});
