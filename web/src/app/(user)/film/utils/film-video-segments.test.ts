import assert from "node:assert/strict";
import test from "node:test";

import { composeFilmVideoPrompt, createDefaultSegments, mergeVideoSegmentWithPrevious, removeVideoSegment, splitVideoSegment, validateSegments } from "./film-video-segments";
import type { FilmVideoSegment } from "@/lib/film/types";

const segment = (id: string, start: number, end: number, prompt = ""): FilmVideoSegment => ({ id, start, end, prompt });

test("默认分段覆盖完整时长", () => {
    const [only] = createDefaultSegments(5);
    assert.equal(only.start, 0);
    assert.equal(only.end, 5);
    assert.equal(validateSegments([only], 5), null);
});

test("校验空隙、起点与结束时间", () => {
    assert.match(validateSegments([segment("a", 1, 3)], 3) || "", /从 0 秒开始/);
    assert.match(validateSegments([segment("a", 0, 2)], 3) || "", /结束在镜头时长/);
    assert.match(validateSegments([segment("a", 0, 1), segment("b", 2, 3)], 3) || "", /空隙或重叠/);
    assert.match(validateSegments([segment("a", 0, 0)], 0) || "", /结束时间必须大于开始时间/);
});

test("拆分、合并与删除分段", () => {
    const segments = [segment("a", 0, 4, "抬头")];
    const split = splitVideoSegment(segments, "a");
    assert.equal(split.length, 2);
    assert.deepEqual(split.map((item) => [item.start, item.end]), [[0, 2], [2, 4]]);
    const merged = mergeVideoSegmentWithPrevious([segment("a", 0, 2, "抬头"), segment("b", 2, 4, "转身")], "b");
    assert.equal(merged.length, 1);
    assert.equal(merged[0].prompt, "抬头；转身");
    const removed = removeVideoSegment([segment("a", 0, 2), segment("b", 2, 3), segment("c", 3, 5)], "b");
    assert.deepEqual(removed.map((item) => [item.start, item.end]), [[0, 3], [3, 5]]);
    const removedFirst = removeVideoSegment([segment("a", 0, 2), segment("b", 2, 5)], "a");
    assert.deepEqual(removedFirst.map((item) => [item.start, item.end]), [[0, 5]]);
});

test("拼装视频提示词包含时间段与禁止项", () => {
    const prompt = composeFilmVideoPrompt({
        segments: [segment("a", 0, 2, "人物缓慢转头"), segment("b", 2, 5, "镜头推进")],
        shotTypeLabel: "近景",
        cameraMovement: "缓慢推进",
        description: "雨夜的海边",
        styleText: "暗黑写实风格",
        performance: { objective: "留住对方", emotion: "克制", subtext: "别走", bodyLanguage: "手指收紧", intensity: 4 },
        soundDesign: { ambience: "雨声", sfx: "伞骨合拢", music: "", dialogueTone: "压低" },
        mode: "reference",
    });
    assert.ok(prompt.includes("0-2s：人物缓慢转头"));
    assert.ok(prompt.includes("2-5s：镜头推进"));
    assert.ok(prompt.includes("暗黑写实风格"));
    assert.ok(prompt.includes("表演："));
    assert.ok(prompt.includes("目标 留住对方"));
    assert.ok(prompt.includes("声音意图："));
    assert.ok(prompt.includes("环境声 雨声"));
    assert.ok(prompt.includes("避免画面跳变"));
});

test("首尾帧模式强调保持首帧", () => {
    const prompt = composeFilmVideoPrompt({
        segments: [segment("a", 0, 3, "人物起身")],
        shotTypeLabel: "全景",
        cameraMovement: "固定",
        description: "海边",
        mode: "frames",
        hasFirstFrame: true,
    });
    assert.ok(prompt.includes("保持首帧"));
});
