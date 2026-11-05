export type FilmStage = "script" | "cast" | "storyboard" | "edit";

export type FilmAspect = "9:16" | "16:9" | "2.39:1" | "4:3" | "1:1";

export type FilmImageRef = {
    id: string;
    url: string;
    storageKey?: string;
    source?: "upload" | "generated";
    createdAt?: string;
};

export type FilmCharacterPartKey = "face" | "hair" | "upper" | "lower" | "limbs";

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
    card?: FilmImageRef;
    cardSignature?: string;
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

export type FilmScriptCharacterAnalysis = {
    name: string;
    aliases: string[];
    role: string;
    description: string;
};

export type FilmScriptRelationshipAnalysis = {
    from: string;
    to: string;
    type: string;
    direction: "bilateral" | "from-to" | "to-from";
    strength: number;
    sceneRange: { start: number; end: number };
    evolution: Array<{ sceneIndex: number; event: string; typeBefore: string; typeAfter: string }>;
    note: string;
};

export type FilmScriptSceneRelationship = {
    from: string;
    to: string;
    type: string;
    direction: "bilateral" | "from-to" | "to-from";
    strength: number;
    note: string;
    event: string;
};

export type FilmScriptSceneAnalysis = {
    sceneIndex: number;
    episode: string;
    heading: string;
    sourceHash: string;
    characters: string[];
    summary: string;
    mood: string;
    props: string[];
    productionNotes: string[];
    beats: Array<{ type: string; summary: string }>;
    relationships: FilmScriptSceneRelationship[];
};

export type FilmScriptBlock =
    | { type: "action"; text: string; line: number }
    | { type: "dialogue"; character: string; parenthetical: string; text: string; line: number }
    | { type: "transition"; text: string; line: number };

export type FilmScriptScene = {
    heading: string;
    interiorExterior: "内景" | "外景" | "";
    location: string;
    timeOfDay: string;
    characters: string[];
    blocks: FilmScriptBlock[];
    lineStart: number;
    lineEnd: number;
    hash: string;
};

export type FilmScriptEpisode = {
    title: string;
    scenes: FilmScriptScene[];
};

export type FilmScriptDocument = {
    schemaVersion: number;
    parserVersion: string;
    scriptHash: string;
    format: "plain" | "fountain" | "fdx" | "docx";
    episodes: FilmScriptEpisode[];
};

export type FilmScriptAnalysis = {
    schemaVersion: number;
    parserVersion: string;
    scriptHash: string;
    characters: FilmScriptCharacterAnalysis[];
    relationships: FilmScriptRelationshipAnalysis[];
    scenes: FilmScriptSceneAnalysis[];
};

export type FilmContinuitySheet = {
    shotNo: string;
    version: string;
    prevFrameSummary: string;
    nextFrameRequirement: string;
    characterState: string;
    propState: string;
    environment: string;
    cameraParams: string;
    audioState: string;
    emotionNarrative: string;
    risks: string;
    forbidden: string;
    referenceAssets: string;
    validation: string;
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
    continuity?: FilmContinuitySheet;
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
    scriptDocument?: FilmScriptDocument;
    scriptAnalysis?: FilmScriptAnalysis;
    createdAt: string;
    updatedAt: string;
};
