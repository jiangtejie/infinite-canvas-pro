import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { SourceRemixHistoryEntry } from "../[id]/lib/canvas-source-remix";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { CanvasSourceNodeCard } from "./canvas-source-node-card";

const source: CanvasNodeData = {
    id: "source-1",
    type: CanvasNodeType.Source,
    title: "抖音素材",
    position: { x: 0, y: 0 },
    width: 420,
    height: 420,
    metadata: { sourceStatus: "success", sourceTitle: "同城攻略", sourceText: "原始攻略正文" },
};

const history: SourceRemixHistoryEntry[] = [
    { runId: "run-2", planNodeId: "plan-2", title: "第二版", createdAt: "2026-11-25T02:00:00Z" },
    { runId: "run-1", planNodeId: "plan-1", title: "第一版", createdAt: "2026-11-25T01:00:00Z" },
];

test("素材节点只保留一个复刻工作台入口，不再展示历史版本下拉", () => {
    const markup = renderToStaticMarkup(
        <CanvasSourceNodeCard
            node={source}
            expandedNeedsSync={false}
            onRemix={() => {}}
            history={history}
            onOpenWorkbench={() => {}}
        />,
    );
    assert.ok(markup.includes("复刻工作台 2 版"));
    assert.ok(!markup.includes("历史 1"));
    assert.ok(!markup.includes("ant-dropdown-trigger"));
});
