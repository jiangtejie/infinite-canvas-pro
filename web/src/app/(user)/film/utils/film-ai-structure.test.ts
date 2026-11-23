import assert from "node:assert/strict";
import test from "node:test";

import type { FilmStructurePlan } from "@/lib/film/types";
import { structurePlanPromptContext } from "./film-ai-structure";

const plan: FilmStructurePlan = {
    scriptHash: "hash",
    createdAt: "2026-11-22T00:00:00.000Z",
    scenes: [{
        episodeTitle: "第 1 集",
        sceneNo: 1,
        sceneName: "天台",
        purpose: "建立危机",
        beats: [{ type: "转折", summary: "雨停" }],
        coverage: ["建立镜头"],
        characters: ["沈迟"],
        estimatedDuration: 30,
    }],
};

test("structurePlanPromptContext outputs scenes, beats and coverage", () => {
    const context = JSON.parse(structurePlanPromptContext(plan));
    assert.deepEqual(context, [{
        episode: "第 1 集",
        scene: "天台",
        purpose: "建立危机",
        beats: ["雨停"],
        coverage: ["建立镜头"],
        duration: 30,
    }]);
    assert.equal(structurePlanPromptContext(undefined), "");
    assert.equal(structurePlanPromptContext({ ...plan, scenes: [] }), "");
});
