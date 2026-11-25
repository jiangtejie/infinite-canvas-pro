import assert from "node:assert/strict";
import test from "node:test";

import {
    collectScriptCharacterNames,
    createScriptCharacter,
    createScriptEpisode,
    createScriptProject,
    createScriptScene,
    normalizeScriptCharacters,
    scriptPageCount,
    scriptSceneHeading,
    scriptSceneMissingFields,
    scriptWordCount,
} from "./script-project";

test("新建剧本创建首集，场次带修订元数据", () => {
    const project = createScriptProject({ title: "测试剧本" });
    assert.equal(project.title, "测试剧本");
    assert.equal(project.format, "film");
    assert.equal(project.schemaVersion, 2);
    assert.equal(project.episodes.length, 1);
    assert.deepEqual(project.episodes[0].scenes, []);
    assert.deepEqual(project.publications, []);
    assert.equal("scenes" in project, false);

    const scene = createScriptScene(2);
    assert.equal(scene.no, 2);
    assert.equal(scene.interiorExterior, "内景");
    assert.equal(scene.timeOfDay, "日");
    assert.equal(scene.revision, 1);
    assert.ok(Number.isFinite(Date.parse(scene.updatedAt)));
    assert.equal(createScriptEpisode(3).title, "第 3 集");
});

test("场景标题与缺失字段", () => {
    const scene = { ...createScriptScene(1), location: "咖啡馆", timeOfDay: "夜" };
    assert.equal(scriptSceneHeading(scene), "内景 · 咖啡馆 · 夜");
    assert.deepEqual(scriptSceneMissingFields(scene), ["目标", "冲突", "转折", "结果"]);
    assert.equal(scriptSceneMissingFields({ ...scene, goal: "确认对方知道多少", conflict: "对方回避", turn: "她拿出照片", outcome: "阿健决定跟踪" }).length, 0);
});

test("角色名去重与跨剧集字数统计", () => {
    assert.deepEqual(normalizeScriptCharacters("阿健、老板娘 阿健"), ["阿健", "老板娘"]);
    const project = createScriptProject({ title: "统计", format: "tv" });
    project.episodes[0].scenes = [{ ...createScriptScene(1), characters: ["阿健"], content: "阿健推门进来。".repeat(10) }];
    project.episodes.push({ ...createScriptEpisode(2), scenes: [{ ...createScriptScene(1), characters: ["老板娘"] }] });
    project.characters = [createScriptCharacter()];
    project.characters[0].name = "阿健";
    assert.deepEqual(collectScriptCharacterNames(project), ["阿健", "老板娘"]);
    assert.equal(scriptWordCount(project), 70);
    assert.ok(scriptPageCount(project) >= 1);
});
