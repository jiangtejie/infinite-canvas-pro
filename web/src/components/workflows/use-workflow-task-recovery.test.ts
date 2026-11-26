import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./use-workflow-task-recovery.ts", import.meta.url), "utf8");

test("workflow stop fallback polls through the latest callback", () => {
    assert.match(source, /pollRecoveredWorkflowTasksRef\.current = pollRecoveredWorkflowTasks/);
    assert.doesNotMatch(source, /await pollRecoveredWorkflowTasks\(/);
    assert.equal((source.match(/await pollRecoveredWorkflowTasksRef\.current\(\)/g) || []).length, 3);
});
