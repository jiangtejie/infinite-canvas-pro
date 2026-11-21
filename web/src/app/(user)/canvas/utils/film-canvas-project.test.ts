import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../types";
import { buildFilmCanvasProject } from "./film-canvas-project";

const context = {
    id: "film-1",
    now: "2026-11-21T00:00:00.000Z",
    viewport: { x: 0, y: 0, k: 1 },
    sidePanel: { open: true, width: 280 },
    agentPanel: { open: false, width: 464 },
};

test("builds a film canvas document with script, unique style and one scene", () => {
    const project = buildFilmCanvasProject("测试影视", context);

    assert.equal(project.id, "film-1");
    assert.equal(project.domain, "film");
    assert.equal(project.film?.aspect, "16:9");
    assert.equal(project.nodes.length, 3);
    assert.equal(project.connections.length, 0);

    const scripts = project.nodes.filter((node) => node.type === CanvasNodeType.Script);
    const scenes = project.nodes.filter((node) => node.type === CanvasNodeType.Scene);
    const styles = project.nodes.filter((node) => node.metadata?.filmAsset?.kind === "style");
    assert.equal(scripts.length, 1);
    assert.equal(scenes.length, 1);
    assert.equal(styles.length, 1);
    assert.equal(scripts[0]?.metadata?.filmScript?.text, "");
    assert.equal(scenes[0]?.metadata?.filmScene?.episodeTitle, "第 1 集");
});

test("falls back to a default title", () => {
    const project = buildFilmCanvasProject("   ", context);
    assert.equal(project.title, "未命名影视画布");
});
