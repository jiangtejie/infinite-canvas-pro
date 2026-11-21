import type { CanvasProjectDomain } from "../types";

export function isFilmCanvasProject(project: { domain?: CanvasProjectDomain }) {
    return project.domain === "film";
}

export function generalCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter((project) => !isFilmCanvasProject(project));
}

export function filmCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter(isFilmCanvasProject);
}
