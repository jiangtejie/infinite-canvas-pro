import type { FilmAspect, FilmAsset, FilmAssetKind } from "@/lib/film/types";
import type { CanvasNodeData, FilmContextEdgeData, FilmContextRole } from "../../types";
import type { FilmContextCenterView } from "./film-context-center";
import type { FilmAssetProductionState } from "./film-asset-production";
import type { FilmContextLens } from "./film-context-lens";
import type { FilmProductionPlan } from "./film-production-plan";
import type { FilmShotGroupSummary } from "./film-shot-groups";
import type { FilmVersionKind, FilmVersionShot } from "./film-version-room";

export type FilmStudioView = "board" | "table" | "storyboard" | "assets";
export type FilmProductionKind = "asset" | FilmShotBatchKind;
export type FilmProductionOpenOptions = { assetIds?: string[]; shotIds?: string[]; kind?: FilmProductionKind };

export type FilmShotEntry = {
    shot: CanvasNodeData;
    sceneId: string;
    sceneLabel: string;
    episodeTitle: string;
    index: number;
};

export type FilmSceneEntry = {
    id: string;
    label: string;
    episodeTitle: string;
    name: string;
    scene: CanvasNodeData | null;
    shots: FilmShotEntry[];
};

export type FilmShotContextChip = {
    id: string;
    edgeId: string;
    role: FilmContextRole;
    name: string;
    stateId?: string;
    stateName?: string;
    variantId?: string;
    variantName?: string;
    continuity?: FilmContextEdgeData["continuity"];
    states: { id: string; name: string }[];
    variants: { id: string; name: string }[];
};

export const FILM_SHOT_CONTEXT_CREATABLE_KINDS = ["character", "location", "prop"] as const satisfies readonly FilmAssetKind[];
export type FilmShotContextCreatableKind = (typeof FILM_SHOT_CONTEXT_CREATABLE_KINDS)[number];

export const FILM_CONTEXT_ROLE_LABELS: Record<FilmContextRole, string> = {
    character: "角色",
    location: "场景",
    prop: "道具",
    style: "风格",
    beat: "动作节拍",
};

export type FilmContextNodeOption = {
    nodeId: string;
    role: FilmContextRole;
    name: string;
};

export type FilmShotBatchKind = "image" | "video";

export type FilmShotBatchState = {
    running: boolean;
    kind: FilmShotBatchKind | null;
    total: number;
    completed: number;
    failed: number;
    currentTitle: string;
    currentIndex: number;
    currentShotId: string;
};

export type FilmDirectorBoardModel = {
    projectId: string;
    view: FilmStudioView;
    onViewChange: (view: FilmStudioView) => void;
    onArrangeBoard: () => void;
    shotFocusOpen: boolean;
    onOpenShotFocus: (shotId: string) => void;
    onCloseShotFocus: () => void;
    previewOpen: boolean;
    previewShotIds: string[] | null;
    onOpenPreview: () => void;
    onClosePreview: () => void;
    shotGroups: {
        open: boolean;
        groups: FilmShotGroupSummary[];
        onOpen: () => void;
        onClose: () => void;
        onCreate: (title: string, shotIds: string[]) => void;
        onRename: (id: string, title: string) => void;
        onDelete: (id: string) => void;
        onSelect: (shotIds: string[]) => void;
        onPreview: (shotIds: string[]) => void;
    };
    onSaveShotGroup: (shotIds: string[]) => void;
    aspect: FilmAspect;
    scenes: FilmSceneEntry[];
    shots: FilmShotEntry[];
    activeSceneId: string | null;
    activeShot: FilmShotEntry | null;
    activeContexts: FilmShotContextChip[];
    contextsByShot: Record<string, FilmShotContextChip[]>;
    contextLenses: { image: FilmContextLens | null; video: FilmContextLens | null };
    versionRoom: {
        mode: "compare" | "batch";
        kind: FilmVersionKind;
        shots: FilmVersionShot[];
        activeShotId: string | null;
        picks: Record<string, string>;
        onModeChange: (mode: "compare" | "batch") => void;
        onKindChange: (kind: FilmVersionKind) => void;
        onSetCurrent: (shotId: string, kind: FilmVersionKind, versionId: string) => void;
        onPick: (shotId: string, versionId: string) => void;
        onApply: () => void;
        onClose: () => void;
    } | null;
    versionRoomCount: number;
    onOpenVersionCompare: (shotId: string, kind: FilmVersionKind) => void;
    onOpenVersionBatch: () => void;
    contextCenter: FilmContextCenterView;
    productionCenter: {
        open: boolean;
        plan: FilmProductionPlan;
        initialAssetIds?: string[];
        initialShotIds?: string[];
        initialKind?: FilmProductionKind;
        assetState: FilmAssetProductionState;
        shotBatch: FilmShotBatchState;
        onKindChange: (kind: FilmShotBatchKind) => void;
        onStartAssets: (nodeIds: string[]) => void;
        onStopAssets: () => void;
        onStartShots: (shotIds: string[], kind: FilmShotBatchKind) => void;
        onStopShots: () => void;
        onLocate: (target: "asset" | "shot", id: string) => void;
        onClose: () => void;
    } | null;
    onOpenProduction: (options?: FilmProductionOpenOptions) => void;
    onCreateAsset: (kind: FilmAssetKind) => void;
    onImportAssetFromLibrary: (kind: FilmAssetKind, entry: FilmAsset) => void;
    onReplaceAssetFromLibrary: (nodeId: string, entry: FilmAsset) => void;
    onLocateAsset: (nodeId: string) => void;
    shotBatch: FilmShotBatchState;
    onStopShotBatch: () => void;
    consistencyReviewing: boolean;
    onRunConsistencyReview: () => void;
    onClearConsistencyReview: () => void;
    styleName: string | null;
    onSceneChange: (sceneId: string) => void;
    onSelectShot: (shotId: string) => void;
    onUpdateShot: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onMoveShot: (shotId: string, targetSceneId: string, targetShotId: string | null, after: boolean) => void;
    onCreateShot: (sceneId?: string) => void;
    onLocateShot: (shotId: string) => void;
    imageGenerating: boolean;
    imageError: string | null;
    taskProgress: number;
    canGenerateImage: boolean;
    onGenerateImage: (shotId: string) => void;
    onStopImage: (shotId: string) => void;
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: (shotId: string) => void;
    onStopVideo: (shotId: string) => void;
    availableContexts: FilmContextNodeOption[];
    onAddContext: (shotId: string, assetNodeId: string) => void;
    onRemoveContext: (edgeId: string) => void;
    onUpdateContext: (edgeId: string, patch: Partial<Omit<FilmContextEdgeData, "role">>) => void;
    onEditAsset: (nodeId: string) => void;
    onOpenScript: () => void;
    onCreateShotAsset: (shotId: string, kind: FilmShotContextCreatableKind) => void;
    onUpdateBeat: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onDecomposeBeat: (beatId: string) => void;
    onGenerateBeatPreview: (beatId: string) => void;
    onStopBeatTask: (beatId: string) => void;
    onLocateBeatShots: (beatId: string) => void;
};
