import assert from "node:assert/strict";
import test from "node:test";
import localforage from "localforage";

import { fixtureDocument } from "@/test/script-fixtures";
import { installScriptMemoryDriver } from "@/test/script-memory-driver";
import { axiosResponse } from "@/test/axios-adapter";
import { activateScriptVersion, createScriptVersion } from "@/app/(user)/script/utils/script-version";
import { summarizeScriptProject } from "@/app/(user)/script/utils/script-document";
import { CanvasNodeType } from "@/app/(user)/canvas/types";

const clearStorage = await installScriptMemoryDriver();
const { findFilmProjectByPublication, importScriptPublicationForFilm, publishScriptToFilm, previewScriptPublicationRefresh, applyScriptPublicationRefresh } = await import("./script-film-publication");
const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
const { configureScriptAccount, useScriptStore } = await import("@/app/(user)/script/stores/use-script-store");
const { useUserStore } = await import("@/stores/use-user-store");

async function setup() {
    await clearStorage();
    useUserStore.setState({ token: "" });
    useCanvasStore.setState({ projects: [] });
    useScriptStore.setState({ summaries: [], documents: {}, versions: {}, conflicts: {}, loadStates: {}, syncStates: {} });
    await configureScriptAccount("account-1");
    const document = fixtureDocument();
    const version = createScriptVersion(document, { scope: "project", label: "锁定", kind: "locked" });
    const locked = activateScriptVersion(document, version);
    useScriptStore.setState({
        documents: { [document.id]: locked },
        summaries: [summarizeScriptProject(locked, 1)],
        versions: { [document.id]: [version] },
    });
    return { document, locked, version };
}

test("publication retry finds the existing film project", () => {
    const project = useCanvasStore.getState().createFilmProject("测试影视", { id: "film-1", scriptPublicationId: "pub-1" });
    assert.equal(findFilmProjectByPublication("pub-1")?.id, project);
});

test("publication creates a stable graph and retry keeps the original locked snapshot", async () => {
    const { document, locked, version } = await setup();
    const episodeIds = locked.episodes.map((episode) => episode.id);
    const publication = await publishScriptToFilm({ projectId: document.id, episodeIds });
    assert.equal(publication.status, "published");
    assert.ok(publication.filmProjectId);
    const film = findFilmProjectByPublication(publication.id)!;
    assert.equal(film.id, publication.filmProjectId);
    assert.ok(film.nodes.some((node) => node.id === "scene-1"));
    assert.ok(film.nodes.some((node) => node.id === "scene-1:0"));

    const edited = structuredClone(useScriptStore.getState().documents[document.id]);
    edited.episodes[0].scenes[0].content = "更新后的锁定正文";
    const nextVersion = createScriptVersion(edited, { scope: "project", label: "新锁定", kind: "locked" });
    const nextLocked = activateScriptVersion(edited, nextVersion);
    useScriptStore.setState({
        documents: { [document.id]: nextLocked },
        summaries: [summarizeScriptProject(nextLocked, 2)],
        versions: { [document.id]: [nextVersion, version] },
    });
    const retried = await publishScriptToFilm({ projectId: document.id, episodeIds, publicationId: publication.id });
    assert.equal(retried.filmProjectId, film.id);
    const script = findFilmProjectByPublication(publication.id)!.nodes.find((node) => node.type === CanvasNodeType.FilmScript)!;
    assert.match(script.metadata?.filmScript?.text || "", /阿健推门进来/);
    assert.doesNotMatch(script.metadata?.filmScript?.text || "", /更新后的锁定正文/);
    assert.equal(useCanvasStore.getState().projects.length, 1);
});

test("publication retry rejects a different episode selection", async () => {
    const { document, locked } = await setup();
    const episodeIds = locked.episodes.map((episode) => episode.id);
    const publication = await publishScriptToFilm({ projectId: document.id, episodeIds });
    await assert.rejects(
        publishScriptToFilm({ projectId: document.id, episodeIds: [episodeIds[0]], publicationId: publication.id }),
        /剧集/,
    );
    assert.equal(useCanvasStore.getState().projects.length, 1);
});

test("failed publication can retry without creating a second film project", async () => {
    const { document, locked } = await setup();
    const saveProjectNow = useCanvasStore.getState().saveProjectNow;
    useCanvasStore.setState({ saveProjectNow: async () => { throw new Error("本地写入失败"); } });
    try {
        await assert.rejects(
            publishScriptToFilm({ projectId: document.id, episodeIds: locked.episodes.map((episode) => episode.id) }),
            /本地写入失败/,
        );
    } finally {
        useCanvasStore.setState({ saveProjectNow });
    }
    const failed = useScriptStore.getState().documents[document.id].publications[0];
    assert.equal(failed.status, "failed");
    const publication = await publishScriptToFilm({ projectId: document.id, episodeIds: failed.episodeIds, publicationId: failed.id });
    assert.equal(publication.status, "published");
    assert.equal(useCanvasStore.getState().projects.length, 1);
});

