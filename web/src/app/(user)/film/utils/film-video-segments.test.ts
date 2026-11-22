import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultSegments, mergeVideoSegmentWithPrevious, removeVideoSegment, splitVideoSegment, validateSegments } from "./film-video-segments";
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
