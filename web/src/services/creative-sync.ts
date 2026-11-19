import type { ComicLibraryCharacter, ComicLibraryLocation, ComicProject } from "@/app/(user)/comic/types";
import { useComicCastStore } from "@/app/(user)/comic/stores/use-comic-cast-store";
import { useComicStore } from "@/app/(user)/comic/stores/use-comic-store";
import { useScriptStore, SCRIPT_STORE_KEY } from "@/app/(user)/script/stores/use-script-store";
import type { ScriptProject } from "@/app/(user)/script/types";
import type { FilmProject } from "@/lib/film/types";
import { mergeFilmLibrary, mergeFilmProjects, type FilmLibrarySnapshot } from "@/lib/film/film-account-merge";
import { mergeRecordsById } from "@/lib/account-domain-merge";
import { currentAccountId } from "@/lib/account-storage";
import { localForageStorage } from "@/lib/localforage-storage";
import { useSaveStatusStore } from "@/lib/persisted-store";
import { waitForStoreHydration } from "@/lib/store-hydration";
import { COMIC_CAST_STORE_KEY, COMIC_STORE_KEY, FILM_CAST_STORE_KEY, FILM_STORE_KEY } from "@/lib/storage-keys";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useFilmStore } from "@/stores/use-film-store";
import { fetchUserComicCast, fetchUserComicProjects, fetchUserFilmLibrary, fetchUserFilmProjects, fetchUserScriptProjects, syncUserComicCast, syncUserComicProjects, syncUserFilmLibrary, syncUserFilmProjects, syncUserScriptProjects } from "@/services/api/user-config";
import { applyFilmMediaPromotionsToLibrary, applyFilmMediaPromotionsToProjects, collectFilmMediaPromotions, filmMediaNeedsPromotion } from "@/services/film-media-sync";
import { applyMediaPromotions, collectMediaPromotions, collectMediaRefsFromValue, mediaNeedsPromotion, type MediaPromotionReplacement } from "@/services/media-promotion";

type ComicCastSnapshot = { characters: ComicLibraryCharacter[]; locations: ComicLibraryLocation[] };

type SyncDomain = {
    key: string;
    load: (token: string) => Promise<unknown>;
    save: (token: string, value: unknown) => Promise<unknown>;
    merge: (remote: unknown, local: unknown) => { value: unknown; shouldPush: boolean };
    read: () => unknown;
    write: (value: unknown) => void;
    ready: () => Promise<void>;
    subscribe: (notify: () => void) => () => void;
    guest?: { key: string; extract: (state: Record<string, unknown>) => unknown | null };
    media?: {
        needs: (value: unknown) => boolean;
        collect: (value: unknown, token: string) => Promise<Map<string, MediaPromotionReplacement>>;
        apply: (value: unknown, replacements: Map<string, MediaPromotionReplacement>) => { value: unknown; changed: boolean };
    };
};

const DEBOUNCE = 800;
const PULL_THROTTLE = 30_000;
const RETRY_DELAYS = [5000, 15000, 45000];
const HYDRATE_COOLDOWN = 15_000;

let syncToken = "";
let syncEnabled = false;
let hydrating = false;
let applyingRemote = false;
let listenersReady = false;
let hydratedToken = "";
let hydratedAt = 0;
let lastPullAt = 0;
let activeSyncOps = 0;
const failures = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const dirty = new Set<string>();
const pushing = new Set<string>();

function filmLibrary(value: Partial<FilmLibrarySnapshot> | null | undefined): FilmLibrarySnapshot {
    return {
        characters: Array.isArray(value?.characters) ? value!.characters : [],
        locations: Array.isArray(value?.locations) ? value!.locations : [],
        props: Array.isArray(value?.props) ? value!.props : [],
        costumes: Array.isArray(value?.costumes) ? value!.costumes : [],
        styles: Array.isArray(value?.styles) ? value!.styles : [],
    };
}

