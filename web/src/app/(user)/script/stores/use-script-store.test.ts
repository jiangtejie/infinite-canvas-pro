import assert from "node:assert/strict";
import test from "node:test";

import { fixtureDocument } from "@/test/script-fixtures";
import { installScriptMemoryDriver } from "@/test/script-memory-driver";

const clearStorage = await installScriptMemoryDriver();
const { configureScriptAccount, loadScriptProject, loadScriptVersions, syncScriptProject, useScriptStore } = await import("./use-script-store");
const { createSyncBaseline, mergeScriptDocuments } = await import("../utils/script-merge");
const { writeScriptOutbox, readScriptOutbox } = await import("../utils/script-outbox");
const { summarizeScriptProject } = await import("../utils/script-document");
const { useUserStore } = await import("@/stores/use-user-store");

async function resetAccount(accountId = "account-1") {
    await clearStorage();
    useUserStore.setState({ token: "" });
    useScriptStore.setState({ summaries: [], documents: {}, versions: {}, conflicts: {}, loadStates: {}, syncStates: {} });
    await configureScriptAccount(accountId);
}

test("updateScene increments only the edited scene revision", async () => {
    await resetAccount();
    const document = fixtureDocument("p1");
    useScriptStore.setState({ documents: { p1: document }, summaries: [] });
    await useScriptStore.getState().updateScene("p1", "episode-1", "scene-2", { content: "新正文" });
    const next = useScriptStore.getState().documents.p1;
    assert.equal(next.episodes[0].scenes[0].revision, 1);
    assert.equal(next.episodes[0].scenes[1].revision, 2);
    assert.equal(useScriptStore.getState().syncStates.p1, "local");
});

test("first edit after sync merges against the pre-edit scene baseline", async () => {
    await resetAccount();
    const synced = fixtureDocument("p1");
    useScriptStore.setState({ documents: { p1: structuredClone(synced) }, summaries: [summarizeScriptProject(synced, 6)] });
    await useScriptStore.getState().updateScene("p1", "episode-1", "scene-2", { content: "新正文" });
    const outbox = await readScriptOutbox("account-1", "p1");
    assert.ok(outbox);
    const merged = mergeScriptDocuments(outbox.base, outbox.document, synced);
    assert.equal(merged.document.episodes[0].scenes[1].content, "新正文");
    assert.deepEqual(merged.conflicts, []);
});

test("project persistence writes document, summary and outbox under the account", async () => {
    await resetAccount();
    const document = fixtureDocument("p1");
    useScriptStore.setState({ documents: { p1: document }, summaries: [] });
    await useScriptStore.getState().persistScriptProject("p1");
    const { default: localforage } = await import("localforage");
    assert.deepEqual(await localforage.getItem("infinite-canvas:script:v2:project:account-1:p1"), document);
    const index = await localforage.getItem<{ items: { id: string }[] }>("infinite-canvas:script:v2:index:account-1");
    assert.equal(index?.items[0].id, "p1");
    assert.ok(await localforage.getItem("infinite-canvas:script:v2:outbox:account-1:p1"));
});

test("account hydration does not expose another account's projects", async () => {
    await resetAccount("account-1");
    const document = fixtureDocument("p1");
    useScriptStore.setState({ documents: { p1: document }, summaries: [] });
    await useScriptStore.getState().persistScriptProject("p1");
    await configureScriptAccount("account-2");
    await useScriptStore.getState().hydrateScriptIndex("account-2");
    assert.deepEqual(useScriptStore.getState().summaries, []);
    assert.deepEqual(useScriptStore.getState().documents, {});
});

test("create and import persist immediately and create a first-sync outbox", async () => {
    await resetAccount();
    const id = await useScriptStore.getState().createProject({ title: "新剧本" });
    assert.equal(useScriptStore.getState().documents[id].title, "新剧本");
    assert.equal(useScriptStore.getState().summaries[0].revision, 0);
    const { default: localforage } = await import("localforage");
    const outbox = await localforage.getItem<{ base: { revision: number } }>(`infinite-canvas:script:v2:outbox:account-1:${id}`);
    assert.equal(outbox?.base.revision, 0);
    const importedId = await useScriptStore.getState().importProject(fixtureDocument("imported"));
    assert.equal(useScriptStore.getState().documents[importedId].episodes.length, 2);
});

test("guest load is ready without waiting for a server", async () => {
    await resetAccount();
    const document = fixtureDocument("p1");
    useScriptStore.setState({ documents: { p1: document }, summaries: [] });
    await useScriptStore.getState().persistScriptProject("p1");
    useScriptStore.setState({ documents: {}, summaries: [] });
    await useScriptStore.getState().loadScriptProject("p1");
    assert.equal(useScriptStore.getState().loadStates.p1, "ready");
    assert.equal(useScriptStore.getState().documents.p1.id, "p1");
});

