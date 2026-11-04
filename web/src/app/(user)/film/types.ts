export type FilmStage = "script" | "cast" | "storyboard";

export type FilmAssetKind = "character" | "location";

export type FilmAssetStatus = "idle" | "ready" | "failed";

export type FilmShotStatus = "idle" | "image_ready" | "video_ready" | "failed";

export type FilmShot = {
    id: string;
    shotNo: string;
    shotType: string;
    duration: number;
    description: string;
    dialogue: string;
    audio: string;
    prompt: string;
    status: FilmShotStatus;
    characterIds?: string[];
    locationId?: string;
    imageUrl?: string;
    storageKey?: string;
    videoUrl?: string;
    videoStorageKey?: string;
    errorMessage?: string;
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
    createdAt: string;
};

export type FilmProject = {
    id: string;
    title: string;
    visualStyle: string;
    stage: FilmStage;
    scriptText: string;
    episodes: FilmEpisode[];
    characters: FilmAsset[];
    locations: FilmAsset[];
    createdAt: string;
    updatedAt: string;
};
