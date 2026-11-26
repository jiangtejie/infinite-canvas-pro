import type { InsertAssetPayload } from "@/lib/asset-picker";
import type { FilmAssetSuggestion, FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import type {
    FilmAspect,
    FilmConsistencyReview,
    FilmEpisode,
    FilmShot,
    FilmShotGroup,
    FilmStructurePlan,
    FilmStylePresetId,
} from "@/lib/film/types";
import type {
    FilmBeatNodeData,
    FilmCharacterNodeData,
    FilmConnectionKind,
    FilmContextEdgeData,
    FilmDerivedEdgeData,
    FilmLocationNodeData,
    FilmPropNodeData,
    FilmStyleNodeData,
} from "./[id]/lib/film-graph-types";
import type { ComicPageNodeData } from "./[id]/lib/comic-graph-types";

export type {
    FilmBeatNodeData,
    FilmCharacterNodeData,
    FilmConnectionKind,
    FilmContextEdgeData,
    FilmContextRole,
    FilmDerivedEdgeData,
    FilmEdgeData,
    FilmNodeType,
    FilmLocationNodeData,
    FilmPropNodeData,
    FilmStyleNodeData,
} from "./[id]/lib/film-graph-types";
export type { CanvasComicMeta } from "./[id]/lib/comic-graph-types";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Panorama = "panorama",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Director = "director",
    Group = "group",
    Source = "source",
    Publish = "publish",
    Comic = "comic",
    ComicPage = "comicPage",
    FilmScript = "filmScript",
    FilmScene = "filmScene",
    FilmShot = "filmShot",
    FilmCharacter = "filmCharacter",
    FilmLocation = "filmLocation",
    FilmProp = "filmProp",
    FilmStyle = "filmStyle",
    FilmBeat = "filmBeat",
}

export type ComicLetterKind = "speech" | "thought" | "caption" | "sfx";
export type ComicLetterTemplate = "oval" | "rounded" | "boxed" | "cloud" | "caption";

export type ComicLetterElement = {
    id: string;
    kind: ComicLetterKind;
    text: string;
    /** 以下均为相对页面宽高的 0-1 值；fontSize 相对页宽。 */
    x: number;
    y: number;
    width: number;
    fontSize: number;
    align: "left" | "center" | "right";
    tail: "none" | "left" | "right";
    /** 气泡模板；未设置时按 kind 取默认。 */
    template?: ComicLetterTemplate;
    /** 尾巴水平位置，相对气泡宽度 0-1。 */
    tailX?: number;
};

export type ComicExportPreset = {
    pageSize: "fit" | "a4" | "b5";
    dpi: 150 | 300;
    pageNumbers: boolean;
    titlePage: boolean;
    titlePageText?: string;
};

export type CanvasComicBook = {
    pageNodeIds: string[];
    coverNodeId?: string;
    format?: "page" | "strip";
    direction?: "rtl" | "ltr";
    lettering?: Record<string, ComicLetterElement[]>;
    exportPreset?: ComicExportPreset;
};

export type CanvasNodeStatus = "idle" | "success" | "loading" | "stopping" | "stopped" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";

export type CameraControlOptions = {
    enabled: boolean;
    camera: string;
    lens: string;
    focalLength: number;
    aperture: number;
};

export type CanvasPublishDraft = {
    title?: string;
    body?: string;
    tags?: string[];
    imageNodeIds?: string[];
};

export type CanvasPublishRecord = {
    id: string;
    qrText: string;
    expiresAt: string;
    mock: boolean;
    status: "issued" | "confirmed";
    publishedUrl?: string;
};

export type CanvasProjectDomain = "film" | "comic";

export type CanvasFilmAssetQueue = {
    id: string;
    startedAt: number;
    remainingNodeIds: string[];
};

export type CanvasFilmShotQueue = {
    id: string;
    startedAt: number;
    kind: "image" | "video";
    remainingShotIds: string[];
};

export type CanvasFilmAssetAliasRule = {
    kind: FilmAssetSuggestionKind;
    name: string;
    aliases: string[];
};

