import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeStatus, type FilmShotNodeData } from "../../types";
import { planFilmShotBatch } from "./film-batch-preflight";

const shotNode = (id: string, patch: Partial<FilmShotNodeData> = {}, status: CanvasNodeStatus = "idle"): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Shot,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        status,
        filmShot: { shotNo: id, shotType: "中景", cameraMovement: "推近", duration: 4, description: `${id} 描述`, dialogue: "", audio: "", prompt: `${id} 提示词`, ...patch },
    },
});
const assetNode = (id: string, asset: FilmAsset): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmAsset,
    title: asset.name,
    position: { x: 0, y: 0 },
    width: 200,
    height: 200,
    metadata: { filmAsset: { kind: "character", asset } },
});

test("plans selected shots in the global chain order and dedupes ids", () => {
    const a1 = shotNode("a1");
    const a2 = shotNode("a2");
    const b1 = shotNode("b1");
    const chain: CanvasConnection[] = [
        { id: "a1->b1", fromNodeId: "a1", toNodeId: "b1", kind: "sequence" },
        { id: "b1->a2", fromNodeId: "b1", toNodeId: "a2", kind: "sequence" },
    ];
    const plan = planFilmShotBatch([a1, a2, b1], chain, ["a2", "a1", "b1", "a1"], "image", { maxReferences: 10 });
    assert.deepEqual(plan.ready.map((item) => item.shotId), ["a1", "b1", "a2"]);
    assert.equal(plan.skipped.length, 0);
});

test("reports missing text, busy shots and frames without a first frame", () => {
    const empty = shotNode("empty", { description: "", prompt: "" });
    const busy = shotNode("busy", {}, "loading");
    const frames = shotNode("frames", { videoMode: "frames" });
    const plan = planFilmShotBatch([empty, busy, frames, shotNode("ready")], [], ["empty", "busy", "frames", "ready"], "video", { maxReferences: 10 });
    assert.deepEqual(plan.ready.map((item) => item.shotId), ["ready"]);
    assert.deepEqual(plan.skipped.map((item) => item.reason).sort(), ["busy", "frames-missing-first", "no-text"]);
});

test("records compiler warnings without blocking the shot", () => {
    const character = { ...createFilmAsset("character", 1), name: "沈迟", visualPrompt: "深色风衣" };
    const shot = shotNode("warned");
    const connections: CanvasConnection[] = [{ id: "bind", fromNodeId: "char", toNodeId: shot.id, kind: "binding", data: { source: "manual" } }];
    const plan = planFilmShotBatch([assetNode("char", character), shot], connections, [shot.id], "image", { maxReferences: 10 });
    assert.deepEqual(plan.ready.map((item) => item.shotId), [shot.id]);
    assert.equal(plan.warningShots.length, 1);
    assert.ok(plan.warningShots[0].warnings.some((warning) => warning.includes("参考板")));
    assert.equal(plan.warnings, plan.warningShots[0].warnings.length);
});

test("turns compiler failures into skipped shots with the compiler message", () => {
    const character = { ...createFilmAsset("character", 1), name: "沈迟", visualPrompt: "深色风衣" };
    character.character = {
        ...character.character!,
        board: { images: [{ id: "board", url: "https://example.com/board.png", createdAt: "2026-11-22T00:00:00.000Z" }], locked: false },
    };
    const shot = shotNode("too-many");
    const connections: CanvasConnection[] = [{ id: "bind", fromNodeId: "char", toNodeId: shot.id, kind: "binding", data: { source: "manual" } }];
    const plan = planFilmShotBatch([assetNode("char", character), shot], connections, [shot.id], "image", { maxReferences: 0 });
    assert.equal(plan.ready.length, 0);
    assert.equal(plan.skipped[0]?.reason, "compile-error");
    assert.ok(plan.skipped[0]?.message.includes("超出参考图上限"));
});

test("reports missing shot ids instead of silently dropping them", () => {
    const plan = planFilmShotBatch([shotNode("ready")], [], ["ready", "missing"], "image", { maxReferences: 10 });
    assert.deepEqual(plan.ready.map((item) => item.shotId), ["ready"]);
    assert.equal(plan.skipped[0]?.reason, "missing-shot");
});
