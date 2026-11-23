import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { selectActiveFilmShot, selectFilmSceneEntries, selectFilmShotContexts, selectFilmShotEntries, selectFilmShotFocus, selectFilmStyleName } from "./film-selectors";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

const scene = (id: string, episodeId: string, name: string) => node(id, CanvasNodeType.FilmScene, {
    filmScene: { episodeId, episodeTitle: episodeId === "ep1" ? "第 1 集" : "第 2 集", name, location: "", time: "", mood: "" },
});
const shot = (id: string) => node(id, CanvasNodeType.FilmShot, { filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
const asset = (id: string, kind: "character" | "location" | "style") => {
    const payload = kind === "character"
        ? { asset: { id, name: id, character: { states: [{ id: "state-1", name: "受伤" }] } } as FilmAsset }
        : kind === "location"
            ? { asset: { id, name: id, location: { variants: [{ id: "variant-1", name: "雨夜" }] } } as FilmAsset }
            : { asset: { id, name: id } as FilmAsset };
    if (kind === "character") return node(id, CanvasNodeType.FilmCharacter, { filmCharacter: payload });
    if (kind === "location") return node(id, CanvasNodeType.FilmLocation, { filmLocation: payload });
    return node(id, CanvasNodeType.FilmStyle, { filmStyle: payload });
};
const beat = node("beat", CanvasNodeType.FilmBeat, { filmBeat: { title: "动作节拍", mode: "grid9", prompt: "", frames: [], status: "idle", progress: 0 } });

const nodes = [
    scene("scene1", "ep1", "场景 1"),
    scene("scene2", "ep2", "场景 2"),
    shot("shot1"),
    shot("shot2"),
    shot("shot3"),
    shot("shot4"),
    asset("char", "character"),
    asset("loc", "location"),
    asset("style", "style"),
    beat,
];

const connections: CanvasConnection[] = [
    { id: "c1", fromNodeId: "scene1", toNodeId: "shot1", kind: "composition" },
    { id: "c2", fromNodeId: "scene1", toNodeId: "shot2", kind: "composition" },
    { id: "c3", fromNodeId: "scene2", toNodeId: "shot3", kind: "composition" },
    { id: "s1", fromNodeId: "shot2", toNodeId: "shot1", kind: "sequence" },
    { id: "char->shot1", fromNodeId: "char", toNodeId: "shot1", kind: "context", data: { role: "character", stateId: "state-1", continuity: { emotion: "紧张" }, source: "manual" } },
    { id: "loc->shot1", fromNodeId: "loc", toNodeId: "shot1", kind: "context", data: { role: "location", variantId: "variant-1", source: "manual" } },
    { id: "beat->shot1", fromNodeId: "beat", toNodeId: "shot1", kind: "context", data: { role: "beat", source: "ai" } },
    { id: "wrong-role->shot1", fromNodeId: "char", toNodeId: "shot1", kind: "context", data: { role: "location", source: "manual" } },
    { id: "d1", fromNodeId: "scene1", toNodeId: "shot1", kind: "derived", data: { source: "script-analysis" } },
];

test("groups scenes by episode and orders shots by sequence", () => {
    const scenes = selectFilmSceneEntries(nodes, connections);
    assert.deepEqual(scenes.map((item) => item.id), ["scene1", "scene2", "unassigned"]);
    assert.deepEqual(scenes[0].shots.map((item) => item.shot.id), ["shot2", "shot1"]);
    assert.deepEqual(scenes[2].shots.map((item) => item.shot.id), ["shot4"]);
});

test("selects the preferred shot, falls back to the scene's first shot, and handles empty scenes", () => {
    const scenes = selectFilmSceneEntries(nodes, connections);
    assert.equal(selectActiveFilmShot(scenes, "scene1", "shot1").shot?.shot.id, "shot1");
    assert.equal(selectActiveFilmShot(scenes, "scene1", "missing").shot?.shot.id, "shot2");
    assert.equal(selectActiveFilmShot(scenes, "unassigned", null).shot?.shot.id, "shot4");
    const emptyScene = scene("scene3", "ep3", "空场");
    const emptyScenes = selectFilmSceneEntries([...nodes, emptyScene], connections);
    const active = selectActiveFilmShot(emptyScenes, "scene3", null);
    assert.equal(active.scene?.id, "scene3");
    assert.equal(active.shot, null);
});

test("projects an interleaved global sequence while keeping scene grouping", () => {
    const interleavedNodes = [scene("scene-a", "ep1", "场景 A"), scene("scene-b", "ep1", "场景 B"), shot("a1"), shot("b1"), shot("a2")];
    const interleavedConnections: CanvasConnection[] = [
        { id: "a1-comp", fromNodeId: "scene-a", toNodeId: "a1", kind: "composition" },
        { id: "a2-comp", fromNodeId: "scene-a", toNodeId: "a2", kind: "composition" },
        { id: "b1-comp", fromNodeId: "scene-b", toNodeId: "b1", kind: "composition" },
        { id: "a1->b1", fromNodeId: "a1", toNodeId: "b1", kind: "sequence" },
        { id: "b1->a2", fromNodeId: "b1", toNodeId: "a2", kind: "sequence" },
    ];
    assert.deepEqual(selectFilmShotEntries(interleavedNodes, interleavedConnections).map((entry) => entry.shot.id), ["a1", "b1", "a2"]);
    const scenes = selectFilmSceneEntries(interleavedNodes, interleavedConnections);
    assert.deepEqual(scenes[0].shots.map((entry) => entry.shot.id), ["a1", "a2"]);
    assert.deepEqual(scenes[1].shots.map((entry) => entry.shot.id), ["b1"]);
});

test("opens Shot Focus on a board-selected shot and returns to the same node", () => {
    const entries = selectFilmShotEntries(nodes, connections);
    // 导演板点击 shot1 后打开镜头聚焦：仍是同一镜头，上一镜/下一镜来自全片链。
    const focus = selectFilmShotFocus(entries, "shot1");
    assert.equal(focus.entry?.shot.id, "shot1");
    assert.equal(focus.index, 1);
    assert.equal(focus.prev?.shot.id, "shot2");
    assert.equal(focus.next?.shot.id, "shot3");
    // 关闭镜头聚焦后回到导演板，仍是同一场次/镜头。
    const active = selectActiveFilmShot(selectFilmSceneEntries(nodes, connections), "scene1", "shot1");
    assert.equal(active.scene?.id, "scene1");
    assert.equal(active.shot?.shot.id, "shot1");
    assert.equal(selectFilmShotFocus(entries, active.shot?.shot.id ?? null).entry?.shot.id, "shot1");
});

test("keeps the active shot in Shot Focus after editing its payload", () => {
    const entries = selectFilmShotEntries(nodes, connections);
    const basePayload = nodes.find((item) => item.id === "shot1")?.metadata?.filmShot;
    assert.ok(basePayload);
    const editedNodes: CanvasNodeData[] = nodes.map((item) => item.id !== "shot1" ? item : {
        ...item,
        metadata: { ...item.metadata, filmShot: { ...basePayload, description: "改过的画面", duration: 6 } },
    });
    const editedEntries = selectFilmShotEntries(editedNodes, connections);
    const focus = selectFilmShotFocus(editedEntries, "shot1");
    assert.equal(focus.entry?.shot.id, "shot1");
    assert.equal(focus.entry?.shot.metadata?.filmShot?.description, "改过的画面");
    assert.equal(focus.index, entries.findIndex((entry) => entry.shot.id === "shot1"));
    const active = selectActiveFilmShot(selectFilmSceneEntries(editedNodes, connections), "scene1", "shot1");
    assert.equal(active.scene?.id, "scene1");
    assert.equal(active.shot?.shot.metadata?.filmShot?.duration, 6);
    assert.equal(selectFilmShotFocus(editedEntries, active.shot?.shot.id ?? null).entry?.shot.id, "shot1");
});

test("Shot Focus never invents a shot for empty or missing selections", () => {
    const entries = selectFilmShotEntries(nodes, connections);
    assert.deepEqual(selectFilmShotFocus(entries, null), { entry: null, index: -1, prev: null, next: null });
    assert.deepEqual(selectFilmShotFocus(entries, "missing"), { entry: null, index: -1, prev: null, next: null });
});

test("selects context chips but never treats derived edges as context", () => {
    const chips = selectFilmShotContexts(nodes, connections, "shot1");
    assert.deepEqual(chips.map((chip) => ({ id: chip.id, edgeId: chip.edgeId, role: chip.role, name: chip.name, stateId: chip.stateId, variantId: chip.variantId })), [
        { id: "char", edgeId: "char->shot1", role: "character", name: "char", stateId: "state-1", variantId: undefined },
        { id: "loc", edgeId: "loc->shot1", role: "location", name: "loc", stateId: undefined, variantId: "variant-1" },
        { id: "beat", edgeId: "beat->shot1", role: "beat", name: "动作节拍", stateId: undefined, variantId: undefined },
    ]);
    assert.deepEqual(chips[0].continuity, { emotion: "紧张" });
    assert.ok(chips[1].variants.some((variant) => variant.id === "variant-1" && variant.name === "雨夜"));
    assert.equal(selectFilmStyleName(nodes), "style");
});
