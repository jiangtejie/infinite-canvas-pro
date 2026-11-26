import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReferenceStrip } from "./workbench-controls";

const reference = { id: "image-1", name: "参考图", type: "image/png", dataUrl: "data:image/png;base64,AA==" };

test("compact reference removal keeps a touch-sized target", () => {
    const markup = renderToStaticMarkup(<ReferenceStrip references={[reference]} compact onRemoveReference={() => {}} />);
    const labelIndex = markup.indexOf('aria-label="移除参考图"');
    assert.notEqual(labelIndex, -1);
    const start = markup.lastIndexOf("<button", labelIndex);
    const button = markup.slice(start, markup.indexOf(">", labelIndex) + 1);
    assert.ok(button.includes("size-8"), button);
    assert.ok(button.includes("pointer-coarse:size-10"), button);
});
