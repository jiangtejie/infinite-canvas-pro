import assert from "node:assert/strict";
import test from "node:test";

import { fixtureDocument } from "@/test/script-fixtures";
import { createSyncBaseline, mergeScriptDocuments, type ScriptOutbox } from "@/app/(user)/script/utils/script-merge";

import { scriptChangeRequest, scriptConflictDocument, resolveScriptOutboxConflict } from "./script-sync";

function pendingOutbox(): ScriptOutbox {
    const document = fixtureDocument("p1");
    return { document: structuredClone(document), base: createSyncBaseline(document, 2) };
}

test("change request keeps original baseline while submitting latest local document", () => {
    const outbox = pendingOutbox();
    outbox.document.title = "本地标题";
    outbox.document.episodes[0].scenes[0].content = "本地正文";
    const request = scriptChangeRequest(outbox);
    assert.equal(request.baseRevision, 2);
    assert.equal(request.baseHeaderHash, outbox.base.headerHash);
    assert.equal(request.document.title, "本地标题");
    assert.deepEqual(request.baseScenes, outbox.base.scenes);
});

test("conflict preview merges independent remote scenes without replacing pending local conflicts", () => {
    const outbox = pendingOutbox();
    outbox.document.title = "本地标题";
    outbox.document.episodes[0].scenes[0].content = "本地场次";
    const remote = structuredClone(outbox.document);
    remote.title = "远端标题";
    remote.episodes[1].scenes[0].content = "远端独立修改";
    const preview = scriptConflictDocument(outbox, remote);
    assert.equal(preview.title, "本地标题");
    assert.equal(preview.episodes[0].scenes[0].content, "本地场次");
    assert.equal(preview.episodes[1].scenes[0].content, "远端独立修改");
    assert.equal(outbox.document.episodes[0].scenes[0].content, "本地场次");
    assert.equal(outbox.document.episodes[1].scenes[0].content, "仓库里传来脚步声。");
});

test("choosing remote for one conflict preserves another unresolved local scene", () => {
    const outbox = pendingOutbox();
    outbox.document.title = "本地标题";
    outbox.document.episodes[0].scenes[0].content = "本地一";
    outbox.document.episodes[1].scenes[0].content = "本地二";
    const remote = structuredClone(outbox.document);
    remote.title = "远端标题";
    remote.episodes[0].scenes[0].content = "远端一";
    remote.episodes[1].scenes[0].content = "远端二";
    outbox.conflicts = [{
        scope: "header",
        local: null,
        remote: {
            title: remote.title, format: remote.format, genre: remote.genre, logline: remote.logline,
            theme: remote.theme, synopsis: remote.synopsis, actOne: remote.actOne, actTwo: remote.actTwo,
            actThree: remote.actThree, characters: remote.characters, lockedVersionId: remote.lockedVersionId,
            lockedVersionHash: remote.lockedVersionHash,
            episodes: remote.episodes.map((episode) => ({ ...episode, sceneIds: episode.scenes.map((scene) => scene.id) })),
            publications: remote.publications,
        },
    }];
    const resolved = resolveScriptOutboxConflict(outbox, { scope: "header", choice: "remote" });
    assert.equal(resolved.document.title, "远端标题");
    assert.equal(resolved.document.episodes[0].scenes[0].content, "本地一");
    assert.deepEqual(resolved.resolutions?.at(-1), { scope: "header", choice: "remote" });
    assert.equal(outbox.document.title, "本地标题");
});

test("choosing remote deletion removes only the conflicted scene", () => {
    const outbox = pendingOutbox();
    const deletedId = outbox.document.episodes[0].scenes[0].id;
    const localScene = outbox.document.episodes[0].scenes[0];
    outbox.conflicts = [{ scope: "scene", id: deletedId, local: localScene, remote: null }];
    const resolved = resolveScriptOutboxConflict(outbox, { scope: "scene", id: deletedId, choice: "remote" });
    assert.equal(resolved.document.episodes[0].scenes.some((scene) => scene.id === deletedId), false);
    assert.equal(resolved.document.episodes[1].scenes.length, 1);
});

test("an unchanged scene with a higher revision wins without a conflict", () => {
    const base = fixtureDocument("p1");
    const local = structuredClone(base);
    const remote = structuredClone(base);
    remote.episodes[0].scenes[0].revision = 9;
    local.title = "本地标题";
    const result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.document.episodes[0].scenes[0].revision, 9);
});
