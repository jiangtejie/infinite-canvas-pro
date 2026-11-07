import assert from "node:assert/strict";
import test from "node:test";

import { selectFilmBatchShots } from "./film-batch";
import type { FilmShot } from "@/lib/film/types";

const shot = (id: string, overrides: Partial<FilmShot> = {}): FilmShot => ({
    id,
    shotNo: id,
    shotType: "MS",
    cameraMovement: "",
    duration: 4,
    description: `画面 ${id}`,
    dialogue: "",
    audio: "",
    prompt: "",
    ...overrides,
});

test("过滤没有描述的镜头", () => {
    const result = selectFilmBatchShots([shot("a"), shot("b", { description: "" })]);
    assert.deepEqual(result.map((item) => item.id), ["a"]);
});

test("跳过已有分镜图并保持锚点最前", () => {
    const shots = [shot("a", { imageUrl: "a.png" }), shot("b"), shot("c"), shot("d", { imageUrl: "d.png" })];
    const result = selectFilmBatchShots(shots, { anchorShotId: "c", skipExisting: true });
    assert.deepEqual(result.map((item) => item.id), ["c", "b"]);
});

test("不跳过时锚点镜头仍然排最前", () => {
    const result = selectFilmBatchShots([shot("a"), shot("b"), shot("c")], { anchorShotId: "b" });
    assert.deepEqual(result.map((item) => item.id), ["b", "a", "c"]);
});
