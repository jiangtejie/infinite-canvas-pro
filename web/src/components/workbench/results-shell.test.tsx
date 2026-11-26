import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ResultsEmptyState, ResultsToolbarActions } from "./results-shell";

test("result toolbar actions keep a touch-sized target", () => {
    const markup = renderToStaticMarkup(
        <ResultsToolbarActions
            onNew={() => {}}
            onToggleSelectAll={() => {}}
            selectAllLabel="全选"
            selectAllDisabled={false}
            onDownload={() => {}}
            downloadDisabled={false}
            onDelete={() => {}}
            deleteDisabled={false}
        />,
    );

    const buttons = [...markup.matchAll(/<button[^>]*>/g)].map((match) => match[0]);
    assert.equal(buttons.length, 4);
    for (const button of buttons) {
        assert.ok(button.includes("pointer-coarse:!h-10"), button);
        assert.ok(!button.includes("!h-7"), button);
    }
});

test("result empty states share layout while keeping media-specific examples", () => {
    const markup = renderToStaticMarkup(
        <ResultsEmptyState
            icon={<span />}
            title="还没有生成视频"
            description="填写提示词并开始创作"
            examples={["海边环绕镜头", "墨水扩散慢动作"]}
            onUseExample={() => {}}
        />,
    );
    assert.ok(markup.includes("还没有生成视频"));
    assert.ok(markup.includes("海边环绕镜头"));
    assert.ok(markup.includes("墨水扩散慢动作"));
    assert.ok(markup.includes("min-h-[320px]"));
    assert.ok(markup.includes("lg:min-h-[520px]"));
});
