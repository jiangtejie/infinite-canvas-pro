import type { FilmAspect, FilmAsset, FilmAssetKind } from "@/lib/film/types";
import type { CanvasNodeData, FilmBindingEdgeData } from "../../types";
import type { FilmAssetView } from "./film-asset-view";
import type { FilmAssetProductionPlan, FilmAssetProductionState } from "./film-asset-production";
import type { FilmContextLens } from "./film-context-lens";
import type { FilmProposalMode, FilmStructureProposal } from "./film-structure-proposal";
import type { FilmScriptAssetProposal } from "./film-script-assets";
import type { FilmShotGroupSummary } from "./film-shot-groups";
import type { FilmVersionKind, FilmVersionShot } from "./film-version-room";

export type FilmStudioView = "studio" | "graph" | "table" | "board" | "timeline" | "assets";

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

export type FilmShotBindingChip = {
    id: string;
    edgeId: string;
    kind: FilmAssetKind;
    name: string;
    stateId?: string;
    stateName?: string;
    variantId?: string;
    variantName?: string;
    continuity?: FilmBindingEdgeData["continuity"];
    states: { id: string; name: string }[];
    variants: { id: string; name: string }[];
};

export type FilmBindingAssetOption = {
    nodeId: string;
    kind: FilmAssetKind;
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

export type FilmStudioModel = {
    projectId: string;
    view: FilmStudioView;
    onViewChange: (view: FilmStudioView) => void;
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
    shotProductionOpen: boolean;
    onOpenShotProduction: () => void;
    onCloseShotProduction: () => void;
    aspect: FilmAspect;
    scenes: FilmSceneEntry[];
    shots: FilmShotEntry[];
    activeSceneId: string | null;
    activeShot: FilmShotEntry | null;
    activeBindings: FilmShotBindingChip[];
    bindingsByShot: Record<string, FilmShotBindingChip[]>;
    contextLenses: { image: FilmContextLens | null; video: FilmContextLens | null };
    structureProposal: {
        proposal: FilmStructureProposal;
        mode: FilmProposalMode;
        selectedSceneKeys: Set<string>;
        applying: boolean;
        onModeChange: (mode: FilmProposalMode) => void;
        onToggleScene: (key: string) => void;
        onSelectAll: () => void;
        onClear: () => void;
        onApply: () => void;
        onCancel: () => void;
    } | null;
    assetProposal: {
        proposal: FilmScriptAssetProposal;
        selectedKeys: Set<string>;
        bindToShots: boolean;
        onToggle: (key: string) => void;
        onSelectAll: () => void;
        onClear: () => void;
        onBindChange: (value: boolean) => void;
        onApply: () => void;
        onCancel: () => void;
    } | null;
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
    onOpenVersionCompare: (kind: FilmVersionKind) => void;
    onOpenVersionBatch: () => void;
    assetView: FilmAssetView;
    assetProduction: {
        open: boolean;
        plan: FilmAssetProductionPlan;
        state: FilmAssetProductionState;
        onStart: (nodeIds: string[]) => void;
        onStop: () => void;
        onClose: () => void;
    } | null;
    onOpenAssetProduction: () => void;
    onCreateAsset: (kind: FilmAssetKind) => void;
    onImportAssetFromLibrary: (kind: FilmAssetKind, entry: FilmAsset) => void;
    onLocateAsset: (nodeId: string) => void;
    shotBatch: FilmShotBatchState;
    onBatchGenerateShots: (shotIds: string[], kind: FilmShotBatchKind) => void;
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
    onLocateInGraph: (shotId: string) => void;
    imageGenerating: boolean;
    imageError: string | null;
    taskProgress: number;
    canGenerateImage: boolean;
    onGenerateImage: () => void;
    onStopImage: () => void;
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: () => void;
    onStopVideo: () => void;
    availableAssets: FilmBindingAssetOption[];
    onAddBinding: (assetNodeId: string) => void;
    onRemoveBinding: (edgeId: string) => void;
    onUpdateBinding: (edgeId: string, patch: Partial<FilmBindingEdgeData>) => void;
    onEditAsset: (nodeId: string) => void;
    onOpenScript: () => void;
    onCreateShotAsset: (kind: FilmAssetKind) => void;
};
