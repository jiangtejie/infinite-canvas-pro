import assert from "node:assert/strict";
import test from "node:test";

import { filmSceneOptions, filmShotPosition, importFilmAsset, moveFilmShot, moveFilmShotToScene } from "./film-edits";
import { createEmptyCharacterProfile } from "./film-character";
import { appendSlotImage } from "./film-image-slot";
import type { FilmEpisode, FilmShot } from "@/lib/film/types";

const shot = (id: string): FilmShot => ({ id, shotNo: id, shotType: "", cameraMovement: "", duration: 5, description: id, dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [] });

const episodes: FilmEpisode[] = [
    {
        id: "e1", title: "第1集", scenes: [
            { id: "s1", name: "1-1 海边", location: "", time: "", mood: "", shots: [shot("a"), shot("b")] },
            { id: "s2", name: "1-2 操场", location: "", time: "", mood: "", shots: [shot("c")] },
        ],
    },
];

test("镜头可以上移和下移", () => {
    const movedDown = moveFilmShot(episodes, "a", 1);
    assert.deepEqual(movedDown[0].scenes[0].shots.map((item) => item.id), ["b", "a"]);
    const movedUp = moveFilmShot(movedDown, "a", -1);
    assert.deepEqual(movedUp[0].scenes[0].shots.map((item) => item.id), ["a", "b"]);
    assert.equal(moveFilmShot(episodes, "a", -1)[0].scenes[0].shots[0].id, "a");
});

test("镜头可以移动到其他场", () => {
    const moved = moveFilmShotToScene(episodes, "b", "s2");
    assert.deepEqual(moved[0].scenes[0].shots.map((item) => item.id), ["a"]);
    assert.deepEqual(moved[0].scenes[1].shots.map((item) => item.id), ["c", "b"]);
});

test("定位镜头与场景选项", () => {
    const position = filmShotPosition(episodes, "b");
    assert.deepEqual(position, { episodeIndex: 0, sceneIndex: 0, shotIndex: 1, sceneId: "s1", sceneShotCount: 2 });
    assert.deepEqual(filmSceneOptions(episodes), [{ value: "s1", label: "第1集 / 1-1 海边" }, { value: "s2", label: "第1集 / 1-2 操场" }]);
});

test("从角色库导入会深拷贝嵌套设定并记录来源", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.slot = appendSlotImage(profile.parts.face.slot, { id: "face-1", url: "face.png" });
    profile.states = [{ id: "injured", name: "受伤", description: "额头受伤", condition: "左臂受伤", heldPropIds: [], look: { images: [], locked: false } }];
    const source = { id: "library-c1", name: "沈星晴", aliases: ["小夏"], description: "", visualPrompt: "", status: "ready" as const, concept: { images: [], locked: false }, character: profile, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    const imported = importFilmAsset([], source)[0];

    assert.notEqual(imported.id, source.id);
    assert.equal(imported.sourceLibraryAssetId, source.id);
    imported.aliases.push("阿夏");
    imported.character!.states[0].name = "新状态";
    imported.character!.parts.face.slot.images.push({ id: "face-2", url: "face-2.png" });
    assert.deepEqual(source.aliases, ["小夏"]);
    assert.equal(source.character.states[0].name, "受伤");
    assert.deepEqual(source.character.parts.face.slot.images.map((image) => image.id), ["face-1"]);
});
