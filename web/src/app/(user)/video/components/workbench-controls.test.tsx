import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FrameReferenceStrip } from "./workbench-controls";

const reference = { id: "frame-1", name: "首帧", type: "image/png", dataUrl: "data:image/png;base64,AA==" };

test("compact frame removal keeps a touch-sized target", () => {
    const markup = renderToStaticMarkup(
        <FrameReferenceStrip firstFrame={reference} lastFrame={null} compact onUploadFrame={() => {}} onRemoveFrame={() => {}} />,
    );
    const labelIndex = markup.indexOf('aria-label="移除首帧"');
    assert.notEqual(labelIndex, -1);
    const start = markup.lastIndexOf("<button", labelIndex);
    const button = markup.slice(start, markup.indexOf(">", labelIndex) + 1);
    assert.ok(button.includes("size-8"), button);
    assert.ok(button.includes("pointer-coarse:size-10"), button);
});
