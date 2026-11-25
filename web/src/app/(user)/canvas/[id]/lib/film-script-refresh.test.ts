import assert from "node:assert/strict";
import test from "node:test";

import { fixtureSnapshot } from "@/test/script-fixtures";
import { buildInitialScriptFilmGraph, compileScriptFilmPlan } from "@/app/(user)/script/utils/script-film-plan";
import { buildFilmCanvasProject } from "@/app/(user)/canvas/utils/film-canvas-project";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmScriptSource } from "../../types";
import { applyScriptFilmRefresh, previewScriptFilmRefresh } from "./film-script-refresh";
import { undoFilmParseGraph } from "./film-script-parse";

const source: FilmScriptSource = {
    projectId: "project-1",
    projectTitle: "测试剧本",
    publicationId: "publication-1",
    versionIds: ["version-1"],
    hash: "source-hash",
    publishedAt: "2026-11-25T00:00:00.000Z",
};

function publishedGraph() {
    const project = buildFilmCanvasProject("测试影视", { id: "film-1", now: source.publishedAt, viewport: { x: 0, y: 0, k: 1 }, sidePanel: { open: true, width: 280 }, agentPanel: { open: false, width: 464 } });
    const plan = compileScriptFilmPlan(fixtureSnapshot());
    const graph = buildInitialScriptFilmGraph(project, plan, source);
    return { project: { ...project, ...graph }, plan };
}

function withoutSceneOne() {
    const snapshot = fixtureSnapshot();
    snapshot.episodes[0].scenes = snapshot.episodes[0].scenes.filter((scene) => scene.id !== "scene-1");
    return compileScriptFilmPlan(snapshot);
}

test("refresh protects deleted shots with media, custom prompts and context bindings", () => {
    const { project } = publishedGraph();
    const edited = structuredClone(project);
    const shot = edited.nodes.find((node) => node.id === "scene-1:0")!;
    shot.metadata!.filmShot!.prompt = "人工提示词";
    shot.metadata!.filmShot!.imageUrl = "https://example.test/image.png";
    const character: CanvasNodeData = {
        id: "character-1",
        type: CanvasNodeType.FilmCharacter,
        title: "人工角色",
        position: { x: 0, y: 600 },
        width: 300,
        height: 200,
    };
    edited.nodes.push(character);
    const context: CanvasConnection = { id: "manual-context", fromNodeId: character.id, toNodeId: shot.id, kind: "context", data: { role: "character", source: "manual" } };
    edited.connections.push(context);
    const plan = withoutSceneOne();

    const preview = previewScriptFilmRefresh(edited.nodes, edited.connections, plan, source);
    assert.ok(preview.protected.includes(shot.id));
    const result = applyScriptFilmRefresh(edited.nodes, edited.connections, plan, source);
    const kept = result.nodes.find((node) => node.id === shot.id)!;
    assert.equal(kept.metadata?.filmShot?.prompt, "人工提示词");
    assert.equal(kept.metadata?.filmShot?.imageUrl, "https://example.test/image.png");
    assert.equal(kept.metadata?.filmShot?.scriptSourceKey, undefined);
    assert.ok(result.connections.some((edge) => edge.id === context.id));
    assert.equal(result.nodes.find((node) => node.id === "scene-1")?.metadata?.filmScene?.scriptSourceKey, undefined);
});

test("refresh keeps stable ids, adds new source nodes and preserves manual edges", () => {
    const { project } = publishedGraph();
    const manual: CanvasConnection = { id: "manual-composition", fromNodeId: "scene-1", toNodeId: "scene-1:0", kind: "composition" };
    const otherPublication: CanvasConnection = { id: "script:other:scene-1->scene-1:0", fromNodeId: "scene-1", toNodeId: "scene-1:0", kind: "composition" };
    const snapshot = fixtureSnapshot();
    snapshot.episodes[0].scenes[0].location = "新地点";
    snapshot.episodes[1].scenes[0].content = "新仓库正文";
    snapshot.episodes[1].scenes.push({ ...structuredClone(snapshot.episodes[1].scenes[0]), id: "scene-4", no: 2, content: "新增场次" });
    const plan = compileScriptFilmPlan(snapshot);
    const preview = previewScriptFilmRefresh(project.nodes, [...project.connections, manual, otherPublication], plan, source);
    assert.ok(preview.updated.includes("scene-1"));
    assert.ok(preview.kept.includes("scene-2"));
    assert.ok(preview.added.includes("scene-4"));
    const result = applyScriptFilmRefresh(project.nodes, [...project.connections, manual, otherPublication], plan, source);
    assert.equal(result.nodes.find((node) => node.id === "scene-1")?.metadata?.filmScene?.location, "新地点");
    assert.ok(result.nodes.some((node) => node.id === "scene-1:0"));
    assert.ok(result.connections.some((edge) => edge.id === manual.id));
    assert.ok(result.connections.some((edge) => edge.id === otherPublication.id));
    assert.equal(result.connections.filter((edge) => edge.id.startsWith(`script:${source.publicationId}:`)).length, 7);
});

test("refresh never overwrites a manual node whose id collides with a source id", () => {
    const { project } = publishedGraph();
    const manual = structuredClone(project.nodes.find((node) => node.id === "scene-2")!);
    manual.title = "人工场次";
    delete manual.metadata!.filmScene!.scriptSourceKey;
    const nodes = project.nodes.map((node) => node.id === manual.id ? manual : node);
    const result = applyScriptFilmRefresh(nodes, project.connections, publishedGraph().plan, source);
    assert.equal(result.nodes.find((node) => node.id === "scene-2")?.title, "人工场次");
    const created = result.nodes.find((node) => node.metadata?.filmScene?.scriptSourceKey === "scene-2")!;
    assert.equal(created.id, `script:${source.publicationId}:scene-2`);
});

test("undo refresh removes added nodes and restores updated and detached nodes", () => {
    const { project } = publishedGraph();
    const edited = structuredClone(project);
    const shot = edited.nodes.find((node) => node.id === "scene-1:0")!;
    shot.metadata!.filmShot!.prompt = "人工提示词";
    const plan = withoutSceneOne();
    const result = applyScriptFilmRefresh(edited.nodes, edited.connections, plan, { ...source, hash: "new-hash" });
    const script = result.nodes.find((node) => node.type === CanvasNodeType.FilmScript)!;
    const undone = undoFilmParseGraph(script, result.nodes, result.connections);
    assert.ok(undone);
    assert.equal(undone.nodes.find((node) => node.id === "scene-1:0")?.metadata?.filmShot?.scriptSourceKey, "scene-1:0");
    assert.equal(undone.nodes.find((node) => node.id === "scene-1")?.metadata?.filmScene?.scriptSourceKey, "scene-1");
    assert.equal(undone.nodes.find((node) => node.type === CanvasNodeType.FilmScript)?.metadata?.filmScript?.source?.hash, source.hash);
});
