import assert from "node:assert/strict";
import test from "node:test";

import { comicLetterTailX, comicLetterTemplate, defaultComicLetterTemplate, fitComicLetterWidth } from "./comic-lettering";

test("letter templates default by kind and keep explicit overrides", () => {
    assert.equal(defaultComicLetterTemplate("speech"), "oval");
    assert.equal(defaultComicLetterTemplate("thought"), "cloud");
    assert.equal(defaultComicLetterTemplate("caption"), "caption");
    assert.equal(defaultComicLetterTemplate("sfx"), "boxed");
    assert.equal(comicLetterTemplate({ id: "1", kind: "speech", text: "", x: 0, y: 0, width: 0.3, fontSize: 0.03, align: "left", tail: "none", template: "rounded" }), "rounded");
    assert.equal(comicLetterTailX({ id: "1", kind: "speech", text: "", x: 0, y: 0, width: 0.3, fontSize: 0.03, align: "left", tail: "left" }), 0.25);
    assert.equal(comicLetterTailX({ id: "1", kind: "speech", text: "", x: 0, y: 0, width: 0.3, fontSize: 0.03, align: "left", tail: "right", tailX: 0.6 }), 0.6);
});

test("letter width fitting follows text length and clamps extremes", () => {
    assert.ok(fitComicLetterWidth("你好", 0.03) < fitComicLetterWidth("你好，今天也要加油", 0.03));
    assert.equal(fitComicLetterWidth("", 0.03), 0.15);
    assert.equal(fitComicLetterWidth("很长很长很长很长很长很长很长很长很长很长", 0.1), 0.9);
});
