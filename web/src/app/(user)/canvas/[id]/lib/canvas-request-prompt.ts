import { appendImageNegativePrompt, buildNodeGenerationContext, hydrateNodeGenerationContext } from "../../components/canvas-node-generation";
import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import { applyCameraPrompt } from "../../utils/canvas-camera";
import { resolveImageNegativePrompt } from "../../utils/canvas-negative-prompt";
import { isCanvasImageNodeType, isPanoramaNodeType } from "../../utils/canvas-panorama";
import type { CanvasConnection, CanvasNodeData } from "../../types";

export async function buildCanvasNodeRequestPrompt(input: {
    nodeId: string;
    mode: CanvasNodeGenerationMode;
    prompt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
}) {
    const source = input.nodes.find((node) => node.id === input.nodeId);
    const generationContext = await hydrateNodeGenerationContext(buildNodeGenerationContext(input.nodeId, input.nodes, input.connections, input.prompt));
    const effectivePrompt = generationContext.prompt.trim();
    const imageNegativePrompt = isCanvasImageNodeType(source?.type)
        ? resolveImageNegativePrompt(effectivePrompt, source?.metadata?.negativePrompt, source?.metadata?.autoNegativePrompt !== false)
        : "";
    const cameraPrompt = input.mode === "video" || (input.mode === "image" && !isPanoramaNodeType(source?.type))
        ? applyCameraPrompt(effectivePrompt, source?.metadata?.cameraControl)
        : effectivePrompt;
    return { generationContext, effectivePrompt, imageNegativePrompt, cameraPrompt, requestPrompt: appendImageNegativePrompt(cameraPrompt, imageNegativePrompt) };
}
