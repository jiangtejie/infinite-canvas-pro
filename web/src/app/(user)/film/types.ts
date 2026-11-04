export type FilmStage = "script" | "cast" | "storyboard" | "edit";

export type FilmAspect = "9:16" | "16:9" | "2.39:1" | "4:3" | "1:1";

export type FilmImageRef = {
    id: string;
    url: string;
    storageKey?: string;
    source?: "upload" | "generated";
    createdAt?: string;
};

export type FilmCharacterPartKey = "face" | "hair" | "upper" | "middle" | "lower" | "limbs";

export type FilmCharacterPart = {
    images: FilmImageRef[];
    prompt: string;
    notes: string;
    locked: boolean;
};

export type FilmCharacterProp = {
    id: string;
    name: string;
    type: "accessory" | "weapon" | "other";
    description: string;
    images: FilmImageRef[];
    locked: boolean;
};

export type FilmCharacterProfile = {
    parts: Record<FilmCharacterPartKey, FilmCharacterPart>;
    props: FilmCharacterProp[];
    masterViews: FilmImageRef[];
    masterLocked: boolean;
};

export type FilmVideoMode = "reference" | "frames";

export type FilmVideoSegment = {
    id: string;
    start: number;
    end: number;
    prompt: string;
};

export type FilmFrameSource = {
    kind: "storyboard" | "version" | "upload";
    url: string;
    storageKey?: string;
    versionId?: string;
};

export type FilmStylePresetId =
    | "custom"
    | "jp-3d"
    | "cg"
    | "dark-real"
    | "cinematic"
    | "anime2d"
    | "guofeng"
    | "cyberpunk"
    | "film"
    | "pixel";

export type FilmAssetKind = "character" | "location";

export type FilmAssetStatus = "idle" | "ready" | "failed";

export type FilmShotStatus = "idle" | "image_ready" | "video_ready" | "failed";

export type FilmMediaVersion = {
    id: string;
    url: string;
    storageKey?: string;
    createdAt: string;
};

export type FilmShot = {
    id: string;
    shotNo: string;
    shotType: string;
    cameraMovement: string;
    duration: number;
    description: string;
    dialogue: string;
    audio: string;
    prompt: string;
    status: FilmShotStatus;
    characterIds?: string[];
    locationId?: string;
    videoMode?: FilmVideoMode;
    firstFrame?: FilmFrameSource;
    lastFrame?: FilmFrameSource;
    videoSegments?: FilmVideoSegment[];
    videoPrompt?: string;
    imageUrl?: string;
    storageKey?: string;
    videoUrl?: string;
    videoStorageKey?: string;
    errorMessage?: string;
    imageVersions?: FilmMediaVersion[];
    videoVersions?: FilmMediaVersion[];
};

export type FilmScene = {
    id: string;
    name: string;
    location: string;
    time: string;
    mood: string;
    shots: FilmShot[];
};

export type FilmEpisode = {
    id: string;
    title: string;
    scenes: FilmScene[];
};

export type FilmAssetView = {
    id: string;
    label: string;
    imageUrl?: string;
    storageKey?: string;
};

export type FilmAsset = {
    id: string;
    name: string;
    description: string;
    visualPrompt: string;
    imageUrl?: string;
    storageKey?: string;
    status: FilmAssetStatus;
    errorMessage?: string;
    views?: FilmAssetView[];
    character?: FilmCharacterProfile;
    createdAt: string;
};

export type FilmProject = {
    id: string;
    title: string;
    visualStyle: string;
    aspect: FilmAspect;
    stylePreset: FilmStylePresetId;
    stage: FilmStage;
    scriptText: string;
    episodes: FilmEpisode[];
    characters: FilmAsset[];
    locations: FilmAsset[];
    createdAt: string;
    updatedAt: string;
};
