import assert from "node:assert/strict";
import test from "node:test";

import { NODE_DEFAULT_SIZE, NODE_SPECS } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { normalizeConnection } from "./canvas-connections";
import { createCanvasNode } from "./canvas-node-factory";
import type {
    FilmBeatNodeData,
    FilmCharacterNodeData,
    FilmConnectionKind,
    FilmContextEdgeData,
    FilmContextRole,
    FilmDerivedEdgeData,
    FilmLocationNodeData,
    FilmNodeType,
    FilmPropNodeData,
    FilmStyleNodeData,
} from "./film-graph-types";

const filmNodeTypes: FilmNodeType[] = [
    "filmScript",
    "filmScene",
    "filmShot",
    "filmCharacter",
    "filmLocation",
    "filmProp",
    "filmStyle",
    "filmBeat",
];

const filmConnectionKinds: FilmConnectionKind[] = ["composition", "sequence", "context", "derived"];
const filmContextRoles: FilmContextRole[] = ["character", "location", "prop", "style", "beat"];
const canvasFilmNodeTypes = [
    CanvasNodeType.FilmScript,
    CanvasNodeType.FilmScene,
    CanvasNodeType.FilmShot,
    CanvasNodeType.FilmCharacter,
    CanvasNodeType.FilmLocation,
    CanvasNodeType.FilmProp,
    CanvasNodeType.FilmStyle,
    CanvasNodeType.FilmBeat,
];
const node = (id: string, type: CanvasNodeType, metadata?: CanvasNodeData["metadata"]): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

// @ts-expect-error Context edges require a role.
const contextEdgeWithoutRole: FilmContextEdgeData = { source: "manual" };
const contextConnection: CanvasConnection = {
    id: "character->shot",
    fromNodeId: "character",
    toNodeId: "shot",
    kind: "context",
    data: { role: "character", source: "manual" },
};
const derivedConnection: CanvasConnection = {
    id: "script->scene",
    fromNodeId: "script",
    toNodeId: "scene",
    kind: "derived",
    data: { source: "script-analysis" },
};

test("defines specialized film graph node, connection and context contracts", () => {
    assert.deepEqual(filmNodeTypes, [
        "filmScript",
        "filmScene",
        "filmShot",
        "filmCharacter",
        "filmLocation",
        "filmProp",
        "filmStyle",
        "filmBeat",
    ]);
    assert.deepEqual(filmConnectionKinds, ["composition", "sequence", "context", "derived"]);
    assert.deepEqual(filmContextRoles, ["character", "location", "prop", "style", "beat"]);
    assert.deepEqual(canvasFilmNodeTypes, filmNodeTypes);
    assert.equal(filmNodeTypes.includes("filmCostume" as FilmNodeType), false);
});

test("requires a role on context edges and keeps costume out of project context roles", () => {
    const edge: FilmContextEdgeData = {
        role: "character",
        stateId: "state-1",
        variantId: undefined,
        source: "manual",
    };
    const derived: FilmDerivedEdgeData = { source: "script-analysis", sourceKey: "scene-1" };

    assert.equal(edge.role, "character");
    assert.equal(derived.source, "script-analysis");
    void contextEdgeWithoutRole;
    assert.equal(contextConnection.kind, "context");
    assert.equal(derivedConnection.kind, "derived");
    assert.equal(filmContextRoles.includes("costume" as FilmContextRole), false);
});

test("keeps film node sizes and node specs aligned with the public enum", () => {
    assert.deepEqual(Object.keys(NODE_DEFAULT_SIZE).sort(), Object.values(CanvasNodeType).sort());
    assert.deepEqual(Object.keys(NODE_SPECS).sort(), Object.values(CanvasNodeType).sort());
    for (const type of Object.values(CanvasNodeType)) {
        assert.equal(NODE_SPECS[type].width, NODE_DEFAULT_SIZE[type].width);
        assert.equal(NODE_SPECS[type].height, NODE_DEFAULT_SIZE[type].height);
        assert.equal(NODE_SPECS[type].title, NODE_DEFAULT_SIZE[type].title);
    }
});

