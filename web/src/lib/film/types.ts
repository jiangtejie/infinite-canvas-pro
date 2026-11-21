export type FilmStage = "script" | "cast" | "storyboard" | "edit";

export type FilmAspect = "9:16" | "16:9" | "2.39:1" | "4:3" | "1:1";

export type FilmImageRef = {
    id: string;
    url: string;
    storageKey?: string;
    source?: "upload" | "generated" | "asset" | "library" | "shot";
    /** 表情名 / 视图名 / 细节部位名。 */
    label?: string;
    prompt?: string;
    model?: string;
    width?: number;
    height?: number;
    rating?: 0 | 1 | 2 | 3;
    notes?: string;
    createdAt?: string;
};

/** 图槽位：版本池 + 当前选定参考 + 锁定；activeImageId 为空时取最后一张。 */
export type FilmImageSlot = {
    images: FilmImageRef[];
    activeImageId?: string;
    locked: boolean;
};

export type FilmCharacterPartKey = "face" | "hair" | "upper" | "lower" | "limbs";

export type FilmCharacterPart = {
    slot: FilmImageSlot;
    prompt: string;
    notes: string;
};

export type FilmCharacterState = {
    id: string;
    name: string;
    description: string;
    costumeId?: string;
    /** 状况：破损 / 血迹 / 湿身等。 */
    condition: string;
    heldPropIds: string[];
    look: FilmImageSlot;
};

export type FilmCharacterProfile = {
    parts: Record<FilmCharacterPartKey, FilmCharacterPart>;
    /** 表情集：label = 喜 / 怒 / 哀 / 惊 / 平静… */
    expressions: FilmImageSlot;
    master: FilmImageSlot;
    card: FilmImageSlot;
    cardSignature?: string;
    /** 标志性道具 → project.props。 */
    propIds: string[];
    states: FilmCharacterState[];
};

export type FilmVideoMode = "reference" | "frames";

export type FilmShotCharacterBinding = {
    characterId: string;
    stateId?: string;
    source: "manual" | "ai";
    characterNameSnapshot: string;
    stateNameSnapshot?: string;
    continuity: {
        outfit?: string;
        physicalCondition?: string;
        heldProps?: string[];
        emotion?: string;
        intentionalChange?: string;
    };
};

/** 自动绑定留下的歧义角色名：同名角色无法判断归属，等用户确认。 */
export type FilmShotCharacterSuggestion = {
    characterName: string;
};

export type FilmShotPropBinding = {
    propId: string;
    propNameSnapshot: string;
    source: "manual" | "ai";
};

/** 场次时间/氛围匹配到多个场景变体时留给用户确认的建议。 */
export type FilmShotVariantSuggestion = {
    variantId: string;
    variantName: string;
};

export type FilmGenerationReferenceRole =
    | "character-package"
    | "character-state"
    | "character-detail"
    | "character-expression"
    | "costume"
    | "prop"
    | "location"
    | "location-variant"
    | "style"
    | "previous-shot"
    | "anchor-shot"
    | "storyboard"
    | "first-frame"
    | "last-frame";

export type FilmGenerationReference = {
    id: string;
    revision: string;
    role: FilmGenerationReferenceRole;
    characterId?: string;
    label: string;
    image: FilmImageRef;
};

export type FilmCharacterGenerationSnapshot = {
    characterId: string;
    characterName: string;
    characterSignature: string;
    stateId?: string;
    stateName?: string;
    prompt: string;
    references: FilmGenerationReference[];
};

export type FilmGenerationContext = {
    inputSignature: string;
    compilerVersion: string;
    prompt: string;
    characters: FilmCharacterGenerationSnapshot[];
    references: FilmGenerationReference[];
    missingReferenceIds: string[];
    warnings: string[];
    previousShotId?: string;
    anchorShotId?: string;
    createdAt: string;
};

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

export type FilmAssetKind = "character" | "location" | "prop" | "costume" | "style";

