import { detachRemixNodes } from "../[id]/lib/canvas-source-remix";
import type { CanvasProject } from "../stores/use-canvas-store";

type CanvasProjectImportContext = {
    id: string;
    now: string;
    viewport: CanvasProject["viewport"];
    sidePanel: CanvasProject["sidePanel"];
    agentPanel: CanvasProject["agentPanel"];
};

export function buildImportedCanvasProject(
    source: Partial<CanvasProject>,
    context: CanvasProjectImportContext,
): CanvasProject {
    return {
        id: context.id,
        title: source.title || "导入画布",
        createdAt: source.createdAt || context.now,
        updatedAt: context.now,
        nodes: detachRemixNodes(source.nodes || []),
        connections: source.connections || [],
        chatSessions: source.chatSessions || [],
        activeChatId: source.activeChatId || null,
        agentConfig: source.agentConfig || null,
        autoTitlePending: false,
        pendingAgentRequest: source.pendingAgentRequest,
        backgroundMode: source.backgroundMode || "lines",
        showImageInfo: source.showImageInfo || false,
        showConnections: source.showConnections !== false,
        viewport: source.viewport || context.viewport,
        sidePanel: source.sidePanel || context.sidePanel,
        agentPanel: source.agentPanel || context.agentPanel,
        domain: source.domain,
        film: source.film,
        comic: source.comic,
    };
}
