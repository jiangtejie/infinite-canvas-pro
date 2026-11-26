import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { addFilmContextEdge, removeFilmContextEdge, updateFilmContextEdge } from "./film-context-edges";
import { FILM_SHOT_CONTEXT_CREATABLE_KINDS } from "./film-studio-types";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

const character = node("character-1", CanvasNodeType.FilmCharacter, {
    filmCharacter: {
        asset: {
            id: "character-asset",
            name: "林雾",
            character: { states: [{ id: "injured", name: "受伤" }] },
        } as FilmAsset,
    },
});
const location = (id: string) => node(id, CanvasNodeType.FilmLocation, {
    filmLocation: { asset: { id: `${id}-asset`, name: id } as FilmAsset },
});
const shot = node("shot-1", CanvasNodeType.FilmShot, {
    filmShot: { shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" },
});

const nodes = [character, location("location-1"), location("location-2"), shot];

test("shot context creation does not offer another project-level style node", () => {
    assert.deepEqual(FILM_SHOT_CONTEXT_CREATABLE_KINDS, ["character", "location", "prop"]);
});

test("adds a role-aware character context edge with state and source data", () => {
    const result = addFilmContextEdge(nodes, [], "character-1", "shot-1", {
        role: "character",
        stateId: "injured",
        source: "manual",
    });

    assert.ok("connections" in result);
    assert.deepEqual(result.connections.at(-1), {
        id: "character-1->shot-1",
        fromNodeId: "character-1",
        toNodeId: "shot-1",
        kind: "context",
        data: { role: "character", stateId: "injured", source: "manual" },
    });
    assert.equal(result.edgeId, "character-1->shot-1");
});

test("rejects a second location context for one shot", () => {
    const existing: CanvasConnection[] = [{
        id: "location-1->shot-1",
        fromNodeId: "location-1",
        toNodeId: "shot-1",
        kind: "context",
        data: { role: "location", source: "manual" },
    }];

    assert.deepEqual(addFilmContextEdge(nodes, existing, "location-2", "shot-1", {
        role: "location",
        source: "manual",
    }), { error: "每个镜头只能引用一个场景" });
});

test("rejects a role that does not match the specialized context node", () => {
    assert.deepEqual(addFilmContextEdge(nodes, [], "character-1", "shot-1", {
        role: "location",
        source: "manual",
    }), { error: "上下文角色与节点类型不匹配" });
});

test("rejects invalid source and target endpoints before creating an edge", () => {
    assert.deepEqual(addFilmContextEdge(nodes, [], "missing", "shot-1", {
        role: "character",
        source: "manual",
    }), { error: "该节点不能作为镜头上下文" });
    assert.deepEqual(addFilmContextEdge([...nodes, node("script", CanvasNodeType.FilmScript)], [], "script", "shot-1", {
        role: "character",
        source: "manual",
    }), { error: "该节点不能作为镜头上下文" });
    assert.deepEqual(addFilmContextEdge(nodes, [], "character-1", "missing-shot", {
        role: "character",
        source: "manual",
    }), { error: "上下文目标必须是镜头节点" });
    assert.deepEqual(addFilmContextEdge(nodes, [], "character-1", "location-1", {
        role: "character",
        source: "manual",
    }), { error: "上下文目标必须是镜头节点" });
});

test("accepts an AI context edge by switching its source to manual", () => {
    const ai: CanvasConnection[] = [{
        id: "character-1->shot-1",
        fromNodeId: "character-1",
        toNodeId: "shot-1",
        kind: "context",
        data: { role: "character", source: "ai" },
    }];
    const accepted = updateFilmContextEdge(ai, "character-1->shot-1", { source: "manual" });
    assert.deepEqual(accepted[0].kind === "context" ? accepted[0].data : null, { role: "character", source: "manual" });
});

test("updates and removes only context edges while preserving other edge kinds", () => {
    const original: CanvasConnection[] = [
        {
            id: "character-1->shot-1",
            fromNodeId: "character-1",
            toNodeId: "shot-1",
            kind: "context",
            data: { role: "character", source: "manual" },
        },
        { id: "script->shot-1", fromNodeId: "script", toNodeId: "shot-1", kind: "derived", data: { source: "script-analysis" } },
    ];
    const updated = updateFilmContextEdge(original, "character-1->shot-1", {
        stateId: "injured",
        continuity: { emotion: "压抑" },
    });

    assert.deepEqual(updated[0], {
        ...original[0],
        data: { role: "character", source: "manual", stateId: "injured", continuity: { emotion: "压抑" } },
    });
    assert.deepEqual(updated[1], original[1]);
    assert.deepEqual(removeFilmContextEdge(updated, "character-1->shot-1"), [original[1]]);
    assert.deepEqual(removeFilmContextEdge(updated, "script->shot-1"), updated);
    assert.deepEqual(original[0].kind === "context" ? original[0].data : null, { role: "character", source: "manual" });
});