function comicCast(value: Partial<ComicCastSnapshot> | null | undefined): ComicCastSnapshot {
    return {
        characters: Array.isArray(value?.characters) ? value!.characters : [],
        locations: Array.isArray(value?.locations) ? value!.locations : [],
    };
}

function mergeComicCast(remote: ComicCastSnapshot, local: ComicCastSnapshot) {
    const characters = mergeRecordsById(remote.characters, local.characters);
    const locations = mergeRecordsById(remote.locations, local.locations);
    return { value: { characters: characters.value, locations: locations.value }, shouldPush: characters.shouldPush || locations.shouldPush };
}

function applyComicProjectMedia(value: unknown, replacements: Map<string, MediaPromotionReplacement>) {
    const projects = value as ComicProject[];
    let changed = false;
    const next = projects.map((project) => {
        const applied = applyMediaPromotions(project, replacements);
        if (!applied.changed) return project;
        changed = true;
        return { ...applied.value, updatedAt: new Date().toISOString() };
    });
    return { value: changed ? next : projects, changed };
}

function applyComicCastMedia(value: unknown, replacements: Map<string, MediaPromotionReplacement>) {
    const cast = value as ComicCastSnapshot;
    let changed = false;
    const applyList = <T extends { updatedAt?: string }>(items: T[]) => items.map((item) => {
        const applied = applyMediaPromotions(item, replacements);
        if (!applied.changed) return item;
        changed = true;
        return { ...applied.value, updatedAt: new Date().toISOString() };
    });
    const next = { characters: applyList(cast.characters), locations: applyList(cast.locations) };
    return { value: changed ? next : cast, changed };
}

const comicMedia: NonNullable<SyncDomain["media"]> = {
    needs: (value) => mediaNeedsPromotion(collectMediaRefsFromValue(value)),
    collect: (value, token) => collectMediaPromotions(collectMediaRefsFromValue(value), token),
    apply: (value, replacements) => {
        const applied = applyMediaPromotions(value, replacements);
        return { value: applied.value, changed: applied.changed };
    },
};

