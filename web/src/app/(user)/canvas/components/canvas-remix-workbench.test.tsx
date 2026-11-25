import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { canvasThemes } from "@/lib/canvas-theme";
import type { RemixRun, SourceRemixPlan } from "../remix-types";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { RemixWorkbenchContent } from "./canvas-remix-plan-panel";

const plan: SourceRemixPlan = {
    schemaVersion: 1,
    sourcePattern: { type: "攻略清单", preserve: ["递进顺序"] },
    copy: { title: "第一版标题", body: "第一版正文", tags: ["周末"] },
    marketingPlacement: { mode: "content", reason: "保留攻略价值", cta: "" },
    factsUsed: [],
    visual: { sharedAnchors: ["浅色卡片"], images: [] },
};

function run(id: string, title: string): RemixRun {
    return {
        id,
        createdAt: id === "run-2" ? "2026-11-25T02:00:00Z" : "2026-11-25T01:00:00Z",
        input: {
            ownerId: "owner-1",
            sourceNodeId: "source-1",
            sourceSignature: "source-signature",
            sourceText: "原始素材",
            sourceImages: [],
            settings: { mode: "content", goal: "保留清单结构", placement: "natural", instruction: "", skills: [] },
            skills: [],
            coreVersion: "remix-1",
        },
        binding: "active",
        plan: { ...plan, copy: { ...plan.copy, title, body: `${title}正文` } },
    };
}

function planNode(value: RemixRun): CanvasNodeData {
    return {
        id: `${value.id}-plan`,
        type: CanvasNodeType.Text,
        title: value.id,
        position: { x: 0, y: 0 },
        width: 420,
        height: 300,
        metadata: { remixRole: "plan", remixRunId: value.id, remixSourceId: "source-1", remixRun: value, status: "success" },
    };
}

function imageNode(runId: string, index: number, metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return {
        id: `${runId}-image-${index}`,
        type: CanvasNodeType.Image,
        title: `第 ${index} 张`,
        position: { x: 0, y: 0 },
        width: 360,
        height: 480,
        metadata: { remixRole: "image", remixRunId: runId, remixSourceId: "source-1", remixIndex: index, prompt: `提示词 ${index}`, ...metadata },
    };
}

function renderWorkbench(nodes: CanvasNodeData[], selectedRunId = "run-1") {
    return renderToStaticMarkup(
        <RemixWorkbenchContent
            theme={canvasThemes.light}
            selectedRunId={selectedRunId}
            onSelectRun={() => {}}
            nodes={nodes}
            onGenerate={() => {}}
            onReplan={() => {}}
            onPublish={() => {}}
            onFocusNode={() => {}}
        />,
    );
}

function buttonTag(markup: string, label: string) {
    const labelIndex = markup.indexOf(label);
    assert.notEqual(labelIndex, -1, `missing button: ${label}`);
    const start = markup.lastIndexOf("<button", labelIndex);
    const end = markup.indexOf("</button>", labelIndex);
    assert.ok(start >= 0 && end > start, `missing button: ${label}`);
    return markup.slice(start, end + "</button>".length);
}

test("工作台按版本集中展示策划、配图和三类待处理项", () => {
    const first = run("run-1", "第一版标题");
    const second = run("run-2", "第二版标题");
    const nodes = [
        planNode(first),
        planNode(second),
        imageNode(first.id, 1, { status: "success", content: "blob:first-result" }),
        imageNode(first.id, 2, { status: "error", errorDetails: "模型请求失败" }),
        imageNode(first.id, 3, { status: "idle" }),
        imageNode(first.id, 4, { status: "loading", imageTaskUnknown: true }),
    ];
    const markup = renderWorkbench(nodes);
    assert.match(markup, /版本 2/);
    assert.match(markup, /版本 1/);
    assert.ok(markup.includes("第一版标题正文"));
    assert.ok(markup.includes("blob:first-result"));
    assert.ok(markup.includes("模型请求失败"));
    assert.match(markup, /失败 1/);
    assert.match(markup, /未提交 1/);
    assert.match(markup, /状态未知 1/);
    assert.ok(buttonTag(markup, "重试失败项（1）").includes("ant-btn-primary"));
    assert.ok(markup.includes("另做一版"));
    assert.ok(!markup.includes("审阅并生成"));
});

test("选中版本不存在时回退最新版本，不展示空工作台", () => {
    const first = run("run-1", "第一版标题");
    const second = run("run-2", "第二版标题");
    const markup = renderWorkbench([planNode(first), planNode(second)], "missing-run");
    assert.ok(markup.includes("第二版标题"));
    assert.ok(markup.includes("第二版标题正文"));
    assert.ok(buttonTag(markup, "版本 2 · 第二版标题").includes('aria-pressed="true"'));
});

test("全部配图完成且已有发布节点时只保留一个去发布主动作", () => {
    const value = run("run-1", "第一版标题");
    const publish: CanvasNodeData = {
        id: "publish-1",
        type: CanvasNodeType.Publish,
        title: "发布",
        position: { x: 0, y: 0 },
        width: 360,
        height: 360,
        metadata: { remixRole: "publish", remixRunId: value.id, remixSourceId: "source-1" },
    };
    const markup = renderWorkbench([
        planNode(value),
        imageNode(value.id, 1, { status: "success", content: "blob:one" }),
        publish,
    ]);
    assert.ok(buttonTag(markup, "去发布").includes("ant-btn-primary"));
    assert.equal(markup.split("去发布").length - 1, 1);
});

test("工作台只使用画布主题色，不写入固定黑白背景", () => {
    const value = run("run-1", "第一版标题");
    const markup = renderWorkbench([planNode(value)]);
    assert.ok(markup.includes(canvasThemes.light.toolbar.panel));
    assert.ok(!markup.includes("background:#000"));
    assert.ok(!markup.includes("background:#fff"));
});
