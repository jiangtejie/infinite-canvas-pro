import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasImageTask } from "@/services/api/image";
import type { FilmAsset, FilmAssetTask } from "@/lib/film/types";
import { createFilmAsset } from "./film-asset-factory";
import { createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { applyFilmAssetImageTaskUpdate, selectFilmAssetImageTaskTargets } from "./film-asset-task-updates";
import { filmContextAsset } from "./film-node-patch";

const assetNode = (id: string, kind: "character" | "location", asset: FilmAsset, pending?: FilmAssetTask): CanvasNodeData => ({
    id,
    type: kind === "character" ? CanvasNodeType.FilmCharacter : CanvasNodeType.FilmLocation,
    title: asset.name,
    position: { x: 0, y: 0 },
    width: 360,
    height: 420,
    metadata: { status: "idle", [kind === "character" ? "filmCharacter" : "filmLocation"]: { asset: { ...asset, pendingTask: pending } } },
});

const pending = (patch: Partial<FilmAssetTask> = {}): FilmAssetTask => ({
    kind: "image",
    id: "task-1",
    startedAt: 1,
    target: "board",
    label: "标准参考板",
    templateId: "cinematic-portrait",
    templateVersion: 1,
    ...patch,
});

const task = (status: string, patch: Partial<CanvasImageTask> = {}): CanvasImageTask => ({
    id: "task-1",
    status,
    url: "https://example.com/asset.png",
    storageKey: "image:asset",
    prompt: "生成提示词",
    model: "gpt-image-2",
    ...patch,
});

test("selects only assets with pending image tasks", () => {
    const character = createFilmAsset("character", 1);
    const location = createFilmAsset("location", 1);
    const nodes = [
        assetNode("c1", "character", { ...character, name: "沈迟" }, pending()),
        assetNode("l1", "location", { ...location, name: "车站" }),
        assetNode("c2", "character", { ...character, name: "阿青" }, pending({ kind: "video", target: "concept" })),
    ];
    assert.deepEqual(selectFilmAssetImageTaskTargets(nodes).map((node) => node.id), ["c1"]);
});

test("writes completed board task into the character board and clears pending", () => {
    const character = { ...createFilmAsset("character", 1), name: "沈迟" };
    const nodes = [assetNode("c1", "character", character, pending())];
    const result = applyFilmAssetImageTaskUpdate(nodes, "c1", task("completed"));
    const asset = filmContextAsset(result[0]);
    assert.equal(asset?.status, "ready");
    assert.equal(asset?.pendingTask, undefined);
    assert.equal(asset?.referenceTemplateId, "cinematic-portrait");
    assert.equal(asset?.character?.board.images.length, 1);
    assert.equal(asset?.character?.board.images[0].label, "标准参考板");
    assert.equal(asset?.character?.board.images[0].storageKey, "image:asset");
    assert.equal(asset?.character?.board.images[0].model, "gpt-image-2");
});

test("writes concept and variant targets", () => {
    const location = {
        ...createFilmAsset("location", 1),
        name: "车站",
        location: { variants: [{ id: "v1", name: "雨夜", description: "", concept: createFilmImageSlot() }] },
    };
    const conceptNodes = [assetNode("l1", "location", location, pending({ target: "concept" }))];
    const conceptAsset = filmContextAsset(applyFilmAssetImageTaskUpdate(conceptNodes, "l1", task("completed")).at(0)!);
    assert.equal(conceptAsset?.concept.images.length, 1);
    assert.equal(conceptAsset?.location?.variants[0].concept.images.length, 0);

    const variantNodes = [assetNode("l1", "location", location, pending({ target: "variant", variantId: "v1" }))];
    const variantAsset = filmContextAsset(applyFilmAssetImageTaskUpdate(variantNodes, "l1", task("completed")).at(0)!);
    assert.equal(variantAsset?.location?.variants[0].concept.images.length, 1);
    assert.equal(variantAsset?.concept.images.length, 0);
});

test("failed task clears pending and records the error", () => {
    const character = createFilmAsset("character", 1);
    const nodes = [assetNode("c1", "character", character, pending())];
    const result = applyFilmAssetImageTaskUpdate(nodes, "c1", task("failed", { error: { message: "审核失败" } }));
    const asset = filmContextAsset(result[0]);
    assert.equal(asset?.status, "failed");
    assert.equal(asset?.errorMessage, "审核失败");
    assert.equal(asset?.pendingTask, undefined);
    assert.equal(asset?.character?.board.images.length, 0);
});

test("active tasks leave nodes untouched", () => {
    const character = createFilmAsset("character", 1);
    const nodes = [assetNode("c1", "character", character, pending())];
    const result = applyFilmAssetImageTaskUpdate(nodes, "c1", task("processing", { url: undefined }));
    assert.equal(result, nodes);
});
