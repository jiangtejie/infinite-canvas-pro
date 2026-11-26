import assert from "node:assert/strict";
import test from "node:test";

import { filmMentionIncludes, filmMentionTerms, normalizeFilmMentionText } from "./film-mentions";

test("drops single-character names from automatic mentions", () => {
    assert.deepEqual(filmMentionTerms("王", ["小王"]), ["小王"]);
    assert.equal(filmMentionIncludes(normalizeFilmMentionText("王队长走进来"), "王"), false);
});

test("matches English names only on word boundaries", () => {
    const text = normalizeFilmMentionText("Tom arrives at the tomato garden.");
    assert.equal(filmMentionIncludes(text, "tom"), true);
    assert.equal(filmMentionIncludes(normalizeFilmMentionText("the tomato garden"), "tom"), false);
    assert.equal(filmMentionIncludes(normalizeFilmMentionText("TOM: hello"), "tom"), true);
});

test("normalizes punctuation, aliases and multi-word terms", () => {
    const text = normalizeFilmMentionText("沈迟，老沈：钥匙在桌上…");
    assert.deepEqual(filmMentionTerms("沈迟", ["老沈", "沈 迟"]), ["沈迟", "老沈"]);
    assert.equal(filmMentionIncludes(text, "老沈"), true);
    assert.equal(filmMentionIncludes(normalizeFilmMentionText("Tom Hanks enters"), "tom hanks"), true);
});
