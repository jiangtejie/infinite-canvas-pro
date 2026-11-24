import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { canvasThemes } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import type { FilmNodeSummary } from "../lib/film-node-summary";
import { FilmNodeShell, type FilmNodeShellAction } from "./film-node-shell";

const node: CanvasNodeData = {
    id: "film-node-1",
    type: CanvasNodeType.FilmShot,
    title: "镜头 01",
    position: { x: 0, y: 0 },
    width: 420,
    height: 420,
};

const summary: FilmNodeSummary = {
    type: "filmShot",
    label: "镜头",
    title: node.title,
    description: "镜头摘要",
};

function renderShell(status: FilmNodeSummary["status"], actions: FilmNodeShellAction[] = [], needsRefresh = false) {
    return renderToStaticMarkup(
        <FilmNodeShell node={node} theme={canvasThemes.light} summary={{ ...summary, status, needsRefresh }} actions={actions}>
            <div>卡片内容</div>
        </FilmNodeShell>,
    );
}

function buttonTag(markup: string, label: string) {
    const contentEnd = markup.indexOf(`>${label}</button>`);
    assert.notEqual(contentEnd, -1, `missing button: ${label}`);
    const start = markup.lastIndexOf("<button", contentEnd);
    return markup.slice(start, contentEnd + `>${label}</button>`.length);
}

test("idle status is hidden while refresh warning remains visible", () => {
    const markup = renderShell("idle", [], true);
    assert.ok(!markup.includes("待处理"));
    assert.ok(markup.includes("需更新"));
});

test("header keeps collapse control without duplicate resize buttons", () => {
    const markup = renderShell("loading");
    assert.ok(markup.includes('aria-label="折叠节点"'));
    assert.ok(!markup.includes('aria-label="缩窄节点"'));
    assert.ok(!markup.includes('aria-label="加宽节点"'));
});

test("primary action uses selection styling while secondary action stays quiet", () => {
    const markup = renderShell("idle", [
        { label: "主动作", primary: true, onClick: () => {} },
        { label: "次动作", onClick: () => {} },
    ]);
    const primary = buttonTag(markup, "主动作");
    const secondary = buttonTag(markup, "次动作");
    assert.ok(primary.includes("background:rgba(47,128,255,.20)"));
    assert.ok(primary.includes("border-color:#2f80ff"));
    assert.ok(secondary.includes("background:transparent"));
    assert.ok(secondary.includes("border-color:transparent"));
    assert.ok(!secondary.includes("background:rgba(47,128,255,.20)"));
});