export type CanvasFilmMeta = {
    aspect: FilmAspect;
    stylePresetId: FilmStylePresetId;
    directorStyleId: string;
    targetDuration?: number;
    scriptPublicationId?: string;
    consistencyReview?: FilmConsistencyReview;
    shotGroups?: FilmShotGroup[];
    assetQueue?: CanvasFilmAssetQueue;
    shotQueue?: CanvasFilmShotQueue;
    /** 项目级资产名归并：再次分析时作为已知资产表输入。 */
    assetAliases?: CanvasFilmAssetAliasRule[];
};

export type FilmParseSnapshot = {
    id: string;
    createdAt: string;
    mode: "overwrite" | "append" | "refresh" | "merge";
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    removedNodes?: CanvasNodeData[];
    removedConnections?: CanvasConnection[];
    updatedNodes?: CanvasNodeData[];
    detachedNodes?: CanvasNodeData[];
};

export type FilmScriptSource = {
    projectId: string;
    projectTitle: string;
    publicationId: string;
    versionIds: string[];
    hash: string;
    publishedAt: string;
};

export type FilmAnalysisStatus = "running" | "structure-ready" | "ready" | "applied" | "failed" | "cancelled";
export type FilmAnalysisStage = "structure" | "shots" | "assets";
export type FilmLandingMode = "merge" | "append" | "replace";

export type FilmAnalysisOptions = {
    pacing?: "fast" | "normal" | "slow";
    shotDensity?: "sparse" | "normal" | "dense";
    targetDuration?: number;
    directorStyleId?: string;
    extractAssets?: boolean;
};

export type FilmAnalysisSessionDraft = {
    episodes: FilmEpisode[];
    suggestions: FilmAssetSuggestion[];
    structurePlan?: FilmStructurePlan;
};

export type FilmAnalysisSession = {
    id: string;
    status: FilmAnalysisStatus;
    /** 发起分析时的正文指纹，用于过期判断。 */
    sourceHash: string;
    options: FilmAnalysisOptions;
    progress?: { stage: FilmAnalysisStage; done: number; total: number };
    structurePlan?: FilmStructurePlan;
    draft?: FilmAnalysisSessionDraft;
    /** 单场失败原因，可单场重试。 */
    sceneErrors?: Record<string, string>;
    summary?: { scenes: number; shots: number; assets: number; appliedAt: string; mode: FilmLandingMode };
    warnings?: string[];
    error?: string;
    createdAt: string;
    updatedAt: string;
};

export type FilmScriptNodeData = {
    text: string;
    source?: FilmScriptSource;
    parseSnapshots: FilmParseSnapshot[];
    structurePlan?: FilmStructurePlan;
    analysis?: FilmAnalysisSession;
};

export type FilmSceneNodeData = {
    episodeId: string;
    episodeTitle: string;
    name: string;
    location: string;
    time: string;
    mood: string;
    purpose?: string;
    beatSummary?: string;
    notes?: string;
    scriptSourceKey?: string;
};

export type FilmShotNodeData = Omit<
    FilmShot,
    "id" | "characterBindings" | "propBindings" | "locationId" | "locationVariantId"
> & {
    lastFailedTaskKind?: "image" | "video";
    scriptSourceKey?: string;
    scriptSourcePromptHash?: string;
};