test("import binds a dedicated publication copy to the current film canvas", async () => {
    const { document, locked, version } = await setup();
    await localforage.setItem(`infinite-canvas:script:v2:project:account-1:${document.id}`, locked);
    await localforage.setItem(`infinite-canvas:script:v2:version:account-1:${document.id}:${version.id}`, version);
    const filmId = useCanvasStore.getState().createFilmProject("手动影视", { id: "film-import" });
    const { publication, source, text } = await importScriptPublicationForFilm({ projectId: document.id, filmId });
    assert.equal(publication.status, "published");
    assert.equal(publication.filmProjectId, filmId);
    assert.equal(useScriptStore.getState().documents[document.id].publications.length, 1);
    assert.equal(source.projectId, document.id);
    assert.equal(source.publicationId, publication.id);
    assert.equal(source.hash, publication.sourceHash);
    assert.match(text, /阿健推门进来/);
    assert.equal(findFilmProjectByPublication(publication.id)?.id, filmId);
});

test("import keeps the original publication untouched and reuses the canvas copy", async () => {
    const { document, locked, version } = await setup();
    await localforage.setItem(`infinite-canvas:script:v2:project:account-1:${document.id}`, locked);
    await localforage.setItem(`infinite-canvas:script:v2:version:account-1:${document.id}:${version.id}`, version);
    const published = await publishScriptToFilm({ projectId: document.id, episodeIds: locked.episodes.map((episode) => episode.id) });
    const originalFilmId = published.filmProjectId!;
    const filmId = useCanvasStore.getState().createFilmProject("另一个影视", { id: "film-import" });

    const first = await importScriptPublicationForFilm({ projectId: document.id, filmId });
    assert.notEqual(first.publication.id, published.id);
    assert.equal(first.publication.filmProjectId, filmId);
    assert.equal(first.publication.sourceHash, published.sourceHash);

    const second = await importScriptPublicationForFilm({ projectId: document.id, filmId });
    assert.equal(second.publication.id, first.publication.id);
    assert.equal(useScriptStore.getState().documents[document.id].publications.length, 2);

    const original = useScriptStore.getState().documents[document.id].publications.find((item) => item.id === published.id)!;
    assert.equal(original.filmProjectId, originalFilmId);
    assert.equal(findFilmProjectByPublication(published.id)?.id, originalFilmId);
});

test("import rejects a script without locked episodes", async () => {
    const { document } = await setup();
    useScriptStore.setState({ documents: { [document.id]: fixtureDocument() } });
    useCanvasStore.getState().createFilmProject("空影视", { id: "film-empty" });
    await assert.rejects(importScriptPublicationForFilm({ projectId: document.id, filmId: "film-empty" }), /锁定/);
});

test("refresh preview resolves the current locked snapshot in the existing film project", async () => {
    const { document, locked, version } = await setup();
    const episodeIds = locked.episodes.map((episode) => episode.id);
    const published = await publishScriptToFilm({ projectId: document.id, episodeIds });
    const edited = structuredClone(useScriptStore.getState().documents[document.id]);
    edited.episodes[0].scenes[0].content = "刷新后的锁定正文";
    const nextVersion = createScriptVersion(edited, { scope: "project", label: "刷新锁定", kind: "locked" });
    const nextLocked = activateScriptVersion(edited, nextVersion);
    useScriptStore.setState({
        documents: { [document.id]: nextLocked },
        summaries: [summarizeScriptProject(nextLocked, 2)],
        versions: { [document.id]: [nextVersion, version] },
    });

    const preview = await previewScriptPublicationRefresh(document.id, published.id);
    assert.equal(preview.publication.filmProjectId, published.filmProjectId);
    assert.notEqual(preview.source.hash, published.sourceHash);
    assert.ok(preview.plan.updated.includes("scene-1:0"));
    const refreshed = await applyScriptPublicationRefresh(document.id, published.id, preview.source.hash!);
    assert.equal(refreshed.sourceHash, preview.source.hash);
    assert.deepEqual(refreshed.sourceVersionIds, [nextVersion.id]);
    assert.equal(useCanvasStore.getState().projects.length, 1);
    const film = findFilmProjectByPublication(published.id)!;
    const script = film.nodes.find((node) => node.type === CanvasNodeType.FilmScript)!;
    assert.equal(script.metadata?.filmScript?.source?.hash, preview.source.hash);
    assert.match(script.metadata?.filmScript?.text || "", /刷新后的锁定正文/);
});

