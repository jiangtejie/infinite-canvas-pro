import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { defaultConfig } from "@/stores/use-config-store";
import { HistoryLogCard, PendingVideoCard } from "./result-cards";
import type { GenerationLog, GenerationResult } from "../history";

const result: GenerationResult = {
    id: "result-1",
    status: "pending",
    createdAt: 0,
    prompt: "测试提示词",
    model: "test-video",
    config: defaultConfig,
    references: [],
    videoReferences: [],
    audioReferences: [],
};

const log: GenerationLog = {
    id: "log-1",
    createdAt: 0,
    title: "测试记录",
    prompt: "测试提示词",
    time: "0:00",
    model: "test-video",
    config: defaultConfig,
    references: [],
    videoReferences: [],
    audioReferences: [],
    durationMs: 0,
    size: "1280x720",
    resolution: "720",
    seconds: "6",
    status: "失败",
};

function buttonByLabel(markup: string, label: string) {
    const labelIndex = markup.indexOf(`aria-label="${label}"`);
    assert.notEqual(labelIndex, -1, `missing button: ${label}`);
    const start = markup.lastIndexOf("<button", labelIndex);
    return markup.slice(start, markup.indexOf(">", labelIndex) + 1);
}

test("pending video actions use touch-sized targets", () => {
    const markup = renderToStaticMarkup(
        <PendingVideoCard result={result} onCopyPrompt={() => {}} onStop={() => {}} onRetry={() => {}} onDelete={() => {}} />,
    );
    const stop = buttonByLabel(markup, "停止");
    assert.ok(stop.includes("pointer-coarse:!h-10"), stop);
    assert.ok(!stop.includes("!h-6"), stop);
});

test("stopping video action renders only the shared loading spinner", () => {
    const markup = renderToStaticMarkup(
        <PendingVideoCard result={{ ...result, status: "stopping" }} onCopyPrompt={() => {}} onStop={() => {}} onRetry={() => {}} onDelete={() => {}} />,
    );
    const labelIndex = markup.indexOf('aria-label="停止中"');
    const start = markup.lastIndexOf("<button", labelIndex);
    const stop = markup.slice(start, markup.indexOf("</button>", start) + "</button>".length);
    assert.ok(stop.includes("ant-btn-loading-icon"), stop);
    assert.ok(!stop.includes("lucide-loader-circle"), stop);
});

test("pending video progress uses the shared accessible state", () => {
    const markup = renderToStaticMarkup(
        <PendingVideoCard result={{ ...result, progress: 42 }} onCopyPrompt={() => {}} onStop={() => {}} onRetry={() => {}} onDelete={() => {}} />,
    );
    assert.ok(markup.includes("正在创作 42%"));
    assert.ok(markup.includes('role="progressbar"'));
    assert.ok(markup.includes('aria-valuenow="42"'));
});

test("stopped video deletion uses a touch-sized target", () => {
    const markup = renderToStaticMarkup(
        <PendingVideoCard result={{ ...result, status: "stopped" }} onCopyPrompt={() => {}} onStop={() => {}} onRetry={() => {}} onDelete={() => {}} />,
    );
    const remove = buttonByLabel(markup, "删除结果");
    assert.ok(remove.includes("pointer-coarse:!size-10"), remove);
    assert.ok(!remove.includes("!h-6"), remove);
});

test("history video deletion uses a touch-sized target", () => {
    const markup = renderToStaticMarkup(
        <HistoryLogCard
            log={log}
            index={0}
            selected
            active={false}
            syncing={false}
            onToggleSelect={() => {}}
            onDelete={() => {}}
            onPreview={() => {}}
            onRetry={() => {}}
            onCopyPrompt={() => {}}
            onDownload={() => {}}
            onSync={() => {}}
            onSaveAsset={() => {}}
        />,
    );
    const remove = buttonByLabel(markup, "删除视频结果");
    assert.ok(remove.includes("pointer-coarse:!size-10"), remove);
    assert.ok(!remove.includes("!h-6"), remove);
});
