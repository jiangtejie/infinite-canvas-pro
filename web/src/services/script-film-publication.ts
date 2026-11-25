import { nanoid } from "nanoid";

import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { applyScriptFilmRefresh, previewScriptFilmRefresh, type ScriptFilmRefreshPlan } from "@/app/(user)/canvas/[id]/lib/film-script-refresh";
import type { FilmScriptSource } from "@/app/(user)/canvas/types";
import type { ScriptContentSnapshot, ScriptPublication, ScriptVersion } from "@/app/(user)/script/types";
import { loadScriptProject, loadScriptVersions, useScriptStore } from "@/app/(user)/script/stores/use-script-store";
import { useUserStore } from "@/stores/use-user-store";
import { publicationSourceHash, resolvePublicationVersions } from "@/app/(user)/script/utils/script-publication";
import { buildInitialScriptFilmGraph, compileScriptFilmPlan } from "@/app/(user)/script/utils/script-film-plan";

type PublishInput = { projectId: string; episodeIds: string[]; publicationId?: string };
export type ScriptFilmRefreshPreview = {
    plan: ScriptFilmRefreshPlan;
    source: FilmScriptSource;
    publication: ScriptPublication;
};

export function findFilmProjectByPublication(publicationId: string): CanvasProject | undefined {
    return useCanvasStore.getState().projects.find((project) => project.domain === "film" && project.film?.scriptPublicationId === publicationId);
}

function sameEpisodes(left: string[], right: string[]) {
    return left.length === right.length && left.every((id) => right.includes(id));
}

function publicationSnapshot(publication: ScriptPublication, versions: ScriptVersion[], episodeIds: string[]) {
    const selected = publication.sourceVersionIds.map((id) => versions.find((version) => version.id === id));
    if (selected.some((version) => !version)) throw new Error("发布来源版本不可用，请重新锁定后再发布");
    const first = selected[0]!;
    return {
        ...structuredClone(first.data),
        episodes: episodeIds.map((episodeId) => {
            const episode = selected.map((version) => version!.data.episodes.find((item) => item.id === episodeId)).find(Boolean);
            if (!episode) throw new Error("发布来源缺少所选剧集");
            return structuredClone(episode);
        }),
    } satisfies ScriptContentSnapshot;
}

async function updatePublication(projectId: string, publicationId: string, patch: Partial<ScriptPublication>) {
    await useScriptStore.getState().updateDocument(projectId, (document) => {
        const exists = document.publications.some((item) => item.id === publicationId);
        return {
            ...document,
            publications: exists
                ? document.publications.map((item) => item.id === publicationId ? { ...item, ...patch } : item)
                : [...document.publications, { id: publicationId, ...patch } as ScriptPublication],
        };
    });
    return useScriptStore.getState().documents[projectId].publications.find((item) => item.id === publicationId)!;
}

async function currentPublicationSource(projectId: string, publicationId: string) {
    if (useUserStore.getState().token) {
        await loadScriptProject(projectId);
        await loadScriptVersions(projectId);
    }
    const document = useScriptStore.getState().documents[projectId];
    if (!document) throw new Error("剧本尚未加载");
    const publication = document.publications.find((item) => item.id === publicationId);
    if (!publication) throw new Error("发布记录不存在");
    const versions = useScriptStore.getState().versions[projectId] || [];
    const resolved = resolvePublicationVersions(document, versions, publication.episodeIds);
    const sourceHash = publicationSourceHash(document, publication.episodeIds);
    if (!resolved.length || !sourceHash) throw new Error("请先锁定要发布的剧集");
    const current = { ...publication, sourceVersionIds: [...new Set(resolved.map((version) => version.id))], sourceHash };
    return {
        document,
        publication,
        plan: compileScriptFilmPlan(publicationSnapshot(current, versions, publication.episodeIds)),
        source: {
            projectId,
            projectTitle: document.title,
            publicationId,
            versionIds: current.sourceVersionIds,
            hash: sourceHash,
            publishedAt: new Date().toISOString(),
        } satisfies FilmScriptSource,
    };
}

export async function previewScriptPublicationRefresh(projectId: string, publicationId: string): Promise<ScriptFilmRefreshPreview> {
    const film = findFilmProjectByPublication(publicationId);
    if (!film) throw new Error("影视项目不存在");
    const current = await currentPublicationSource(projectId, publicationId);
    return {
        plan: previewScriptFilmRefresh(film.nodes, film.connections, current.plan, current.source),
        source: current.source,
        publication: current.publication,
    };
}