test("refresh rejects a stale preview before changing the film graph", async () => {
    const { document, locked, version } = await setup();
    const episodeIds = locked.episodes.map((episode) => episode.id);
    const published = await publishScriptToFilm({ projectId: document.id, episodeIds });
    const before = structuredClone(findFilmProjectByPublication(published.id)!);
    const edited = structuredClone(useScriptStore.getState().documents[document.id]);
    edited.episodes[0].scenes[0].content = "第一次更新";
    const firstVersion = createScriptVersion(edited, { scope: "project", label: "第一次", kind: "locked" });
    useScriptStore.setState({ documents: { [document.id]: activateScriptVersion(edited, firstVersion) }, versions: { [document.id]: [firstVersion, version] } });
    const preview = await previewScriptPublicationRefresh(document.id, published.id);
    edited.episodes[0].scenes[0].content = "第二次更新";
    const secondVersion = createScriptVersion(edited, { scope: "project", label: "第二次", kind: "locked" });
    useScriptStore.setState({ documents: { [document.id]: activateScriptVersion(edited, secondVersion) }, versions: { [document.id]: [secondVersion, firstVersion, version] } });

    await assert.rejects(applyScriptPublicationRefresh(document.id, published.id, preview.source.hash!), /重新预览/);
    assert.deepEqual(findFilmProjectByPublication(published.id), before);
    assert.equal(useCanvasStore.getState().projects.length, 1);
});

test("apply reloads the source before rejecting a preview stale in another context", async () => {
    const { document, locked, version } = await setup();
    const episodeIds = locked.episodes.map((episode) => episode.id);
    const published = await publishScriptToFilm({ projectId: document.id, episodeIds });
    const before = structuredClone(findFilmProjectByPublication(published.id)!);
    const firstEdited = structuredClone(useScriptStore.getState().documents[document.id]);
    firstEdited.episodes[0].scenes[0].content = "当前页预览";
    const firstVersion = createScriptVersion(firstEdited, { scope: "project", label: "当前页", kind: "locked" });
    const firstLocked = activateScriptVersion(firstEdited, firstVersion);
    useScriptStore.setState({
        documents: { [document.id]: firstLocked },
        summaries: [summarizeScriptProject(firstLocked, 2)],
        versions: { [document.id]: [firstVersion, version] },
    });
    const preview = await previewScriptPublicationRefresh(document.id, published.id);
    const { clearScriptOutbox } = await import("@/app/(user)/script/utils/script-outbox");
    await clearScriptOutbox("account-1", document.id);

    const remote = structuredClone(firstLocked);
    remote.episodes[0].scenes[0].content = "另一上下文更新";
    const remoteVersion = createScriptVersion(remote, { scope: "project", label: "另一上下文", kind: "locked" });
    remote.lockedVersionId = remoteVersion.id;
    remote.lockedVersionHash = remoteVersion.hash;
    remote.publications = [published];
    useUserStore.setState({ token: "online-token" });
    const { default: axios } = await import("axios");
    const previousAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config) => {
        const url = config.url || "";
        if (config.method === "get" && url === `/api/v1/script/projects/${document.id}`) return axiosResponse(config, { code: 0, data: { document: remote, revision: 3 }, msg: "" });
        if (config.method === "get" && url === `/api/v1/script/projects/${document.id}/versions`) return axiosResponse(config, { code: 0, data: { items: [{ id: remoteVersion.id }] }, msg: "" });
        if (config.method === "get" && url === `/api/v1/script/projects/${document.id}/versions/${remoteVersion.id}`) return axiosResponse(config, { code: 0, data: remoteVersion, msg: "" });
        throw new Error(`unexpected request ${config.method} ${url}`);
    };
    try {
        await assert.rejects(applyScriptPublicationRefresh(document.id, published.id, preview.source.hash!), /重新预览/);
    } finally {
        axios.defaults.adapter = previousAdapter;
    }
    assert.deepEqual(findFilmProjectByPublication(published.id), before);
});

test("refresh persists the graph before advancing the publication source", async () => {
    const { document, locked, version } = await setup();
    const episodeIds = locked.episodes.map((episode) => episode.id);
    const published = await publishScriptToFilm({ projectId: document.id, episodeIds });
    const edited = structuredClone(useScriptStore.getState().documents[document.id]);
    edited.episodes[0].scenes[0].content = "落盘顺序正文";
    const nextVersion = createScriptVersion(edited, { scope: "project", label: "落盘", kind: "locked" });
    useScriptStore.setState({ documents: { [document.id]: activateScriptVersion(edited, nextVersion) }, versions: { [document.id]: [nextVersion, version] } });
    const preview = await previewScriptPublicationRefresh(document.id, published.id);
    const saveProjectNow = useCanvasStore.getState().saveProjectNow;
    let saved = false;
    useCanvasStore.setState({
        saveProjectNow: async (id) => {
            assert.equal(id, published.filmProjectId);
            const script = useCanvasStore.getState().projects.find((project) => project.id === id)!.nodes.find((node) => node.type === CanvasNodeType.FilmScript)!;
            assert.equal(script.metadata?.filmScript?.source?.hash, preview.source.hash);
            assert.equal(useScriptStore.getState().documents[document.id].publications[0].sourceHash, published.sourceHash);
            await saveProjectNow(id);
            saved = true;
        },
    });
    try {
        await applyScriptPublicationRefresh(document.id, published.id, preview.source.hash!);
    } finally {
        useCanvasStore.setState({ saveProjectNow });
    }
    assert.equal(saved, true);
    assert.equal(useScriptStore.getState().documents[document.id].publications[0].sourceHash, preview.source.hash);
});