test("guest versions persist locally and activate only valid locks", async () => {
    await resetAccount();
    const id = await useScriptStore.getState().createProject({ title: "版本剧本" });
    const locked = await useScriptStore.getState().lockVersion(id, { scope: "project", label: "锁定" });
    assert.equal(useScriptStore.getState().documents[id].lockedVersionId, locked.id);
    assert.equal(useScriptStore.getState().versions[id][0].kind, "locked");
    const { default: localforage } = await import("localforage");
    assert.equal((await localforage.getItem(`infinite-canvas:script:v2:version:account-1:${id}:${locked.id}`))?.id, locked.id);
    assert.equal((await localforage.getItem(`infinite-canvas:script:v2:project:account-1:${id}`))?.lockedVersionId, locked.id);
});

test("online version save synchronizes pending edits before the version transaction", async () => {
    await resetAccount();
    const document = fixtureDocument("p1");
    useScriptStore.setState({ documents: { p1: document }, summaries: [] });
    await useScriptStore.getState().updateScene("p1", "episode-1", "scene-2", { content: "待同步正文" });
    useUserStore.setState({ token: "online-token" });
    const { default: axios } = await import("axios");
    const previousAdapter = axios.defaults.adapter;
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const calls: string[] = [];
    axios.defaults.adapter = async (config) => {
        const body = typeof config.data === "string" ? JSON.parse(config.data) : {};
        calls.push(`${config.method} ${config.url}`);
        if (config.url === "/api/v1/script/projects") return { status: 200, data: { code: 0, data: { document: body, revision: 1 }, msg: "" } };
        if (config.method === "get") return { status: 200, data: { code: 0, data: { items: [] }, msg: "" } };
        assert.equal(config.url, "/api/v1/script/projects/p1/versions");
        assert.equal(body.baseRevision, 1);
        assert.equal(body.version.data.episodes[0].scenes[1].content, "待同步正文");
        return { status: 200, data: { code: 0, data: { document: useScriptStore.getState().documents.p1, revision: 2 }, msg: "" } };
    };
    try {
        await useScriptStore.getState().saveVersion("p1", { scope: "project", label: "同步后版本" });
        assert.deepEqual(calls, ["post /api/v1/script/projects", "post /api/v1/script/projects/p1/versions", "get /api/v1/script/projects/p1/versions"]);
    } finally {
        axios.defaults.adapter = previousAdapter;
        if (onlineDescriptor) Object.defineProperty(navigator, "onLine", onlineDescriptor);
        else Reflect.deleteProperty(navigator, "onLine");
    }
});

test("account version cache remains readable when the server is unreachable", async () => {
    await resetAccount();
    const id = await useScriptStore.getState().createProject({ title: "离线版本" });
    const version = await useScriptStore.getState().saveVersion(id, { scope: "project", label: "本机版本" });
    useUserStore.setState({ token: "offline-token" });
    useScriptStore.setState({ versions: {} });
    await loadScriptVersions(id);
    assert.equal(useScriptStore.getState().versions[id]?.[0]?.id, version.id);
});

test("loading a pending project previews remote changes without moving the sync baseline", async () => {
    await resetAccount();
    const base = fixtureDocument("p1");
    const pending = structuredClone(base);
    pending.episodes[0].scenes[0].content = "本地正文";
    const remote = structuredClone(base);
    remote.episodes[1].scenes[0].content = "远端正文";
    const { default: localforage } = await import("localforage");
    await localforage.setItem("infinite-canvas:script:v2:project:account-1:p1", pending);
    await writeScriptOutbox("account-1", "p1", { document: pending, base: createSyncBaseline(base, 1) });
    useUserStore.setState({ token: "online-token" });
    const { default: axios } = await import("axios");
    const previousAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async () => ({ status: 200, data: { code: 0, data: { document: remote, revision: 2 }, msg: "" } });
    try {
        await loadScriptProject("p1");
    } finally {
        axios.defaults.adapter = previousAdapter;
    }
    const preview = useScriptStore.getState().documents.p1;
    assert.equal(preview.episodes[0].scenes[0].content, "本地正文");
    assert.equal(preview.episodes[1].scenes[0].content, "远端正文");
    const outbox = await localforage.getItem<{ document: typeof base; base: { revision: number; scenes: Record<string, { hash: string }> } }>("infinite-canvas:script:v2:outbox:account-1:p1");
    assert.equal(outbox?.document.episodes[1].scenes[0].content, base.episodes[1].scenes[0].content);
    assert.equal(outbox?.base.revision, 1);
    assert.equal(outbox?.base.scenes["scene-1"].hash, createSyncBaseline(base, 1).scenes["scene-1"].hash);
});

