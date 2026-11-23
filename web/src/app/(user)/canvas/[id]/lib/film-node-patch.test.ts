import assert from "node:assert/strict";
import test from "node:test";

import { createFilmAsset } from "./film-asset-factory";
import { addFilmContextEdge, removeFilmContextEdge, updateFilmContextEdge } from "./film-context-edges";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { patchFilmContextAssetNode, patchFilmSceneNode, patchFilmScriptNode, patchFilmShotNode } from "./film-node-patch";

const script = { id: "s", type: CanvasNodeType.FilmScript, title: "剧本", position: { x: 1, y: 2 }, width: 100, height: 100, metadata: { filmScript: { text: "旧", parseSnapshots: [] } } } as CanvasNodeData;
const scene = { id: "c", type: CanvasNodeType.FilmScene, title: "场次", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: "旧场", location: "", time: "", mood: "" } } } as CanvasNodeData;
const shot = { id: "h", type: CanvasNodeType.FilmShot, title: "镜头", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { status: "success", filmShot: { shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "旧", dialogue: "", audio: "", prompt: "" } } } as CanvasNodeData;
const character = { id: "p", type: CanvasNodeType.FilmCharacter, title: "角色", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmCharacter: { asset: createFilmAsset("character", 1) } } } as CanvasNodeData;

test("patches payloads without touching identity or other metadata", () => {
    assert.equal(patchFilmScriptNode(script, { text: "新" }).metadata?.filmScript?.text, "新");
    assert.equal(patchFilmSceneNode(scene, { name: "新场" }).metadata?.filmScene?.name, "新场");
    assert.equal(patchFilmShotNode(shot, { shotNo: "02" }).metadata?.filmShot?.description, "旧");
    assert.equal(patchFilmShotNode(shot, { duration: 8 }).position.x, 0);
});

test("shot editor patch preserves unrelated media and task fields", () => {
    const node: CanvasNodeData = {
        ...shot,
        metadata: {
            status: "success",
            filmShot: {
                ...shot.metadata?.filmShot,
                shotNo: "01",
                shotType: "",
                cameraMovement: "",
                duration: 4,
                description: "旧",
                dialogue: "",
                audio: "",
                prompt: "",
                imageUrl: "https://example.com/shot.png",
                imageVersions: [{ id: "image-v1", url: "https://example.com/shot.png", createdAt: "2026-11-22T00:00:00.000Z" }],
                videoVersions: [{ id: "video-v1", url: "https://example.com/shot.mp4", createdAt: "2026-11-22T00:00:00.000Z" }],
                pendingTask: { kind: "image", id: "task-1", startedAt: 1 },
            },
        },
    };
    const next = patchFilmShotNode(node, { description: "新的动作" });
    assert.equal(next.metadata?.filmShot?.description, "新的动作");
    assert.deepEqual(next.metadata?.filmShot?.imageVersions, node.metadata?.filmShot?.imageVersions);
    assert.deepEqual(next.metadata?.filmShot?.videoVersions, node.metadata?.filmShot?.videoVersions);
    assert.deepEqual(next.metadata?.filmShot?.pendingTask, node.metadata?.filmShot?.pendingTask);
    assert.equal(next.metadata?.filmShot?.imageUrl, node.metadata?.filmShot?.imageUrl);
    assert.equal(next.metadata?.status, node.metadata?.status);
});

test("shot editor patch keeps the original node and its other fields intact", () => {
    const next = patchFilmShotNode(shot, { shotNo: "02", description: "新动作" });
    assert.notEqual(next, shot);
    assert.notEqual(next.metadata, shot.metadata);
    assert.notEqual(next.metadata?.filmShot, shot.metadata?.filmShot);
    assert.equal(shot.metadata?.filmShot?.shotNo, "01");
    assert.equal(shot.metadata?.filmShot?.description, "旧");
    assert.equal(next.metadata?.filmShot?.shotNo, "02");
    assert.equal(next.metadata?.filmShot?.duration, 4);
});

test("context commands never write shot payload fields", () => {
    const before = shot.metadata?.filmShot;
    const added = addFilmContextEdge([character, shot], [], character.id, shot.id, { role: "character", source: "manual" });
    assert.ok("connections" in added);
    if (!("connections" in added)) return;
    assert.equal(shot.metadata?.filmShot, before);
    const updated = updateFilmContextEdge(added.connections, added.edgeId, { continuity: { emotion: "压抑" } });
    assert.equal(updated[0].kind === "context" ? updated[0].data.continuity?.emotion : null, "压抑");
    assert.equal(shot.metadata?.filmShot, before);
    assert.deepEqual(removeFilmContextEdge(updated, added.edgeId), []);
    assert.equal(shot.metadata?.filmShot, before);
});

test("patches specialized context assets without changing node identity", () => {
    const styleAsset = createFilmAsset("style", 1);
    const styleNode: CanvasNodeData = {
        ...character,
        id: "style",
        type: CanvasNodeType.FilmStyle,
        metadata: { filmStyle: { asset: styleAsset } },
    };
    const next = patchFilmContextAssetNode(styleNode, { name: "雨夜胶片" }, "2026-11-22T00:00:00.000Z");
    assert.equal(next.metadata?.filmStyle?.asset.name, "雨夜胶片");
    assert.equal(next.metadata?.filmStyle?.asset.updatedAt, "2026-11-22T00:00:00.000Z");
    assert.equal(next.type, CanvasNodeType.FilmStyle);
});
