import assert from "node:assert/strict";
import test from "node:test";

import { buildFilmPlanFromDraft } from "./script-handoff";
import { createScriptDraft, createScriptProject, createScriptScene } from "./script-project";

test("锁定稿转影视分镜时生成剧集与镜头", () => {
    const project = createScriptProject({ title: "转分镜测试" });
    project.scenes = [
        { ...createScriptScene(1), interiorExterior: "内景", location: "咖啡馆", timeOfDay: "日", content: "阿健推门进来。\n\n阿健：这么晚还开着？" },
        { ...createScriptScene(2), interiorExterior: "外景", location: "街道", timeOfDay: "夜", content: "阿健走出咖啡馆。" },
    ];
    const plan = buildFilmPlanFromDraft(createScriptDraft(project, "锁定稿"));
    assert.match(plan.scriptText, /内景 咖啡馆 日/);
    assert.match(plan.scriptText, /阿健：这么晚还开着？/);
    assert.ok(plan.episodes.length >= 1);
    const shots = plan.episodes.reduce((total, episode) => total + episode.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.shots.length, 0), 0);
    assert.ok(shots >= 2);
    assert.equal(plan.document.schemaVersion, 1);
});
