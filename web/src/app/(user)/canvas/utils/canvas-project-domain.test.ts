import assert from "node:assert/strict";
import test from "node:test";

import { generalCanvasProjects, isFilmCanvasProject } from "./canvas-project-domain";

test("filters film projects out of the general canvas list", () => {
    const projects = [
        { id: "general" },
        { id: "film", domain: "film" as const },
    ];

    assert.deepEqual(
        generalCanvasProjects(projects).map((project) => project.id),
        ["general"],
    );
    assert.equal(isFilmCanvasProject(projects[0]), false);
    assert.equal(isFilmCanvasProject(projects[1]), true);
});
