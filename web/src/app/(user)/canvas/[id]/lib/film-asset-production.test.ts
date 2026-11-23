import assert from "node:assert/strict";
import test from "node:test";

import { createFilmAsset } from "./film-asset-factory";
import { createEmptyCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { appendSlotImage, createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import { defaultFilmAssetProductionSelection, initialFilmAssetProductionSelection, planFilmAssetProduction } from "./film-asset-production";

const sceneNode = (): CanvasNodeData => ({
    id: "scene",
    type: CanvasNodeType.FilmScene,
    title: "咖啡馆",
    position: { x: 700, y: 100 },
    width: 360,
    height: 240,
    metadata: { status: "idle", filmScene: { episodeId: "e1", episodeTitle: "第 1 集", name: "咖啡馆", location: "旧城咖啡馆", time: "夜", mood: "" } },
});

const shotNode = (id: string): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmShot,
    title: id,
    position: { x: 700, y: 380 },
    width: 420,
    height: 320,
    metadata: { status: "idle", filmShot: { shotNo: id, shotType: "中景", cameraMovement: "固定", duration: 4, description: id, dialogue: "", audio: "", prompt: "" } as FilmShotNodeData },
});

const assetNode = (id: string, kind: "character" | "location" | "style", name: string, withBoard = false): CanvasNodeData => {
    const asset = createFilmAsset(kind, 1);
    const image = { id: `${id}-image`, url: "https://example.com/a.png", source: "upload" as const, createdAt: "2026-11-22T00:00:00.000Z" };
    const payload = {
        ...asset,
        name,
        ...(kind === "character" ? { character: { ...createEmptyCharacterProfile(), board: withBoard ? appendSlotImage(createFilmImageSlot(), image) : createFilmImageSlot() } } : {}),
        ...(kind === "location" && withBoard ? { concept: appendSlotImage(createFilmImageSlot(), image) } : {}),
    };
    return {
        id,
        type: kind === "character" ? CanvasNodeType.FilmCharacter : kind === "location" ? CanvasNodeType.FilmLocation : CanvasNodeType.FilmStyle,
        title: name,
        position: { x: 0, y: 0 },
        width: 360,
        height: 420,
        metadata: {
            status: "idle",
            ...(kind === "character" ? { filmCharacter: { asset: payload } } : kind === "location" ? { filmLocation: { asset: payload } } : { filmStyle: { asset: payload } }),
        },
    };
};

const connections = (): CanvasConnection[] => [
    { id: "c1", fromNodeId: "scene", toNodeId: "s1", kind: "composition" },
    { id: "c2", fromNodeId: "scene", toNodeId: "s2", kind: "composition" },
    { id: "b1", fromNodeId: "char-ready", toNodeId: "s1", kind: "context", data: { role: "character", source: "manual" } },
    { id: "b2", fromNodeId: "char-ready", toNodeId: "s2", kind: "context", data: { role: "character", source: "manual" } },
    { id: "b3", fromNodeId: "loc", toNodeId: "s1", kind: "context", data: { role: "location", source: "manual" } },
];

test("plans all context nodes with readiness, usage and reference target", () => {
    const nodes = [
        sceneNode(), shotNode("s1"), shotNode("s2"),
        assetNode("char-missing", "character", "阿青"),
        assetNode("char-ready", "character", "沈迟", true),
        assetNode("loc", "location", "旧城咖啡馆"),
        assetNode("style", "style", "风格圣经"),
    ];
    const plan = planFilmAssetProduction(nodes, connections());
    assert.deepEqual(plan.totals, { assets: 4, missing: 3, ready: 1, pending: 0 });
    assert.deepEqual(plan.items.map((item) => [item.kind, item.name, item.ready]), [
        ["character", "阿青", false],
        ["character", "沈迟", true],
        ["location", "旧城咖啡馆", false],
        ["style", "风格圣经", false],
    ]);
    assert.equal(plan.items[0].targetLabel, "参考板 · 标准参考板");
    assert.equal(plan.items[2].targetLabel, "概念图");
    assert.equal(plan.items[3].targetLabel, "风格参考图");
    assert.equal(plan.items[1].usedShots, 2);
    assert.equal(plan.items[2].usedShots, 1);
});

