import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { patchFilmAssetNode, patchFilmSceneNode, patchFilmScriptNode, patchFilmShotNode } from "./film-node-patch";

const script = { id: "s", type: CanvasNodeType.Script, title: "剧本", position: { x: 1, y: 2 }, width: 100, height: 100, metadata: { filmScript: { text: "旧", parseSnapshots: [] } } } as CanvasNodeData;
const scene = { id: "c", type: CanvasNodeType.Scene, title: "场次", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: "旧场", location: "", time: "", mood: "" } } } as CanvasNodeData;
const shot = { id: "h", type: CanvasNodeType.Shot, title: "镜头", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmShot: { shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "旧", dialogue: "", audio: "", prompt: "" } } } as CanvasNodeData;
const asset = { id: "a", type: CanvasNodeType.FilmAsset, title: "角色", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmAsset: { kind: "character", asset: { id: "a", name: "旧名", updatedAt: "2026-01-01T00:00:00.000Z" } as FilmAsset } } } as CanvasNodeData;

test("patches payloads without touching identity or other metadata", () => {
    assert.equal(patchFilmScriptNode(script, { text: "新" }).metadata?.filmScript?.text, "新");
    assert.equal(patchFilmSceneNode(scene, { name: "新场" }).metadata?.filmScene?.name, "新场");
    assert.equal(patchFilmShotNode(shot, { shotNo: "02" }).metadata?.filmShot?.description, "旧");
    assert.equal(patchFilmShotNode(shot, { duration: 8 }).position.x, 0);
});

test("patches assets with a deterministic updatedAt", () => {
    const next = patchFilmAssetNode(asset, { name: "新名" }, "2026-11-21T00:00:00.000Z");
    assert.equal(next.metadata?.filmAsset?.asset.name, "新名");
    assert.equal(next.metadata?.filmAsset?.asset.updatedAt, "2026-11-21T00:00:00.000Z");
    assert.equal(next.metadata?.filmAsset?.kind, "character");
});