test("normalizes context and structural connections with the graph contract", () => {
    const nodes = [
        node("character", CanvasNodeType.FilmCharacter, { filmCharacter: { asset: {} as never } }),
        node("location", CanvasNodeType.FilmLocation, { filmLocation: { asset: {} as never } }),
        node("style", CanvasNodeType.FilmStyle, { filmStyle: { asset: {} as never } }),
        node("scene", CanvasNodeType.FilmScene),
        node("shot", CanvasNodeType.FilmShot),
        node("next-shot", CanvasNodeType.FilmShot),
    ];
    assert.deepEqual(normalizeConnection("character", "shot", nodes, "source"), {
        fromNodeId: "character",
        toNodeId: "shot",
        kind: "context",
        data: { role: "character", source: "manual" },
    });
    assert.deepEqual(normalizeConnection("location", "shot", nodes, "source"), {
        fromNodeId: "location",
        toNodeId: "shot",
        kind: "context",
        data: { role: "location", source: "manual" },
    });
    assert.deepEqual(normalizeConnection("style", "shot", nodes, "source"), {
        fromNodeId: "style",
        toNodeId: "shot",
        kind: "context",
        data: { role: "style", source: "manual" },
    });
    assert.deepEqual(normalizeConnection("scene", "shot", nodes, "source"), {
        fromNodeId: "scene",
        toNodeId: "shot",
        kind: "composition",
    });
    assert.deepEqual(normalizeConnection("shot", "next-shot", nodes, "source"), {
        fromNodeId: "shot",
        toNodeId: "next-shot",
        kind: "sequence",
    });
});

test("provides valid defaults for specialized film nodes", () => {
    const script = createCanvasNode(CanvasNodeType.FilmScript, { x: 0, y: 0 });
    const scene = createCanvasNode(CanvasNodeType.FilmScene, { x: 0, y: 0 });
    const shot = createCanvasNode(CanvasNodeType.FilmShot, { x: 0, y: 0 });
    const character = createCanvasNode(CanvasNodeType.FilmCharacter, { x: 0, y: 0 });
    const secondCharacter = createCanvasNode(CanvasNodeType.FilmCharacter, { x: 0, y: 0 });
    const location = createCanvasNode(CanvasNodeType.FilmLocation, { x: 0, y: 0 });
    const prop = createCanvasNode(CanvasNodeType.FilmProp, { x: 0, y: 0 });
    const style = createCanvasNode(CanvasNodeType.FilmStyle, { x: 0, y: 0 });
    const beat = createCanvasNode(CanvasNodeType.FilmBeat, { x: 0, y: 0 });

    assert.deepEqual(script.metadata?.filmScript, { text: "", parseSnapshots: [] });
    assert.deepEqual(scene.metadata?.filmScene, { episodeId: "", episodeTitle: "", name: "", location: "", time: "", mood: "" });
    assert.equal(shot.metadata?.filmShot?.duration, 4);
    assert.equal(character.metadata?.filmCharacter?.asset.name, "角色 1");
    assert.notEqual(character.metadata?.filmCharacter?.asset.id, secondCharacter.metadata?.filmCharacter?.asset.id);
    assert.equal(location.metadata?.filmLocation?.asset.name, "场景 1");
    assert.equal(prop.metadata?.filmProp?.asset.name, "道具 1");
    assert.equal(style.metadata?.filmStyle?.asset.name, "风格圣经 1");
    assert.equal(beat.metadata?.filmBeat?.mode, "grid9");
    assert.equal(beat.metadata?.filmBeat?.frames.length, 9);
    assert.equal(beat.metadata?.filmBeat?.status, "idle");
});

test("keeps specialized context payloads backed by library assets", () => {
    const asset = { id: "asset-1" } as FilmCharacterNodeData["asset"];
    const character: FilmCharacterNodeData = { asset };
    const location: FilmLocationNodeData = { asset };
    const prop: FilmPropNodeData = { asset };
    const style: FilmStyleNodeData = { asset };
    const beat: FilmBeatNodeData = {
        title: "动作节拍",
        mode: "grid9",
        prompt: "",
        frames: Array.from({ length: 9 }, () => ""),
        status: "idle",
        progress: 0,
    };

    assert.equal(character.asset.id, "asset-1");
    assert.equal(location.asset.id, "asset-1");
    assert.equal(prop.asset.id, "asset-1");
    assert.equal(style.asset.id, "asset-1");
    assert.equal(beat.frames.length, 9);
});
