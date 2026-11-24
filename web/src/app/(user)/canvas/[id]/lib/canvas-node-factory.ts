import { nanoid } from "nanoid";

import { defaultConfig } from "@/stores/use-config-store";

import { getNodeSpec } from "../../constants";
import { useCanvasUiStore } from "../../stores/use-canvas-ui-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../../types";
import { createFilmAsset, createFilmStyleAsset } from "./film-asset-factory";
import { applyNodeConfigPatch } from "./canvas-node-builders";

function defaultComicMetadata(type: CanvasNodeType): CanvasNodeMetadata {
    if (type !== CanvasNodeType.ComicPage) return {};
    return {
        comicPage: {
            title: "新页面",
            summary: "",
            chapterId: "unassigned",
            panels: [],
            reviewStatus: "draft",
            reviewNotes: "",
        },
    };
}

function defaultFilmMetadata(type: CanvasNodeType): CanvasNodeMetadata {
    switch (type) {
        case CanvasNodeType.FilmCharacter:
            return { filmCharacter: { asset: createFilmAsset("character", 1) } };
        case CanvasNodeType.FilmLocation:
            return { filmLocation: { asset: createFilmAsset("location", 1) } };
        case CanvasNodeType.FilmProp:
            return { filmProp: { asset: createFilmAsset("prop", 1) } };
        case CanvasNodeType.FilmStyle:
            return { filmStyle: { asset: createFilmStyleAsset() } };
        case CanvasNodeType.FilmBeat:
            return {
                filmBeat: {
                    title: "动作节拍",
                    mode: "grid9",
                    prompt: "",
                    frames: Array.from({ length: 9 }, () => ""),
                    status: "idle",
                    progress: 0,
                },
            };
        default:
            return {};
    }
}

export function createCanvasNode(type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata, nodeId?: string): CanvasNodeData {
    const spec = getNodeSpec(type);
    const defaults = type === CanvasNodeType.Image || type === CanvasNodeType.Video ? useCanvasUiStore.getState().generationDefaults[type] : undefined;
    const initialSize = defaults?.size || (type === CanvasNodeType.Image ? defaultConfig.size : undefined);
    const id = nodeId || nanoid();

    const node: CanvasNodeData = {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
        },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...defaults, ...defaultComicMetadata(type), ...defaultFilmMetadata(type), ...metadata },
    };
    return initialSize && metadata?.size === undefined ? applyNodeConfigPatch(node, { size: initialSize }) : node;
}
