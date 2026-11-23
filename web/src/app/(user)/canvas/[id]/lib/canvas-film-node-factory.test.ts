import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";
import { createFilmAsset } from "./film-asset-factory";

test("creates specialized film context and beat nodes with payload defaults", () => {
    const character = createCanvasNode(CanvasNodeType.FilmCharacter, { x: 0, y: 0 });
    assert.equal(character.title, "角色");
    assert.equal(character.metadata?.filmCharacter?.asset.name, "角色 1");

    const style = createCanvasNode(CanvasNodeType.FilmStyle, { x: 0, y: 0 });
    assert.equal(style.title, "风格圣经");
    assert.equal(style.metadata?.filmStyle?.asset.name, "风格圣经 1");

    const beat = createCanvasNode(CanvasNodeType.FilmBeat, { x: 0, y: 0 });
    assert.equal(beat.title, "动作节拍");
    assert.equal(beat.metadata?.filmBeat?.mode, "grid9");
    assert.equal(beat.metadata?.filmBeat?.frames.length, 9);
});

test("accepts specialized film asset metadata and keeps the node type", () => {
    const asset = { ...createFilmAsset("character", 1), name: "沈迟" };
    const node = createCanvasNode(CanvasNodeType.FilmCharacter, { x: 0, y: 0 }, { filmCharacter: { asset } });
    assert.equal(node.title, "角色");
    assert.equal(node.metadata?.filmCharacter?.asset.id, asset.id);
});
