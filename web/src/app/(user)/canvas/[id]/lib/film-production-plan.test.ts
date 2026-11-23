import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { createFilmAsset } from "./film-asset-factory";
import { appendSlotImage, createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeStatus, type FilmShotNodeData } from "../../types";
import { selectFilmProductionPlan } from "./film-production-plan";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-22T00:00:00.000Z" });
const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 200, height: 100, metadata });
const scene = (id: string, name: string) => node(id, CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name, location: "", time: "", mood: "" } });
const shot = (id: string, patch: Partial<FilmShotNodeData> = {}, status: CanvasNodeStatus = "idle") => node(id, CanvasNodeType.FilmShot, {
    status,
    filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: `${id} 描述`, dialogue: "", audio: "", prompt: `${id} 提示词`, ...patch },
});
const composition = (sceneId: string, shotId: string): CanvasConnection => ({ id: `${sceneId}->${shotId}`, fromNodeId: sceneId, toNodeId: shotId, kind: "composition" });
const contextEdge = (fromNodeId: string, toNodeId: string, role: "character" | "location"): CanvasConnection => ({ id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId, kind: "context", data: { role, source: "manual" } });

const character = () => node("char", CanvasNodeType.FilmCharacter, {
    filmCharacter: { asset: { ...createFilmAsset("character", 1), name: "沈迟", character: { ...createEmptyCharacterProfile(), board: appendSlotImage(createFilmImageSlot(), image("board")) } } },
});
const location = () => node("loc", CanvasNodeType.FilmLocation, { filmLocation: { asset: { ...createFilmAsset("location", 1), name: "天台" } } });

const project = () => {
    const nodes = [
        scene("scene", "天台"),
        shot("s1"),
        shot("s2", { description: "", prompt: "" }),
        shot("s3", { imageUrl: image("s3").url }),
        shot("s4", { lastFailedTaskKind: "image" }, "error"),
        character(),
        location(),
    ];
    const connections = [
        composition("scene", "s1"),
        composition("scene", "s2"),
        composition("scene", "s3"),
        composition("scene", "s4"),
        contextEdge("char", "s1", "character"),
        contextEdge("loc", "s1", "location"),
    ];
    return { nodes, connections };
};

test("combines assets and shots and preserves selected IDs from the entry point", () => {
    const { nodes, connections } = project();
    const plan = selectFilmProductionPlan(nodes, connections, {
        assetIds: ["loc"],
        shotIds: ["s1", "s3"],
        shotKind: "image",
        imageMaxReferences: 10,
        videoMaxReferences: 10,
    });
    assert.equal(plan.shotKind, "image");
    assert.deepEqual(plan.assets.map((item) => [item.id, item.role, item.status, item.selected]), [
        ["char", "character", "done", false],
        ["loc", "location", "ready", true],
    ]);
    assert.deepEqual(plan.shots.map((item) => [item.id, item.status, item.selected]), [
        ["s1", "ready", true],
        ["s2", "blocked", false],
        ["s3", "done", true],
        ["s4", "failed", false],
    ]);
    assert.deepEqual(plan.assets.map((item) => item.groupId), ["character", "location"]);
    assert.deepEqual(plan.shots.map((item) => item.groupId), ["scene", "scene", "scene", "scene"]);
    assert.deepEqual(plan.selected, { assetIds: ["loc"], shotIds: ["s1", "s3"] });
});

test("defaults select missing assets and ungenerated shots", () => {
    const { nodes, connections } = project();
    const plan = selectFilmProductionPlan(nodes, connections, { imageMaxReferences: 10, videoMaxReferences: 10 });
    assert.deepEqual(plan.selected.assetIds, ["loc"]);
    assert.deepEqual(plan.selected.shotIds, ["s1", "s4"]);
    assert.deepEqual(plan.totals, { assets: 2, shots: 4, ready: 2, done: 2, busy: 0, failed: 1, blocked: 1 });
});

test("does not default-select the other scope when opened from a view", () => {
    const { nodes, connections } = project();
    const assets = selectFilmProductionPlan(nodes, connections, { entryKind: "asset", imageMaxReferences: 10, videoMaxReferences: 10 });
    assert.deepEqual(assets.selected, { assetIds: ["loc"], shotIds: [] });
    const shots = selectFilmProductionPlan(nodes, connections, { shotIds: ["s1"], shotKind: "image", imageMaxReferences: 10, videoMaxReferences: 10 });
    assert.deepEqual(shots.selected, { assetIds: [], shotIds: ["s1"] });
});

test("carries queue remaining items and failure state into the plan", () => {
    const { nodes, connections } = project();
    const plan = selectFilmProductionPlan(nodes, connections, {
        imageMaxReferences: 10,
        videoMaxReferences: 10,
        assetQueue: { remainingNodeIds: ["loc"] },
        shotQueue: { remainingShotIds: ["s1", "s4"], kind: "image" },
    });
    assert.deepEqual(plan.queue, { assetRemaining: 1, shotRemaining: 2, shotKind: "image" });
    assert.deepEqual(plan.failures.map((item) => [item.id, item.canStart, item.reason]), [
        ["s4", true, "上次生成失败"],
    ]);
});

test("blocks a location with a missing referenced variant instead of marking it done", () => {
    const blockedLocation = node("loc", CanvasNodeType.FilmLocation, {
        filmLocation: {
            asset: {
                ...createFilmAsset("location", 1),
                name: "天台",
                location: { variants: [{ id: "v1", name: "雨夜", description: "", concept: createFilmImageSlot() }] },
            },
        },
    });
    const plan = selectFilmProductionPlan([
        scene("scene", "天台"),
        shot("s1"),
        blockedLocation,
    ], [
        composition("scene", "s1"),
        { id: "loc->s1", fromNodeId: "loc", toNodeId: "s1", kind: "context", data: { role: "location", variantId: "v1", source: "manual" } },
    ], { imageMaxReferences: 10, videoMaxReferences: 10 });
    assert.deepEqual(plan.assets.map((item) => [item.id, item.status, item.canStart, item.selected]), [
        ["loc", "blocked", false, false],
    ]);
    assert.match(plan.assets[0].reason, /变体/);
});

test("uses existing preflight skip reasons for the active shot kind", () => {
    const { nodes, connections } = project();
    const image = selectFilmProductionPlan(nodes, connections, { shotKind: "image", imageMaxReferences: 10, videoMaxReferences: 10 });
    assert.deepEqual(image.shots.map((item) => [item.id, item.status, item.reason]), [
        ["s1", "ready", ""],
        ["s2", "blocked", "缺少画面描述或提示词"],
        ["s3", "done", "已生成"],
        ["s4", "failed", "上次生成失败"],
    ]);
    const videoNodes = nodes.map((item) => item.id === "s1" ? shot("s1", { videoMode: "frames" }) : item);
    const video = selectFilmProductionPlan(videoNodes, connections, { shotKind: "video", imageMaxReferences: 10, videoMaxReferences: 10 });
    assert.equal(video.shots[0].status, "blocked");
    assert.match(video.shots[0].reason, /首帧/);
});
