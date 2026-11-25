export type ScriptFormat = "film" | "tv" | "short";

export type ScriptCharacter = {
    id: string;
    name: string;
    role: string;
    want: string;
    need: string;
    flaw: string;
    arc: string;
    description: string;
};

export type ScriptScene = {
    id: string;
    no: number;
    interiorExterior: "内景" | "外景" | "内外景" | "";
    location: string;
    timeOfDay: string;
    characters: string[];
    goal: string;
    conflict: string;
    turn: string;
    outcome: string;
    summary: string;
    content: string;
    notes: string;
    revision: number;
    updatedAt: string;
};

export type ScriptEpisode = {
    id: string;
    no: number;
    title: string;
    scenes: ScriptScene[];
    lockedVersionId?: string;
    lockedVersionHash?: string;
};

export type ScriptPublication = {
    id: string;
    filmProjectId?: string;
    episodeIds: string[];
    sourceVersionIds: string[];
    sourceHash: string;
    status: "publishing" | "published" | "failed";
    publishedAt?: string;
    lastError?: string;
};

export type ScriptProjectDocument = {
    schemaVersion: 2;
    id: string;
    title: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    episodes: ScriptEpisode[];
    lockedVersionId?: string;
    lockedVersionHash?: string;
    publications: ScriptPublication[];
    createdAt: string;
    updatedAt: string;
};

export type ScriptProjectSummary = {
    id: string;
    title: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    episodeCount: number;
    sceneCount: number;
    characterCount: number;
    wordCount: number;
    lockedEpisodeCount: number;
    hasPublication: boolean;
    publicationStale: boolean;
    revision: number;
    createdAt: string;
    updatedAt: string;
};

export type ScriptContentSnapshot = {
    title: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    episodes: ScriptEpisode[];
};

export type ScriptVersion = {
    id: string;
    projectId: string;
    scope: "project" | "episode";
    episodeId?: string;
    label: string;
    kind: "manual" | "locked" | "safety";
    hash: string;
    data: ScriptContentSnapshot;
    createdAt: string;
};

export type ScriptVersionSummary = Omit<ScriptVersion, "data">;

export type ScriptHeader = {
    title: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    lockedVersionId?: string;
    lockedVersionHash?: string;
    episodes: Array<{
        id: string;
        no: number;
        title: string;
        sceneIds: string[];
        lockedVersionId?: string;
        lockedVersionHash?: string;
    }>;
    publications: ScriptPublication[];
};

export type ScriptConflict = {
    scope: "header" | "scene";
    id?: string;
    local: ScriptHeader | ScriptScene | null;
    remote: ScriptHeader | ScriptScene | null;
};

export type ScriptProjectLoadState = "idle" | "local" | "loading" | "ready" | "error" | "missing";
export type ScriptSyncState = "local" | "syncing" | "synced" | "conflict" | "error";

export type ScriptSnapshotDiff = {
    scenes: Array<{
        id: string;
        no: number;
        heading: string;
        status: "added" | "removed" | "changed" | "same";
        changedFields: string[];
        wordDelta: number;
    }>;
    added: number;
    removed: number;
    changed: number;
    same: number;
    wordDelta: number;
    characterChanges: string[];
};
