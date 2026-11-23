import { DEFAULT_DIRECTOR_STYLE_ID } from "@/lib/film/director-styles";
import { DEFAULT_FILM_STYLE } from "@/lib/film/film-styles";
import { createFilmStyleAsset } from "../[id]/lib/film-asset-factory";
import { createCanvasNode } from "../[id]/lib/canvas-node-factory";
import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType } from "../types";

export type FilmCanvasProjectContext = {
    id: string;
    now: string;
    viewport: CanvasProject["viewport"];
    sidePanel: CanvasProject["sidePanel"];
    agentPanel: CanvasProject["agentPanel"];
};

export function buildFilmCanvasProject(title: string, context: FilmCanvasProjectContext): CanvasProject {
    const script = createCanvasNode(CanvasNodeType.FilmScript, { x: -560, y: 300 }, {
        filmScript: { text: "", parseSnapshots: [] },
    }, `${context.id}-script`);
    const style = createCanvasNode(CanvasNodeType.FilmStyle, { x: -560, y: -220 }, {
        filmStyle: { asset: createFilmStyleAsset() },
    }, `${context.id}-style`);
    const scene = createCanvasNode(CanvasNodeType.FilmScene, { x: 260, y: 160 }, {
        filmScene: {
            episodeId: "episode-1",
            episodeTitle: "第 1 集",
            name: "场景 1",
            location: "",
            time: "",
            mood: "",
        },
    }, `${context.id}-scene-1`);
    style.title = "风格圣经";

    return {
        id: context.id,
        title: title.trim() || "未命名影视画布",
        createdAt: context.now,
        updatedAt: context.now,
        nodes: [script, style, scene],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        agentConfig: null,
        autoTitlePending: false,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: context.viewport,
        sidePanel: context.sidePanel,
        agentPanel: context.agentPanel,
        domain: "film",
        film: {
            aspect: "16:9",
            stylePresetId: DEFAULT_FILM_STYLE,
            directorStyleId: DEFAULT_DIRECTOR_STYLE_ID,
        },
    };
}
