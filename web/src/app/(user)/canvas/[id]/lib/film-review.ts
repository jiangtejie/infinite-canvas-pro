import type { FilmAsset, FilmAssetKind, FilmEpisode, FilmProject } from "@/lib/film/types";
import type { FilmAssetReadinessReport } from "@/app/(user)/film/utils/film-asset-readiness";
import { filmAssetReadiness } from "@/app/(user)/film/utils/film-asset-readiness";
import type { FilmAnimaticIssue } from "@/app/(user)/film/utils/film-animatic";
import { buildFilmAnimatic } from "@/app/(user)/film/utils/film-animatic";
import type { CanvasConnection, CanvasFilmMeta, CanvasNodeData } from "../../types";
import { CanvasNodeType } from "../../types";
import { selectFilmSceneEntries } from "./film-selectors";
import { selectFilmShotFromGraph } from "./film-shot-generation-context";

export type FilmReviewReport = {
    shotCount: number;
    sceneCount: number;
    readiness: FilmAssetReadinessReport;
    issues: FilmAnimaticIssue[];
};

function assetsOfKind(nodes: CanvasNodeData[], kind: FilmAssetKind): FilmAsset[] {
    return nodes.flatMap((node) => {
        const payload = node.type === CanvasNodeType.FilmAsset ? node.metadata?.filmAsset : undefined;
        return payload?.kind === kind ? [payload.asset] : [];
    });
}

/**
 * 把画布图投影成检查用的只读项目，不持久化、不参与同步；
 * 复用既有就绪、覆盖、风格和绑定检查，避免第二套规则。
 */
export function selectFilmProjectFromGraph(nodes: CanvasNodeData[], connections: CanvasConnection[], film?: CanvasFilmMeta, title = "") {
    const episodes: FilmEpisode[] = [];
    const episodeMap = new Map<string, FilmEpisode>();
    const entries = selectFilmSceneEntries(nodes, connections);
    for (const entry of entries) {
        const meta = entry.scene?.metadata?.filmScene;
        const episodeTitle = entry.episodeTitle || "未分集";
        const episodeId = meta?.episodeId || episodeTitle;
        let episode = episodeMap.get(episodeId);
        if (!episode) {
            episode = { id: episodeId, title: episodeTitle, scenes: [] };
            episodeMap.set(episodeId, episode);
            episodes.push(episode);
        }
        const shots = entry.shots.flatMap(({ shot }) => selectFilmShotFromGraph(shot, nodes, connections) ?? []);
        episode.scenes.push({
            id: entry.id,
            name: meta?.name || entry.label || "未分场",
            location: meta?.location || "",
            time: meta?.time || "",
            mood: meta?.mood || "",
            shots,
        });
    }
    const characters = assetsOfKind(nodes, "character");
    const locations = assetsOfKind(nodes, "location");
    const props = assetsOfKind(nodes, "prop");
    const costumes = assetsOfKind(nodes, "costume");
    const style = assetsOfKind(nodes, "style")[0];
    const script = nodes.find((node) => node.type === CanvasNodeType.Script)?.metadata?.filmScript;
    const project = {
        id: "canvas-film-review",
        title,
        visualStyle: style?.visualPrompt || "",
        aspect: film?.aspect || "16:9",
        stylePreset: film?.stylePresetId || "custom",
        directorStyleId: film?.directorStyleId,
        targetDuration: film?.targetDuration,
        structurePlan: script?.structurePlan,
        consistencyReview: film?.consistencyReview,
        stage: "script",
        scriptText: script?.text || "",
        scriptHash: film?.scriptHash,
        episodes,
        characters,
        locations,
        props,
        costumes,
        style,
        createdAt: "",
        updatedAt: "",
    } as FilmProject;
    const shots = episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.shots));
    return { project, shots };
}

const ISSUE_ORDER: Record<FilmAnimaticIssue["level"], number> = { error: 0, warning: 1, info: 2 };

export function selectFilmReview(nodes: CanvasNodeData[], connections: CanvasConnection[], film?: CanvasFilmMeta, title = ""): FilmReviewReport {
    const { project, shots } = selectFilmProjectFromGraph(nodes, connections, film, title);
    const readiness = filmAssetReadiness(project, shots);
    const issues = [...buildFilmAnimatic(project).issues].sort((left, right) => ISSUE_ORDER[left.level] - ISSUE_ORDER[right.level]);
    return {
        shotCount: shots.length,
        sceneCount: episodesSceneCount(project),
        readiness,
        issues,
    };
}

function episodesSceneCount(project: FilmProject) {
    return project.episodes.reduce((sum, episode) => sum + episode.scenes.length, 0);
}
