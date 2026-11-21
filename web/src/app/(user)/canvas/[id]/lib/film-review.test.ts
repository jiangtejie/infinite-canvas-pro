import assert from "node:assert/strict";
import test from "node:test";

import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { filmReviewFingerprintForProject, filmReviewIsStale, selectFilmProjectFromGraph, selectFilmReview } from "./film-review";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id, type, title: id, position: { x: 0, y: 0 }, width: 300, height: 200, metadata,
});
const character = { ...createFilmAsset("character", 1), name: "阿青" };
const nodes: CanvasNodeData[] = [
    node("script", CanvasNodeType.Script, { filmScript: { text: "雨夜天台", parseSnapshots: [] } }),
    node("char", CanvasNodeType.FilmAsset, { filmAsset: { kind: "character", asset: character } }),
    node("scene", CanvasNodeType.Scene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "天台", location: "楼顶", time: "夜", mood: "压抑" } }),
    node("shot", CanvasNodeType.Shot, { filmShot: { shotNo: "01", shotType: "MS", cameraMovement: "固定", duration: 4, description: "阿青回头", dialogue: "", audio: "", prompt: "阿青回头" } }),
];
const connections: CanvasConnection[] = [
    { id: "scene->shot", fromNodeId: "scene", toNodeId: "shot", kind: "composition" },
    { id: "char->shot", fromNodeId: "char", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
];

test("projects graph nodes into review episodes and bindings", () => {
    const { project, shots } = selectFilmProjectFromGraph(nodes, connections, undefined, "测试影视");
    assert.equal(project.episodes.length, 1);
    assert.equal(project.episodes[0].scenes[0].name, "天台");
    assert.equal(shots.length, 1);
    assert.equal(shots[0].characterBindings[0].characterId, character.id);
    assert.equal(project.characters[0].name, "阿青");
});

test("reports missing readiness references and static issues", () => {
    const report = selectFilmReview(nodes, connections, undefined, "测试影视");
    assert.equal(report.shotCount, 1);
    assert.equal(report.sceneCount, 1);
    assert.equal(report.readiness.checked, 1);
    assert.equal(report.readiness.ready, 0);
    assert.equal(report.readiness.missing[0].name, "阿青");
    assert.ok(report.issues.length > 0);
});

test("review fingerprint follows AI input and ignores generated media", () => {
    const { project } = selectFilmProjectFromGraph(nodes, connections, undefined, "测试影视");
    const fingerprint = filmReviewFingerprintForProject(project);
    assert.equal(selectFilmReview(nodes, connections, undefined, "测试影视").fingerprint, fingerprint);

    const edited = nodes.map((item): CanvasNodeData => {
        if (item.id !== "shot" || !item.metadata?.filmShot) return item;
        return { ...item, metadata: { ...item.metadata, filmShot: { ...item.metadata.filmShot, description: "阿青转身" } } };
    });
    assert.notEqual(filmReviewFingerprintForProject(selectFilmProjectFromGraph(edited, connections, undefined, "测试影视").project), fingerprint);

    const withMedia = nodes.map((item): CanvasNodeData => {
        if (item.id !== "shot" || !item.metadata?.filmShot) return item;
        return { ...item, metadata: { ...item.metadata, filmShot: { ...item.metadata.filmShot, imageUrl: "https://example.com/shot.jpg" } } };
    });
    assert.equal(filmReviewFingerprintForProject(selectFilmProjectFromGraph(withMedia, connections, undefined, "测试影视").project), fingerprint);
});

test("marks stored review stale only when its fingerprint differs", () => {
    const review = { scriptHash: "", reviewedAt: "", issues: [], graphFingerprint: "abc" };
    assert.equal(filmReviewIsStale(undefined, "abc"), false);
    assert.equal(filmReviewIsStale(review, undefined), false);
    assert.equal(filmReviewIsStale(review, "abc"), false);
    assert.equal(filmReviewIsStale(review, "def"), true);
    assert.equal(filmReviewIsStale({ ...review, graphFingerprint: undefined }, "abc"), true);
});
