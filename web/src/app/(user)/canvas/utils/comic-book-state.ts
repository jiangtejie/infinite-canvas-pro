import { comicComposedPageCount, comicReviewProgress } from "@/app/(user)/comic/utils/comic-project";
import type { ComicProject, ComicStage } from "@/app/(user)/comic/types";

import { CanvasNodeType, type CanvasNodeData } from "../types";

export type ComicProjectLinkState =
    | { kind: "loading" }
    | { kind: "standalone" }
    | { kind: "project-missing"; projectId: string }
    | { kind: "linked"; project: ComicProject; progress: ComicProjectProgress };

export type ComicPageSlot =
    | { pageNodeId: string; kind: "available"; page: CanvasNodeData }
    | { pageNodeId: string; kind: "missing" };

export type ComicProjectProgress = {
    stage: ComicStage;
    totalPages: number;
    composedPages?: number;
    approvedPages?: number;
};

export type ComicBookPrimaryAction =
    | "add-selected-pages"
    | "handle-missing-pages"
    | "continue-layout"
    | "continue-review"
    | "open-book";

export type CanvasComicBookViewState = {
    project: ComicProjectLinkState;
    pageSlots: ComicPageSlot[];
    validPages: CanvasNodeData[];
    missingPageIds: string[];
    primaryAction: ComicBookPrimaryAction;
};

export function resolveComicPageSlots({ pageNodeIds, nodes }: { pageNodeIds: string[]; nodes: CanvasNodeData[] }) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const pageSlots = pageNodeIds.map((pageNodeId): ComicPageSlot => {
        const page = nodeById.get(pageNodeId);
        return page?.type === CanvasNodeType.Image && Boolean(page.metadata?.content)
            ? { pageNodeId, kind: "available", page }
            : { pageNodeId, kind: "missing" };
    });
    const validPages = pageSlots.flatMap((slot) => slot.kind === "available" ? [slot.page] : []);
    const missingPageIds = pageSlots.flatMap((slot) => slot.kind === "missing" ? [slot.pageNodeId] : []);
    return { pageSlots, validPages, missingPageIds };
}

export function resolveComicProjectLinkState({ projectId, projects, projectsHydrated }: { projectId?: string; projects: ComicProject[]; projectsHydrated: boolean }): ComicProjectLinkState {
    if (!projectId) return { kind: "standalone" };
    if (!projectsHydrated) return { kind: "loading" };
    const project = projects.find((item) => item.id === projectId);
    return project ? { kind: "linked", project, progress: resolveComicProjectProgress(project) } : { kind: "project-missing", projectId };
}

export function resolveComicProjectProgress(project: ComicProject): ComicProjectProgress {
    const totalPages = project.chapters.reduce((total, chapter) => total + chapter.pages.length, 0);
    if (project.stage === "layout") return { stage: project.stage, totalPages, composedPages: comicComposedPageCount(project).composed };
    if (project.stage === "review") return { stage: project.stage, totalPages, approvedPages: comicReviewProgress(project).approved };
    return { stage: project.stage, totalPages };
}

export function resolveComicBookPrimaryAction({ project, pageSlots, selectedImageCount }: { project: ComicProjectLinkState; pageSlots: ComicPageSlot[]; selectedImageCount: number }): ComicBookPrimaryAction {
    if (!pageSlots.length && selectedImageCount > 0) return "add-selected-pages";
    if (pageSlots.some((slot) => slot.kind === "missing")) return "handle-missing-pages";
    if (project.kind === "linked" && project.progress.stage === "layout" && (project.progress.composedPages || 0) < project.progress.totalPages) return "continue-layout";
    if (project.kind === "linked" && project.progress.stage === "review" && (project.progress.approvedPages || 0) < project.progress.totalPages) return "continue-review";
    return "open-book";
}

export function resolveCanvasComicBookState({ node, nodes, projects, projectsHydrated, selectedImageCount }: { node: CanvasNodeData; nodes: CanvasNodeData[]; projects: ComicProject[]; projectsHydrated: boolean; selectedImageCount: number }): CanvasComicBookViewState {
    const pageNodeIds = node.metadata?.comicBook?.pageNodeIds || [];
    const { pageSlots, validPages, missingPageIds } = resolveComicPageSlots({ pageNodeIds, nodes });
    const project = resolveComicProjectLinkState({ projectId: node.metadata?.comicBook?.comicProjectId, projects, projectsHydrated });
    return {
        project,
        pageSlots,
        validPages,
        missingPageIds,
        primaryAction: resolveComicBookPrimaryAction({ project, pageSlots, selectedImageCount }),
    };
}
