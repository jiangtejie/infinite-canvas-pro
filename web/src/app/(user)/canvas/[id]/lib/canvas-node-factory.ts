import { nanoid } from "nanoid";

import { defaultConfig } from "@/stores/use-config-store";

import { getNodeSpec } from "../../constants";
import { useCanvasUiStore } from "../../stores/use-canvas-ui-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../../types";
import { applyNodeConfigPatch } from "./canvas-node-builders";

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
        metadata: { ...spec.metadata, ...defaults, ...metadata },
    };
    return initialSize && metadata?.size === undefined ? applyNodeConfigPatch(node, { size: initialSize }) : node;
}