test("guest lock and restore update the pending document", async () => {
    await resetAccount("guest");
    const id = await useScriptStore.getState().createProject({ title: "游客锁定" });
    const episodeId = useScriptStore.getState().documents[id].episodes[0].id;
    await useScriptStore.getState().addScene(id, episodeId);
    await useScriptStore.getState().updateScene(id, episodeId, useScriptStore.getState().documents[id].episodes[0].scenes[0].id, { content: "阿健推门进来。" });
    const locked = await useScriptStore.getState().lockVersion(id, { scope: "project", label: "锁定" });
    const { readScriptOutbox } = await import("../utils/script-outbox");
    let outbox = await readScriptOutbox("guest", id);
    assert.equal(outbox?.document.lockedVersionId, locked.id);
    await useScriptStore.getState().restoreVersion(id, locked.id);
    outbox = await readScriptOutbox("guest", id);
    assert.equal(outbox?.document.episodes[0].scenes[0].content, "阿健推门进来。");
    assert.equal(outbox?.document.episodes[0].scenes[0].revision, 3);
});

test("guest login copies locked versions into the account partition", async () => {
    await resetAccount("guest");
    const id = await useScriptStore.getState().createProject({ title: "游客接管" });
    const locked = await useScriptStore.getState().lockVersion(id, { scope: "project", label: "锁定" });
    await configureScriptAccount("account-1");
    const { default: localforage } = await import("localforage");
    const version = await localforage.getItem(`infinite-canvas:script:v2:version:account-1:${id}:${locked.id}`);
    assert.equal(version?.id, locked.id);
    const document = await localforage.getItem(`infinite-canvas:script:v2:project:account-1:${id}`);
    assert.equal(document?.lockedVersionId, locked.id);
});

test("account configuration can retry after a storage failure", async () => {
    await resetAccount("guest");
    const id = await useScriptStore.getState().createProject({ title: "接管重试" });
    const { default: localforage } = await import("localforage");
    const setItem = localforage.setItem.bind(localforage);
    let failed = false;
    localforage.setItem = async (key, value) => {
        if (!failed && key === "infinite-canvas:script:v2:index:account-1") {
            failed = true;
            throw new Error("存储写入失败");
        }
        return setItem(key, value);
    };
    try {
        await assert.rejects(configureScriptAccount("account-1"), /存储写入失败/);
    } finally {
        localforage.setItem = setItem;
    }
    await configureScriptAccount("account-1");
    assert.equal((await localforage.getItem(`infinite-canvas:script:v2:project:account-1:${id}`))?.title, "接管重试");
});

test("same-ID guest and account documents preserve both sides as a conflict", async () => {
    await resetAccount("guest");
    const guest = fixtureDocument("p1");
    guest.episodes[0].scenes[0].content = "游客正文";
    const account = fixtureDocument("p1");
    account.episodes[0].scenes[0].content = "账号正文";
    const { default: localforage } = await import("localforage");
    await localforage.setItem("infinite-canvas:script:v2:index:guest", { items: [{ id: "p1", revision: 0 }] });
    await localforage.setItem("infinite-canvas:script:v2:project:guest:p1", guest);
    await localforage.setItem("infinite-canvas:script:v2:index:account-1", { items: [] });
    await localforage.setItem("infinite-canvas:script:v2:project:account-1:p1", account);
    await configureScriptAccount("account-1");
    assert.equal((await localforage.getItem<typeof account>("infinite-canvas:script:v2:project:account-1:p1"))?.episodes[0].scenes[0].content, "账号正文");
    const outbox = await localforage.getItem<{ document: typeof guest; conflicts: unknown[] }>("infinite-canvas:script:v2:outbox:account-1:p1");
    assert.equal(outbox?.document.episodes[0].scenes[0].content, "游客正文");
    assert.ok(outbox?.conflicts.length);
});

test("failed project deletion retries from its local tombstone", async () => {
    await resetAccount();
    const id = await useScriptStore.getState().createProject({ title: "删除重试" });
    useUserStore.setState({ token: "online-token" });
    const { default: axios } = await import("axios");
    const previousAdapter = axios.defaults.adapter;
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } } });
    let attempts = 0;
    axios.defaults.adapter = async (config) => {
        assert.equal(config.method, "delete");
        assert.ok(config.url?.startsWith(`/api/v1/script/projects/${id}`));
        attempts += 1;
        if (attempts === 1) throw new Error("网络断开");
        return { status: 200, data: { code: 0, data: { deleted: true }, msg: "" } };
    };
    try {
        await assert.rejects(useScriptStore.getState().deleteProjects([id]), /网络断开|接口连接失败/);
        assert.ok(useScriptStore.getState().documents[id]);
        const { readTombstones } = await import("@/lib/sync-tombstones");
        assert.ok(readTombstones("script-projects")[id]);
        assert.equal(attempts, 1);
        await syncScriptProject(id);
    } finally {
        axios.defaults.adapter = previousAdapter;
        if (onlineDescriptor) Object.defineProperty(navigator, "onLine", onlineDescriptor);
        else Reflect.deleteProperty(navigator, "onLine");
        if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
        else Reflect.deleteProperty(globalThis, "window");
    }
    assert.equal(attempts, 2);
    assert.equal(useScriptStore.getState().documents[id], undefined);
});