export type CanvasNodeMetadata = {
    content?: string;
    groupId?: string;
    composerContent?: string;
    prompt?: string;
    excludeUpstreamText?: boolean;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    workflowRef?: import("@/lib/workflow-channel").WorkflowRef;
    channelId?: string;
    size?: string;
    quality?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    mode?: string;
    negativePrompt?: string;
    autoNegativePrompt?: boolean;
    generateAudio?: string;
    characterOrientation?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    grokTtsVoice?: string;
    grokTtsLanguage?: string;
    grokTtsFormat?: string;
    grokTtsSpeed?: string;
    glmTtsVoice?: string;
    glmTtsFormat?: string;
    glmTtsSpeed?: string;
    mimoTtsVoice?: string;
    mimoTtsFormat?: string;
    mimoVoiceDesignPrompt?: string;
    geminiTtsVoice?: string;
    miniMaxTtsVoice?: string;
    miniMaxTtsFormat?: string;
    miniMaxTtsSpeed?: string;
    mimoVoiceCloneAudioNodeId?: string;
    referenceAudioNodeId?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    startedAt?: number;
    progress?: number;
    clientTaskId?: string;
    agentRequestId?: string;
    taskBackend?: "account" | "workflow";
    imageTaskId?: string;
    imageTaskResultId?: string;
    imageTaskUnknown?: boolean;
    imageTaskBillingState?: "free" | "charged" | "refunding" | "refunded" | string;
    audioTaskId?: string;
    audioTaskResultId?: string;
    videoTaskId?: string;
    videoTaskVideoId?: string;
    videoTaskTranslation?: import("@/services/api/video").VideoResponse["translationSnapshot"];
    firstFrameNodeId?: string;
    lastFrameNodeId?: string;
    multiShot?: string;
    shotType?: string;
    klingImageNodeIds?: string[];
    klingMultiPrompt?: { textNodeId?: string; duration?: string }[];
    klingElementList?: { name?: string; description?: string; nodeIds?: string[] }[];
    cameraControl?: CameraControlOptions;
    panoramaSourcePrompt?: string;
    panoramaFinalPrompt?: string;
    panoramaProjection?: "equirectangular";
    directorProject?: unknown;
    sourceInput?: string;
    sourcePlatform?: string;
    sourceStatus?: "idle" | "loading" | "success" | "error";
    sourceError?: string;
    sourceId?: string;
    sourceKind?: "image" | "video" | "text";
    sourceTitle?: string;
    sourceText?: string;
    sourceTags?: string[];
    sourceAuthor?: string;
    sourceStats?: { likes: number; collects: number; comments: number; shares: number } | null;
    sourceImages?: { url: string; storageKey?: string; width?: number; height?: number; mimeType?: string }[];
    sourceVideoUrl?: string;
    sourceCoverUrl?: string;
    sourceWarnings?: string[];
    sourceParsing?: boolean;
    sourceExpanded?: boolean;
    sourceExpandedSignature?: string;
    sourceExpandedNodeSignatures?: Record<string, string>;
    sourceMaterialRole?: "text";
    comicBook?: CanvasComicBook;
    comicPage?: ComicPageNodeData;
    remixRole?: import("./remix-types").RemixNodeRole;
    remixRunId?: string;
    remixRun?: import("./remix-types").RemixRun;
    marketingAssetId?: string;
    remixIndex?: number;
    remixSourceId?: string;
    publishSourceId?: string;
    publishDraft?: CanvasPublishDraft;
    publishDraftSnapshot?: CanvasPublishDraft;
    publishRecord?: CanvasPublishRecord;
    publishStatus?: "idle" | "generating" | "error";
    publishError?: string;
    filmScript?: FilmScriptNodeData;
    filmScene?: FilmSceneNodeData;
    filmShot?: FilmShotNodeData;
    filmShotTaskKind?: "image" | "video";
    filmCharacter?: FilmCharacterNodeData;
    filmLocation?: FilmLocationNodeData;
    filmProp?: FilmPropNodeData;
    filmStyle?: FilmStyleNodeData;
    filmBeat?: FilmBeatNodeData;
};

export type CanvasDirectorPanorama = {
    edgeId: string;
    sourceNodeId: string;
    imageUrl: string;
    fileName: string;
    projectionMode: "equirectangular" | "backdrop";
};

export type CanvasDirectorCapture = {
    dataUrl: string;
    fileName: string;
};

export type CanvasDirectorVideo = {
    blob: Blob;
    fileName: string;
    width: number;
    height: number;
    durationSeconds: number;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

type CanvasConnectionEndpoints = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

type CanvasConnectionByKind = {
    [Kind in FilmConnectionKind]: CanvasConnectionEndpoints & (
        Kind extends "context" ? { kind: Kind; data: FilmContextEdgeData }
            : Kind extends "derived" ? { kind: Kind; data: FilmDerivedEdgeData }
                : { kind: Kind; data?: never }
    );
}[FilmConnectionKind];

export type CanvasConnection = CanvasConnectionByKind | (CanvasConnectionEndpoints & { kind?: undefined; data?: never });
type WithoutConnectionId<T> = T extends { id: string } ? Omit<T, "id"> : never;
export type CanvasConnectionInput = WithoutConnectionId<CanvasConnection>;

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    label?: string;
    dataUrl?: string;
    url?: string;
    storageKey?: string;
    mimeType?: string;
    text?: string;
};