const domains: SyncDomain[] = [
    {
        key: "film-projects",
        load: async (token) => (await fetchUserFilmProjects<{ projects?: FilmProject[] }>(token)).projects || [],
        save: (token, value) => syncUserFilmProjects(token, { projects: value }),
        merge: (remote, local) => {
            const merged = mergeFilmProjects(remote as FilmProject[], local as FilmProject[]);
            return { value: merged.projects, shouldPush: merged.shouldPush };
        },
        read: () => useFilmStore.getState().projects,
        write: (value) => useFilmStore.setState({ projects: value as FilmProject[] }),
        ready: () => waitForStoreHydration(useFilmStore),
        subscribe: (notify) => useFilmStore.subscribe((state, previous) => {
            if (state.projects !== previous.projects) notify();
        }),
        guest: {
            key: `${FILM_STORE_KEY}:guest`,
            extract: (state) => Array.isArray(state.projects) ? state.projects : null,
        },
        media: {
            needs: (value) => filmMediaNeedsPromotion(value as FilmProject[], []),
            collect: (value, token) => collectFilmMediaPromotions(value as FilmProject[], [], token),
            apply: (value, replacements) => {
                const applied = applyFilmMediaPromotionsToProjects(value as FilmProject[], replacements);
                return { value: applied.projects, changed: applied.changed };
            },
        },
    },
    {
        key: "film-library",
        load: async (token) => filmLibrary(await fetchUserFilmLibrary<Partial<FilmLibrarySnapshot>>(token)),
        save: (token, value) => syncUserFilmLibrary(token, value),
        merge: (remote, local) => {
            const merged = mergeFilmLibrary(remote as FilmLibrarySnapshot, local as FilmLibrarySnapshot);
            return { value: merged.snapshot, shouldPush: merged.shouldPush };
        },
        read: () => {
            const state = useFilmCastStore.getState();
            return { characters: state.characters, locations: state.locations, props: state.props, costumes: state.costumes, styles: state.styles };
        },
        write: (value) => {
            const snapshot = value as FilmLibrarySnapshot;
            useFilmCastStore.setState({ ...snapshot });
        },
        ready: () => waitForStoreHydration(useFilmCastStore),
        subscribe: (notify) => useFilmCastStore.subscribe((state, previous) => {
            if (state.characters !== previous.characters || state.locations !== previous.locations || state.props !== previous.props || state.costumes !== previous.costumes || state.styles !== previous.styles) notify();
        }),
        guest: {
            key: `${FILM_CAST_STORE_KEY}:guest`,
            extract: (state) => filmLibrary(state as Partial<FilmLibrarySnapshot>),
        },
        media: {
            needs: (value) => {
                const snapshot = value as FilmLibrarySnapshot;
                return filmMediaNeedsPromotion([], [...snapshot.characters, ...snapshot.locations, ...snapshot.props, ...snapshot.costumes, ...snapshot.styles]);
            },
            collect: (value, token) => {
                const snapshot = value as FilmLibrarySnapshot;
                return collectFilmMediaPromotions([], [...snapshot.characters, ...snapshot.locations, ...snapshot.props, ...snapshot.costumes, ...snapshot.styles], token);
            },
            apply: (value, replacements) => {
                const applied = applyFilmMediaPromotionsToLibrary(value as FilmLibrarySnapshot, replacements);
                return { value: applied.library, changed: applied.changed };
            },
        },
    },
    {
        key: "comic-projects",
        load: async (token) => (await fetchUserComicProjects<{ projects?: ComicProject[] }>(token)).projects || [],
        save: (token, value) => syncUserComicProjects(token, { projects: value }),
        merge: (remote, local) => mergeRecordsById(remote as ComicProject[], local as ComicProject[]),
        read: () => useComicStore.getState().projects,
        write: (value) => useComicStore.setState({ projects: value as ComicProject[] }),
        ready: () => waitForStoreHydration(useComicStore),
        subscribe: (notify) => useComicStore.subscribe((state, previous) => {
            if (state.projects !== previous.projects) notify();
        }),
        guest: {
            key: `${COMIC_STORE_KEY}:guest`,
            extract: (state) => Array.isArray(state.projects) ? state.projects : null,
        },
        media: {
            needs: comicMedia.needs,
            collect: comicMedia.collect,
            apply: applyComicProjectMedia,
        },
    },
    {
        key: "comic-cast",
        load: async (token) => comicCast(await fetchUserComicCast<Partial<ComicCastSnapshot>>(token)),
        save: (token, value) => syncUserComicCast(token, value),
        merge: (remote, local) => mergeComicCast(remote as ComicCastSnapshot, local as ComicCastSnapshot),
        read: () => {
            const state = useComicCastStore.getState();
            return { characters: state.characters, locations: state.locations };
        },
        write: (value) => {
            const cast = value as ComicCastSnapshot;
            useComicCastStore.setState({ characters: cast.characters, locations: cast.locations });
        },
        ready: () => waitForStoreHydration(useComicCastStore),
        subscribe: (notify) => useComicCastStore.subscribe((state, previous) => {
            if (state.characters !== previous.characters || state.locations !== previous.locations) notify();
        }),
        guest: {
            key: `${COMIC_CAST_STORE_KEY}:guest`,
            extract: (state) => comicCast(state as Partial<ComicCastSnapshot>),
        },
        media: {
            needs: comicMedia.needs,
            collect: comicMedia.collect,
            apply: applyComicCastMedia,
        },
    },
    {
        key: "script-projects",
        load: async (token) => (await fetchUserScriptProjects<{ projects?: ScriptProject[] }>(token)).projects || [],
        save: (token, value) => syncUserScriptProjects(token, { projects: value }),
        merge: (remote, local) => mergeRecordsById(remote as ScriptProject[], local as ScriptProject[]),
        read: () => useScriptStore.getState().projects,
        write: (value) => useScriptStore.setState({ projects: value as ScriptProject[] }),
        ready: () => waitForStoreHydration(useScriptStore),
        subscribe: (notify) => useScriptStore.subscribe((state, previous) => {
            if (state.projects !== previous.projects) notify();
        }),
        guest: {
            key: `${SCRIPT_STORE_KEY}:guest`,
            extract: (state) => Array.isArray(state.projects) ? state.projects : null,
        },
    },
];

