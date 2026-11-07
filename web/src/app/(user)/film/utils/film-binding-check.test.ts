import assert from "node:assert/strict";
import test from "node:test";

import { checkFilmBindingIssues } from "./film-binding-check";
import type { FilmAsset, FilmEpisode } from "@/lib/film/types";

const asset = (id: string, name: string): FilmAsset => ({ id, name, description: "", visualPrompt: "", status: "idle", createdAt: "2026-01-01T00:00:00.000Z" });
const shot = (id: string, description: string, extra: Partial<FilmEpisode["scenes"][number]["shots"][number]> = {}) => ({ id, shotNo: id, shotType: "", cameraMovement: "", duration: 5, description, dialogue: "", audio: "", prompt: "", ...extra });

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

test("没有问题时返回空数组", () => {
    const clean: FilmEpisode[] = [{ id: "e1", title: "第1集", scenes: [{ id: "s1", name: "1-1 海边", location: "", time: "", mood: "", shots: [shot("01", "空镜")] }] }];
    assert.deepEqual(checkFilmBindingIssues(clean, [], []), []);
});
