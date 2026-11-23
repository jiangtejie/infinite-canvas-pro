import type { FilmAsset, FilmFrameSource, FilmImageSlot } from "@/lib/film/types";

export type FilmNodeType =
    | "filmScript"
    | "filmScene"
    | "filmShot"
    | "filmCharacter"
    | "filmLocation"
    | "filmProp"
    | "filmStyle"
    | "filmBeat";

export type FilmConnectionKind = "composition" | "sequence" | "context" | "derived";

export type FilmContextRole = "character" | "location" | "prop" | "style" | "beat";

export type FilmCharacterNodeData = { asset: FilmAsset };
export type FilmLocationNodeData = { asset: FilmAsset };
export type FilmPropNodeData = { asset: FilmAsset };
export type FilmStyleNodeData = { asset: FilmAsset };

export type FilmBeatNodeData = {
    title: string;
    mode: "grid4" | "grid9" | "timeline";
    prompt: string;
    frames: string[];
    firstFrame?: FilmFrameSource;
    lastFrame?: FilmFrameSource;
    duration?: number;
    preview?: FilmImageSlot;
    status: "idle" | "success" | "loading" | "stopping" | "stopped" | "error";
    progress: number;
    errorMessage?: string;
};

export type FilmContextEdgeData = {
    role: FilmContextRole;
    stateId?: string;
    variantId?: string;
    continuity?: {
        outfit?: string;
        physicalCondition?: string;
        heldProps?: string[];
        emotion?: string;
        intentionalChange?: string;
    };
    source: "manual" | "ai";
};

export type FilmDerivedEdgeData = {
    source: "script-analysis" | "script-handoff";
    sourceKey?: string;
};

export type FilmEdgeData = FilmContextEdgeData | FilmDerivedEdgeData;
