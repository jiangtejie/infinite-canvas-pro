import { create } from "zustand";
import localforage from "localforage";

import type {
    ScriptConflict, ScriptProjectDocument, ScriptProjectLoadState, ScriptProjectSummary,
    ScriptScene, ScriptSyncState, ScriptVersion,
} from "../types";
import { createScriptEpisode, createScriptProject, createScriptScene } from "../utils/script-project";
import { summarizeScriptProject } from "../utils/script-document";
import { activateScriptVersion, canDeleteScriptVersion, createScriptVersion, restoreScriptVersion } from "../utils/script-version";
import { createSyncBaseline, mergeScriptDocuments, type ScriptOutbox } from "../utils/script-merge";
import { clearScriptOutbox, readScriptOutbox, writeScriptOutbox } from "../utils/script-outbox";
import { readTombstones, writeTombstones } from "@/lib/sync-tombstones";
import { useUserStore } from "@/stores/use-user-store";
import { errorStatus } from "@/services/api/request";
import * as api from "@/services/api/script";
import { resolveScriptOutboxConflict, scriptChangeRequest } from "@/services/script-sync";

type CreateInput = Parameters<typeof createScriptProject>[0];
export type ScenePatch = Partial<Omit<ScriptScene, "id" | "revision" | "updatedAt">>;
type VersionInput = { scope: "project" | "episode"; episodeId?: string; label: string };

type ScriptStore = {
    summaries: ScriptProjectSummary[];
    documents: Record<string, ScriptProjectDocument>;
    versions: Record<string, ScriptVersion[]>;
    conflicts: Record<string, ScriptConflict[]>;
    loadStates: Record<string, ScriptProjectLoadState>;
    syncStates: Record<string, ScriptSyncState>;
    createProject: (input: CreateInput) => Promise<string>;
    importProject: (document: ScriptProjectDocument) => Promise<string>;
    updateDocument: (id: string, updater: (document: ScriptProjectDocument) => ScriptProjectDocument) => Promise<void>;
    updateScene: (id: string, episodeId: string, sceneId: string, patch: ScenePatch) => Promise<void>;
    addEpisode: (id: string) => Promise<void>;
    addScene: (id: string, episodeId: string) => Promise<void>;
    removeScene: (id: string, episodeId: string, sceneId: string) => Promise<void>;
    moveScene: (id: string, episodeId: string, sceneId: string, direction: -1 | 1) => Promise<void>;
    lockVersion: (id: string, input: VersionInput) => Promise<ScriptVersion>;
    saveVersion: (id: string, input: VersionInput) => Promise<ScriptVersion>;
    restoreVersion: (id: string, versionId: string) => Promise<void>;
    deleteVersion: (id: string, versionId: string) => Promise<void>;
    deleteProjects: (ids: string[]) => Promise<void>;
    persistScriptProject: (id: string) => Promise<void>;
    hydrateScriptIndex: (id: string) => Promise<void>;
    loadScriptProject: (id: string) => Promise<void>;
};

let accountId = "guest";
const prefix = "infinite-canvas:script:v2";
const indexKey = (id = accountId) => `${prefix}:index:${id}`;
const projectKey = (id: string, account = accountId) => `${prefix}:project:${account}:${id}`;
const outboxKey = (id: string, account = accountId) => `${prefix}:outbox:${account}:${id}`;
const versionKey = (projectId: string, versionId: string, account = accountId) => `${prefix}:version:${account}:${projectId}:${versionId}`;

function summaryList(state: { summaries: ScriptProjectSummary[] }, document: ScriptProjectDocument, revision: number) {
    const summary = summarizeScriptProject(document, revision);
    return [summary, ...state.summaries.filter((item) => item.id !== document.id)];
}

async function writeLocal(document: ScriptProjectDocument, revision: number) {
    const index = await localforage.getItem<{ items: ScriptProjectSummary[] }>(indexKey()) ?? { items: [] };
    await localforage.setItem(indexKey(), { items: [summarizeScriptProject(document, revision), ...index.items.filter((item) => item.id !== document.id)] });
    await localforage.setItem(projectKey(document.id), document);
}

async function writePending(document: ScriptProjectDocument, base = createSyncBaseline(document, 0), extra: Partial<ScriptOutbox> = {}) {
    await writeLocal(document, base.revision);
    await writeScriptOutbox(accountId, document.id, { document: structuredClone(document), base, ...extra });
}

