import type { FilmAspect, FilmAssetKind } from "@/lib/film/types";
import type { CanvasNodeData } from "../../types";

export type FilmStudioView = "studio" | "graph";

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
    kind: FilmAssetKind;
    name: string;
};

export type FilmStudioModel = {
    view: FilmStudioView;
    onViewChange: (view: FilmStudioView) => void;
    aspect: FilmAspect;
    scenes: FilmSceneEntry[];
    shots: FilmShotEntry[];
    activeSceneId: string | null;
    activeShot: FilmShotEntry | null;
    activeBindings: FilmShotBindingChip[];
    styleName: string | null;
    onSceneChange: (sceneId: string) => void;
    onSelectShot: (shotId: string) => void;
    onUpdateShot: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onCreateShot: (sceneId?: string) => void;
    onLocateInGraph: (shotId: string) => void;
};
