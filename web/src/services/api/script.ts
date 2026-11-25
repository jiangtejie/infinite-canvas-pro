import { apiDelete, apiGet, apiPost } from "./request";
import type {
    ScriptConflict,
    ScriptConflictResolution,
    ScriptProjectDocument,
    ScriptProjectSummary,
    ScriptSyncBaseline,
    ScriptVersion,
    ScriptVersionRestoreRequest,
    ScriptVersionSummary,
} from "@/app/(user)/script/types";

export type ScriptProjectView = { document: ScriptProjectDocument; revision: number };
export type ScriptChangeRequest = {
    baseRevision: number;
    baseHeaderHash: string;
    baseScenes: ScriptSyncBaseline["scenes"];
    document: ScriptProjectDocument;
    resolutions?: ScriptConflictResolution[];
};
export type ScriptVersionRestoreRequest = { baseRevision: number };
export type ScriptChangeResponse = { document: ScriptProjectDocument; revision: number; conflicts: ScriptConflict[] };
export type ScriptVersionCreateRequest = { version: ScriptVersion; activateLock: boolean; baseRevision: number };

const projectPath = (id: string) => `/api/v1/script/projects/${encodeURIComponent(id)}`;

export function listScriptProjects(token: string) {
    return apiGet<{ items: ScriptProjectSummary[] }>("/api/v1/script/projects", undefined, token);
}

export function createScriptProject(token: string, document: ScriptProjectDocument) {
    return apiPost<ScriptProjectView>("/api/v1/script/projects", document, token);
}

export function getScriptProject(token: string, id: string) {
    return apiGet<ScriptProjectView>(projectPath(id), undefined, token);
}

export function changeScriptProject(token: string, id: string, request: ScriptChangeRequest) {
    return apiPost<ScriptChangeResponse>(`${projectPath(id)}/changes`, request, token);
}

export function deleteScriptProject(token: string, id: string, revision: number) {
    return apiDelete<boolean>(`${projectPath(id)}?revision=${revision}`, token);
}

export function listScriptVersions(token: string, projectId: string) {
    return apiGet<{ items: ScriptVersionSummary[] }>(`${projectPath(projectId)}/versions`, undefined, token);
}

export function getScriptVersion(token: string, projectId: string, versionId: string) {
    return apiGet<ScriptVersion>(`${projectPath(projectId)}/versions/${encodeURIComponent(versionId)}`, undefined, token);
}

export function createScriptVersion(token: string, projectId: string, request: ScriptVersionCreateRequest) {
    return apiPost<ScriptProjectView>(`${projectPath(projectId)}/versions`, request, token);
}

export function restoreScriptVersion(token: string, projectId: string, versionId: string, request: ScriptVersionRestoreRequest) {
    return apiPost<ScriptProjectView>(`${projectPath(projectId)}/versions/${encodeURIComponent(versionId)}/restore`, request, token);
}

export function deleteScriptVersion(token: string, projectId: string, versionId: string, baseRevision: number) {
    return apiDelete<boolean>(`${projectPath(projectId)}/versions/${encodeURIComponent(versionId)}?baseRevision=${baseRevision}`, token);
}