export async function applyScriptPublicationRefresh(projectId: string, publicationId: string, expectedHash: string): Promise<ScriptPublication> {
    const film = findFilmProjectByPublication(publicationId);
    if (!film) throw new Error("影视项目不存在");
    const current = await currentPublicationSource(projectId, publicationId);
    if (current.source.hash !== expectedHash) throw new Error("来源已再次更新，请重新预览后再刷新");
    const graph = applyScriptFilmRefresh(film.nodes, film.connections, current.plan, current.source);
    useCanvasStore.getState().updateProject(film.id, { nodes: graph.nodes, connections: graph.connections });
    await useCanvasStore.getState().saveProjectNow(film.id);
    return updatePublication(projectId, publicationId, {
        sourceVersionIds: current.source.versionIds,
        sourceHash: current.source.hash,
        publishedAt: current.source.publishedAt,
        lastError: undefined,
    });
}

export async function publishScriptToFilm(input: PublishInput): Promise<ScriptPublication> {
    const document = useScriptStore.getState().documents[input.projectId];
    if (!document) throw new Error("剧本尚未加载");
    const episodeIds = [...new Set(input.episodeIds)];
    if (!episodeIds.length || episodeIds.some((id) => !document.episodes.some((episode) => episode.id === id))) {
        throw new Error("请选择要发布的剧集");
    }
    const versions = useScriptStore.getState().versions[input.projectId] || [];
    let publication = input.publicationId
        ? document.publications.find((item) => item.id === input.publicationId)
        : document.publications.find((item) => sameEpisodes(item.episodeIds, episodeIds));
    if (input.publicationId && !publication) throw new Error("发布记录不存在");
    if (publication && !sameEpisodes(publication.episodeIds, episodeIds)) throw new Error("重试发布的剧集必须与原发布一致");
    if (publication?.status === "published") return publication;

    let snapshot: ScriptContentSnapshot;
    if (publication) {
        snapshot = publicationSnapshot(publication, versions, episodeIds);
    } else {
        const resolved = resolvePublicationVersions(document, versions, episodeIds);
        const sourceHash = publicationSourceHash(document, episodeIds);
        if (!resolved.length || !sourceHash) throw new Error("请先锁定要发布的剧集");
        publication = {
            id: nanoid(),
            episodeIds,
            sourceVersionIds: [...new Set(resolved.map((version) => version.id))],
            sourceHash,
            status: "publishing",
        };
        snapshot = publicationSnapshot(publication, versions, episodeIds);
        await updatePublication(input.projectId, publication.id, publication);
    }

    let currentPublication = publication;
    try {
        let film = findFilmProjectByPublication(currentPublication.id)
            || (currentPublication.filmProjectId ? useCanvasStore.getState().projects.find((project) => project.id === currentPublication.filmProjectId) : undefined);
        if (!film) {
            const filmId = nanoid();
            useCanvasStore.getState().createFilmProject(snapshot.title, { id: filmId, scriptPublicationId: currentPublication.id });
            await useCanvasStore.getState().saveProjectNow(filmId);
            film = useCanvasStore.getState().projects.find((project) => project.id === filmId)!;
            currentPublication = await updatePublication(input.projectId, currentPublication.id, { filmProjectId: filmId });
        }
        const source = {
            projectId: input.projectId,
            projectTitle: snapshot.title,
            publicationId: currentPublication.id,
            versionIds: currentPublication.sourceVersionIds,
            hash: currentPublication.sourceHash,
            publishedAt: currentPublication.publishedAt || new Date().toISOString(),
        };
        const graph = buildInitialScriptFilmGraph(film, compileScriptFilmPlan(snapshot), source);
        useCanvasStore.getState().updateProject(film.id, { nodes: graph.nodes, connections: graph.connections });
        await useCanvasStore.getState().saveProjectNow(film.id);
        return await updatePublication(input.projectId, currentPublication.id, {
            filmProjectId: film.id,
            status: "published",
            publishedAt: source.publishedAt,
            lastError: undefined,
        });
    } catch (error) {
        try {
            await updatePublication(input.projectId, currentPublication.id, {
                status: "failed",
                lastError: error instanceof Error ? error.message : "发布失败",
            });
        } catch {
            // 保留原始发布错误；outbox 仍持有 publishing 记录，可在重试时继续恢复。
        }
        throw error;
    }
}