export type { InsertAssetPayload } from "@/lib/asset-picker";

export type CanvasOverlay =
    | { kind: "prompt"; nodeId: string }
    | { kind: "director"; nodeId: string }
    | { kind: "info"; nodeId: string }
    | { kind: "crop"; nodeId: string }
    | { kind: "audioTrim"; nodeId: string }
    | { kind: "maskEdit"; nodeId: string }
    | { kind: "split"; nodeId: string }
    | { kind: "upscale"; nodeId: string }
    | { kind: "denoise"; nodeId: string }
    | { kind: "angle"; nodeId: string }
    | { kind: "preview"; nodeId: string }
    | { kind: "comic"; nodeId: string; mode?: "preview" | "lettering" | "manage" }
    | { kind: "referencePicker"; nodeId: string };

export type PendingAgentAsset = {
    nodeId: string;
    payload: InsertAssetPayload;
    reference: CanvasAssistantReference;
};

export type CanvasPendingAgentRequest = {
    prompt: string;
    assets: PendingAgentAsset[];
    skills: CanvasAgentSkillSelection[];
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
    source?: "asset" | "library";
};

export type CanvasAgentSkillSelection = {
    id: string;
    name: string;
    source: "system" | "user";
};

export const MAX_CANVAS_AGENT_SKILLS = 5;

export type CanvasAgentPhase =
    | "intake"
    | "concept"
    | "script"
    | "breakdown"
    | "references"
    | "storyboard"
    | "video"
    | "audio"
    | "review"
    | "complete";

export type CanvasAgentConfig = {
    textApiMode: "chat" | "responses";
    textStreaming?: boolean;
    textReasoningEnabled?: boolean;
    autoGenerateMedia: boolean;
    confirmMediaGeneration?: boolean;
    imageQuality: string;
    imageSize: string;
    videoQuality: string;
    videoSize: string;
};

export type CanvasAgentState = {
    phase: CanvasAgentPhase;
    brief?: string;
    targetDurationSeconds?: number;
    approvedPlan?: string;
    approvedNodeIds: string[];
    referenceNodeIds: string[];
    pendingTaskIds: string[];
    completedTaskIds: string[];
};

export type CanvasAgentContent =
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
    >;

export type CanvasAgentToolCall = {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    argumentsError?: string;
};

export type CanvasAgentProtocolMessage =
    | { role: "user" | "system"; content: CanvasAgentContent }
    | { role: "assistant"; content?: string; reasoningContent?: string; responseItems?: unknown[]; toolCalls?: CanvasAgentToolCall[] }
    | { role: "tool"; content: string; toolCallId: string; name: string };

export type CanvasAssistantMessageStatus = "thinking" | "running" | "waiting" | "success" | "error";

export type CanvasAssistantBatch = {
    total: number;
    succeeded: number;
    failed: number;
    rolledBack: boolean;
    /** 本批创建/触及的节点，用于在消息里定位。 */
    nodeIds?: string[];
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    status?: CanvasAssistantMessageStatus;
    activity?: string;
    references?: CanvasAssistantReference[];
    images?: CanvasAssistantImage[];
    skills?: CanvasAgentSkillSelection[];
    skillsSelected?: boolean;
    batch?: CanvasAssistantBatch;
};

export type CanvasAgentJsonFallbackMode = "structured-json" | "prompt-json";
export type CanvasAgentToolMode = "native" | CanvasAgentJsonFallbackMode;

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    agentState: CanvasAgentState;
    protocolMessages: CanvasAgentProtocolMessage[];
    jsonToolFallbackKey?: string;
    jsonToolFallbackMode?: CanvasAgentJsonFallbackMode;
    activeSkills?: CanvasAgentSkillSelection[];
    contextCheckpoint?: string;
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
        type: "node";
        x: number;
        y: number;
        nodeId: string;
    }
    | {
        type: "connection";
        x: number;
        y: number;
        connectionId: string;
    };
