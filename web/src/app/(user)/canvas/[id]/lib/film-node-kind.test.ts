import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { FILM_NODE_TYPES, filmContextRoleOfNode } from "./film-node-kind";

const node = (type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: type,
    type,
    title: type,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

test("lists all dedicated film node types", () => {
    assert.deepEqual([...FILM_NODE_TYPES], [
        CanvasNodeType.FilmScript,
        CanvasNodeType.FilmScene,
        CanvasNodeType.FilmShot,
        CanvasNodeType.FilmCharacter,
        CanvasNodeType.FilmLocation,
        CanvasNodeType.FilmProp,
        CanvasNodeType.FilmStyle,
        CanvasNodeType.FilmBeat,
    ]);
});

test("maps context nodes only when their dedicated payload exists", () => {
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.FilmCharacter, { filmCharacter: { asset: {} as never } })), "character");
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.FilmLocation, { filmLocation: { asset: {} as never } })), "location");
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.FilmProp, { filmProp: { asset: {} as never } })), "prop");
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.FilmStyle, { filmStyle: { asset: {} as never } })), "style");
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.FilmBeat, { filmBeat: { title: "节拍", mode: "grid9", prompt: "", frames: [], status: "idle", progress: 0 } })), "beat");
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.FilmCharacter)), null);
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.FilmShot, { filmShot: {} as never })), null);
    assert.equal(filmContextRoleOfNode(node(CanvasNodeType.Image)), null);
    assert.equal(filmContextRoleOfNode(undefined), null);
});
