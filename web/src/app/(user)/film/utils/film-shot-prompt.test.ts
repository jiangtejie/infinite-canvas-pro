import assert from "node:assert/strict";
import test from "node:test";

import type { FilmShot } from "@/lib/film/types";
import { buildFilmShotPrompt, buildFilmShotPromptSpec } from "./film-shot-prompt";

const shot = (overrides: Partial<FilmShot> = {}): FilmShot => ({
    id: "s1",
    shotNo: "01",
    shotType: "MS",
    cameraMovement: "缓慢推进",
    duration: 5,
    description: "阿青回头",
    dialogue: "别走",
    audio: "雨声参考",
    prompt: "保持电影感",
    negativePrompt: "低清晰度",
    coverage: "建立",
    composition: "三分法",
    lighting: "侧逆光",
    colorTone: "低饱和冷调",
    lens: "35mm",
    transition: "叠化",
    performance: { objective: "确认来人", emotion: "警惕", subtext: "别靠近", bodyLanguage: "肩背绷紧", intensity: 4 },
    soundDesign: { ambience: "雨声", sfx: "衣料摩擦", music: "低音持续", dialogueTone: "低声" },
    characterBindings: [],
    propBindings: [],
    ...overrides,
});

const baseInput = () => ({
    shot: shot(),
    scene: { episodeTitle: "第 1 集", name: "天台", location: "楼顶", time: "夜", mood: "压抑", notes: "湿冷" },
    characters: ["角色 阿青：黑色风衣"],
    location: "场景：天台",
    continuity: "承接上一镜：左后方机位",
    style: "电影级 CG",
    previousInstruction: "参考上一镜保持机位",
    videoSegments: [{ id: "seg", start: 0, end: 5, prompt: "缓慢回头" }],
});

test("图片提示词拆解场景、镜头语言、表演、声音与结构", () => {
    const prompt = buildFilmShotPrompt({ ...baseInput(), medium: "image" });
    for (const expected of ["【场景】", "地点：楼顶", "【角色与场景】", "【主体与动作】", "【镜头语言】", "构图：三分法", "光线：侧逆光", "色彩：低饱和冷调", "焦段：35mm", "【表演】", "情绪：警惕", "【声音氛围】", "环境声：雨声", "【叙事作用】", "覆盖：建立", "【连续性】", "【视觉风格】", "【创作补充】", "保持电影感", "【避免】", "低清晰度"]) {
        assert.ok(prompt.includes(expected), `missing ${expected}`);
    }
    assert.ok(prompt.includes("潜台词：别靠近"));
    assert.ok(!prompt.includes("台词：别走"));
    assert.ok(!prompt.includes("时间节拍"));
    assert.equal(prompt.match(/【镜头语言】/g)?.length, 1);
});

test("视频提示词额外包含台词、时间段与视频约束", () => {
    const prompt = buildFilmShotPrompt({ ...baseInput(), medium: "video", videoMode: "reference" });
    assert.ok(prompt.includes("【声音】"));
    assert.ok(prompt.includes("台词：别走"));
    assert.ok(prompt.includes("台词语气：低声"));
    assert.ok(prompt.includes("【时间节拍】"));
    assert.ok(prompt.includes("0-5s：缓慢回头"));
    assert.ok(prompt.includes("【视频约束】"));
    assert.ok(prompt.includes("避免"));
    assert.ok(prompt.includes("画面跳变"));
});

test("Spec 保留结构化分区，覆盖与转场不会丢失", () => {
    const spec = buildFilmShotPromptSpec({ ...baseInput(), medium: "image" });
    assert.deepEqual(spec.sections.map((section) => section.key), ["scene", "characters", "subject", "camera", "performance", "coverage", "sound", "continuity", "style", "direction", "references"]);
    assert.ok(spec.sections.find((section) => section.key === "camera")?.lines[0].includes("转场：叠化"));
    assert.deepEqual(spec.negative, ["低清晰度"]);
});
