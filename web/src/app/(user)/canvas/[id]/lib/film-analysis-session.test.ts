import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import { scriptTextHash } from "@/lib/film/film-script-import";
import type { FilmEpisode } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData, type FilmAnalysisSession } from "../../types";
import {
    applyFilmAnalysisSession,
    cancelFilmAnalysisSession,
    createFilmAnalysisSession,
    failFilmAnalysisSession,
    isFilmAnalysisExpired,
    patchFilmAnalysisSession,
    recoverFilmAnalysisNodes,
    recoverFilmAnalysisSession,
} from "./film-analysis-session";

const draft = (): FilmAnalysisSession["draft"] => ({
    episodes: [{ id: "ep", title: "第 1 集", scenes: [] }] as FilmEpisode[],
    suggestions: [{ key: "character:沈迟", kind: "character", name: "沈迟", aliases: [], description: "", visualPrompt: "" }] as FilmAssetSuggestion[],
});

test("starts running and records progress", () => {
    const session = createFilmAnalysisSession("hash-1", { pacing: "fast", targetDuration: 60 });
    assert.equal(session.status, "running");
    assert.equal(session.sourceHash, "hash-1");
    assert.equal(session.options.pacing, "fast");
    const progressed = patchFilmAnalysisSession(session, { progress: { stage: "structure", done: 1, total: 3 } });
    assert.deepEqual(progressed.progress, { stage: "structure", done: 1, total: 3 });
    assert.ok(progressed.updatedAt >= session.updatedAt);
});

test("cancels with or without a partial draft and fails with an error", () => {
    const session = createFilmAnalysisSession("hash");
    const partial = cancelFilmAnalysisSession(patchFilmAnalysisSession(session, { status: "structure-ready", draft: draft() }));
    assert.equal(partial.status, "cancelled");
    assert.ok(partial.draft);
    assert.equal(partial.progress, undefined);
    const empty = cancelFilmAnalysisSession(session);
    assert.equal(empty.draft, undefined);
    const failed = failFilmAnalysisSession(session, "结构失败");
    assert.equal(failed.status, "failed");
    assert.equal(failed.error, "结构失败");
});

test("applied sessions keep only the summary", () => {
    const session = patchFilmAnalysisSession(createFilmAnalysisSession("hash"), { status: "ready", draft: draft(), warnings: ["资产提取失败"] });
    const applied = applyFilmAnalysisSession(session, { scenes: 2, shots: 6, assets: 3, appliedAt: "2026-11-26T00:00:00.000Z", mode: "merge" });
    assert.equal(applied.status, "applied");
    assert.equal(applied.draft, undefined);
    assert.equal(applied.warnings, undefined);
    assert.deepEqual(applied.summary, { scenes: 2, shots: 6, assets: 3, appliedAt: "2026-11-26T00:00:00.000Z", mode: "merge" });
});

test("recovers interrupted running sessions and keeps drafts openable", () => {
    const running = createFilmAnalysisSession("hash");
    const recovered = recoverFilmAnalysisSession(running);
    assert.equal(recovered.status, "cancelled");
    assert.ok(recovered.error?.includes("中断"));
    const ready = recoverFilmAnalysisSession(patchFilmAnalysisSession(running, { draft: draft() }));
    assert.equal(ready.status, "ready");
    assert.equal(ready.error, undefined);
    const node = scriptNode(running);
    assert.equal(recoverFilmAnalysisNodes([node])[0].metadata?.filmScript?.analysis?.status, "cancelled");
});

test("marks a draft expired only after the script text changes", () => {
    const sourceHash = scriptTextHash("旧正文");
    const session = patchFilmAnalysisSession(createFilmAnalysisSession(sourceHash), { draft: draft() });
    assert.equal(isFilmAnalysisExpired(session, "旧正文"), false);
    assert.equal(isFilmAnalysisExpired(session, "新正文"), true);
    assert.equal(isFilmAnalysisExpired(createFilmAnalysisSession(sourceHash), "新正文"), false);
});

function scriptNode(analysis: FilmAnalysisSession): CanvasNodeData {
    return {
        id: "script",
        type: CanvasNodeType.FilmScript,
        title: "剧本",
        position: { x: 0, y: 0 },
        width: 520,
        height: 380,
        metadata: { filmScript: { text: "旧正文", parseSnapshots: [], analysis } },
    };
}
