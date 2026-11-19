import type { FilmProject } from "@/lib/film/types";
import { currentAccountId } from "@/lib/account-storage";
import { localForageStorage } from "@/lib/localforage-storage";
import { FILM_CAST_STORE_KEY, FILM_STORE_KEY } from "@/lib/storage-keys";
import { useSaveStatusStore } from "@/lib/persisted-store";
import { waitForStoreHydration } from "@/lib/store-hydration";
import { fetchUserFilmLibrary, fetchUserFilmProjects, syncUserFilmLibrary, syncUserFilmProjects } from "@/services/api/user-config";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useFilmStore } from "@/stores/use-film-store";
import { mergeFilmLibrary, mergeFilmProjects, type FilmLibrarySnapshot } from "@/lib/film/film-account-merge";
import { applyFilmMediaPromotionsToLibrary, applyFilmMediaPromotionsToProjects, collectFilmMediaPromotions, filmMediaNeedsPromotion } from "@/services/film-media-sync";

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

let projectTimer: ReturnType<typeof setTimeout> | null = null;
let libraryTimer: ReturnType<typeof setTimeout> | null = null;
let projectDirty = false;
let libraryDirty = false;
let projectPushing = false;
let libraryPushing = false;
let activeSyncOps = 0;
let projectSyncFailed = false;
let librarySyncFailed = false;

function startSyncOp() {
    activeSyncOps += 1;
    useSaveStatusStore.getState().setSyncStatus("syncing");
}

function refreshSyncStatus() {
    if (projectSyncFailed || librarySyncFailed) {
        useSaveStatusStore.getState().setSyncStatus("error");
        return;
    }
    useSaveStatusStore.getState().setSyncStatus(activeSyncOps > 0 ? "syncing" : "synced");
}

function finishSyncOp(domain: "projects" | "library", ok: boolean) {
    activeSyncOps = Math.max(0, activeSyncOps - 1);
    if (domain === "projects") projectSyncFailed = !ok;
    else librarySyncFailed = !ok;
    refreshSyncStatus();
}

function librarySnapshot(): FilmLibrarySnapshot {
    const state = useFilmCastStore.getState();
    return { characters: state.characters, locations: state.locations, props: state.props, costumes: state.costumes, styles: state.styles };
}

function setLibrarySnapshot(snapshot: FilmLibrarySnapshot) {
    useFilmCastStore.setState({
        characters: snapshot.characters || [],
        locations: snapshot.locations || [],
        props: snapshot.props || [],
        costumes: snapshot.costumes || [],
        styles: snapshot.styles || [],
    });
}

function cancelTimer(kind: "projects" | "library") {
    if (kind === "projects") {
        if (projectTimer) clearTimeout(projectTimer);
        projectTimer = null;
    } else {
        if (libraryTimer) clearTimeout(libraryTimer);
        libraryTimer = null;
    }
}

function scheduleProjects(delay = DEBOUNCE) {
    if (!syncEnabled || !syncToken || hydrating) return;
    projectDirty = true;
    cancelTimer("projects");
    projectTimer = setTimeout(() => void flushProjects(0), delay);
}

function scheduleLibrary(delay = DEBOUNCE) {
    if (!syncEnabled || !syncToken || hydrating) return;
    libraryDirty = true;
    cancelTimer("library");
    libraryTimer = setTimeout(() => void flushLibrary(0), delay);
}

async function flushProjects(attempt: number): Promise<void> {
    if (!syncEnabled || !syncToken || projectPushing) return;
    const token = syncToken;
    projectPushing = true;
    projectDirty = false;
    startSyncOp();
    try {
        const replacements = await collectFilmMediaPromotions(useFilmStore.getState().projects, [], token);
        if (token !== syncToken) {
            activeSyncOps = Math.max(0, activeSyncOps - 1);
            return;
        }
        const applied = applyFilmMediaPromotionsToProjects(useFilmStore.getState().projects, replacements);
        if (applied.changed) {
            applyingRemote = true;
            useFilmStore.setState({ projects: applied.projects });
            applyingRemote = false;
        }
        await syncUserFilmProjects(token, { projects: applied.projects });
        if (token !== syncToken) {
            activeSyncOps = Math.max(0, activeSyncOps - 1);
            return;
        }
        finishSyncOp("projects", true);
    } catch {
        if (token !== syncToken || !syncEnabled) return;
        finishSyncOp("projects", false);
        projectDirty = true;
        if (attempt < RETRY_DELAYS.length) {
            cancelTimer("projects");
            projectTimer = setTimeout(() => void flushProjects(attempt + 1), RETRY_DELAYS[attempt]);
        }
    } finally {
        projectPushing = false;
        if (projectDirty && syncEnabled && !projectTimer) scheduleProjects();
    }
}

