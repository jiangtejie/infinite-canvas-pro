import type { FilmEpisode } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasFilmMeta, type CanvasNodeData } from "../../types";

export type FilmProposalMode = "merge" | "append" | "replace";

export type FilmProposalIssue = { level: "error" | "warning" | "info"; message: string };

export type FilmProposalShot = { shotNo: string; shotType: string; duration: number; description: string };

export type FilmProposalScene = {
    key: string;
    episodeTitle: string;
    name: string;
    duration: number;
    shots: FilmProposalShot[];
};

export type FilmProposalEpisode = { title: string; scenes: FilmProposalScene[] };

export type FilmStructureProposal = {
    episodes: FilmProposalEpisode[];
    sceneKeys: string[];
    totals: { episodes: number; scenes: number; shots: number; duration: number };
    current: { scenes: number; shots: number; mediaShots: number };
    issues: FilmProposalIssue[];
};

/** 把 AI 拆镜结果投影成可审阅的结构提案；不修改节点、不生成边。 */
export function buildFilmStructureProposal(
    episodes: FilmEpisode[],
    nodes: CanvasNodeData[],
    _connections: CanvasConnection[],
    film?: CanvasFilmMeta,
): FilmStructureProposal {
    let scenes = 0;
    let shots = 0;
    let duration = 0;
    let missingDescriptions = 0;
    let duplicateScenes = 0;
    const projected: FilmProposalEpisode[] = episodes.map((episode, episodeIndex) => ({
        title: episode.title || "未分集",
        scenes: episode.scenes.map((scene, sceneIndex) => {
            const sceneShots = scene.shots.map((shot) => {
                const shotDuration = Math.max(1, shot.duration || 4);
                const description = (shot.description || "").trim();
                const prompt = (shot.prompt || "").trim();
                if (!description && !prompt) missingDescriptions += 1;
                shots += 1;
                duration += shotDuration;
                return { shotNo: shot.shotNo || "—", shotType: shot.shotType || "", duration: shotDuration, description: description || prompt || "未填写画面描述" };
            });
            const numbers = sceneShots.map((shot) => shot.shotNo);
            if (new Set(numbers).size !== numbers.length) duplicateScenes += 1;
            scenes += 1;
            return {
                key: `${episodeIndex}:${sceneIndex}`,
                episodeTitle: episode.title || "未分集",
                name: scene.name || "未命名场次",
                duration: sceneShots.reduce((sum, shot) => sum + shot.duration, 0),
                shots: sceneShots,
            };
        }),
    }));
    const shotNodes = nodes.filter((node) => node.type === CanvasNodeType.FilmShot);
    const current = {
        scenes: nodes.filter((node) => node.type === CanvasNodeType.FilmScene).length,
        shots: shotNodes.length,
        mediaShots: shotNodes.filter((node) => {
            const shot = node.metadata?.filmShot;
            return Boolean(shot && (shot.imageUrl || shot.videoUrl || shot.storageKey || shot.videoStorageKey || shot.imageVersions?.length || shot.videoVersions?.length));
        }).length,
    };
    const issues: FilmProposalIssue[] = [];
    if (!scenes || !shots) issues.push({ level: "error", message: "提案中没有可写入的场次或镜头" });
    if (current.scenes || current.shots) issues.push({ level: "warning", message: `替换将删除现有 ${current.scenes} 场 ${current.shots} 镜${current.mediaShots ? `（其中 ${current.mediaShots} 镜已有媒体）` : ""}，仅勾选的提案场次会写入画布。` });
    if (missingDescriptions) issues.push({ level: "warning", message: `${missingDescriptions} 镜缺画面描述，写入后需要补充才能生成。` });
    if (duplicateScenes) issues.push({ level: "warning", message: `${duplicateScenes} 个场次存在重复镜号，请应用后核对。` });
    if (film?.targetDuration && duration) {
        const deviation = Math.round((Math.abs(duration - film.targetDuration) / film.targetDuration) * 100);
        if (deviation > 20) issues.push({ level: "warning", message: `预计 ${duration}s，目标时长 ${film.targetDuration}s，偏差 ${deviation}%。` });
    }
    return {
        episodes: projected,
        sceneKeys: projected.flatMap((episode) => episode.scenes.map((scene) => scene.key)),
        totals: { episodes: projected.length, scenes, shots, duration },
        current,
        issues,
    };
}

/** 只保留勾选场次；没有场次的集会被丢弃。 */
export function filterFilmProposalEpisodes(episodes: FilmEpisode[], selectedKeys: Iterable<string>): FilmEpisode[] {
    const selected = new Set(selectedKeys);
    return episodes.flatMap((episode, episodeIndex) => {
        const scenes = episode.scenes.filter((_, sceneIndex) => selected.has(`${episodeIndex}:${sceneIndex}`));
        return scenes.length ? [{ ...episode, scenes }] : [];
    });
}
