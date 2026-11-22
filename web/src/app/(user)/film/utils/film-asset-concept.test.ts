import assert from "node:assert/strict";
import test from "node:test";

import { createFilmAsset } from "./film-edits";
import { buildFilmAssetConceptPrompt } from "./film-asset-concept";

const asset = (kind: "location" | "prop" | "costume" | "style", patch: Record<string, unknown> = {}) => ({
    ...createFilmAsset(kind, 1),
    name: "旧城咖啡馆",
    description: "老式咖啡馆，木桌与暖黄灯",
    visualPrompt: "深色木饰面，雨夜玻璃反光",
    ...patch,
});

test("location concept prompt carries setting, style and no-person framing", () => {
    const style = { ...createFilmAsset("style", 1), name: "冷灰电影感", visualPrompt: "低饱和冷灰与暖黄点缀" };
    const prompt = buildFilmAssetConceptPrompt("location", asset("location"), style);
    assert.ok(prompt.prompt.includes("广角建立镜头"));
    assert.ok(prompt.prompt.includes("深色木饰面"));
    assert.ok(prompt.prompt.includes("视觉风格：冷灰电影感"));
    assert.ok(prompt.prompt.includes("低饱和冷灰"));
    assert.ok(prompt.prompt.includes("无人物"));
    assert.equal(prompt.size, "1536x1024");
    assert.equal(prompt.label, "场景概念图");
});

test("prop and costume prompts use their own layout guidance", () => {
    const prop = buildFilmAssetConceptPrompt("prop", asset("prop", { name: "旧怀表" }));
    assert.ok(prop.prompt.includes("道具设定图"));
    assert.ok(prop.prompt.includes("正面、侧面与关键细节"));
    assert.equal(prop.size, "1024x1024");

    const costume = buildFilmAssetConceptPrompt("costume", asset("costume", { name: "红围巾" }));
    assert.ok(costume.prompt.includes("服装设定图"));
    assert.ok(costume.prompt.includes("人台或平铺"));
    assert.ok(costume.prompt.includes("面料"));
    assert.equal(costume.label, "服装概念图");
});

test("style prompt stays abstract and tolerates missing copy", () => {
    const prompt = buildFilmAssetConceptPrompt("style", asset("style", { name: "", description: "", visualPrompt: "" }));
    assert.ok(prompt.prompt.includes("电影视觉风格参考板"));
    assert.ok(prompt.prompt.includes("抽象场景"));
    assert.ok(prompt.prompt.includes("未命名资产"));
    assert.ok(!prompt.prompt.includes("undefined"));
});
