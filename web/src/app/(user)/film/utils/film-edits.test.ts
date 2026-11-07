import assert from "node:assert/strict";
import test from "node:test";

import { filmSceneOptions, filmShotPosition, moveFilmShot, moveFilmShotToScene } from "./film-edits";
import type { FilmEpisode, FilmShot } from "@/lib/film/types";

const shot = (id: string): FilmShot => ({ id, shotNo: id, shotType: "", cameraMovement: "", duration: 5, description: id, dialogue: "", audio: "", prompt: "" });

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
