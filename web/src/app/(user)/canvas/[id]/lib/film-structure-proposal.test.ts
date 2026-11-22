import assert from "node:assert/strict";
import test from "node:test";

import type { FilmEpisode, FilmShot } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { buildFilmStructureProposal, filterFilmProposalEpisodes } from "./film-structure-proposal";

const shot = (id: string, shotNo: string, duration: number, description = `${id} 画面`): FilmShot => ({
    id,
    shotNo,
    shotType: "中景",
    cameraMovement: "固定",
    duration,
    description,
    dialogue: "",
    audio: "",
    prompt: description,
    characterBindings: [],
    propBindings: [],
});
const episode = (id: string, title: string, scenes: { id: string; name: string; shots: FilmShot[] }[]): FilmEpisode => ({ id, title, scenes: scenes.map((scene) => ({ ...scene, location: "", time: "", mood: "" })) });
const node = (id: string, type: CanvasNodeType): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: type === CanvasNodeType.Shot ? { filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } } : {},
});

const proposalEpisodes: FilmEpisode[] = [
    episode("ep1", "第 1 集", [
        { id: "s1", name: "1-1 街道", shots: [shot("a", "01", 4), shot("b", "02", 6)] },
        { id: "s2", name: "1-2 仓库", shots: [shot("c", "01", 10)] },
    ]),
    episode("ep2", "第 2 集", [{ id: "s3", name: "2-1 天台", shots: [shot("d", "01", 4)] }]),
];
const currentNodes = [node("scene", CanvasNodeType.Scene), node("shot1", CanvasNodeType.Shot), node("shot2", CanvasNodeType.Shot)];
const currentConnections: CanvasConnection[] = [];

test("summarizes structure totals, current graph and target duration deviation", () => {
    const proposal = buildFilmStructureProposal(proposalEpisodes, currentNodes, currentConnections, { aspect: "16:9", targetDuration: 15 } as never);
    assert.deepEqual(proposal.totals, { episodes: 2, scenes: 3, shots: 4, duration: 24 });
    assert.deepEqual(proposal.current, { scenes: 1, shots: 2 });
    assert.deepEqual(proposal.sceneKeys, ["0:0", "0:1", "1:0"]);
    assert.ok(proposal.issues.some((issue) => issue.message.includes("替换将删除现有 1 场 2 镜")));
    assert.ok(proposal.issues.some((issue) => issue.message.includes("目标时长")));
});

test("warns about missing descriptions and duplicate shot numbers inside a scene", () => {
    const flawed: FilmEpisode[] = [episode("ep1", "第 1 集", [{
        id: "s1",
        name: "1-1 街道",
        shots: [shot("a", "01", 4, ""), shot("b", "01", 4)],
    }])];
    const proposal = buildFilmStructureProposal(flawed, [], [], undefined);
    assert.ok(proposal.issues.some((issue) => issue.message.includes("缺画面描述")));
    assert.ok(proposal.issues.some((issue) => issue.message.includes("重复镜号")));
});

test("filters selected scenes and drops empty episodes", () => {
    const kept = filterFilmProposalEpisodes(proposalEpisodes, new Set(["1:0"]));
    assert.equal(kept.length, 1);
    assert.equal(kept[0].title, "第 2 集");
    assert.deepEqual(kept[0].scenes.map((scene) => scene.name), ["2-1 天台"]);
    assert.equal(filterFilmProposalEpisodes(proposalEpisodes, new Set()).length, 0);
});

test("keeps scenes when multiple selections span episodes", () => {
    const kept = filterFilmProposalEpisodes(proposalEpisodes, new Set(["0:1", "1:0"]));
    assert.deepEqual(kept.map((item) => item.title), ["第 1 集", "第 2 集"]);
    assert.deepEqual(kept[0].scenes.map((scene) => scene.name), ["1-2 仓库"]);
});
