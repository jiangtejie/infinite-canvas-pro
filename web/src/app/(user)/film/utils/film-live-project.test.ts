import assert from "node:assert/strict";
import test from "node:test";

import type { FilmProject } from "@/lib/film/types";
import { useFilmStore } from "@/stores/use-film-store";
import { latestFilmAssetPatch, latestFilmShotPatch } from "./film-live-project";

const project = ({ id = "p1" }: { id?: string } = {}): FilmProject => ({
    id, title: "项目", visualStyle: "", aspect: "16:9", stylePreset: "custom", stage: "cast", scriptText: "",
    episodes: [], characters: [{ id: "c1", name: "角色", aliases: [], description: "", visualPrompt: "", status: "idle", concept: { images: [], locked: false }, createdAt: "", updatedAt: "" }],
    locations: [], props: [], costumes: [], createdAt: "", updatedAt: "",
});

test("基于最新资产生成补丁，不会覆盖并发写入", () => {
    const original = useFilmStore.getState().projects;
    try {
        useFilmStore.setState({ projects: [project()] });
        const stale = useFilmStore.getState().projects[0];
        const latest = useFilmStore.getState().projects[0];
        useFilmStore.setState({
            projects: [{ ...latest, characters: latest.characters.map((asset) => ({ ...asset, concept: { images: [{ id: "concurrent", url: "concurrent.png" }], locked: false } })) }],
        });
        const patch = latestFilmAssetPatch("p1", "character", "c1", () => ({ description: "新描述" }));
        assert.ok(patch);
        useFilmStore.getState().updateProject("p1", patch!);
        const saved = useFilmStore.getState().projects[0].characters[0];
        assert.equal(saved.description, "新描述");
        assert.deepEqual(saved.concept.images.map((image) => image.id), ["concurrent"]);
        assert.equal(stale.characters[0].description, "");
    } finally {
        useFilmStore.setState({ projects: original });
    }
});

test("基于最新镜头生成补丁，不会覆盖其他镜头编辑", () => {
    const original = useFilmStore.getState().projects;
    try {
        const base = project();
        base.stage = "storyboard";
        base.episodes = [{ id: "e1", title: "第1集", scenes: [{ id: "s1", name: "1-1", location: "", time: "", mood: "", shots: [{ id: "sh1", shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [] }] }] }];
        useFilmStore.setState({ projects: [base] });
        const latest = useFilmStore.getState().projects[0];
        const scene = latest.episodes[0].scenes[0];
        useFilmStore.setState({ projects: [{ ...latest, episodes: [{ ...latest.episodes[0], scenes: [{ ...scene, shots: [{ ...scene.shots[0], description: "并发生成的描述" }] }] }] }] });
        const patch = latestFilmShotPatch("p1", "sh1", () => ({ errorMessage: "失败" }));
        assert.ok(patch);
        useFilmStore.getState().updateProject("p1", patch!);
        const saved = useFilmStore.getState().projects[0].episodes[0].scenes[0].shots[0];
        assert.equal(saved.errorMessage, "失败");
        assert.equal(saved.description, "并发生成的描述");
    } finally {
        useFilmStore.setState({ projects: original });
    }
});