function domainByKey(key: string) {
    return domains.find((domain) => domain.key === key);
}

function refreshSyncStatus() {
    if (failures.size) {
        useSaveStatusStore.getState().setSyncStatus("error");
        return;
    }
    useSaveStatusStore.getState().setSyncStatus(activeSyncOps > 0 ? "syncing" : "synced");
}

function startSyncOp() {
    activeSyncOps += 1;
    useSaveStatusStore.getState().setSyncStatus("syncing");
}

function finishSyncOp(key: string, ok: boolean) {
    activeSyncOps = Math.max(0, activeSyncOps - 1);
    if (ok) failures.delete(key);
    else failures.add(key);
    refreshSyncStatus();
}

function writeSafely(domain: SyncDomain, value: unknown) {
    applyingRemote = true;
    try {
        domain.write(value);
    } finally {
        applyingRemote = false;
    }
}

function cancelTimer(key: string) {
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
}

function schedule(key: string, delay = DEBOUNCE) {
    if (!syncEnabled || !syncToken || hydrating) return;
    dirty.add(key);
    cancelTimer(key);
    timers.set(key, setTimeout(() => void flush(key, 0), delay));
}

async function flush(key: string, attempt: number) {
    const domain = domainByKey(key);
    if (!domain || !syncEnabled || !syncToken || pushing.has(key)) return;
    const token = syncToken;
    pushing.add(key);
    dirty.delete(key);
    startSyncOp();
    try {
        let value = domain.read();
        if (domain.media) {
            const replacements = await domain.media.collect(value, token);
            if (token !== syncToken) {
                activeSyncOps = Math.max(0, activeSyncOps - 1);
                return;
            }
            const applied = domain.media.apply(domain.read(), replacements);
            if (applied.changed) {
                writeSafely(domain, applied.value);
                value = domain.read();
            }
        }
        await domain.save(token, value);
        if (token !== syncToken) {
            activeSyncOps = Math.max(0, activeSyncOps - 1);
            return;
        }
        finishSyncOp(key, true);
    } catch {
        if (token !== syncToken || !syncEnabled) {
            activeSyncOps = Math.max(0, activeSyncOps - 1);
            return;
        }
        finishSyncOp(key, false);
        dirty.add(key);
        if (attempt < RETRY_DELAYS.length) {
            cancelTimer(key);
            timers.set(key, setTimeout(() => void flush(key, attempt + 1), RETRY_DELAYS[attempt]));
        }
    } finally {
        pushing.delete(key);
        if (dirty.has(key) && syncEnabled && !timers.has(key)) schedule(key);
    }
}

async function pullRemote() {
    if (!syncEnabled || !syncToken || hydrating) return;
    const token = syncToken;
    if (failures.size) useSaveStatusStore.getState().setSyncStatus("syncing");
    const results = await Promise.all(domains.map(async (domain) => ({
        domain,
        remote: await domain.load(token).catch(() => null),
    })));
    if (token !== syncToken || !syncEnabled) return;
    for (const { domain, remote } of results) {
        if (remote === null) {
            failures.add(domain.key);
            continue;
        }
        failures.delete(domain.key);
        const merged = domain.merge(remote, domain.read());
        writeSafely(domain, merged.value);
        if (merged.shouldPush || domain.media?.needs(merged.value)) schedule(domain.key, 0);
    }
    refreshSyncStatus();
}

