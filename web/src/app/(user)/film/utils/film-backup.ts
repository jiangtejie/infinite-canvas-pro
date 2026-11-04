import type { FilmProject } from "../types";
import { normalizeFilmAspect } from "./film-aspects";
import { normalizeFilmStylePreset } from "./film-styles";

type FilmBackup = {
    app: "film";
    version: 1;
    exportedAt: string;
    project: FilmProject;
};

/** 导出成带版本标记的 JSON，便于备份或在其他浏览器导入。 */
export function serializeFilmProject(project: FilmProject): string {
    const backup: FilmBackup = { app: "film", version: 1, exportedAt: new Date().toISOString(), project };
    return JSON.stringify(backup, null, 2);
}

export function parseFilmProjectBackup(text: string): FilmProject {
    const data = JSON.parse(text) as Partial<FilmBackup> & Partial<FilmProject>;
    const project = (data.project || data) as Partial<FilmProject>;
    if (!project || typeof project.title !== "string" || !Array.isArray(project.episodes)) {
        throw new Error("不是有效的影视项目备份文件");
    }
    const stage = ["script", "cast", "storyboard", "edit"].includes(project.stage || "") ? (project.stage as FilmProject["stage"]) : "script";
    return {
        id: typeof project.id === "string" ? project.id : "",
        title: project.title,
        visualStyle: project.visualStyle || "",
        aspect: normalizeFilmAspect(project.aspect),
        stylePreset: normalizeFilmStylePreset(project.stylePreset),
        stage,
        scriptText: project.scriptText || "",
        episodes: project.episodes,
        characters: Array.isArray(project.characters) ? project.characters : [],
        locations: Array.isArray(project.locations) ? project.locations : [],
        createdAt: project.createdAt || new Date().toISOString(),
        updatedAt: project.updatedAt || new Date().toISOString(),
    };
}
