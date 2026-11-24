import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { canvasThemes } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeStatus } from "../types";
import type { FilmNodeSummary } from "../[id]/lib/film-node-summary";
import { FilmBeatNodeCard } from "../[id]/components/film-beat-node-card";
import { FilmScriptNodeCard, FilmShotNodeCard } from "./film-node-card";

const shotNode: CanvasNodeData = {
    id: "shot-1",
    type: CanvasNodeType.FilmShot,
    title: "镜头 01",
    position: { x: 0, y: 0 },
    width: 420,
    height: 420,
};

const shotSummary: FilmNodeSummary = {
    type: "filmShot",
    label: "镜头",
    title: shotNode.title,
    description: "镜头描述",
    shotNo: "01",
    sceneLabel: "场次 01",
    contextLabels: [],
    pendingGeneration: null,
    status: "idle",
    imageVersionCount: 1,
    videoVersionCount: 1,
};

function beatNode(status: CanvasNodeStatus): CanvasNodeData {
    return {
        id: "beat-1",
        type: CanvasNodeType.FilmBeat,
        title: "动作节拍",
        position: { x: 0, y: 0 },
        width: 480,
        height: 520,
        metadata: {
            status,
            progress: status === "loading" ? 50 : 0,
            filmBeat: {
                title: "动作节拍",
                mode: "grid9",
                prompt: "动作说明",
                frames: Array.from({ length: 9 }, () => ""),
                status,
                progress: status === "loading" ? 50 : 0,
            },
        },
    };
}

function beatSummary(status: CanvasNodeStatus): FilmNodeSummary {
    return { type: "filmBeat", label: "动作节拍", title: "动作节拍", description: "动作说明", status, progress: status === "loading" ? 50 : 0 };
}

function buttonTag(markup: string, label: string) {
    const contentEnd = markup.indexOf(`>${label}</button>`);
    assert.notEqual(contentEnd, -1, `missing button: ${label}`);
    const start = markup.lastIndexOf("<button", contentEnd);
    return markup.slice(start, contentEnd + `>${label}</button>`.length);
}

function assertPrimary(markup: string, label: string) {
    assert.ok(buttonTag(markup, label).includes("background:rgba(47,128,255,.20)"), `${label} should be primary`);
}

test("shot card keeps all actions and emphasizes storyboard generation", () => {
    const markup = renderToStaticMarkup(
        <FilmShotNodeCard
            node={shotNode}
            nodes={[shotNode]}
            connections={[]}
            theme={canvasThemes.light}
            summary={shotSummary}
            onGenerateImage={() => {}}
            onGenerateVideo={() => {}}
            onFocusShot={() => {}}
            onEditAsset={() => {}}
            onOpenVersions={() => {}}
        />,
    );
    assertPrimary(markup, "生成分镜图");
    assert.ok(!buttonTag(markup, "生成视频").includes("background:rgba(47,128,255,.20)"));
    for (const label of ["打开镜头聚焦", "镜头概览", "图片版本 1", "视频版本 1"]) {
        assert.ok(markup.includes(label));
    }
});

test("idle beat card emphasizes AI decomposition", () => {
    const node = beatNode("idle");
    const markup = renderToStaticMarkup(
        <FilmBeatNodeCard
            node={node}
            nodes={[node]}
            connections={[]}
            theme={canvasThemes.light}
            summary={beatSummary("idle")}
            onDecomposeBeat={() => {}}
            onGenerateBeatPreview={() => {}}
            onStopBeatTask={() => {}}
            onLocateBeatShots={() => {}}
            onEditAsset={() => {}}
        />,
    );
    assertPrimary(markup, "AI 拆解动作");
});

test("busy beat card switches primary action to stop generation", () => {
    const node = beatNode("loading");
    const markup = renderToStaticMarkup(
        <FilmBeatNodeCard
            node={node}
            nodes={[node]}
            connections={[]}
            theme={canvasThemes.light}
            summary={beatSummary("loading")}
            onDecomposeBeat={() => {}}
            onGenerateBeatPreview={() => {}}
            onStopBeatTask={() => {}}
            onLocateBeatShots={() => {}}
            onEditAsset={() => {}}
        />,
    );
    assertPrimary(markup, "停止生成");
    assert.ok(!buttonTag(markup, "AI 拆解动作").includes("background:rgba(47,128,255,.20)"));
});

test("single-action script card emphasizes director analysis", () => {
    const node: CanvasNodeData = { ...shotNode, id: "script-1", type: CanvasNodeType.FilmScript, title: "剧本" };
    const summary: FilmNodeSummary = { type: "filmScript", label: "剧本", title: node.title, description: "剧本内容", status: "idle" };
    const markup = renderToStaticMarkup(
        <FilmScriptNodeCard node={node} nodes={[node]} connections={[]} theme={canvasThemes.light} summary={summary} onOpenScript={() => {}} />,
    );
    assertPrimary(markup, "导演分析");
});
