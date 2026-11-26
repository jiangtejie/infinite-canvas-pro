import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ConfirmProvider } from "@/components/ui/confirm-dialog";

import { AnnouncementBanner } from "./announcement-banner";
import { UserStatusActions } from "./user-status-actions";

function openingTag(markup: string, label: string) {
    const labelIndex = markup.indexOf(`aria-label="${label}"`);
    assert.notEqual(labelIndex, -1, `missing control: ${label}`);
    const start = markup.lastIndexOf("<", labelIndex);
    return markup.slice(start, markup.indexOf(">", labelIndex) + 1);
}

test("announcement controls keep usable touch targets", () => {
    const markup = renderToStaticMarkup(<AnnouncementBanner />);
    for (const label of ["显示第 1 条公告", "显示第 2 条公告", "显示第 3 条公告"]) {
        const indicator = openingTag(markup, label);
        assert.ok(indicator.includes("h-6"), indicator);
        assert.ok(indicator.includes("w-8") || indicator.includes("w-9"), indicator);
    }
    const close = openingTag(markup, "关闭公告");
    assert.ok(close.includes("size-8"), close);
    assert.ok(close.includes("pointer-coarse:size-10"), close);
});

test("shared account icon actions keep touch-sized targets", () => {
    const markup = renderToStaticMarkup(<ConfirmProvider><UserStatusActions /></ConfirmProvider>);
    for (const label of ["配置", "切换到浅色主题", "切换到深色主题"]) {
        if (!markup.includes(`aria-label="${label}"`)) continue;
        const button = openingTag(markup, label);
        assert.ok(button.includes("size-8"), button);
        assert.ok(button.includes("pointer-coarse:size-10"), button);
    }
    assert.ok(markup.includes("pointer-coarse:h-10"), "login action should have a touch-sized height");
});
