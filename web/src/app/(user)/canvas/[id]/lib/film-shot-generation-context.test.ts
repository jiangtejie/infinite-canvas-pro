import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-21T00:00:00.000Z" });
const withConcept = (asset: FilmAsset, id: string) => ({ ...asset, concept: appendSlotImage(asset.concept, image(id)) });
const assetNode = (id: string, asset: FilmAsset, kind: "character" | "location" | "prop" | "style"): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmAsset,
    title: asset.name,
    position: { x: 0, y: 0 },
    width: 200,
    height: 200,
    metadata: { filmAsset: { kind, asset } },
});
const shotNode = (id: string, payload: Partial<FilmShotNodeData> & { description: string; prompt: string; imageUrl?: string }): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Shot,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        filmShot: {
            shotNo: id,
            shotType: "中景",
            cameraMovement: "推近",
            duration: 4,
            dialogue: "",
            audio: "",
            ...payload,
        },
    },
});

const character = {
    ...createFilmAsset("character", 1),
    name: "沈迟",
    description: "落魄调查记者",
    visualPrompt: "深色风衣，短发",
};
character.character = { ...character.character!, master: appendSlotImage(character.character!.master, image("char-master")) };
const location = { ...withConcept(createFilmAsset("location", 1), "loc-concept"), name: "雨夜天台", description: "暴雨霓虹" };
const prop = { ...withConcept(createFilmAsset("prop", 1), "prop-concept"), name: "录音笔" };
const style = { ...withConcept(createFilmAsset("style", 1), "style-concept"), name: "冷峻电影感", visualPrompt: "冷调、低饱和、霓虹边缘光" };

const nodes: CanvasNodeData[] = [
    assetNode("char", character, "character"),
    assetNode("loc", location, "location"),
    assetNode("prop", prop, "prop"),
    assetNode("style", style, "style"),
    shotNode("shot-prev", { description: "主角站在天台边缘", prompt: "雨夜天台远景", imageUrl: "https://example.com/prev.png" }),
    shotNode("shot", { description: "主角回头", prompt: "雨夜天台，主角半侧身回头" }),
];
const connections: CanvasConnection[] = [
    { id: "seq", fromNodeId: "shot-prev", toNodeId: "shot", kind: "sequence" },
    { id: "bc", fromNodeId: "char", toNodeId: "shot", kind: "binding", data: { source: "manual", continuity: { emotion: "压抑" } } },
    { id: "bl", fromNodeId: "loc", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
    { id: "bp", fromNodeId: "prop", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
];

test("compiles a shot from graph nodes and edges", () => {
    const context = buildFilmShotGenerationFromGraph(nodes, connections, "shot", { medium: "image", maxReferences: 10 });
    assert.ok(context);
    assert.equal(context!.characters[0]?.characterId, character.id);
    assert.ok(context!.references.some((ref) => ref.role === "character-package"));
    assert.ok(context!.references.some((ref) => ref.role === "location"));
    assert.ok(context!.references.some((ref) => ref.role === "prop"));
    assert.ok(context!.references.some((ref) => ref.role === "previous-shot"));
    assert.ok(context!.prompt.includes("落魄调查记者"));
    assert.ok(context!.prompt.includes("雨夜天台"));
    assert.ok(context!.prompt.includes("冷调、低饱和"));
});

test("can skip the previous shot", () => {
    const context = buildFilmShotGenerationFromGraph(nodes, connections, "shot", { medium: "image", maxReferences: 10, includePreviousShot: false });
    assert.ok(context);
    assert.equal(context!.references.some((ref) => ref.role === "previous-shot"), false);
});
