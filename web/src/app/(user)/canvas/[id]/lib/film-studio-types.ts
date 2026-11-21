import type { FilmAspect, FilmAssetKind } from "@/lib/film/types";
import type { CanvasNodeData, FilmBindingEdgeData } from "../../types";

export type FilmStudioView = "studio" | "graph" | "table" | "board" | "timeline";

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
    aspect: FilmAspect;
    scenes: FilmSceneEntry[];
    shots: FilmShotEntry[];
    activeSceneId: string | null;
    activeShot: FilmShotEntry | null;
    activeBindings: FilmShotBindingChip[];
    bindingsByShot: Record<string, FilmShotBindingChip[]>;
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
    onReorderShots: (sceneId: string, orderedShotIds: string[]) => void;
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
