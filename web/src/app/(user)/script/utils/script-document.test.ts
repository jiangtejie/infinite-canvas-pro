import assert from "node:assert/strict";
import test from "node:test";

import { createScriptEpisode, createScriptProject, createScriptScene } from "./script-project";
import { exportScriptText, scriptDataHash, snapshotScriptContent, summarizeScriptProject } from "./script-document";

test("tv documents keep episodes and compute summary from all scenes", () => {
    const project = createScriptProject({ title: "三集剧", format: "tv" });
    const episodes = [1, 2, 3].map((no) => {
        const episode = createScriptEpisode(no, `第 ${no} 集`);
        episode.scenes = [createScriptScene(1), createScriptScene(2)];
        if (no === 1) episode.scenes[1].content = "第二场正文";
        return episode;
    });
    const document = { ...project, episodes };
    const summary = summarizeScriptProject(document);
    assert.equal(summary.episodeCount, 3);
    assert.equal(summary.sceneCount, 6);
    assert.equal(summary.wordCount, 5);
    assert.equal("scenes" in document, false);
});

test("canonical data hash normalizes key order and Unicode", () => {
    assert.equal(scriptDataHash({ z: "<>&\u2028😀", a: "中文" }), "223ee7fb");
    assert.equal(scriptDataHash({ a: "\uD800" }), scriptDataHash({ a: "\uFFFD" }));
});

test("summary derives lock count and publication staleness from current locks", () => {
    const document = createScriptProject({ title: "锁定摘要", format: "tv" });
    document.episodes.push(createScriptEpisode(2, "第二集"));
    document.episodes[0].lockedVersionId = "episode-v1";
    document.episodes[0].lockedVersionHash = "episode-hash";
    assert.equal(summarizeScriptProject(document).lockedEpisodeCount, 1);

    document.lockedVersionId = "project-v1";
    document.lockedVersionHash = "project-hash";
    document.publications = [{
        id: "publication-1",
        episodeIds: document.episodes.map((episode) => episode.id),
        sourceVersionIds: ["project-v1"],
        sourceHash: "old-hash",
        status: "published",
    }];
    const summary = summarizeScriptProject(document);
    assert.equal(summary.lockedEpisodeCount, 2);
    assert.equal(summary.hasPublication, true);
    assert.equal(summary.publicationStale, true);
});

test("snapshot is isolated and export ignores revisions and lock references", () => {
    const document = createScriptProject({ title: "快照", format: "tv" });
    const scene = { ...createScriptScene(1), content: "原稿", notes: "备注" };
    document.episodes[0].scenes = [scene];
    document.characters = [{ id: "c1", name: "阿健", role: "主角", want: "赢", need: "", flaw: "", arc: "", description: "" }];
    const snapshot = snapshotScriptContent(document);
    const text = exportScriptText(snapshot);
    assert.match(text, /标题："快照"/);
    assert.match(text, /人物姓名："阿健"/);
    assert.match(text, /场次正文："原稿"/);
    assert.match(text, /备注："备注"/);

    document.episodes[0].scenes[0].content = "后续修改";
    document.characters[0].name = "后续人物";
    assert.equal(snapshot.episodes[0].scenes[0].content, "原稿");
    assert.equal(snapshot.characters[0].name, "阿健");

    snapshot.episodes[0].lockedVersionId = "ignored-lock";
    snapshot.episodes[0].lockedVersionHash = "ignored-hash";
    snapshot.episodes[0].scenes[0].revision = 99;
    snapshot.episodes[0].scenes[0].updatedAt = "2099-01-01T00:00:00.000Z";
    assert.equal(exportScriptText(snapshot), text);
    snapshot.episodes[0].scenes[0].notes = "变化";
    assert.notEqual(exportScriptText(snapshot), text);
});
