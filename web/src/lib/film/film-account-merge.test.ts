import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmProject } from "@/lib/film/types";
import { EMPTY_FILM_LIBRARY, mergeFilmLibrary, mergeFilmProjects } from "./film-account-merge";

const project = (id: string, title: string, updatedAt: string): FilmProject => ({
    id, title, visualStyle: "", aspect: "16:9", stylePreset: "custom", stage: "script", scriptText: "",
    episodes: [], characters: [], locations: [], props: [], costumes: [], createdAt: "", updatedAt,
});
const asset = (id: string, updatedAt: string): FilmAsset => ({
    id, name: id, aliases: [], description: "", visualPrompt: "", status: "idle", concept: { images: [], locked: false },
    createdAt: "", updatedAt,
});

test("项目合并保留本地独有并取最新版本", () => {
    const merged = mergeFilmProjects([project("p1", "远端旧", "2026-01-01T00:00:00.000Z")], [
        project("p1", "本地新", "2026-01-02T00:00:00.000Z"),
        project("p2", "本地独有", "2026-01-01T00:00:00.000Z"),
    ]);
    assert.deepEqual(merged.projects.map((item) => item.title), ["本地新", "本地独有"]);
    assert.equal(merged.shouldPush, true);
});

test("远端更新时采用远端且不回传", () => {
    const merged = mergeFilmProjects([project("p1", "远端新", "2026-01-03T00:00:00.000Z")], [project("p1", "本地旧", "2026-01-01T00:00:00.000Z")]);
    assert.equal(merged.projects[0].title, "远端新");
    assert.equal(merged.shouldPush, false);
});

test("五类库分别合并，任一域本地独有即回传", () => {
    const remote = { ...EMPTY_FILM_LIBRARY, characters: [asset("c1", "2026-01-02T00:00:00.000Z")] };
    const local = { ...EMPTY_FILM_LIBRARY, characters: [asset("c1", "2026-01-01T00:00:00.000Z")], props: [asset("p1", "2026-01-01T00:00:00.000Z")] };
    const merged = mergeFilmLibrary(remote, local);
    assert.deepEqual(merged.snapshot.characters.map((item) => item.id), ["c1"]);
    assert.deepEqual(merged.snapshot.props.map((item) => item.id), ["p1"]);
    assert.equal(merged.shouldPush, true);
});

test("相同时间戳保持远端内容且不回传", () => {
    const time = "2026-01-01T00:00:00.000Z";
    const merged = mergeFilmLibrary({ ...EMPTY_FILM_LIBRARY, costumes: [asset("cos", time)] }, { ...EMPTY_FILM_LIBRARY, costumes: [asset("cos", time)] });
    assert.equal(merged.shouldPush, false);
});
