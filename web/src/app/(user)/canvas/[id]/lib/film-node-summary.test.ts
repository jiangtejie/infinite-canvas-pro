import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmGenerationContext } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";
import { summarizeFilmNode } from "./film-node-summary";

const asset = (id: string, name: string): FilmAsset => ({
    id,
    name,
    aliases: [],
    description: `${name}设定`,
    visualPrompt: `${name}视觉提示`,
    status: "ready",
    concept: { images: [], locked: false },
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
});

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}, title = id): CanvasNodeData => ({
    id,
    type,
    title,
    position: { x: 0, y: 0 },
    width: 360,
    height: 240,
    metadata,
});

const scene = node("scene-1", CanvasNodeType.FilmScene, {
    filmScene: { episodeId: "ep-1", episodeTitle: "第 1 集", name: "天台", location: "天台", time: "深夜", mood: "压迫" },
});

const character = node("character-1", CanvasNodeType.FilmCharacter, { filmCharacter: { asset: asset("char-1", "沈迟") } });
const location = node("location-1", CanvasNodeType.FilmLocation, { filmLocation: { asset: asset("location-1", "天台") } });

const contextEdge = (fromNodeId: string, role: "character" | "location"): CanvasConnection => ({
    id: `${fromNodeId}->shot-1`,
    fromNodeId,
    toNodeId: "shot-1",
    kind: "context",
    data: { role, source: "manual" },
});

const shot = (patch: Partial<NonNullable<CanvasNodeData["metadata"]>["filmShot"]> = {}, metadata: CanvasNodeData["metadata"] = {}) => node("shot-1", CanvasNodeType.FilmShot, {
    ...metadata,
    filmShot: {
        shotNo: "01",
        shotType: "中景",
        cameraMovement: "推进",
        duration: 4,
        description: "沈迟走到天台边缘",
        dialogue: "",
        audio: "风声",
        prompt: "天台深夜",
        ...patch,
    },
});

const generationContext = (inputSignature: string): FilmGenerationContext => ({
    inputSignature,
    compilerVersion: "test",
    prompt: "test",
    characters: [],
    references: [],
    missingReferenceIds: [],
    warnings: [],
    createdAt: "2026-11-22T00:00:00.000Z",
});

const graphConnections: CanvasConnection[] = [
    { id: "scene-1->shot-1", fromNodeId: "scene-1", toNodeId: "shot-1", kind: "composition" },
    contextEdge("character-1", "character"),
    contextEdge("location-1", "location"),
];


test("shot summary exposes scene, contexts, media and refresh state", () => {
    const shotNode = shot({ imageUrl: "https://example.com/shot.png" });
    const nodes = [scene, character, location, shotNode];
    const connections = graphConnections;
    const imageContext = buildFilmShotGenerationFromGraph(nodes, connections, shotNode.id, { medium: "image", maxReferences: 6 });
    shotNode.metadata!.filmShot!.imageVersions = [{ id: "image-1", url: shotNode.metadata!.filmShot!.imageUrl!, createdAt: "2026-11-22T00:00:00.000Z", generationContext: imageContext! }];
    const summary = summarizeFilmNode(shotNode, nodes, connections);

    assert.deepEqual(summary, {
        type: "filmShot",
        label: "镜头",
        title: "shot-1",
        description: "沈迟走到天台边缘",
        shotNo: "01",
        sceneLabel: "第 1 集 · 天台",
        contextLabels: ["角色 · 沈迟", "场景 · 天台"],
        previousShotNo: undefined,
        referenceCount: 0,
        media: "image",
        versionCount: 1,
        imageVersionCount: 1,
        videoVersionCount: 0,
        pendingGeneration: null,
        refreshState: "current",
        stale: false,
        needsRefresh: false,
        status: undefined,
        progress: undefined,
    });
});

test("empty shot summary keeps an explicit unassigned and unrecorded state", () => {
    const shotNode = shot({ description: "", prompt: "", shotNo: "" });
    const summary = summarizeFilmNode(shotNode, [shotNode], []);

    assert.equal(summary.media, "none");
    assert.equal(summary.sceneLabel, "未分场");
    assert.deepEqual(summary.contextLabels, []);
    assert.equal(summary.versionCount, 0);
    assert.equal(summary.refreshState, "unrecorded");
    assert.equal(summary.pendingGeneration, null);
});

test("shot summary exposes pending generation, multiple versions and stale signatures", () => {
    const shotNode = shot(
        {
            imageUrl: "https://example.com/current.png",
            imageVersions: [
                { id: "image-1", url: "https://example.com/old.png", createdAt: "2026-11-22T00:00:00.000Z", generationContext: generationContext("old-signature") },
                { id: "image-2", url: "https://example.com/current.png", createdAt: "2026-11-22T00:01:00.000Z", generationContext: generationContext("current-signature") },
            ],
            videoVersions: [{ id: "video-1", url: "https://example.com/shot.mp4", createdAt: "2026-11-22T00:02:00.000Z" }],
            pendingTask: { kind: "image", id: "task-1", startedAt: Date.now(), generationContext: generationContext("old-signature") },
        },
        { status: "loading" },
    );
    const summary = summarizeFilmNode(shotNode, [shotNode], []);

    assert.equal(summary.media, "image+video");
    assert.equal(summary.versionCount, 3);
    assert.equal(summary.imageVersionCount, 2);
    assert.equal(summary.videoVersionCount, 1);
    assert.equal(summary.pendingGeneration, "image");
    assert.equal(summary.refreshState, "pending");
    assert.equal(summary.stale, true);
    assert.equal(summary.needsRefresh, true);
});

test("shot summary exposes previous shot and compiled reference count", () => {
    const previous: CanvasNodeData = { ...shot({ shotNo: "01", description: "上一镜", imageUrl: "https://example.com/previous.png" }), id: "shot-0" };
    const current: CanvasNodeData = { ...shot({ shotNo: "02", description: "本镜" }), id: "shot-2" };
    const nodes = [previous, current];
    const connections: CanvasConnection[] = [{ id: "shot-0->shot-2", fromNodeId: "shot-0", toNodeId: "shot-2", kind: "sequence" }];
    const summary = summarizeFilmNode(current, nodes, connections);

    assert.equal(summary.previousShotNo, "01");
    assert.equal(summary.referenceCount, 1);
});

test("script, scene, context and beat summaries use their specialized payloads", () => {
    const script = node("script", CanvasNodeType.FilmScript, { filmScript: { text: "第一幕\n天台相遇", parseSnapshots: [] } });
    const sceneNode = node("scene", CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep-1", episodeTitle: "第 1 集", name: "天台", location: "天台", time: "深夜", mood: "压迫", notes: "雨后" } });
    const characterNode = node("character", CanvasNodeType.FilmCharacter, { filmCharacter: { asset: asset("char", "沈迟") } });
    const beat = node("beat", CanvasNodeType.FilmBeat, { filmBeat: { title: "回头", mode: "grid9", prompt: "突然回头", frames: ["frame-1"], status: "success", progress: 100 } });

    assert.equal(summarizeFilmNode(script, [script], []).description, "第一幕 天台相遇");
    assert.equal(summarizeFilmNode(sceneNode, [sceneNode], []).description, "天台 / 深夜 / 压迫");
    assert.equal(summarizeFilmNode(characterNode, [characterNode], []).description, "沈迟设定");
    assert.equal(summarizeFilmNode(beat, [beat], []).description, "突然回头");
});
