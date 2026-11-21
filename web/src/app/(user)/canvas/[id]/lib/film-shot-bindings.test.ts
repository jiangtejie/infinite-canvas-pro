import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { addFilmShotBinding, removeFilmShotBinding, updateFilmShotBinding } from "./film-shot-bindings";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id, type, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata,
});
const asset = (id: string, kind: "character" | "location" | "prop") => node(id, CanvasNodeType.FilmAsset, {
    filmAsset: { kind, asset: { id, name: id } as FilmAsset },
});
const shot = node("shot", CanvasNodeType.Shot);
const nodes = [asset("char", "character"), asset("loc", "location"), asset("prop", "prop"), shot];

test("adds character and prop bindings, rejects duplicate and second location", () => {
    const first = addFilmShotBinding(nodes, [], "shot", "char");
    assert.ok("connections" in first);
    const second = addFilmShotBinding(nodes, first.connections, "shot", "char");
    assert.ok("error" in second);
    const location = addFilmShotBinding(nodes, first.connections, "shot", "loc");
    assert.ok("connections" in location);
    const secondLocation = addFilmShotBinding(nodes, location.connections, "shot", "loc");
    assert.ok("error" in secondLocation);
    const prop = addFilmShotBinding(nodes, location.connections, "shot", "prop");
    assert.ok("connections" in prop);
    assert.equal(prop.connections.length, 3);
});

test("removes and updates binding edge data", () => {
    const added = addFilmShotBinding(nodes, [], "shot", "char");
    assert.ok("connections" in added);
    const edgeId = added.edgeId;
    const updated = updateFilmShotBinding(added.connections, edgeId, { stateId: "state-1", continuity: { emotion: "压抑" } });
    const edge = updated.find((item) => item.id === edgeId);
    assert.equal(edge?.data?.stateId, "state-1");
    assert.equal(edge?.data?.continuity?.emotion, "压抑");
    assert.equal(removeFilmShotBinding(updated, edgeId).length, 0);
});
