import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { addFilmContextEdge, removeFilmContextEdge, updateFilmContextEdge } from "./film-context-edges";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id, type, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata,
});
const asset = (id: string, kind: "character" | "location" | "prop") => {
    const payload = { asset: { id, name: id } as FilmAsset };
    if (kind === "character") return node(id, CanvasNodeType.FilmCharacter, { filmCharacter: payload });
    if (kind === "location") return node(id, CanvasNodeType.FilmLocation, { filmLocation: payload });
    return node(id, CanvasNodeType.FilmProp, { filmProp: payload });
};
const shot = node("shot", CanvasNodeType.FilmShot);
const nodes = [asset("char", "character"), asset("loc", "location"), asset("prop", "prop"), shot];

test("adds character and prop context edges, rejects duplicate and second location", () => {
    const first = addFilmContextEdge(nodes, [], "char", "shot", { role: "character", source: "manual" });
    assert.ok("connections" in first);
    assert.equal(first.connections[0].kind, "context");
    const second = addFilmContextEdge(nodes, first.connections, "char", "shot", { role: "character", source: "manual" });
    assert.ok("error" in second);
    const location = addFilmContextEdge(nodes, first.connections, "loc", "shot", { role: "location", source: "manual" });
    assert.ok("connections" in location);
    const secondLocation = addFilmContextEdge(nodes, location.connections, "loc", "shot", { role: "location", source: "manual" });
    assert.ok("error" in secondLocation);
    const prop = addFilmContextEdge(nodes, location.connections, "prop", "shot", { role: "prop", source: "manual" });
    assert.ok("connections" in prop);
    assert.equal(prop.connections.length, 3);
});

test("removes and updates binding edge data", () => {
    const added = addFilmContextEdge(nodes, [], "char", "shot", { role: "character", source: "manual" });
    assert.ok("connections" in added);
    const edgeId = added.edgeId;
    const updated = updateFilmContextEdge(added.connections, edgeId, { stateId: "state-1", continuity: { emotion: "压抑" } });
    const edge = updated.find((item) => item.id === edgeId);
    assert.ok(edge?.kind === "context");
    assert.equal(edge?.data.stateId, "state-1");
    assert.equal(edge?.data.continuity?.emotion, "压抑");
    assert.equal(removeFilmContextEdge(updated, edgeId).length, 0);
});