function pullRemoteIfStale() {
    if (Date.now() - lastPullAt < PULL_THROTTLE) return;
    lastPullAt = Date.now();
    void pullRemote();
}

function registerListeners() {
    if (listenersReady || typeof window === "undefined") return;
    listenersReady = true;
    for (const domain of domains) {
        domain.subscribe(() => {
            if (applyingRemote || hydrating) return;
            schedule(domain.key);
        });
    }
    window.addEventListener("focus", pullRemoteIfStale);
    window.addEventListener("online", () => {
        if (!syncEnabled) return;
        lastPullAt = 0;
        void pullRemote();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") pullRemoteIfStale();
    });
}

function persistedState(parsed: unknown): Record<string, unknown> | null {
    if (!parsed || typeof parsed !== "object") return null;
    const state = (parsed as { state?: unknown }).state;
    return state && typeof state === "object" ? state as Record<string, unknown> : null;
}

async function consumeGuestDomains() {
    if (currentAccountId() === "guest") return;
    for (const domain of domains) {
        if (!domain.guest) continue;
        const raw = await localForageStorage.getItem(domain.guest.key);
        if (!raw) continue;
        try {
            const state = persistedState(JSON.parse(raw));
            if (!state) continue;
            const extracted = domain.guest.extract(state);
            if (extracted !== null) {
                const merged = domain.merge(domain.read(), extracted);
                writeSafely(domain, merged.value);
            }
            await localForageStorage.removeItem(domain.guest.key);
        } catch {
            // 游客数据无法解析时保留原键，避免直接丢失。
        }
    }
}

/** 登录后统一同步影视、漫画与剧本数据：合并远端、接管游客分区、失败重试、聚焦拉取。 */
export async function hydrateCreativeAccountSync(token: string, enabled: boolean): Promise<void> {
    if (!enabled) {
        stopCreativeAccountSync();
        return;
    }
    registerListeners();
    syncToken = token;
    syncEnabled = true;
    if (token === hydratedToken && Date.now() - hydratedAt < HYDRATE_COOLDOWN) return;
    activeSyncOps = 0;
    failures.clear();
    startSyncOp();
    hydrating = true;
    const pushKeys = new Set<string>();
    try {
        await Promise.all(domains.map((domain) => domain.ready()));
        if (token !== syncToken || !syncEnabled) return;
        await consumeGuestDomains();
        if (token !== syncToken || !syncEnabled) return;
        const results = await Promise.all(domains.map(async (domain) => ({
            domain,
            remote: await domain.load(token).catch(() => null),
        })));
        if (token !== syncToken || !syncEnabled) return;
        for (const { domain, remote } of results) {
            if (remote === null) {
                failures.add(domain.key);
                continue;
            }
            const merged = domain.merge(remote, domain.read());
            writeSafely(domain, merged.value);
            if (merged.shouldPush || domain.media?.needs(merged.value)) pushKeys.add(domain.key);
        }
        hydratedToken = token;
        hydratedAt = Date.now();
        lastPullAt = Date.now();
    } finally {
        hydrating = false;
        activeSyncOps = Math.max(0, activeSyncOps - 1);
        if (token === syncToken && syncEnabled) {
            refreshSyncStatus();
            pushKeys.forEach((key) => schedule(key, 0));
        }
    }
}

export function stopCreativeAccountSync() {
    syncToken = "";
    syncEnabled = false;
    hydrating = false;
    applyingRemote = false;
    hydratedToken = "";
    hydratedAt = 0;
    lastPullAt = 0;
    activeSyncOps = 0;
    failures.clear();
    dirty.clear();
    pushing.clear();
    domains.forEach((domain) => cancelTimer(domain.key));
    useSaveStatusStore.getState().setSyncStatus("idle");
}
