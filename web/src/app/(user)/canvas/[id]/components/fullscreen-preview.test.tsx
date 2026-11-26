import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FullscreenPreview } from "./fullscreen-preview";

test("fullscreen dialog provides a programmatic focus target", () => {
    const markup = renderToStaticMarkup(
        <FullscreenPreview
            src="/preview.jpg"
            alt="分镜预览"
            onDownload={() => {}}
            onClose={() => {}}
        />,
    );

    assert.match(markup, /role="dialog" aria-modal="true" aria-label="分镜预览" tabindex="-1"/);
});

test("fullscreen navigation buttons expose their actions", () => {
    const markup = renderToStaticMarkup(
        <FullscreenPreview
            src="/preview.jpg"
            alt="分镜预览"
            hasPrev
            hasNext
            onPrev={() => {}}
            onNext={() => {}}
            onDownload={() => {}}
            onClose={() => {}}
        />,
    );

    assert.ok(markup.includes('aria-label="上一项"'));
    assert.ok(markup.includes('aria-label="下一项"'));
});
