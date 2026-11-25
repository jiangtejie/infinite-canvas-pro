import assert from "node:assert/strict";
import test from "node:test";

import { createScriptEpisode, createScriptProject, createScriptScene } from "./script-project";
import { activateScriptVersion, createScriptVersion } from "./script-version";
import {
    isPublicationStale,
    publicationSourceHash,
    resolvePublicationVersions,
} from "./script-publication";

function lockedProject() {
    const document = createScriptProject({ title: "发布测试", format: "tv" });
    document.episodes[0].scenes = [{ ...createScriptScene(1), location: "第一集" }];
    document.episodes.push({ ...createScriptEpisode(2), scenes: [{ ...createScriptScene(1), location: "第二集" }] });
    return document;
}

test("项目锁定直接提供来源哈希，重新锁定后来源过期", () => {
    const document = lockedProject();
    const version = createScriptVersion(document, { scope: "project", label: "项目锁定", kind: "locked" });
    const locked = activateScriptVersion(document, version);
    const episodeIds = locked.episodes.map((episode) => episode.id);

    assert.equal(publicationSourceHash(locked, episodeIds), version.hash);
    assert.equal(isPublicationStale(locked, episodeIds, version.hash), false);
    locked.episodes[0].scenes[0].content = "更新后的正文";
    const next = createScriptVersion(locked, { scope: "project", label: "新锁定", kind: "locked" });
    const relocked = activateScriptVersion(locked, next);
    assert.equal(isPublicationStale(relocked, episodeIds, version.hash), true);
});

test("多集锁定来源哈希与剧集顺序无关，缺少锁定时不可发布", () => {
    const document = lockedProject();
    const first = createScriptVersion(document, {
        scope: "episode",
        episodeId: document.episodes[0].id,
        label: "第一集",
        kind: "locked",
    });
    const second = createScriptVersion(document, {
        scope: "episode",
        episodeId: document.episodes[1].id,
        label: "第二集",
        kind: "locked",
    });
    const one = activateScriptVersion(document, first);
    const locked = activateScriptVersion(one, second);
    const ids = locked.episodes.map((episode) => episode.id);

    const forward = publicationSourceHash(locked, ids);
    assert.ok(forward);
    assert.equal(publicationSourceHash(locked, [...ids].reverse()), forward);
    assert.equal(isPublicationStale(locked, ids, forward!), false);
    assert.equal(publicationSourceHash(one, ids), null);
    assert.equal(isPublicationStale(one, ids, forward!), true);
    assert.equal(publicationSourceHash(locked, []), null);
});

test("项目锁定版本可覆盖所选剧集，但快照必须包含全部所选剧集", () => {
    const document = lockedProject();
    document.episodes[1].id = "later-episode";
    const version = createScriptVersion(document, { scope: "project", label: "项目锁定", kind: "locked" });
    document.episodes.push({ ...createScriptEpisode(3), id: "new-episode" });
    const locked = activateScriptVersion(document, version);
    const selected = [document.episodes[1].id, document.episodes[0].id];

    assert.deepEqual(resolvePublicationVersions(locked, [version], selected), [version, version]);
    assert.deepEqual(resolvePublicationVersions(locked, [version], [...selected, "new-episode"]), []);
    assert.deepEqual(resolvePublicationVersions(locked, [{ ...version, kind: "manual" }], selected), []);
    assert.deepEqual(resolvePublicationVersions(locked, [{ ...version, projectId: "other" }], selected), []);
    assert.deepEqual(resolvePublicationVersions(locked, [{ ...version, hash: "tampered" }], selected), []);
});

test("本集发布按所选剧集顺序解析，并拒绝归属或哈希错误的版本", () => {
    const document = lockedProject();
    const first = createScriptVersion(document, {
        scope: "episode",
        episodeId: document.episodes[0].id,
        label: "第一集",
        kind: "locked",
    });
    const second = createScriptVersion(document, {
        scope: "episode",
        episodeId: document.episodes[1].id,
        label: "第二集",
        kind: "locked",
    });
    const locked = activateScriptVersion(activateScriptVersion(document, first), second);
    const ids = locked.episodes.map((episode) => episode.id);

    assert.deepEqual(resolvePublicationVersions(locked, [first, second], [...ids].reverse()), [second, first]);
    assert.deepEqual(resolvePublicationVersions(locked, [first], ids), []);
    assert.deepEqual(resolvePublicationVersions(locked, [{ ...first, episodeId: document.episodes[1].id }, second], ids), []);
    assert.deepEqual(resolvePublicationVersions(locked, [{ ...first, hash: "tampered" }, second], ids), []);
    assert.deepEqual(resolvePublicationVersions(locked, [first, second], ["missing-episode"]), []);
});