async function copyGuestToAccount(target: string) {
    if (target === "guest") return;
    const guestIndex = await localforage.getItem<{ items: ScriptProjectSummary[] }>(indexKey("guest"));
    const targetIndex = await localforage.getItem<{ items: ScriptProjectSummary[] }>(indexKey(target)) ?? { items: [] };
    const items = [...targetIndex.items];
    for (const summary of guestIndex?.items ?? []) {
        const guestDocument = await localforage.getItem<ScriptProjectDocument>(projectKey(summary.id, "guest"));
        const targetDocument = await localforage.getItem<ScriptProjectDocument>(projectKey(summary.id, target));
        const guestOutbox = await readScriptOutbox("guest", summary.id);
        if (!guestDocument) continue;
        const guestVersionKeys = (await localforage.keys()).filter((key) => key.startsWith(versionKey(summary.id, "", "guest")));
        await Promise.all(guestVersionKeys.map(async (key) => {
            const version = await localforage.getItem<ScriptVersion>(key);
            if (version) await localforage.setItem(versionKey(summary.id, version.id, target), version);
        }));
        if (!targetDocument) {
            await localforage.setItem(projectKey(summary.id, target), guestDocument);
            if (guestOutbox) await writeScriptOutbox(target, summary.id, guestOutbox);
            if (!items.some((item) => item.id === summary.id)) items.unshift(summary);
            continue;
        }
        const base = { ...createSyncBaseline(targetDocument, summary.revision), headerHash: "", scenes: {} };
        const merged = mergeScriptDocuments(base, guestDocument, targetDocument);
        if (merged.conflicts.length) {
            const outbox: ScriptOutbox = { document: guestDocument, base, conflicts: merged.conflicts };
            await writeScriptOutbox(target, summary.id, outbox);
            useScriptStore.setState((state) => ({ conflicts: { ...state.conflicts, [summary.id]: merged.conflicts }, syncStates: { ...state.syncStates, [summary.id]: "conflict" } }));
        }
    }
    await localforage.setItem(indexKey(target), { items });
    await localforage.removeItem(indexKey("guest"));
    const keys = await localforage.keys();
    await Promise.all(keys.filter((key) => key.startsWith(`${prefix}:project:guest:`) || key.startsWith(`${prefix}:outbox:guest:`) || key.startsWith(`${prefix}:version:guest:`)).map((key) => localforage.removeItem(key)));
}

function applyView(id: string, view: api.ScriptProjectView, synced: boolean) {
    useScriptStore.setState((state) => ({
        documents: { ...state.documents, [id]: view.document },
        summaries: summaryList(state, view.document, view.revision),
        conflicts: { ...state.conflicts, [id]: [] },
        syncStates: { ...state.syncStates, [id]: synced ? "synced" : "local" },
        loadStates: { ...state.loadStates, [id]: "ready" },
    }));
}

async function removeLocalScriptProject(id: string) {
    const keys = (await localforage.keys()).filter((key) => key === projectKey(id) || key === outboxKey(id) || key.startsWith(versionKey(id, "")));
    await Promise.all([...keys.map((key) => localforage.removeItem(key)), clearScriptOutbox(accountId, id)]);
    const index = await localforage.getItem<{ items: ScriptProjectSummary[] }>(indexKey()) ?? { items: [] };
    await localforage.setItem(indexKey(), { items: index.items.filter((item) => item.id !== id) });
    useScriptStore.setState((state) => {
        const documents = { ...state.documents }; delete documents[id];
        const versions = { ...state.versions }; delete versions[id];
        const conflicts = { ...state.conflicts }; delete conflicts[id];
        const loadStates = { ...state.loadStates }; delete loadStates[id];
        const syncStates = { ...state.syncStates }; delete syncStates[id];
        return { documents, summaries: state.summaries.filter((item) => item.id !== id), versions, conflicts, loadStates, syncStates };
    });
}

