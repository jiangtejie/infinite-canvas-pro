import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import type { FilmAnalysisSessionDraft } from "../../types";
import { applyFilmAnalysisDraftCommand } from "./film-analysis-draft";

const draft = (): FilmAnalysisSessionDraft => ({
    episodes: [{
        id: "ep-1",
        title: "第1集",
        scenes: [
            {
                id: "scene-1",
                name: "1-1 咖啡馆",
                location: "咖啡馆",
                time: "日",
                mood: "平静",
                shots: [
                    { id: "s1", shotNo: "01", shotType: "中景", cameraMovement: "固定", duration: 4, description: "沈迟推门。外面在下雨。", dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [] },
                    { id: "s2", shotNo: "02", shotType: "近景", cameraMovement: "推进", duration: 6, description: "阿青抬头。", dialogue: "你来了。", audio: "", prompt: "", characterBindings: [], propBindings: [] },
                ],
            },
            {
                id: "scene-2",
                name: "1-2 仓库",
                location: "仓库",
                time: "夜",
                mood: "紧张",
                shots: [{ id: "s3", shotNo: "01", shotType: "全景", cameraMovement: "固定", duration: 5, description: "仓库空镜。", dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [] }],
            },
        ],
    }],
    suggestions: [
        { key: "character:沈迟", kind: "character", name: "沈迟", aliases: ["老沈"], description: "", visualPrompt: "" },
        { key: "character:阿青", kind: "character", name: "阿青", aliases: [], description: "短发", visualPrompt: "" },
    ],
});

test("edits only the target scene or shot and keeps the rest unchanged", () => {
    const before = draft();
    const sceneEdited = applyFilmAnalysisDraftCommand(before, { type: "scene", sceneKey: "0:0", patch: { name: "1-1 雨夜咖啡馆", mood: "压抑" } });
    assert.equal(sceneEdited.episodes[0].scenes[0].name, "1-1 雨夜咖啡馆");
    assert.equal(sceneEdited.episodes[0].scenes[0].mood, "压抑");
    assert.deepEqual(sceneEdited.episodes[0].scenes[1], before.episodes[0].scenes[1]);
    const shotEdited = applyFilmAnalysisDraftCommand(sceneEdited, { type: "shot", sceneKey: "0:0", index: 1, patch: { shotType: "特写", duration: 3, dialogue: "你终于来了。" } });
    assert.equal(shotEdited.episodes[0].scenes[0].shots[1].shotType, "特写");
    assert.equal(shotEdited.episodes[0].scenes[0].shots[0].description, "沈迟推门。外面在下雨。");
    assert.equal(before.episodes[0].scenes[0].shots[0].description, "沈迟推门。外面在下雨。");
});

test("adds, removes and reorders shots inside a scene", () => {
    let next = applyFilmAnalysisDraftCommand(draft(), { type: "add-shot", sceneKey: "0:0" });
    assert.equal(next.episodes[0].scenes[0].shots.length, 3);
    next = applyFilmAnalysisDraftCommand(next, { type: "move-shot", sceneKey: "0:0", index: 2, direction: -1 });
    assert.equal(next.episodes[0].scenes[0].shots[1].shotNo, "03");
    next = applyFilmAnalysisDraftCommand(next, { type: "remove-shot", sceneKey: "0:0", index: 1 });
    assert.deepEqual(next.episodes[0].scenes[0].shots.map((shot) => shot.shotNo), ["01", "02"]);
});

test("merges adjacent shots and splits one back into two", () => {
    const merged = applyFilmAnalysisDraftCommand(draft(), { type: "merge-shot", sceneKey: "0:0", index: 0 });
    const shots = merged.episodes[0].scenes[0].shots;
    assert.equal(shots.length, 1);
    assert.equal(shots[0].duration, 10);
    assert.ok(shots[0].description.includes("阿青抬头"));
    assert.ok(shots[0].dialogue.includes("你来了"));

    const split = applyFilmAnalysisDraftCommand(draft(), { type: "split-shot", sceneKey: "0:0", index: 0 });
    const splitShots = split.episodes[0].scenes[0].shots;
    assert.equal(splitShots.length, 3);
    assert.equal(splitShots[0].duration + splitShots[1].duration, 4);
    assert.ok(splitShots[0].description.length > 0);
    assert.ok(splitShots[1].description.length > 0);
});

test("edits asset names, kinds, aliases and merge choices", () => {
    const renamed = applyFilmAnalysisDraftCommand(draft(), { type: "asset", key: "character:沈迟", patch: { name: "沈迟（男主）", kind: "prop", aliases: ["老沈", "迟哥"], forceNew: true } });
    const item = renamed.suggestions.find((suggestion) => suggestion.key === "character:沈迟")!;
    assert.equal(item.name, "沈迟（男主）");
    assert.equal(item.kind, "prop");
    assert.deepEqual(item.aliases, ["老沈", "迟哥"]);
    assert.equal(item.forceNew, true);
});

test("merging two assets removes the duplicate and accumulates aliases", () => {
    const merged = applyFilmAnalysisDraftCommand(draft(), { type: "merge-asset", sourceKey: "character:阿青", targetKey: "character:沈迟" });
    assert.equal(merged.suggestions.length, 1);
    const target = merged.suggestions[0];
    assert.equal(target.key, "character:沈迟");
    assert.ok(target.aliases.includes("阿青"));
    assert.equal(target.visualPrompt, "");
    assert.ok((merged.suggestions as FilmAssetSuggestion[]).every((suggestion) => suggestion.name !== "阿青"));
});
