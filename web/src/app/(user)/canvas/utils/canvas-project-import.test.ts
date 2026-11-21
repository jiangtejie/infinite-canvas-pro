import assert from "node:assert/strict";
import test from "node:test";

import { buildImportedCanvasProject } from "./canvas-project-import";

const context = {
    id: "fixed-id",
    now: "2026-11-21T00:00:00.000Z",
    viewport: { x: 0, y: 0, k: 1 },
    sidePanel: { open: true, width: 280 },
    agentPanel: { open: false, width: 464 },
};

test("keeps film domain fields when importing a project", () => {
    const project = buildImportedCanvasProject({
        title: "影视项目",
        domain: "film",
        film: { aspect: "16:9", stylePresetId: "custom", directorStyleId: "cinematic-classic" },
    }, context);

    assert.equal(project.id, "fixed-id");
    assert.equal(project.title, "影视项目");
    assert.equal(project.domain, "film");
    assert.equal(project.film?.aspect, "16:9");
    assert.equal(project.updatedAt, context.now);
});

test("keeps general canvas imports domainless", () => {
    const project = buildImportedCanvasProject({ title: "普通画布" }, context);

    assert.equal(project.domain, undefined);
    assert.equal(project.film, undefined);
    assert.equal(project.title, "普通画布");
});
