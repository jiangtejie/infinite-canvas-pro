import assert from "node:assert/strict";
import test from "node:test";

import { scriptTextHash } from "@/lib/film/film-script-import";

import type { ScriptProjectDocument } from "../types";
import { createScriptEpisode, createScriptProject, createScriptScene } from "./script-project";
import { exportScriptText, snapshotScriptContent } from "./script-document";
import {
    activateScriptVersion,
    canDeleteScriptVersion,
    createScriptVersion,
    diffScriptSnapshots,
    restoreScriptVersion,
} from "./script-version";

function projectWithTwoEpisodes() {
    const document = createScriptProject({ title: "版本测试", format: "tv" });
    document.episodes[0].scenes = [{ ...createScriptScene(1), location: "旧地点", content: "旧正文" }];
    document.episodes.push({ ...createScriptEpisode(2), scenes: [{ ...createScriptScene(1), location: "第二集" }] });
    return document;
}

test("内容哈希保留 UTF-16 code unit 语义", () => {
    assert.equal(scriptTextHash("A😀\n"), "20558029");
});

test("项目和本集锁定写入成对引用，手动版本不能激活", () => {
    const document = projectWithTwoEpisodes();
    const episode = document.episodes[0];
    const episodeVersion = createScriptVersion(document, {
        scope: "episode",
        episodeId: episode.id,
        label: "本集锁定",
        kind: "locked",
    });
    const episodeLocked = activateScriptVersion(document, episodeVersion);
    assert.equal(episodeLocked.episodes[0].lockedVersionId, episodeVersion.id);
    assert.equal(episodeLocked.episodes[0].lockedVersionHash, episodeVersion.hash);
    assert.equal(episodeLocked.episodes[1].lockedVersionId, undefined);

    const projectVersion = createScriptVersion(episodeLocked, {
        scope: "project",
        label: "项目锁定",
        kind: "locked",
    });
    const projectLocked = activateScriptVersion(episodeLocked, projectVersion);
    assert.equal(projectLocked.lockedVersionId, projectVersion.id);
    assert.equal(projectLocked.lockedVersionHash, projectVersion.hash);
    assert.equal(projectLocked.episodes[0].lockedVersionId, episodeVersion.id);

    const manual = createScriptVersion(document, { scope: "project", label: "手动", kind: "manual" });
    assert.throws(() => activateScriptVersion(document, manual), /锁定版本/);
});

test("版本快照深拷贝创作内容且不保存锁定引用", () => {
    const document = projectWithTwoEpisodes();
    document.episodes[0].lockedVersionId = "old-lock";
    document.episodes[0].lockedVersionHash = "old-hash";
    const version = createScriptVersion(document, { scope: "project", label: "快照", kind: "manual" });

    document.title = "修改后的标题";
    document.episodes[0].scenes[0].content = "修改后的正文";
    document.episodes[0].scenes[0].characters.push("新人物");

    assert.equal(version.data.title, "版本测试");
    assert.equal(version.data.episodes[0].scenes[0].content, "旧正文");
    assert.deepEqual(version.data.episodes[0].scenes[0].characters, []);
    assert.equal(version.data.episodes.length, 2);
    assert.equal(version.data.episodes[0].lockedVersionId, undefined);
    assert.equal(version.data.episodes[0].lockedVersionHash, undefined);
    assert.equal(version.hash, scriptTextHash(exportScriptText(version.data)));
});

test("项目恢复替换创作内容、递增场次修订并保留恢复前安全稿", () => {
    const document = projectWithTwoEpisodes();
    const projectLock = createScriptVersion(document, { scope: "project", label: "项目锁定", kind: "locked" });
    const projectLocked = activateScriptVersion(document, projectLock);
    const currentEpisodeLock = createScriptVersion(projectLocked, {
        scope: "episode",
        episodeId: document.episodes[0].id,
        label: "本集锁定",
        kind: "locked",
    });
    const locked = activateScriptVersion(projectLocked, currentEpisodeLock);
    locked.title = "锁定后工作稿";
    locked.episodes[0].scenes[0].content = "锁定后正文";

    const restored = restoreScriptVersion(locked, projectLock);
    assert.equal(restored.document.title, "版本测试");
    assert.equal(restored.document.episodes[0].scenes[0].content, "旧正文");
    assert.equal(restored.document.episodes[0].scenes[0].revision, 2);
    assert.ok(restored.document.episodes[0].scenes[0].updatedAt);
    assert.equal(restored.document.lockedVersionId, projectLock.id);
    assert.equal(restored.document.lockedVersionHash, projectLock.hash);
    assert.equal(restored.document.episodes[0].lockedVersionId, currentEpisodeLock.id);
    assert.equal(restored.document.episodes[0].lockedVersionHash, currentEpisodeLock.hash);
    assert.equal(restored.document.id, locked.id);
    assert.deepEqual(restored.document.publications, locked.publications);
    assert.equal(restored.safety.kind, "safety");
    assert.equal(restored.safety.data.title, "锁定后工作稿");
    assert.equal(restored.safety.data.episodes[0].scenes[0].content, "锁定后正文");
    assert.equal(locked.title, "锁定后工作稿");
});

