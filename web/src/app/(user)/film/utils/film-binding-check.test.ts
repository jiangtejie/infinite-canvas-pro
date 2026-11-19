import assert from "node:assert/strict";
import test from "node:test";

import { checkFilmBindingIssues } from "./film-binding-check";
import type { FilmAsset, FilmEpisode } from "@/lib/film/types";
import { createEmptyCharacterProfile } from "./film-character";

const asset = (id: string, name: string): FilmAsset => ({ id, name, aliases: [], description: "", visualPrompt: "", status: "idle", concept: { images: [], locked: false }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
const shot = (id: string, description: string, extra: Partial<FilmEpisode["scenes"][number]["shots"][number]> = {}) => ({ id, shotNo: id, shotType: "", cameraMovement: "", duration: 5, description, dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [], ...extra });

const episodes: FilmEpisode[] = [{
    id: "e1", title: "第1集", scenes: [{
        id: "s1", name: "1-1 海边", location: "", time: "", mood: "",
        shots: [shot("01", "沈星晴在海边", { locationId: "l1" }), shot("02", "空镜", { locationId: "l2" })],
    }],
}];

test("发现同场引用不同场景", () => {
    const issues = checkFilmBindingIssues(episodes, [], [asset("l1", "海边"), asset("l2", "学校")]);
    assert.ok(issues.some((issue) => issue.message.includes("同场镜头引用了不同场景")));
});

test("发现角色被提及但未绑定", () => {
    const issues = checkFilmBindingIssues(episodes, [asset("c1", "沈星晴")], []);
    assert.ok(issues.some((issue) => issue.message.includes("提到「沈星晴」但未绑定角色")));
});

test("场名与引用场景不一致时提示", () => {
    const issues = checkFilmBindingIssues(episodes, [], [asset("l1", "海边")]);
    assert.ok(issues.some((issue) => issue.message.includes("与场名「海边」不一致")));
});

test("角色别名已绑定时不重复提示未绑定", () => {
    const character = { ...asset("c1", "沈星晴"), aliases: ["小夏"] };
    const bound: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [shot("01", "小夏走进房间", { characterBindings: [{ characterId: "c1", source: "manual", characterNameSnapshot: "沈星晴", continuity: {} }] })] }] }];
    assert.deepEqual(checkFilmBindingIssues(bound, [character], []), []);
});

test("绑定角色已删除时提示待修复", () => {
    const bound: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [shot("01", "空镜", { characterBindings: [{ characterId: "missing", source: "manual", characterNameSnapshot: "沈星晴", continuity: {} }] })] }] }];
    const issues = checkFilmBindingIssues(bound, [asset("c1", "沈星晴")], []);
    assert.ok(issues.some((issue) => issue.message.includes("角色「沈星晴」已删除")));
});

test("绑定状态已删除时提示待修复", () => {
    const character = { ...asset("c1", "沈星晴"), character: { ...createEmptyCharacterProfile(), states: [] } };
    const bound: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [shot("01", "空镜", { characterBindings: [{ characterId: "c1", stateId: "injured", source: "manual", characterNameSnapshot: "沈星晴", stateNameSnapshot: "受伤", continuity: {} }] })] }] }];
    const issues = checkFilmBindingIssues(bound, [character], []);
    assert.ok(issues.some((issue) => issue.message.includes("状态「受伤」已失效")));
});

test("没有问题时返回空数组", () => {
    const clean: FilmEpisode[] = [{ id: "e1", title: "第1集", scenes: [{ id: "s1", name: "1-1 海边", location: "", time: "", mood: "", shots: [shot("01", "空镜")] }] }];
    assert.deepEqual(checkFilmBindingIssues(clean, [], []), []);
});
