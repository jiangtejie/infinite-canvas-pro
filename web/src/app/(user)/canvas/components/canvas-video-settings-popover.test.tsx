import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { canvasThemes } from "@/lib/canvas-theme";
import { ResourceSinglePicker } from "./canvas-video-settings-popover";

const options = [{ nodeId: "image-1", kind: "image" as const, label: "角色参考图" }];

test("resource picker keeps clear action outside the selection button", () => {
    const markup = renderToStaticMarkup(
        <ResourceSinglePicker
            label="首帧"
            value="image-1"
            options={options}
            placeholder="不指定"
            emptyText="暂无已连接图片"
            theme={canvasThemes.light}
            onChange={() => {}}
        />,
    );

    const selection = markup.indexOf('aria-label="选择首帧，当前：角色参考图"');
    const selectionEnd = markup.indexOf("</button>", selection);
    const clear = markup.indexOf('aria-label="清除首帧"');
    assert.notEqual(selection, -1);
    assert.notEqual(selectionEnd, -1);
    assert.ok(clear > selectionEnd, "clear action must be a sibling of the selection button");
    assert.ok(!markup.includes('role="button" tabindex="0"'));
});
