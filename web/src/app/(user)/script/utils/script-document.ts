import type { ScriptContentSnapshot, ScriptProjectDocument, ScriptProjectSummary } from "../types";
import { isPublicationStale } from "./script-publication";
import { scriptWordCount } from "./script-project";

export { scriptDataHash } from "./script-canonical";

export function snapshotScriptContent(document: ScriptProjectDocument): ScriptContentSnapshot {
    return {
        title: document.title,
        format: document.format,
        genre: document.genre,
        logline: document.logline,
        theme: document.theme,
        synopsis: document.synopsis,
        actOne: document.actOne,
        actTwo: document.actTwo,
        actThree: document.actThree,
        characters: structuredClone(document.characters),
        episodes: document.episodes.map((episode) => ({
            id: episode.id,
            no: episode.no,
            title: episode.title,
            scenes: structuredClone(episode.scenes),
        })),
    };
}

export function summarizeScriptProject(document: ScriptProjectDocument, revision = 1): ScriptProjectSummary {
    const episodes = document.episodes;
    const sceneCount = episodes.reduce((total, episode) => total + episode.scenes.length, 0);
    const projectLocked = Boolean(document.lockedVersionId && document.lockedVersionHash);
    return {
        id: document.id,
        title: document.title,
        format: document.format,
        genre: document.genre,
        logline: document.logline,
        episodeCount: episodes.length,
        sceneCount,
        characterCount: document.characters.length,
        wordCount: scriptWordCount(document),
        lockedEpisodeCount: projectLocked ? episodes.length : episodes.filter((episode) => episode.lockedVersionId && episode.lockedVersionHash).length,
        hasPublication: document.publications.length > 0,
        publicationStale: document.publications.some((publication) => publication.status !== "failed" && isPublicationStale(document, publication.episodeIds, publication.sourceHash)),
        revision,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
    };
}

export function exportScriptText(snapshot: ScriptContentSnapshot): string {
    const lines: string[] = [];
    const add = (label: string, value: unknown) => { lines.push(`${label}：${JSON.stringify(value)}`); };
    add("标题", snapshot.title);
    add("格式", snapshot.format);
    add("题材", snapshot.genre);
    add("Logline", snapshot.logline);
    add("主题", snapshot.theme);
    add("梗概", snapshot.synopsis);
    add("第一幕", snapshot.actOne);
    add("第二幕", snapshot.actTwo);
    add("第三幕", snapshot.actThree);
    for (const character of snapshot.characters) {
        add("人物ID", character.id);
        add("人物姓名", character.name);
        add("人物定位", character.role);
        add("人物想要", character.want);
        add("人物需要", character.need);
        add("人物缺陷", character.flaw);
        add("人物变化", character.arc);
        add("人物小传", character.description);
    }
    for (const episode of snapshot.episodes) {
        add("剧集ID", episode.id);
        add("剧集编号", episode.no);
        add("剧集标题", episode.title);
        for (const scene of episode.scenes) {
            add("场次ID", scene.id);
            add("场次编号", scene.no);
            add("内外景", scene.interiorExterior);
            add("地点", scene.location);
            add("时间", scene.timeOfDay);
            add("场次人物", scene.characters);
            add("目标", scene.goal);
            add("冲突", scene.conflict);
            add("转折", scene.turn);
            add("结果", scene.outcome);
            add("剧情", scene.summary);
            add("场次正文", scene.content);
            add("备注", scene.notes);
        }
    }
    return lines.join("\n");
}
