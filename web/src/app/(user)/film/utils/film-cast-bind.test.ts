import assert from "node:assert/strict";
import test from "node:test";

import { bindFilmCast, setFilmShotCharacterBindings } from "./film-cast-bind";
import { createEmptyCharacterProfile } from "./film-character";
import type { FilmAsset, FilmEpisode, FilmShot } from "@/lib/film/types";

const asset = (id: string, name: string, aliases: string[] = []): FilmAsset => ({ id, name, aliases, description: "", visualPrompt: "", status: "idle", createdAt: "2026-01-01T00:00:00.000Z" });
const shot = (id: string, description: string, extra: Partial<FilmShot> = {}): FilmShot => ({ id, shotNo: id, shotType: "", cameraMovement: "", duration: 5, description, dialogue: "", audio: "", prompt: "", characterBindings: [], ...extra });

const episodes: FilmEpisode[] = [{
    id: "e1",
    title: "第1集",
    scenes: [{
        id: "s1",
        name: "1-1 乡村公路",
        location: "",
        time: "",
        mood: "",
        shots: [shot("shot1", "沈星晴 坐在大巴上"), shot("shot2", "空镜")],
    }],
}];

test("唯一角色姓名绑定为带快照的 AI 绑定", () => {
    const result = bindFilmCast(episodes, [asset("c1", "沈星晴"), asset("c2", "刘娜")], [asset("l1", "乡村公路")]);
    assert.equal(result.boundCharacters, 1);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].characterBindings, [{ characterId: "c1", source: "ai", characterNameSnapshot: "沈星晴", continuity: {} }]);
    assert.equal(result.episodes[0].scenes[0].shots[0].locationId, "l1");
    assert.deepEqual(result.episodes[0].scenes[0].shots[1].characterBindings, []);
    assert.equal(result.episodes[0].scenes[0].shots[1].locationId, "l1");
});

test("角色别名可以唯一绑定，短名称不抢长名称", () => {
    const input: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [shot("shot1", "小夏和夏坐在车里")] }] }];
    const result = bindFilmCast(input, [asset("c1", "夏", ["小夏"]), asset("c2", "小夏同学")], []);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].characterBindings, [{ characterId: "c1", source: "ai", characterNameSnapshot: "夏", continuity: {} }]);
});

test("同名角色保留歧义建议，不写正式绑定", () => {
    const input: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [shot("shot1", "林川走进房间")] }] }];
    const result = bindFilmCast(input, [asset("c1", "林川"), asset("c2", "林川")], []);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].characterBindings, []);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].characterSuggestions, [{ characterName: "林川" }]);
    assert.equal(result.boundCharacters, 0);
    assert.equal(result.suggestedCharacters, 1);
});

test("已绑定其中一个同名角色时不再产生歧义建议", () => {
    const manual = { characterId: "c1", source: "manual" as const, characterNameSnapshot: "林川", continuity: {} };
    const input: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [shot("shot1", "林川走进房间", { characterBindings: [manual] })] }] }];
    const result = bindFilmCast(input, [asset("c1", "林川"), asset("c2", "林川")], []);
    assert.equal(result.episodes[0].scenes[0].shots[0].characterSuggestions, undefined);
    assert.equal(result.suggestedCharacters, 0);
});

test("手动绑定保留未解决建议，绑定对应角色后消除该建议", () => {
    const base = shot("shot1", "林川和沈星晴", { characterSuggestions: [{ characterName: "林川" }, { characterName: "沈星晴" }] });
    const characters = [asset("c1", "林川"), asset("c2", "林川"), asset("c3", "沈星晴")];
    const kept = setFilmShotCharacterBindings(base, [{ characterId: "c3" }], characters);
    assert.deepEqual(kept.characterSuggestions, [{ characterName: "林川" }]);
    const resolved = setFilmShotCharacterBindings(kept, [{ characterId: "c3" }, { characterId: "c1" }], characters);
    assert.equal(resolved.characterSuggestions, undefined);
});

test("镜头级连续性字段写入绑定", () => {
    const continuity = { outfit: "湿透的外套", emotion: "克制", heldProps: ["鱼"], intentionalChange: "外套被雨淋湿" };
    const bound = setFilmShotCharacterBindings(shot("shot1", ""), [{ characterId: "c1", continuity }], [asset("c1", "沈星晴")]);
    assert.deepEqual(bound.characterBindings[0].continuity, continuity);
});

test("已有手动绑定不覆盖", () => {
    const manual = { characterId: "manual", source: "manual" as const, characterNameSnapshot: "手动角色", continuity: {} };
    const withBind: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [shot("shot1", "沈星晴出现", { characterBindings: [manual], locationId: "manual-location" })] }] }];
    const result = bindFilmCast(withBind, [asset("c1", "沈星晴")], [asset("l1", "乡村公路")]);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].characterBindings, [manual]);
    assert.equal(result.episodes[0].scenes[0].shots[0].locationId, "manual-location");
    assert.equal(result.boundCharacters, 0);
});

test("状态绑定必须属于对应角色", () => {
    const first = asset("c1", "沈星晴");
    first.character = { ...createEmptyCharacterProfile(), states: [{ id: "injured", name: "受伤", description: "", outfit: "", physicalCondition: "", heldProps: [] }] };
    const second = asset("c2", "刘娜");
    const baseShot = shot("shot1", "");
    const bound = setFilmShotCharacterBindings(baseShot, [{ characterId: "c1", stateId: "injured" }], [first, second]);
    assert.equal(bound.characterBindings[0].stateNameSnapshot, "受伤");
    assert.throws(() => setFilmShotCharacterBindings(baseShot, [{ characterId: "c2", stateId: "injured" }], [first, second]), /状态不存在或不属于该角色/);
});
