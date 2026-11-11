import assert from "node:assert/strict";
import test from "node:test";

import { CANVAS_AGENT_ACTION_NAMES } from "./canvas-agent-tools";
import { CANVAS_AGENT_ACTION_RISK, canvasAgentActionRequiresConfirmation, canvasAgentActionReversible, canvasAgentActionRisk, canvasAgentClearsAutoTitle, isCanvasAgentReadAction } from "./canvas-agent-registry";

test("every canvas agent action declares a risk level", () => {
    for (const name of CANVAS_AGENT_ACTION_NAMES) {
        assert.ok(CANVAS_AGENT_ACTION_RISK[name], name + " 缺少风险等级");
    }
    assert.equal(canvasAgentActionRisk("unknown_tool"), "write");
});

test("read actions are limited to query tools", () => {
    assert.equal(isCanvasAgentReadAction("get_canvas_summary"), true);
    assert.equal(isCanvasAgentReadAction("query_canvas_nodes"), true);
    assert.equal(isCanvasAgentReadAction("read_skill_file"), true);
    assert.equal(isCanvasAgentReadAction("create_text_node"), false);
    assert.equal(isCanvasAgentReadAction("generate_video"), false);
});

test("destructive and costly actions require confirmation", () => {
    assert.equal(canvasAgentActionRequiresConfirmation("delete_node"), true);
    assert.equal(canvasAgentActionRequiresConfirmation("delete_connection"), true);
    assert.equal(canvasAgentActionRequiresConfirmation("generate_image"), true);
    assert.equal(canvasAgentActionRequiresConfirmation("create_text_node"), false);
    assert.equal(canvasAgentActionRequiresConfirmation("get_node"), false);
});

test("auto title is cleared only by real canvas writes", () => {
    assert.equal(canvasAgentClearsAutoTitle("create_text_node"), true);
    assert.equal(canvasAgentClearsAutoTitle("generate_image"), true);
    assert.equal(canvasAgentClearsAutoTitle("delete_node"), true);
    assert.equal(canvasAgentClearsAutoTitle("create_primary_script_node"), false);
    assert.equal(canvasAgentClearsAutoTitle("set_agent_state"), false);
    assert.equal(canvasAgentClearsAutoTitle("get_canvas_summary"), false);
});

test("only reversible structure writes can be rolled back", () => {
    assert.equal(canvasAgentActionReversible("create_text_node"), true);
    assert.equal(canvasAgentActionReversible("create_connection"), true);
    assert.equal(canvasAgentActionReversible("arrange_nodes"), true);
    assert.equal(canvasAgentActionReversible("delete_node"), false);
    assert.equal(canvasAgentActionReversible("generate_image"), false);
    assert.equal(canvasAgentActionReversible("create_primary_script_node"), false);
    assert.equal(canvasAgentActionReversible("get_canvas_summary"), false);
});
