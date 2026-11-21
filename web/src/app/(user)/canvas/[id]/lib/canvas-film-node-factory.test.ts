import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";

test("creates film script, scene and shot nodes with payload defaults", () => {
    const script = createCanvasNode(CanvasNodeType.Script, { x: 0, y: 0 });
    assert.equal(script.title, "剧本");
    assert.equal(script.metadata?.filmScript?.text, "");
    assert.deepEqual(script.metadata?.filmScript?.parseSnapshots, []);

    const scene = createCanvasNode(CanvasNodeType.Scene, { x: 0, y: 0 });
    assert.equal(scene.title, "场次");
    assert.equal(scene.metadata?.filmScene?.mood, "");

    const shot = createCanvasNode(CanvasNodeType.Shot, { x: 0, y: 0 });
    assert.equal(shot.title, "镜头");
    assert.equal(shot.metadata?.filmShot?.shotNo, "");
    assert.equal(shot.metadata?.filmShot?.duration, 4);
});

test("accepts film asset metadata and keeps the type spec", () => {
    const asset = createCanvasNode(CanvasNodeType.FilmAsset, { x: 0, y: 0 }, {
        filmAsset: {
            kind: "character",
            asset: { id: "char-1", name: "沈迟" } as FilmAsset,
        },
    });
    assert.equal(asset.title, "影视资产");
    assert.equal(asset.metadata?.filmAsset?.kind, "character");
});