test("恢复非当前项目版本清除项目锁定，但保留仍存在剧集的锁定", () => {
    const document = projectWithTwoEpisodes();
    const oldLock = createScriptVersion(document, { scope: "project", label: "旧锁定", kind: "locked" });
    const locked = activateScriptVersion(document, oldLock);
    const newLock = createScriptVersion(locked, { scope: "project", label: "新锁定", kind: "locked" });
    const relocked = activateScriptVersion(locked, newLock);

    const restored = restoreScriptVersion(relocked, oldLock);
    assert.equal(restored.document.lockedVersionId, undefined);
    assert.equal(restored.document.lockedVersionHash, undefined);
});

test("本集恢复只替换目标剧集，并仅保留当前本集锁定", () => {
    const document = projectWithTwoEpisodes();
    const firstVersion = createScriptVersion(document, {
        scope: "episode",
        episodeId: document.episodes[0].id,
        label: "第一集旧稿",
        kind: "locked",
    });
    const secondVersion = createScriptVersion(document, {
        scope: "episode",
        episodeId: document.episodes[1].id,
        label: "第二集锁定",
        kind: "locked",
    });
    const firstLocked = activateScriptVersion(document, firstVersion);
    const bothLocked = activateScriptVersion(firstLocked, secondVersion);
    bothLocked.episodes[0].scenes[0].content = "第一集新正文";

    const currentRestored = restoreScriptVersion(bothLocked, firstVersion);
    assert.equal(currentRestored.document.episodes[0].scenes[0].content, "旧正文");
    assert.equal(currentRestored.document.episodes[0].lockedVersionId, firstVersion.id);
    assert.equal(currentRestored.document.episodes[1].lockedVersionId, secondVersion.id);
    assert.deepEqual(currentRestored.document.episodes[1], bothLocked.episodes[1]);

    const relocked = activateScriptVersion(currentRestored.document, createScriptVersion(currentRestored.document, {
        scope: "episode",
        episodeId: document.episodes[0].id,
        label: "第一集新锁定",
        kind: "locked",
    }));
    const oldRestored = restoreScriptVersion(relocked, firstVersion);
    assert.equal(oldRestored.document.episodes[0].lockedVersionId, undefined);
    assert.equal(oldRestored.document.episodes[0].lockedVersionHash, undefined);
    assert.equal(oldRestored.document.episodes[1].lockedVersionId, secondVersion.id);
});

test("删除保护覆盖当前锁定、发布引用与项目归属", () => {
    const document = projectWithTwoEpisodes();
    const version = createScriptVersion(document, { scope: "project", label: "锁定", kind: "locked" });
    const locked = activateScriptVersion(document, version);
    assert.equal(canDeleteScriptVersion(locked, version).allowed, false);

    const publishedVersion = createScriptVersion(document, { scope: "project", label: "已发布", kind: "manual" });
    const published: ScriptProjectDocument = {
        ...locked,
        publications: [{
            id: "publication-1",
            episodeIds: [locked.episodes[0].id],
            sourceVersionIds: [publishedVersion.id],
            sourceHash: publishedVersion.hash,
            status: "published",
        }],
    };
    assert.match(canDeleteScriptVersion(published, publishedVersion).reason || "", /发布/);

    const manual = createScriptVersion(document, { scope: "project", label: "手动", kind: "manual" });
    assert.deepEqual(canDeleteScriptVersion(document, manual), { allowed: true });
    assert.equal(canDeleteScriptVersion({ ...document, id: "other" }, manual).allowed, false);
});

test("快照差异按稳定场次 ID 汇总并忽略修订时间", () => {
    const previousDocument = projectWithTwoEpisodes();
    previousDocument.characters = [{ id: "c1", name: "阿健", role: "主角", want: "", need: "", flaw: "", arc: "", description: "" }];
    const previous = snapshotScriptContent(previousDocument);
    const currentDocument = structuredClone(previousDocument);
    const [changed] = currentDocument.episodes[0].scenes;
    changed.location = "新地点";
    changed.content = "新正文";
    changed.revision = 8;
    changed.updatedAt = "2030-01-01T00:00:00.000Z";
    currentDocument.episodes[1].scenes = [];
    currentDocument.episodes[0].scenes.push({ ...createScriptScene(2), content: "新增正文" });
    currentDocument.characters[0].role = "反派";
    currentDocument.characters.push({ id: "c2", name: "老板娘", role: "", want: "", need: "", flaw: "", arc: "", description: "" });
    const current = snapshotScriptContent(currentDocument);

    const diff = diffScriptSnapshots(current, previous);
    assert.deepEqual([diff.added, diff.removed, diff.changed, diff.same], [1, 1, 1, 0]);
    assert.equal(diff.wordDelta, 4);
    assert.deepEqual(diff.scenes.find((scene) => scene.id === changed.id)?.changedFields, ["地点", "正文"]);
    assert.deepEqual(diff.characterChanges, ["新增角色：老板娘", "阿健：定位变化"]);
});
