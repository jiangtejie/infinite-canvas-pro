import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkbenchShell } from "@/components/workbench/workbench-shell";

import { PageFrame } from "./page-frame";

test("standard page frame provides one scroll container and centered content", () => {
    const markup = renderToStaticMarkup(<PageFrame><p>页面内容</p></PageFrame>);
    assert.match(markup, /^<main class="[^"]*h-full[^"]*overflow-y-auto/);
    assert.ok(markup.includes("page-shell"));
    assert.ok(markup.includes("页面内容"));
});

test("workbench frame keeps content full-bleed without a second main landmark", () => {
    const markup = renderToStaticMarkup(
        <PageFrame variant="workbench">
            <WorkbenchShell layout="side" panel={<div>创作区</div>} results={<div>结果区</div>} />
        </PageFrame>,
    );
    assert.equal((markup.match(/<main\b/g) || []).length, 1);
    assert.ok(markup.includes("overflow-hidden"));
    assert.ok(!markup.includes("page-shell"));
});

test("video workbench uses the shared page frame", () => {
    const source = readFileSync(new URL("../../app/(user)/video/page.tsx", import.meta.url), "utf8");
    assert.match(source, /import \{ PageFrame \} from "@\/components\/ui\/page-frame"/);
    assert.match(source, /<PageFrame variant="workbench">/);
});
