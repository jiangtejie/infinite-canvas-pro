import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TaskActionButton, TaskIconButton, TaskProgressState, TaskStatusTag } from "./task-result";

test("task status tags distinguish stopping from generation", () => {
    const stopping = renderToStaticMarkup(<TaskStatusTag status="停止中" />);
    assert.ok(stopping.includes("停止中"));
    assert.ok(!stopping.includes("生成中"));
    assert.ok(renderToStaticMarkup(<TaskStatusTag status="已停止" />).includes("已停止"));
});

test("task progress state exposes progress and stop-confirmation states", () => {
    const progress = renderToStaticMarkup(<TaskProgressState status="pending" elapsedMs={12000} progress={37} />);
    assert.ok(progress.includes("正在创作 37%"));
    assert.ok(progress.includes('role="progressbar"'));
    assert.ok(progress.includes('aria-valuenow="37"'));
    assert.ok(progress.includes("width:37%"));

    const stopping = renderToStaticMarkup(<TaskProgressState status="stopping" stoppingError elapsedMs={12000} />);
    assert.ok(stopping.includes("停止未确认"));
    const stopped = renderToStaticMarkup(<TaskProgressState status="stopped" elapsedMs={12000} />);
    assert.ok(stopped.includes("已停止"));
    assert.ok(!stopped.includes("已停止生成"));
});

test("task action primitives keep desktop compact and touch sized", () => {
    const action = renderToStaticMarkup(<TaskActionButton>重试</TaskActionButton>);
    assert.ok(action.includes("!h-8"));
    assert.ok(action.includes("pointer-coarse:!h-10"));

    const icon = renderToStaticMarkup(<TaskIconButton label="下载结果" icon={<span />} />);
    assert.ok(icon.includes('aria-label="下载结果"'));
    assert.ok(icon.includes("!size-8"));
    assert.ok(icon.includes("pointer-coarse:!size-10"));
});