async function flushLibrary(attempt: number): Promise<void> {
    if (!syncEnabled || !syncToken || libraryPushing) return;
    const token = syncToken;
    libraryPushing = true;
    libraryDirty = false;
    startSyncOp();
    try {
        const snapshot = librarySnapshot();
        const replacements = await collectFilmMediaPromotions([], [...snapshot.characters, ...snapshot.locations, ...snapshot.props, ...snapshot.costumes, ...snapshot.styles], token);
        if (token !== syncToken) {
            activeSyncOps = Math.max(0, activeSyncOps - 1);
            return;
        }
        const applied = applyFilmMediaPromotionsToLibrary(librarySnapshot(), replacements);
        if (applied.changed) {
            applyingRemote = true;
            setLibrarySnapshot(applied.library);
            applyingRemote = false;
        }
        await syncUserFilmLibrary(token, applied.library);
        if (token !== syncToken) {
            activeSyncOps = Math.max(0, activeSyncOps - 1);
            return;
        }
        finishSyncOp("library", true);
    } catch {
        if (token !== syncToken || !syncEnabled) return;
        finishSyncOp("library", false);
        libraryDirty = true;
        if (attempt < RETRY_DELAYS.length) {
            cancelTimer("library");
            libraryTimer = setTimeout(() => void flushLibrary(attempt + 1), RETRY_DELAYS[attempt]);
        }
    } finally {
        libraryPushing = false;
        if (libraryDirty && syncEnabled && !libraryTimer) scheduleLibrary();
    }
}

function normalizeLibrary(value: Partial<FilmLibrarySnapshot> | null | undefined): FilmLibrarySnapshot {
    return {
        characters: Array.isArray(value?.characters) ? value!.characters : [],
        locations: Array.isArray(value?.locations) ? value!.locations : [],
        props: Array.isArray(value?.props) ? value!.props : [],
        costumes: Array.isArray(value?.costumes) ? value!.costumes : [],
        styles: Array.isArray(value?.styles) ? value!.styles : [],
    };
}

/** 账号本地已有数据时，readAccountStorage 不会接管游客分区；登录后把游客影视数据并入当前账号一次。 */
async function consumeGuestFilmStores() {
    if (currentAccountId() === "guest") return;
    const guestProjectKey = `${FILM_STORE_KEY}:guest`;
    const guestCastKey = `${FILM_CAST_STORE_KEY}:guest`;
    const [projectRaw, castRaw] = await Promise.all([
        localForageStorage.getItem(guestProjectKey),
        localForageStorage.getItem(guestCastKey),
    ]);
    if (projectRaw) {
        try {
            const guest = JSON.parse(projectRaw) as { state?: { projects?: FilmProject[] } };
            const guestProjects = Array.isArray(guest.state?.projects) ? guest.state.projects : [];
            if (guestProjects.length) {
                applyingRemote = true;
                const merged = mergeFilmProjects(useFilmStore.getState().projects, guestProjects);
                useFilmStore.setState({ projects: merged.projects });
                applyingRemote = false;
            }
            await localForageStorage.removeItem(guestProjectKey);
        } catch {
            // 游客数据无法解析时保留原键，避免直接丢失。
        }
    }
    if (castRaw) {
        try {
            const guest = JSON.parse(castRaw) as { state?: Partial<FilmLibrarySnapshot> };
            const guestLibrary = normalizeLibrary(guest.state);
            if (Object.values(guestLibrary).some((list) => list.length)) {
                applyingRemote = true;
                const merged = mergeFilmLibrary(librarySnapshot(), guestLibrary);
                setLibrarySnapshot(merged.snapshot);
                applyingRemote = false;
            }
            await localForageStorage.removeItem(guestCastKey);
        } catch {
            // 同上。
        }
    }
}

async function pullRemote(): Promise<void> {
    if (!syncEnabled || !syncToken || hydrating) return;
    const token = syncToken;
    if (projectSyncFailed || librarySyncFailed) useSaveStatusStore.getState().setSyncStatus("syncing");
    try {
        const [remoteProjects, remoteLibrary] = await Promise.all([
            fetchUserFilmProjects<{ projects?: FilmProject[] }>(token).catch(() => null),
            fetchUserFilmLibrary<Partial<FilmLibrarySnapshot>>(token).catch(() => null),
        ]);
        if (token !== syncToken || !syncEnabled) return;
        projectSyncFailed = !remoteProjects;
        librarySyncFailed = !remoteLibrary;
        if (remoteProjects) {
            applyingRemote = true;
            const projects = mergeFilmProjects(Array.isArray(remoteProjects.projects) ? remoteProjects.projects : [], useFilmStore.getState().projects);
            useFilmStore.setState({ projects: projects.projects });
            applyingRemote = false;
            if (projects.shouldPush || filmMediaNeedsPromotion(projects.projects, [])) scheduleProjects(0);
        }
        if (remoteLibrary) {
            applyingRemote = true;
            const library = mergeFilmLibrary(normalizeLibrary(remoteLibrary), librarySnapshot());
            setLibrarySnapshot(library.snapshot);
            applyingRemote = false;
            if (library.shouldPush || filmMediaNeedsPromotion([], [...library.snapshot.characters, ...library.snapshot.locations, ...library.snapshot.props, ...library.snapshot.costumes, ...library.snapshot.styles])) scheduleLibrary(0);
        }
        refreshSyncStatus();
    } catch {
        applyingRemote = false;
        projectSyncFailed = true;
        librarySyncFailed = true;
        refreshSyncStatus();
    }
}