export const useScriptStore = create<ScriptStore>((set, get) => {
    async function ensureLocal(id: string) {
        const document = get().documents[id];
        if (!document) throw new Error("剧本尚未加载");
        return document;
    }

    async function persist(id: string, previous?: ScriptProjectDocument) {
        const document = await ensureLocal(id);
        const revision = get().summaries.find((item) => item.id === id)?.revision ?? 0;
        const pending = await readScriptOutbox(accountId, id);
        await writePending(document, pending?.base ?? createSyncBaseline(previous ?? document, revision), pending?.conflicts?.length ? { conflicts: pending.conflicts, resolutions: pending.resolutions } : {});
    }

    async function edit(id: string, updater: (document: ScriptProjectDocument) => ScriptProjectDocument) {
        const previous = await ensureLocal(id);
        const document = updater(previous);
        if (!document) return;
        const revision = get().summaries.find((item) => item.id === id)?.revision ?? 0;
        set((state) => ({
            documents: { ...state.documents, [id]: document },
            summaries: summaryList(state, document, revision),
            syncStates: { ...state.syncStates, [id]: "local" },
        }));
        await persist(id, previous);
    }

    async function syncBeforeVersion(id: string) {
        if (!await readScriptOutbox(accountId, id)) return;
        await syncScriptProject(id);
        const state = get().syncStates[id];
        if (state === "conflict" || state === "error") throw new Error(state === "conflict" ? "请先处理同步冲突" : "请先完成剧本同步");
    }

    async function saveLocalVersion(id: string, input: VersionInput & { kind: "manual" | "locked" }) {
        const document = await ensureLocal(id);
        const revision = get().summaries.find((item) => item.id === id)?.revision ?? 0;
        const version = createScriptVersion(document, input);
        const next = input.kind === "locked" ? activateScriptVersion(document, version) : document;
        await localforage.setItem(versionKey(id, version.id), version);
        const pending = await readScriptOutbox(accountId, id);
        await writePending(next, pending?.base ?? createSyncBaseline(document, revision));
        applyView(id, { document: next, revision }, false);
        await loadScriptVersions(id);
        return version;
    }

    return {
        summaries: [], documents: {}, versions: {}, conflicts: {}, loadStates: {}, syncStates: {},
        createProject: async (input) => {
            const document = createScriptProject(input);
            await writePending(document);
            set((state) => ({ documents: { ...state.documents, [document.id]: document }, summaries: summaryList(state, document, 0), loadStates: { ...state.loadStates, [document.id]: "ready" }, syncStates: { ...state.syncStates, [document.id]: "local" } }));
            return document.id;
        },
        importProject: async (document) => {
            await writePending(document);
            set((state) => ({ documents: { ...state.documents, [document.id]: document }, summaries: summaryList(state, document, 0), loadStates: { ...state.loadStates, [document.id]: "ready" }, syncStates: { ...state.syncStates, [document.id]: "local" } }));
            return document.id;
        },
        updateDocument: async (id, updater) => edit(id, (document) => ({ ...updater(document), updatedAt: new Date().toISOString() })),
        updateScene: async (id, episodeId, sceneId, patch) => edit(id, (document) => {
            let changed = false;
            const episodes = document.episodes.map((episode) => episode.id !== episodeId ? episode : {
                ...episode,
                scenes: episode.scenes.map((scene) => {
                    if (scene.id !== sceneId || Object.entries(patch).every(([key, value]) => scene[key as keyof ScriptScene] === value)) return scene;
                    changed = true;
                    return { ...scene, ...patch, revision: scene.revision + 1, updatedAt: new Date().toISOString() };
                }),
            });
            return changed ? { ...document, episodes, updatedAt: new Date().toISOString() } : document;
        }),
        addEpisode: async (id) => edit(id, (document) => ({ ...document, episodes: [...document.episodes, createScriptEpisode(document.episodes.length + 1)] })),
        addScene: async (id, episodeId) => edit(id, (document) => ({
            ...document,
            episodes: document.episodes.map((episode) => episode.id === episodeId ? { ...episode, scenes: [...episode.scenes, createScriptScene(episode.scenes.length + 1)] } : episode),
        })),
        removeScene: async (id, episodeId, sceneId) => edit(id, (document) => ({
            ...document,
            episodes: document.episodes.map((episode) => episode.id === episodeId ? { ...episode, scenes: episode.scenes.filter((scene) => scene.id !== sceneId).map((scene, index) => ({ ...scene, no: index + 1 })) } : episode),
        })),
        moveScene: async (id, episodeId, sceneId, direction) => edit(id, (document) => ({
            ...document,
            episodes: document.episodes.map((episode) => {
                if (episode.id !== episodeId) return episode;
                const index = episode.scenes.findIndex((scene) => scene.id === sceneId);
                const target = index + direction;
                if (index < 0 || target < 0 || target >= episode.scenes.length) return episode;
                const scenes = [...episode.scenes];
                [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
                return { ...episode, scenes: scenes.map((scene, sceneIndex) => ({ ...scene, no: sceneIndex + 1 })) };
            }),
        })),
        lockVersion: async (id, input) => {
            const token = useUserStore.getState().token;
            if (!token) return saveLocalVersion(id, { ...input, label: input.label || "锁定稿", kind: "locked" });
            if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("联网后才能保存版本");
            await syncBeforeVersion(id);
            const version = createScriptVersion(await ensureLocal(id), { ...input, label: input.label || "锁定稿", kind: "locked" });
            const view = await api.createScriptVersion(token, id, { version, activateLock: true, baseRevision: getSummaryRevision(id) });
            await localforage.setItem(versionKey(id, version.id), version);
            applyView(id, view, true);
            await clearScriptOutbox(accountId, id);
            await localforage.setItem(projectKey(id), view.document);
            await writeLocal(view.document, view.revision);
            await loadScriptVersions(id);
            return version;
        },
        saveVersion: async (id, input) => {
            const token = useUserStore.getState().token;
            if (!token) return saveLocalVersion(id, { ...input, kind: "manual" });
            if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("联网后才能保存版本");
            await syncBeforeVersion(id);
            const version = createScriptVersion(await ensureLocal(id), { ...input, kind: "manual" });
            const view = await api.createScriptVersion(token, id, { version, activateLock: false, baseRevision: getSummaryRevision(id) });
            await localforage.setItem(versionKey(id, version.id), version);
            applyView(id, view, true);
            await clearScriptOutbox(accountId, id);
            await localforage.setItem(projectKey(id), view.document);
            await writeLocal(view.document, view.revision);
            await loadScriptVersions(id);
            return version;
        },
        restoreVersion: async (id, versionId) => {
            const versions = get().versions[id] || [];
            const version = versions.find((item) => item.id === versionId);
            if (!version) throw new Error("版本不存在");
            const token = useUserStore.getState().token;
            if (token) {
                if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("联网后才能恢复版本");
                await syncBeforeVersion(id);
                const view = await api.restoreScriptVersion(token, id, versionId, { baseRevision: get().summaries.find((item) => item.id === id)?.revision ?? 0 });
                applyView(id, view, true);
                await clearScriptOutbox(accountId, id);
                await localforage.setItem(projectKey(id), view.document);
                await writeLocal(view.document, view.revision);
                await loadScriptVersions(id);
                return;
            }
            const document = await ensureLocal(id);
            const result = restoreScriptVersion(document, version);
            await localforage.setItem(versionKey(id, result.safety.id), result.safety);
            const revision = getSummaryRevision(id);
            const pending = await readScriptOutbox(accountId, id);
            await writePending(result.document, pending?.base ?? createSyncBaseline(document, revision));
            applyView(id, { document: result.document, revision }, false);
            await loadScriptVersions(id);
        },
        deleteVersion: async (id, versionId) => {
            const document = await ensureLocal(id);
            const version = (get().versions[id] || []).find((item) => item.id === versionId);
            if (!version) return;
            const permission = canDeleteScriptVersion(document, version);
            if (!permission.allowed) throw new Error(permission.reason);
            const token = useUserStore.getState().token;
            if (token) {
                if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("联网后才能删除版本");
                await api.deleteScriptVersion(token, id, versionId, get().summaries.find((item) => item.id === id)?.revision ?? 0);
            }
            await localforage.removeItem(versionKey(id, versionId));
            await loadScriptVersions(id);
        },
        deleteProjects: async (ids) => {
            for (const id of ids) {
                const document = get().documents[id];
                if (!document) continue;
                const token = useUserStore.getState().token;
                if (token) {
                    try {
                        await api.deleteScriptProject(token, id, getSummaryRevision(id));
                    } catch (error) {
                        writeTombstones("script-projects", { ...readTombstones("script-projects"), [id]: Date.now() });
                        set((state) => ({ syncStates: { ...state.syncStates, [id]: "error" } }));
                        throw error;
                    }
                }
                await removeLocalScriptProject(id);
            }
        },
        persistScriptProject: persist,
        hydrateScriptIndex: async (id) => hydrateScriptIndex(id),
        loadScriptProject: async (id) => loadScriptProject(id),
    };
});

let accountConfiguration: Promise<void> = Promise.resolve();

export function configureScriptAccount(nextAccountId: string) {
    if (nextAccountId === accountId) return accountConfiguration;
    accountConfiguration = accountConfiguration.catch(() => {}).then(async () => {
        if (nextAccountId === accountId) return;
        await copyGuestToAccount(nextAccountId);
        accountId = nextAccountId;
        useScriptStore.setState({ summaries: [], documents: {}, versions: {}, conflicts: {}, loadStates: {}, syncStates: {} });
    });
    return accountConfiguration;
}

export async function hydrateScriptIndex(id: string) {
    if (id !== accountId) await configureScriptAccount(id);
    const index = await localforage.getItem<{ items: ScriptProjectSummary[] }>(indexKey(id));
    const token = useUserStore.getState().token;
    if (token && id !== "guest") {
        try {
            const remote = await api.listScriptProjects(token);
            const items = [...remote.items];
            for (const local of index?.items ?? []) if (!items.some((item) => item.id === local.id)) items.push(local);
            await localforage.setItem(indexKey(id), { items });
            useScriptStore.setState({ summaries: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
            return;
        } catch {
            useScriptStore.setState({ summaries: index?.items ?? [] });
            return;
        }
    }
    useScriptStore.setState({ summaries: index?.items ?? [] });
}

export async function loadScriptProject(id: string) {
    const local = await localforage.getItem<ScriptProjectDocument>(projectKey(id));
    const token = useUserStore.getState().token;
    if (!token || accountId === "guest") {
        if (local) applyView(id, { document: local, revision: getSummaryRevision(id) }, false);
        else useScriptStore.setState((state) => ({ loadStates: { ...state.loadStates, [id]: "missing" } }));
        return;
    }
    if (local) {
        applyView(id, { document: local, revision: getSummaryRevision(id) }, false);
        useScriptStore.setState((state) => ({ loadStates: { ...state.loadStates, [id]: "local" } }));
    } else useScriptStore.setState((state) => ({ loadStates: { ...state.loadStates, [id]: "loading" } }));
    try {
        const remote = await api.getScriptProject(token, id);
        const pending = await readScriptOutbox(accountId, id);
        if (pending) {
            const merged = mergeScriptDocuments(pending.base, pending.document, remote.document, pending.resolutions);
            await localforage.setItem(projectKey(id), merged.document);
            useScriptStore.setState((state) => ({
                documents: { ...state.documents, [id]: merged.document },
                summaries: summaryList(state, merged.document, remote.revision),
                conflicts: { ...state.conflicts, [id]: merged.conflicts },
                syncStates: { ...state.syncStates, [id]: merged.conflicts.length ? "conflict" : "local" },
                loadStates: { ...state.loadStates, [id]: "ready" },
            }));
            if (merged.conflicts.length) await writeScriptOutbox(accountId, id, { ...pending, conflicts: merged.conflicts });
            return;
        }
        applyView(id, remote, true);
        await localforage.setItem(projectKey(id), remote.document);
    } catch (error) {
        if (errorStatus(error) === 404) {
            await clearScriptOutbox(accountId, id);
            await localforage.removeItem(projectKey(id));
            useScriptStore.setState((state) => ({ documents: Object.fromEntries(Object.entries(state.documents).filter(([key]) => key !== id)), summaries: state.summaries.filter((item) => item.id !== id), loadStates: { ...state.loadStates, [id]: "missing" } }));
        } else if (!local) useScriptStore.setState((state) => ({ loadStates: { ...state.loadStates, [id]: "error" } }));
    }
}

function getSummaryRevision(id: string) {
    return useScriptStore.getState().summaries.find((item) => item.id === id)?.revision ?? 0;
}

async function loadLocalScriptVersions(projectId: string) {
    const keys = (await localforage.keys()).filter((key) => key.startsWith(versionKey(projectId, "")));
    const versions = (await Promise.all(keys.map((key) => localforage.getItem<ScriptVersion>(key)))).filter((item): item is ScriptVersion => Boolean(item));
    useScriptStore.setState((state) => ({ versions: { ...state.versions, [projectId]: versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } }));
}

export async function loadScriptVersions(projectId: string) {
    const token = useUserStore.getState().token;
    if (token && accountId !== "guest") {
        try {
            const result = await api.listScriptVersions(token, projectId);
            const versions = await Promise.all(result.items.map((summary) => api.getScriptVersion(token, projectId, summary.id)));
            await Promise.all(versions.map((version) => localforage.setItem(versionKey(projectId, version.id), version)));
            useScriptStore.setState((state) => ({ versions: { ...state.versions, [projectId]: versions } }));
            return;
        } catch {
            await loadLocalScriptVersions(projectId);
            return;
        }
    }
    await loadLocalScriptVersions(projectId);
}

export async function syncScriptProject(id: string) {
    const token = useUserStore.getState().token;
    if (!token || accountId === "guest") return;
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("离线修改已保存在本机，联网后自动同步");
    const tombstones = readTombstones("script-projects");
    const pending = await readScriptOutbox(accountId, id);
    if (!tombstones[id] && !pending) return;
    useScriptStore.setState((state) => ({ syncStates: { ...state.syncStates, [id]: "syncing" } }));
    try {
        if (tombstones[id]) {
            await api.deleteScriptProject(token, id, getSummaryRevision(id));
            delete tombstones[id];
            writeTombstones("script-projects", tombstones);
            await removeLocalScriptProject(id);
            return;
        }
        const result = pending!.base.revision === 0
            ? await api.createScriptProject(token, pending.document)
            : await api.changeScriptProject(token, id, scriptChangeRequest(pending));
        if ("conflicts" in result && result.conflicts.length) {
            const preview = mergeScriptDocuments(pending.base, pending.document, result.document, pending.resolutions).document;
            await writeScriptOutbox(accountId, id, { ...pending, conflicts: result.conflicts });
            useScriptStore.setState((state) => ({ documents: { ...state.documents, [id]: preview }, conflicts: { ...state.conflicts, [id]: result.conflicts }, syncStates: { ...state.syncStates, [id]: "conflict" } }));
            return;
        }
        applyView(id, result, true);
        await localforage.setItem(projectKey(id), result.document);
        await writeLocal(result.document, result.revision);
        await clearScriptOutbox(accountId, id);
    } catch (error) {
        useScriptStore.setState((state) => ({ syncStates: { ...state.syncStates, [id]: "error" } }));
        throw error;
    }
}

export async function resolveScriptConflict(projectId: string, scope: "header" | "scene", entityId: string | undefined, choice: "local" | "remote") {
    const pending = await readScriptOutbox(accountId, projectId);
    if (!pending) return;
    let next = pending;
    if (choice === "remote") next = resolveScriptOutboxConflict(next, { scope, id: entityId, choice });
    else next = { ...next, resolutions: [...(next.resolutions || []), { scope, id: entityId, choice }] };
    await writeScriptOutbox(accountId, projectId, next);
    await syncScriptProject(projectId);
}

let autoSyncCleanup = () => {};

export function stopScriptAccountSync() {
    autoSyncCleanup();
    autoSyncCleanup = () => {};
}

export function startScriptAutoSync() {
    if (typeof window === "undefined") return () => {};
    stopScriptAccountSync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
        if (!navigator.onLine || document.visibilityState !== "visible") return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            const ids = Object.keys(useScriptStore.getState().syncStates).filter((id) => ["local", "error"].includes(useScriptStore.getState().syncStates[id]));
            for (const id of ids) void syncScriptProject(id).catch(() => {});
        }, 1200);
    };
    const unsubscribe = useScriptStore.subscribe((state, previous) => {
        if (state.syncStates !== previous.syncStates) schedule();
    });
    window.addEventListener("online", schedule);
    window.addEventListener("focus", schedule);
    autoSyncCleanup = () => { unsubscribe(); clearTimeout(timer); window.removeEventListener("online", schedule); window.removeEventListener("focus", schedule); };
    schedule();
    return autoSyncCleanup;
}
