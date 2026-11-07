import assert from "node:assert/strict";
import test from "node:test";

import { bindFilmCast } from "./film-cast-bind";
import type { FilmAsset, FilmEpisode } from "@/lib/film/types";

const asset = (id: string, name: string): FilmAsset => ({ id, name, description: "", visualPrompt: "", status: "idle", createdAt: "2026-01-01T00:00:00.000Z" });

const episodes: FilmEpisode[] = [{
    id: "e1",
    title: "第1集",
    scenes: [{
        id: "s1",
        name: "1-1 乡村公路",
        location: "",
        time: "",
        mood: "",
        shots: [
            { id: "shot1", shotNo: "01", shotType: "", cameraMovement: "", duration: 5, description: "沈星晴 坐在大巴上", dialogue: "", audio: "", prompt: "" },
            { id: "shot2", shotNo: "02", shotType: "", cameraMovement: "", duration: 5, description: "空镜", dialogue: "", audio: "", prompt: "" },
        ],
    }],
}];

test("按名称自动绑定角色和场景", () => {
    const result = bindFilmCast(episodes, [asset("c1", "沈星晴"), asset("c2", "刘娜")], [asset("l1", "乡村公路")]);
    assert.equal(result.boundCharacters, 1);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].characterIds, ["c1"]);
    assert.equal(result.episodes[0].scenes[0].shots[0].locationId, "l1");
    assert.deepEqual(result.episodes[0].scenes[0].shots[1].characterIds, []);
    assert.equal(result.episodes[0].scenes[0].shots[1].locationId, "l1");
});

test("已有手动绑定不覆盖", () => {
    const withBind: FilmEpisode[] = [{ ...episodes[0], scenes: [{ ...episodes[0].scenes[0], shots: [{ ...episodes[0].scenes[0].shots[0], characterIds: ["manual"], locationId: "manual-location" }] }] }];
    const result = bindFilmCast(withBind, [asset("c1", "沈星晴")], [asset("l1", "乡村公路")]);
    assert.deepEqual(result.episodes[0].scenes[0].shots[0].characterIds, ["manual"]);
    assert.equal(result.episodes[0].scenes[0].shots[0].locationId, "manual-location");
    assert.equal(result.boundCharacters, 0);
});
