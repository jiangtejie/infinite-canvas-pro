import assert from "node:assert/strict";
import test from "node:test";

import { actualPreviewZoom, clampPreviewZoom, previewZoomPercent, stepPreviewZoom } from "./preview-zoom";

test("clamps and steps preview zoom", () => {
    assert.equal(clampPreviewZoom(0.01), 0.2);
    assert.equal(clampPreviewZoom(99), 8);
    assert.equal(stepPreviewZoom(1, 0.25), 1.25);
    assert.equal(stepPreviewZoom(0.2, -1), 0.2);
    assert.equal(stepPreviewZoom(7.9, 1), 8);
});

test("computes effective zoom percentage against natural pixels", () => {
    assert.equal(previewZoomPercent(500, 1000, 1), 50);
    assert.equal(previewZoomPercent(500, 1000, 2), 100);
    assert.equal(previewZoomPercent(500, 1000, 1.5), 75);
    assert.equal(previewZoomPercent(0, 1000, 1), 100);
    assert.equal(previewZoomPercent(500, 0, 1), 100);
});

test("computes actual-pixel zoom and clamps it", () => {
    assert.equal(actualPreviewZoom(500, 1000), 2);
    assert.equal(actualPreviewZoom(100, 1000), 8);
    assert.equal(actualPreviewZoom(0, 1000), 1);
    assert.equal(actualPreviewZoom(500, 0), 1);
});
