import { createCanvasNode } from "../[id]/lib/canvas-node-factory";
import type { CanvasComicMeta } from "../[id]/lib/comic-graph-types";
import { CanvasNodeType } from "../types";
import type { CanvasProject } from "../stores/use-canvas-store";

export type ComicCanvasProjectContext = {
    id: string;
    now: string;
    viewport: CanvasProject["viewport"];
    sidePanel: CanvasProject["sidePanel"];
    agentPanel: CanvasProject["agentPanel"];
};

export function buildComicCanvasProject(title: string, context: ComicCanvasProjectContext): CanvasProject {
    const bookId = `${context.id}-comic-book`;
    const book = createCanvasNode(CanvasNodeType.Comic, { x: 0, y: 0 }, {}, bookId);
    book.title = `${title.trim() || "未命名漫画"} 漫画册`;
    book.metadata = { ...book.metadata, comicBook: { pageNodeIds: [] } };
    const comic: CanvasComicMeta = {
        bookNodeId: bookId,
        stage: "concept",
        format: "page",
        direction: "rtl",
        genre: "",
        audience: "",
        logline: "",
        synopsis: "",
        styleGuide: "",
        status: "draft",
        chapterOrder: [],
        cast: { characters: [], locations: [] },
    };
    return {
        id: context.id,
        title: title.trim() || "未命名漫画",
        createdAt: context.now,
        updatedAt: context.now,
        nodes: [book],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        agentConfig: null,
        autoTitlePending: false,
        backgroundMode: "lines",
        showImageInfo: false,
        showConnections: true,
        viewport: context.viewport,
        sidePanel: context.sidePanel,
        agentPanel: context.agentPanel,
        domain: "comic",
        comic,
    };
}
