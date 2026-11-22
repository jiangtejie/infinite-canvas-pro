import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { appendFilmShot } from "./film-shot-create";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 100, y: 200 },
    width: 300,
    height: 200,
    metadata,
});

const shot = (id: string) => node(id, CanvasNodeType.Shot, { filmShot: { shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });

test("appends a shot to a scene with composition and sequence edges", () => {
    const scene = node("scene", CanvasNodeType.Scene, { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: "场景 1", location: "", time: "", mood: "" } });
    const existing = shot("shot-a");
    const connections: CanvasConnection[] = [{ id: "c", fromNodeId: "scene", toNodeId: "shot-a", kind: "composition" }];
    const result = appendFilmShot([scene, existing], connections, "scene", { nodeId: "shot-b" });
    assert.ok(result);
    const created = result.nodes.find((item) => item.id === "shot-b");
    assert.equal(created?.metadata?.filmShot?.shotNo, "02");
    assert.deepEqual(
        result.connections.slice(-2).map((edge) => ({ from: edge.fromNodeId, to: edge.toNodeId, kind: edge.kind })),
        [
            { from: "scene", to: "shot-b", kind: "composition" },
            { from: "shot-a", to: "shot-b", kind: "sequence" },
        ],
    );
});

test("inserts a new shot after the scene's last shot in the global chain", () => {
    const scene = (id: string) => node(id, CanvasNodeType.Scene, { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: id, location: "", time: "", mood: "" } });
    const a1 = shot("a1");
    const b1 = shot("b1");
    const connections: CanvasConnection[] = [
        { id: "a1-comp", fromNodeId: "scene-a", toNodeId: "a1", kind: "composition" },
        { id: "b1-comp", fromNodeId: "scene-b", toNodeId: "b1", kind: "composition" },
        { id: "a1->b1", fromNodeId: "a1", toNodeId: "b1", kind: "sequence" },
    ];
    const result = appendFilmShot([scene("scene-a"), scene("scene-b"), a1, b1], connections, "scene-a", { nodeId: "a2" });
    assert.ok(result);
    assert.deepEqual(
        result.connections.filter((edge) => edge.kind === "sequence").map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`),
        ["a1->a2", "a2->b1"],
    );
});

test("creates the first shot without a sequence edge and rejects a missing scene", () => {
    const scene = node("scene", CanvasNodeType.Scene, { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: "场景 1", location: "", time: "", mood: "" } });
    const result = appendFilmShot([scene], [], "scene", { nodeId: "shot-a" });
    assert.ok(result);
    assert.equal(result.nodes.find((item) => item.id === "shot-a")?.metadata?.filmShot?.shotNo, "01");
    assert.equal(result.connections.length, 1);
    assert.equal(appendFilmShot([scene], [], "missing"), null);
});
