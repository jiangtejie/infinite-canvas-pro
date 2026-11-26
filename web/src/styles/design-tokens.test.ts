import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("canonical type sizes feed Tailwind text utilities without self-reference", () => {
    for (const [name, value] of Object.entries({ xs: "11px", sm: "13px", base: "15px", lg: "17px", xl: "20px", "2xl": "28px" })) {
        assert.ok(css.includes(`--type-${name}: ${value};`), `missing canonical ${name} size`);
        assert.ok(css.includes(`--text-${name}: var(--type-${name});`), `missing Tailwind ${name} mapping`);
    }
    assert.ok(css.includes("--type-3xl: clamp(2rem, 4vw, 3.2rem);"));
    assert.ok(css.includes("--text-3xl: var(--type-3xl);"));
    assert.ok(!css.includes("--text-xs: 11px;"));
});

test("native form controls share the visible keyboard focus treatment", () => {
    assert.match(css, /input:focus-visible,\s*select:focus-visible,\s*textarea:focus-visible/);
});
