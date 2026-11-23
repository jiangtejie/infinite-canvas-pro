import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCharacterProfile } from "./film-character";
import { createFilmAsset } from "@/app/(user)/canvas/[id]/lib/film-asset-factory";
import { buildFilmReferenceBoardPrompt, DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID, FILM_REFERENCE_BOARD_TEMPLATES } from "./film-reference-board-templates";
import type { FilmAsset } from "@/lib/film/types";

const asset: FilmAsset = {
    ...createFilmAsset("character", 1),
    name: "沈砚",
    aliases: ["沈书生"],
    description: "江南书生，温润克制",
    visualPrompt: "24 岁男性，方巾，月白长衫，竹青腰带",
    character: {
        ...createEmptyCharacterProfile(),
        states: [{ id: "st1", name: "雨夜", description: "衣摆湿透", condition: "左手受伤", heldPropIds: [], look: { images: [], locked: false } }],
    },
};

test("exposes a default standard board plus presentation and lookbook templates", () => {
    assert.ok(FILM_REFERENCE_BOARD_TEMPLATES.some((template) => template.id === DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID));
    assert.equal(new Set(FILM_REFERENCE_BOARD_TEMPLATES.map((template) => template.id)).size, FILM_REFERENCE_BOARD_TEMPLATES.length);
    assert.ok(FILM_REFERENCE_BOARD_TEMPLATES.some((template) => template.purpose === "presentation" && template.requiresTextRendering));
    assert.ok(FILM_REFERENCE_BOARD_TEMPLATES.some((template) => template.id === "costume-lookbook"));
});

test("builds the default reference board with character and state context", () => {
    const result = buildFilmReferenceBoardPrompt(asset);
    assert.equal(result.template.id, DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID);
    assert.ok(result.prompt.includes("沈砚"));
    assert.ok(result.prompt.includes("江南书生，温润克制"));
    assert.ok(result.prompt.includes("24 岁男性"));
    assert.ok(result.prompt.includes("雨夜"));
    assert.ok(result.prompt.includes("正面全身"));
    assert.ok(!result.prompt.includes("{{"));
    assert.equal(result.requiresTextRendering, false);
    assert.ok(result.negativePrompt.includes("水印"));
});

test("the infographic template includes panels, labels and a text warning", () => {
    const result = buildFilmReferenceBoardPrompt(asset, "infographic-character-sheet");
    assert.equal(result.requiresTextRendering, true);
    assert.ok(result.prompt.includes("三视图"));
    assert.ok(result.prompt.includes("脸部特征"));
    assert.ok(result.prompt.includes("服装"));
    assert.ok(result.warnings.some((warning) => warning.includes("文字")));
    assert.ok(result.negativePrompt.includes("乱码"));
});

test("the cinematic portrait template avoids layout panels", () => {
    const result = buildFilmReferenceBoardPrompt(asset, "cinematic-portrait");
    assert.ok(result.prompt.includes("电影感"));
    assert.ok(result.prompt.includes("面部"));
    assert.ok(!result.prompt.includes("三视图"));
});

test("the costume lookbook includes every state and warns when none exist", () => {
    const withStates = buildFilmReferenceBoardPrompt(asset, "costume-lookbook");
    assert.ok(withStates.prompt.includes("雨夜"));
    assert.ok(withStates.prompt.includes("左手受伤"));
    const noStates = buildFilmReferenceBoardPrompt({ ...asset, character: { ...asset.character!, states: [] } }, "costume-lookbook");
    assert.ok(noStates.warnings.some((warning) => warning.includes("造型")));
});

test("falls back to the default template for unknown ids", () => {
    const result = buildFilmReferenceBoardPrompt(asset, "missing-template");
    assert.equal(result.template.id, DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID);
});
