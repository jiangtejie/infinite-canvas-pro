import assert from "node:assert/strict";
import test from "node:test";

import { bindFilmCast, setFilmShotCharacterBindings } from "./film-cast-bind";
import { createEmptyCharacterProfile } from "./film-character";
import type { FilmAsset, FilmEpisode, FilmShot } from "@/lib/film/types";

const asset = (id: string, name: string, aliases: string[] = []): FilmAsset => ({ id, name, aliases, description: "", visualPrompt: "", status: "idle", concept: { images: [], locked: false }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
const shot = (id: string, description: string, extra: Partial<FilmShot> = {}): FilmShot => ({ id, shotNo: id, shotType: "", cameraMovement: "", duration: 5, description, dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [], ...extra });

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
    first.character = { ...createEmptyCharacterProfile(), states: [{ id: "injured", name: "受伤", description: "", condition: "", heldPropIds: [], look: { images: [], locked: false } }] };
    const second = asset("c2", "刘娜");
    const baseShot = shot("shot1", "");
    const bound = setFilmShotCharacterBindings(baseShot, [{ characterId: "c1", stateId: "injured" }], [first, second]);
    assert.equal(bound.characterBindings[0].stateNameSnapshot, "受伤");
    assert.throws(() => setFilmShotCharacterBindings(baseShot, [{ characterId: "c2", stateId: "injured" }], [first, second]), /状态不存在或不属于该角色/);
});

test("道具按唯一名称或别名绑定，同名道具不抢绑定", () => {
    const props = [asset("p1", "雨伞"), asset("p2", "旧信", ["那封信"]), asset("p3", "刀"), asset("p4", "刀")];
    const input: FilmEpisode[] = [{
        ...episodes[0],
        scenes: [{
            ...episodes[0].scenes[0],
            shots: [shot("shot1", "她撑着雨伞读那封信"), shot("shot2", "刀光一闪")],
        }],
    }];
    const result = bindFilmCast(input, [], [], props);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].propBindings.map((binding) => binding.propId), ["p1", "p2"]);
    assert.deepEqual(result.episodes[0].scenes[0].shots[1].propBindings, []);
    assert.equal(result.boundProps, 1);
});

test("场次时间或氛围唯一命中时自动绑定场景变体", () => {
    const night = { id: "v-night", name: "夜·雨", timeOfDay: "夜", weather: "雨", mood: "压抑", description: "", concept: { images: [], locked: false } };
    const location = { ...asset("l1", "咖啡馆"), location: { variants: [night] } };
    const input: FilmEpisode[] = [{
        id: "e1",
        title: "第1集",
        scenes: [{ id: "s1", name: "1-1 咖啡馆", location: "咖啡馆", time: "夜", mood: "压抑", shots: [shot("shot1", "咖啡馆内")] }],
    }];
    const result = bindFilmCast(input, [], [location], []);
    assert.equal(result.episodes[0].scenes[0].shots[0].locationId, "l1");
    assert.equal(result.episodes[0].scenes[0].shots[0].locationVariantId, "v-night");
    assert.equal(result.boundVariants, 1);
});

test("多个变体同时命中时保留建议不自动绑定", () => {
    const night = { id: "v-night", name: "夜·雨", timeOfDay: "夜", weather: "雨", mood: "", description: "", concept: { images: [], locked: false } };
    const lateNight = { id: "v-late", name: "深夜", timeOfDay: "夜", weather: "", mood: "", description: "", concept: { images: [], locked: false } };
    const location = { ...asset("l1", "咖啡馆"), location: { variants: [night, lateNight] } };
    const input: FilmEpisode[] = [{
        id: "e1",
        title: "第1集",
        scenes: [{ id: "s1", name: "1-1 咖啡馆", location: "咖啡馆", time: "夜", mood: "", shots: [shot("shot1", "咖啡馆内")] }],
    }];
    const result = bindFilmCast(input, [], [location], []);
    const boundShot = result.episodes[0].scenes[0].shots[0];
    assert.equal(boundShot.locationVariantId, undefined);
    assert.deepEqual(boundShot.variantSuggestions?.map((item) => item.variantId), ["v-night", "v-late"]);
    assert.equal(result.suggestedVariants, 1);
    assert.equal(result.boundVariants, 0);
});
