import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../types";
import { isFilmCanvasNodeType } from "./film-mode";

test("identifies film node types", () => {
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmScript), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmScene), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmShot), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmCharacter), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmLocation), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmProp), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmStyle), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmBeat), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Image), false);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Text), false);
});