function pullRemoteIfStale() {
    if (Date.now() - lastPullAt < PULL_THROTTLE) return;
    lastPullAt = Date.now();
    void pullRemote();
}

function registerListeners() {
    if (listenersReady || typeof window === "undefined") return;
    listenersReady = true;
    useFilmStore.subscribe((state, previous) => {
        if (applyingRemote || state.projects === previous.projects) return;
        scheduleProjects();
    });
    useFilmCastStore.subscribe((state, previous) => {
        if (applyingRemote) return;
        if (state.characters === previous.characters && state.locations === previous.locations && state.props === previous.props && state.costumes === previous.costumes && state.styles === previous.styles) return;
        scheduleLibrary();
    });
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

/** 登录或切换账号后拉取远端并按 updatedAt 合并；本地独有或更新的内容会补传。 */
export async function hydrateFilmAccountSync(token: string, enabled: boolean): Promise<void> {
    if (!enabled) {
        stopFilmAccountSync();
        return;
    }
    registerListeners();
    syncToken = token;
    syncEnabled = true;
    if (token === hydratedToken && Date.now() - hydratedAt < HYDRATE_COOLDOWN) return;
    activeSyncOps = 0;
    projectSyncFailed = false;
    librarySyncFailed = false;
    startSyncOp();
    hydrating = true;
    let succeeded = false;
    let shouldPushProjects = false;
    let shouldPushLibrary = false;
    try {
        await Promise.all([waitForStoreHydration(useFilmStore), waitForStoreHydration(useFilmCastStore)]);
        if (token !== syncToken || !syncEnabled) return;
        await consumeGuestFilmStores();
        if (token !== syncToken || !syncEnabled) return;
        const [remoteProjects, remoteLibrary] = await Promise.all([
            fetchUserFilmProjects<{ projects?: FilmProject[] }>(token).catch(() => null),
            fetchUserFilmLibrary<Partial<FilmLibrarySnapshot>>(token).catch(() => null),
        ]);
        if (token !== syncToken || !syncEnabled) return;
        projectSyncFailed = !remoteProjects;
        librarySyncFailed = !remoteLibrary;
        succeeded = Boolean(remoteProjects || remoteLibrary);
        if (remoteProjects) {
            applyingRemote = true;
            const projects = mergeFilmProjects(Array.isArray(remoteProjects.projects) ? remoteProjects.projects : [], useFilmStore.getState().projects);
            useFilmStore.setState({ projects: projects.projects });
            applyingRemote = false;
            if (projects.shouldPush || filmMediaNeedsPromotion(projects.projects, [])) shouldPushProjects = true;
        }
        if (remoteLibrary) {
            applyingRemote = true;
            const library = mergeFilmLibrary(normalizeLibrary(remoteLibrary), librarySnapshot());
            setLibrarySnapshot(library.snapshot);
            applyingRemote = false;
            if (library.shouldPush || filmMediaNeedsPromotion([], [...library.snapshot.characters, ...library.snapshot.locations, ...library.snapshot.props, ...library.snapshot.costumes, ...library.snapshot.styles])) shouldPushLibrary = true;
        }
        hydratedToken = token;
        hydratedAt = Date.now();
        lastPullAt = Date.now();
    } finally {
        hydrating = false;
        activeSyncOps = Math.max(0, activeSyncOps - 1);
        if (token === syncToken && syncEnabled) {
            if (!succeeded) {
                projectSyncFailed = true;
                librarySyncFailed = true;
            }
            refreshSyncStatus();
            if (shouldPushProjects) scheduleProjects(0);
            if (shouldPushLibrary) scheduleLibrary(0);
        }
    }
}

export function stopFilmAccountSync() {
    syncToken = "";
    syncEnabled = false;
    hydrating = false;
    applyingRemote = false;
    hydratedToken = "";
    hydratedAt = 0;
    lastPullAt = 0;
    projectDirty = false;
    libraryDirty = false;
    activeSyncOps = 0;
    projectSyncFailed = false;
    librarySyncFailed = false;
    cancelTimer("projects");
    cancelTimer("library");
    useSaveStatusStore.getState().setSyncStatus("idle");
}