export type FilmAssetStatus = "idle" | "ready" | "failed";

export type FilmShotStatus = "idle" | "generating" | "image_ready" | "video_ready" | "failed";

/** 已提交、尚未回写结果的生成任务；用于刷新后恢复轮询与「停止」入口。 */
export type FilmShotTask = {
    kind: "image" | "video";
    id: string;
    taskId?: string;
    videoId?: string;
    startedAt: number;
    generationContext?: FilmGenerationContext;
};

/** 资产设定图任务，记录回写目标（概念图 / 视图 / 部位 / 表情 / 全身合成 / 角色卡 / 场景变体）。 */
export type FilmAssetTaskTarget = "concept" | "view" | "part" | "expression" | "master" | "card" | "variant";

export type FilmAssetTask = FilmShotTask & {
    target: FilmAssetTaskTarget;
    label?: string;
    partKey?: FilmCharacterPartKey;
    variantId?: string;
};

export type FilmMediaVersion = {
    id: string;
    url: string;
    storageKey?: string;
    createdAt: string;
    generationContext?: FilmGenerationContext;
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

export type FilmScriptCostumeHint = {
    character: string;
    description: string;
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
    /** 角色 × 服装描述提示，用户确认后才建服装资产。 */
    costumes?: FilmScriptCostumeHint[];
    /** 气氛变体提示，例如 夜·雨 / 黄昏。 */
    atmosphere?: string;
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
};

/** 表演意图：给演员/视频模型的情绪与动作指令。 */
export type FilmPerformance = {
    objective: string;
    emotion: string;
    subtext: string;
    bodyLanguage: string;
    intensity: number;
};

/** 声音设计：环境声、音效、音乐与台词语气。 */
export type FilmSoundDesign = {
    ambience: string;
    sfx: string;
    music: string;
    dialogueTone: string;
};

export type FilmInteractiveVariableType = "boolean" | "number" | "string";

export type FilmInteractiveVariable = {
    id: string;
    name: string;
    type: FilmInteractiveVariableType;
    initialValue: string;
};

export type FilmBranchConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "truthy" | "falsy";

export type FilmBranchCondition = {
    variableId: string;
    operator: FilmBranchConditionOperator;
    value?: string;
};

export type FilmBranchEffect = {
    variableId: string;
    operation: "set" | "add";
    value: string;
};

/** 互动分支：一个选项可以选择目标镜头，并按条件显示、选择后修改变量。 */
export type FilmShotBranch = {
    label: string;
    condition: string;
    nextShotId?: string;
    /** 结构化显示条件；为空表示总是显示。 */
    conditions?: FilmBranchCondition[];
    conditionLogic?: "all" | "any";
    /** 选择该分支后对互动变量生效。 */
    effects?: FilmBranchEffect[];
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
    negativePrompt?: string;
    performance?: FilmPerformance;
    soundDesign?: FilmSoundDesign;
    /** 一个镜头上的多个互动分支选项。 */
    branches?: FilmShotBranch[];
    /** 结构层标记：建立/反应/细节/关系/过渡，用于覆盖检查。 */
    coverage?: string;
    /** 视觉层补充：构图/光线/色彩/镜头/转场，来自视觉代理。 */
    composition?: string;
    lighting?: string;
    colorTone?: string;
    lens?: string;
    transition?: string;
    characterBindings: FilmShotCharacterBinding[];
    characterSuggestions?: FilmShotCharacterSuggestion[];
    propBindings: FilmShotPropBinding[];
    locationId?: string;
    /** 场景气氛变体；为空表示使用场景概念图。 */
    locationVariantId?: string;
    variantSuggestions?: FilmShotVariantSuggestion[];
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
    continuityCheck?: string;
    pendingTask?: FilmShotTask;
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

export type FilmLocationVariant = {
    id: string;
    name: string;
    timeOfDay?: string;
    weather?: string;
    mood?: string;
    description: string;
    concept: FilmImageSlot;
};

export type FilmLocationProfile = {
    variants: FilmLocationVariant[];
};

export type FilmAsset = {
    id: string;
    name: string;
    aliases: string[];
    description: string;
    visualPrompt: string;
    status: FilmAssetStatus;
    errorMessage?: string;
    sourceLibraryAssetId?: string;
    tags?: string[];
    /** 概念图 / 设定图（所有类型共有）。 */
    concept: FilmImageSlot;
    /** 角度 / 细节参考（场景 / 道具 / 服装）。 */
    views?: FilmImageSlot;
    character?: FilmCharacterProfile;
    location?: FilmLocationProfile;
    pendingTask?: FilmAssetTask;
    createdAt: string;
    updatedAt: string;
};

/** 用户自定义镜头组：把一个或多个镜头聚在一起，仅用于导演台编排。 */
export type FilmShotGroup = {
    id: string;
    title: string;
    shotIds: string[];
    createdAt: string;
};

/** 镜头之间的连线关系（有向），用于在导演台标记镜头的承接/对照关系。 */
export type FilmShotConnection = {
    id: string;
    fromShotId: string;
    toShotId: string;
    createdAt: string;
};

export type FilmStructureBeat = {
    type: string;
    summary: string;
    infoPoint?: string;
    emotion?: string;
};

/** 结构代理的中间表示：只回答“这场戏要表达什么/需要哪些信息点”，不写画面。 */
export type FilmStructureScene = {
    episodeTitle: string;
    sceneNo: number;
    sceneName: string;
    purpose: string;
    beats: FilmStructureBeat[];
    coverage: string[];
    characters: string[];
    estimatedDuration: number;
};

export type FilmStructurePlan = {
    scriptHash: string;
    scenes: FilmStructureScene[];
    createdAt: string;
    model?: string;
};

export type FilmConsistencyIssue = {
    id: string;
    level: "error" | "warning" | "info";
    category: "structure" | "continuity" | "style" | "binding";
    message: string;
    suggestion?: string;
    shotId?: string;
    sceneId?: string;
};

/** 一致性代理：把结构覆盖、连续性、风格漂移的结论聚合到项目上。 */
export type FilmConsistencyReview = {
    scriptHash: string;
    reviewedAt: string;
    summary?: string;
    issues: FilmConsistencyIssue[];
    /** 检查时的输入指纹；与当前项目不一致说明结果已过期。 */
    graphFingerprint?: string;
};

export type FilmProject = {
    id: string;
    title: string;
    visualStyle: string;
    aspect: FilmAspect;
    stylePreset: FilmStylePresetId;
    /** 导演风格语法预设 id（可选；旧项目没有该字段时按普通电影感处理）。 */
    directorStyleId?: string;
    /** 目标成片时长（秒），用于预演验证时长偏差；为空则不校验。 */
    targetDuration?: number;
    /** 结构代理生成的场次计划（中间表示，不直接展示为画面）。 */
    structurePlan?: FilmStructurePlan;
    /** 一致性代理最近一次检查结果。 */
    consistencyReview?: FilmConsistencyReview;
    /** 互动影游变量表；分支条件与效果引用这些变量。 */
    interactiveVariables?: FilmInteractiveVariable[];
    stage: FilmStage;
    scriptText: string;
    /** 来源剧本项目，用于从影视工作台回看剧本并按最新剧本重新解析。 */
    scriptProjectId?: string;
    scriptHash?: string;
    episodes: FilmEpisode[];
    characters: FilmAsset[];
    locations: FilmAsset[];
    props: FilmAsset[];
    costumes: FilmAsset[];
    /** 项目唯一风格圣经：concept 放色彩/光影/质感参考，visualPrompt 放风格规则。 */
    style?: FilmAsset;
    scriptDocument?: FilmScriptDocument;
    scriptAnalysis?: FilmScriptAnalysis;
    shotGroups?: FilmShotGroup[];
    shotConnections?: FilmShotConnection[];
    createdAt: string;
    updatedAt: string;
};
