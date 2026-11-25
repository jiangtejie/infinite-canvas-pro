import assert from "node:assert/strict";
import test from "node:test";

import { fixtureSnapshot } from "@/test/script-fixtures";
import { buildFilmCanvasProject } from "@/app/(user)/canvas/utils/film-canvas-project";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import { compileScriptFilmPlan, buildInitialScriptFilmGraph } from "./script-film-plan";
import { scriptTextHash } from "@/lib/film/film-script-import";

const source = {
    projectId: "project-1",
    projectTitle: "测试剧本",
    publicationId: "pub-1",
    versionIds: ["version-1"],
    hash: "source-hash",
    publishedAt: "2026-11-25T00:00:00.000Z",
};

test("structured script compiles without reparsing and keeps source ids", () => {
    const snapshot = fixtureSnapshot();
    const plan = compileScriptFilmPlan(snapshot);
    assert.equal(plan[0].id, snapshot.episodes[0].id);
    assert.equal(plan[0].scenes[0].id, snapshot.episodes[0].scenes[0].id);
    assert.equal(plan[0].scenes[0].shots[0].id, `${snapshot.episodes[0].scenes[0].id}:0`);
    assert.match(plan[0].scenes[0].shots[0].shotNo, /1/);
    assert.match(plan[1].scenes[0].shots[0].shotNo, /2-1-1/);
});

test("empty scene uses structured dramatic fields for its shot", () => {
    const snapshot = fixtureSnapshot();
    snapshot.episodes[0].scenes[0].content = "";
    const shot = compileScriptFilmPlan(snapshot)[0].scenes[0].shots[0];
    assert.match(shot.description, /确认照片来源/);
    assert.match(shot.description, /决定跟踪/);
});

test("initial source prompt hash tracks the prompt rather than the description", () => {
    const project = buildFilmCanvasProject("测试影视", { id: "film-1", now: source.publishedAt, viewport: { x: 0, y: 0, k: 1 }, sidePanel: { open: true, width: 280 }, agentPanel: { open: false, width: 464 } });
    const graph = buildInitialScriptFilmGraph(project, compileScriptFilmPlan(fixtureSnapshot()), source);
    const shot = graph.nodes.find((node) => node.id === "scene-1:0")!;
    assert.equal(shot.metadata?.filmShot?.scriptSourcePromptHash, scriptTextHash(shot.metadata?.filmShot?.prompt || ""));
});

test("initial graph removes only the empty template and marks source-owned nodes and edges", () => {
    const project = buildFilmCanvasProject("测试影视", {
        id: "film-1",
        now: source.publishedAt,
        viewport: { x: 0, y: 0, k: 1 },
        sidePanel: { open: true, width: 280 },
        agentPanel: { open: false, width: 464 },
    });
    const result = buildInitialScriptFilmGraph(project, compileScriptFilmPlan(fixtureSnapshot()), source);
    const script = result.nodes.find((node) => node.type === CanvasNodeType.FilmScript)!;
    assert.equal(script.metadata?.filmScript?.source?.publicationId, source.publicationId);
    assert.ok(result.nodes.some((node) => node.id === "scene-1" && node.metadata?.filmScene?.scriptSourceKey === "scene-1"));
    assert.ok(result.nodes.some((node) => node.id === "scene-1:0" && node.metadata?.filmShot?.scriptSourceKey === "scene-1:0"));
    assert.ok(result.connections.every((edge) => edge.id.startsWith("script:pub-1:")));
    assert.ok(result.connections.some((edge) => edge.kind === "composition"));
    assert.ok(result.connections.some((edge) => edge.kind === "sequence"));
    assert.equal(result.nodes.some((node) => node.id === `${project.id}-scene-1`), false);
});
