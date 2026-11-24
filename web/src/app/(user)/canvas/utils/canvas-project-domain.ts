import type { CanvasProjectDomain } from "../types";

export function isFilmCanvasProject(project: { domain?: CanvasProjectDomain }) {
    return project.domain === "film";
}

export function isComicCanvasProject(project: { domain?: CanvasProjectDomain }) {
    return project.domain === "comic";
}

export function generalCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter((project) => !project.domain);
}

export function filmCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter(isFilmCanvasProject);
}

export function comicCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter(isComicCanvasProject);
}
