import assert from "node:assert/strict";
import test from "node:test";

import {
    createScriptDraft,
    createScriptProject,
    createScriptScene,
    diffScriptDraft,
    draftWords,
    exportScriptText,
    normalizeScriptCharacters,
    scriptPageCount,
    scriptSceneHeading,
    scriptSceneMissingFields,
    scriptWordCount,
} from "./script-project";

test("新建剧本有默认值与独立场景", () => {
    const project = createScriptProject({ title: "测试剧本" });
    assert.equal(project.title, "测试剧本");
    assert.equal(project.format, "film");
    assert.deepEqual(project.scenes, []);
    const scene = createScriptScene(2);
    assert.equal(scene.no, 2);
    assert.equal(scene.interiorExterior, "内景");
    assert.equal(scene.timeOfDay, "日");
});

test("场景标题与缺失字段", () => {
    const scene = { ...createScriptScene(1), location: "咖啡馆", timeOfDay: "夜" };
    assert.equal(scriptSceneHeading(scene), "内景 · 咖啡馆 · 夜");
    assert.deepEqual(scriptSceneMissingFields(scene), ["目标", "冲突", "转折", "结果"]);
    assert.equal(scriptSceneMissingFields({ ...scene, goal: "确认对方知道多少", conflict: "对方回避", turn: "她拿出照片", outcome: "阿健决定跟踪" }).length, 0);
});

test("角色名去重与字数统计", () => {
    assert.deepEqual(normalizeScriptCharacters("阿健、老板娘 阿健"), ["阿健", "老板娘"]);
    const project = createScriptProject({ title: "统计" });
    project.scenes = [{ ...createScriptScene(1), characters: ["阿健"], content: "阿健推门进来。".repeat(10) }];
    assert.ok(scriptWordCount(project) > 0);
    assert.ok(scriptPageCount(project) >= 1);
});

test("导出文本包含标题、场景标题和正文", () => {
    const project = createScriptProject({ title: "导出测试", logline: "一句话" });
    project.scenes = [{ ...createScriptScene(1), location: "街道", content: "阿健走出咖啡馆。" }];
    const text = exportScriptText(project);
    assert.match(text, /导出测试/);
    assert.match(text, /内景 · 街道 · 日/);
    assert.match(text, /阿健走出咖啡馆。/);
});
test("保存版本快照不会被后续修改污染", () => {
    const project = createScriptProject({ title: "快照隔离" });
    project.scenes = [{ ...createScriptScene(1), content: "原稿第一行" }];
    const draft = createScriptDraft(project, "v1");
    project.scenes[0].content = "改过的正文";
    project.scenes[0].characters.push("阿健");
    assert.equal(draft.scenes[0].content, "原稿第一行");
    assert.deepEqual(draft.scenes[0].characters, []);
});
test("保存版本后再修改，可以算出场次差异", () => {
    const project = createScriptProject({ title: "版本测试" });
    project.scenes = [
        { ...createScriptScene(1), location: "咖啡馆", content: "阿健推门进来。", goal: "确认对方知道多少" },
        { ...createScriptScene(2), location: "街道" },
    ];
    const draft = createScriptDraft(project, "初稿");
    assert.equal(draft.label, "初稿");
    assert.equal(draft.scenes.length, 2);
    assert.ok(draftWords(draft) > 0);

    project.scenes[0] = { ...project.scenes[0], goal: "试探老板娘", content: "阿健推门进来。\n阿健：这么晚还开着？" };
    project.scenes.push({ ...createScriptScene(3), location: "桥下" });
    project.scenes = project.scenes.filter((scene) => scene.no !== 2).map((scene, index) => ({ ...scene, no: index + 1 }));

    const diff = diffScriptDraft(project, draft);
    assert.equal(diff.added, 1);
    assert.equal(diff.removed, 1);
    assert.equal(diff.changed, 1);
    assert.ok(diff.wordDelta > 0);
    const changed = diff.scenes.find((scene) => scene.status === "changed");
    assert.ok(changed?.changedFields.includes("目标"));
    assert.ok(changed?.changedFields.includes("正文"));
});

test("人物档案变化会进入版本差异", () => {
    const project = createScriptProject({ title: "人物版本" });
    project.characters = [{ id: "c1", name: "阿健", role: "主角", want: "赢", need: "", flaw: "", arc: "", description: "" }];
    const draft = createScriptDraft(project, "v1");
    project.characters = [{ ...project.characters[0], want: "赢下最后一场", role: "主角" }];
    project.characters.push({ id: "c2", name: "老板娘", role: "", want: "", need: "", flaw: "", arc: "", description: "" });
    const diff = diffScriptDraft(project, draft);
    assert.ok(diff.characterChanges.some((change) => change.includes("新增角色：老板娘")));
    assert.ok(diff.characterChanges.some((change) => change.includes("阿健") && change.includes("目标")));
});