test("excludes pending asset tasks from the default selection", () => {
    const pendingNode = assetNode("char-pending", "character", "阿青");
    pendingNode.metadata!.filmCharacter!.asset.pendingTask = { kind: "image", id: "task", startedAt: 1, target: "board" };
    const plan = planFilmAssetProduction([pendingNode, assetNode("loc", "location", "旧城咖啡馆")], []);
    assert.deepEqual(plan.totals, { assets: 2, missing: 1, ready: 0, pending: 1 });
    assert.deepEqual([...defaultFilmAssetProductionSelection(plan)], ["loc"]);
});

test("starts from preferred node IDs but ignores pending assets", () => {
    const pending = assetNode("char-pending", "character", "待生成");
    pending.metadata!.filmCharacter!.asset.pendingTask = { kind: "image", id: "task", startedAt: 1, target: "board" };
    const plan = planFilmAssetProduction([
        pending,
        assetNode("char-ready", "character", "沈迟", true),
        assetNode("char-missing", "character", "阿青"),
    ], []);
    assert.deepEqual([...initialFilmAssetProductionSelection(plan, ["char-pending", "char-ready"])], ["char-ready"]);
    assert.deepEqual([...initialFilmAssetProductionSelection(plan)], ["char-missing"]);
});

test("does not queue a location that is only referenced through a ready variant", () => {
    const location = assetNode("loc", "location", "雨夜天台");
    const locationAsset = location.metadata!.filmLocation!.asset;
    locationAsset.location = { variants: [{ id: "v1", name: "雨夜", description: "", concept: appendSlotImage(createFilmImageSlot(), { id: "v1-image", url: "https://example.com/v1.png", source: "upload", createdAt: "2026-11-22T00:00:00.000Z" }) }] };
    const plan = planFilmAssetProduction([sceneNode(), shotNode("s1"), location], [
        { id: "c1", fromNodeId: "scene", toNodeId: "s1", kind: "composition" },
        { id: "b1", fromNodeId: "loc", toNodeId: "s1", kind: "context", data: { role: "location", source: "manual", variantId: "v1" } },
    ]);
    assert.equal(plan.items[0].ready, true);
    assert.deepEqual([...defaultFilmAssetProductionSelection(plan)], []);
});

test("keeps a character production target ready when only its costume reference is missing", () => {
    const character = assetNode("char-ready", "character", "沈迟", true);
    character.metadata!.filmCharacter!.asset.character!.states = [{ id: "st-1", name: "正装", description: "", costumeId: "cos-gone", condition: "", heldPropIds: [], look: createFilmImageSlot() }];
    const plan = planFilmAssetProduction([character], []);
    assert.equal(plan.items[0].ready, true);
    assert.deepEqual([...defaultFilmAssetProductionSelection(plan)], []);
});

test("sorts missing before ready and used assets first within a kind", () => {
    const nodes = [
        sceneNode(), shotNode("s1"), shotNode("s2"),
        assetNode("char-ready", "character", "沈迟", true),
        assetNode("char-missing-used", "character", "阿青"),
        assetNode("char-missing-unused", "character", "路人"),
    ];
    const plan = planFilmAssetProduction(nodes, [
        { id: "c1", fromNodeId: "scene", toNodeId: "s1", kind: "composition" },
        { id: "b1", fromNodeId: "char-missing-used", toNodeId: "s1", kind: "context", data: { role: "character", source: "manual" } },
    ]);
    assert.deepEqual(plan.items.map((item) => item.name), ["阿青", "路人", "沈迟"]);
    assert.deepEqual(plan.items.map((item) => item.usedShots), [1, 0, 0]);
});
