import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../types";
import { isFilmCanvasNodeType } from "./film-mode";

test("identifies film node types", () => {
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Script), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Scene), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Shot), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmAsset), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Image), false);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Text), false);
});
