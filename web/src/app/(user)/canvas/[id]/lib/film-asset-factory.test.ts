import assert from "node:assert/strict";
import test from "node:test";

import { createFilmAsset, createFilmStyleAsset, importFilmAsset } from "./film-asset-factory";

test("creates library assets with kind-specific reference structures", () => {
    const character = createFilmAsset("character", 2);
    const location = createFilmAsset("location", 3);
    const prop = createFilmAsset("prop", 4);

    assert.equal(character.name, "角色 2");
    assert.deepEqual(character.character?.propIds, []);
    assert.deepEqual(character.character?.states, []);
    assert.equal(character.views, undefined);

    assert.equal(location.name, "场景 3");
    assert.deepEqual(location.location?.variants, []);
    assert.ok(location.views);

    assert.equal(prop.name, "道具 4");
    assert.ok(prop.views);
});

test("imports a library asset as an independent project copy", () => {
    const source = { ...createFilmAsset("character", 1), id: "library-character", name: "沈迟" };
    const [copy] = importFilmAsset([], source);
    assert.notEqual(copy.id, source.id);
    assert.equal(copy.sourceLibraryAssetId, source.id);
    assert.equal(copy.name, "沈迟");
    copy.name = "项目内改名";
    assert.equal(source.name, "沈迟");
});

test("creates the default style asset without the legacy generic node wrapper", () => {
    const style = createFilmStyleAsset();

    assert.equal(style.name, "风格圣经 1");
    assert.equal(style.status, "idle");
    assert.deepEqual(style.concept.images, []);
    assert.equal(style.character, undefined);
    assert.equal(style.location, undefined);
    assert.equal(style.views, undefined);
});
