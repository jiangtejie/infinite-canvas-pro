import { nanoid } from "nanoid";

import type { ComicChapter, ComicCharacter, ComicCharacterReference, ComicCharacterVariant, ComicImageRef, ComicLocation, ComicPanel, ComicPanelLayout, ComicPage, ComicProject, ComicReviewStatus } from "../types";

type CreateComicProjectInput = {
    title: string;
    genre?: string;
    audience?: string;
    format?: ComicProject["format"];
    direction?: ComicProject["direction"];
    logline?: string;
};

export type LegacyComicCharacter = Partial<ComicCharacter> & {
    appearance?: string;
    personality?: string;
    wardrobe?: string;
    expressions?: string;
    image?: ComicImageRef;
};

type LegacyComicPanel = Omit<Partial<ComicPanel>, "layout"> & {
    layout?: Partial<ComicPanelLayout>;
};

type LegacyComicPage = Omit<Partial<ComicPage>, "panels"> & {
    panels?: LegacyComicPanel[];
};

type LegacyComicChapter = Omit<Partial<ComicChapter>, "pages"> & {
    pages?: LegacyComicPage[];
};

export type LegacyComicProject = Omit<Partial<ComicProject>, "chapters" | "characters" | "locations"> & {
    chapters?: LegacyComicChapter[];
    characters?: LegacyComicCharacter[];
    locations?: Array<Partial<ComicLocation>>;
};

function stringList(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeLayout(layout: Partial<ComicPanelLayout> | undefined): ComicPanelLayout | undefined {
    if (!layout || ![layout.x, layout.y, layout.w, layout.h].every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
    return {
        x: Math.min(1, Math.max(0, layout.x as number)),
        y: Math.min(1, Math.max(0, layout.y as number)),
        w: Math.min(1, Math.max(0.05, layout.w as number)),
        h: Math.min(1, Math.max(0.05, layout.h as number)),
    };
}

function normalizeReference(reference: Partial<ComicCharacterReference> | undefined, fallbackId: string): ComicCharacterReference | undefined {
    if (!reference || typeof reference.url !== "string" || !reference.url) return undefined;
    return {
        id: typeof reference.id === "string" && reference.id ? reference.id : fallbackId,
        revision: Number.isFinite(reference.revision) ? Math.max(0, Math.trunc(reference.revision as number)) : 0,
        url: reference.url,
        storageKey: typeof reference.storageKey === "string" ? reference.storageKey : undefined,
        width: Number.isFinite(reference.width) ? Number(reference.width) : undefined,
        height: Number.isFinite(reference.height) ? Number(reference.height) : undefined,
    };
}

export function normalizeComicCharacter(character: LegacyComicCharacter, fallbackId: string): ComicCharacter {
    const id = character.id || fallbackId;
    const base = createComicCharacter();
    const variants: ComicCharacterVariant[] = (character.variants || []).map((variant, index) => {
        const variantId = variant.id || `${id}:variant:${index}`;
        const reference = variant.referenceImage;
        return {
            id: variantId,
            name: variant.name || `变体 ${index + 1}`,
            description: variant.description || "",
            identityOverrides: variant.identityOverrides ? { ...variant.identityOverrides } : undefined,
            outfitOverride: variant.outfitOverride || "",
            paletteOverride: variant.paletteOverride || "",
            propChanges: variant.propChanges || "",
            stateDescription: variant.stateDescription || "",
            referenceImage: normalizeReference(reference, `${variantId}:reference`),
            createdAt: variant.createdAt || "",
            updatedAt: variant.updatedAt || "",
        };
    });
    return {
        id,
        name: character.name || base.name,
        aliases: stringList(character.aliases),
        role: character.role || "",
        visualIdentity: {
            description: character.visualIdentity?.description || character.appearance || "",
            ageRange: character.visualIdentity?.ageRange || "",
            bodyProportions: character.visualIdentity?.bodyProportions || "",
            face: character.visualIdentity?.face || "",
            hairstyle: character.visualIdentity?.hairstyle || "",
            skinTone: character.visualIdentity?.skinTone || "",
            signatureFeatures: character.visualIdentity?.signatureFeatures || "",
        },
        defaultLook: {
            outfit: character.defaultLook?.outfit || character.wardrobe || "",
            palette: character.defaultLook?.palette || "",
            fixedProps: character.defaultLook?.fixedProps || "",
        },
        behavior: {
            personality: character.behavior?.personality || character.personality || "",
            speechStyle: character.behavior?.speechStyle || "",
            expressionBaseline: character.behavior?.expressionBaseline || character.expressions || "",
        },
        constraints: {
            mustKeep: stringList(character.constraints?.mustKeep),
            forbidden: stringList(character.constraints?.forbidden),
        },
        notes: character.notes || "",
        references: {
            primary: normalizeReference(character.references?.primary || character.image, `${fallbackId}:primary`),
            face: normalizeReference(character.references?.face, `${fallbackId}:face`),
            fullBody: normalizeReference(character.references?.fullBody, `${fallbackId}:fullBody`),
        },
        variants,
        sourceLibraryCharacterId: character.sourceLibraryCharacterId,
    };
}

export function normalizeComicProject(project: LegacyComicProject, projectId: string): ComicProject {
    if (!projectId) throw new Error("缺少漫画项目 ID");
    const chapters: ComicChapter[] = (project.chapters || []).map((chapter, chapterIndex) => {
        const chapterId = chapter.id || `legacy:${projectId}:chapter:${chapterIndex}`;
        const pages: ComicPage[] = (chapter.pages || []).map((page, pageIndex) => {
            const pageId = page.id || `legacy:${projectId}:chapter:${chapterIndex}:page:${pageIndex}`;
            const panels: ComicPanel[] = (page.panels || []).map((panel, panelIndex) => ({
                id: panel.id || `legacy:${projectId}:chapter:${chapterIndex}:page:${pageIndex}:panel:${panelIndex}`,
                description: panel.description || "",
                dialogue: panel.dialogue || "",
                caption: panel.caption || "",
                sfx: panel.sfx || "",
                layout: normalizeLayout(panel.layout),
                characterBindings: panel.characterBindings || [],
                characterSuggestions: panel.characterSuggestions || [],
                image: panel.image,
                imageError: panel.imageError,
            }));
            return {
                id: pageId,
                title: page.title || `第 ${pageIndex + 1} 页`,
                summary: page.summary || "",
                panels,
                reviewStatus: page.reviewStatus === "approved" || page.reviewStatus === "pending" || page.reviewStatus === "changes" ? page.reviewStatus : "draft",
                reviewNotes: page.reviewNotes || "",
                pageImage: page.pageImage,
                compositionContext: page.compositionContext,
            };
        });
        return { id: chapterId, title: chapter.title || `第 ${chapterIndex + 1} 章`, summary: chapter.summary || "", pages };
    });
    const characters = (project.characters || []).map((character, index) => normalizeComicCharacter(character, `legacy:${projectId}:character:${index}`));
    const locations = (project.locations || []).map((location, index) => ({
        id: location.id || `legacy:${projectId}:location:${index}`,
        name: location.name || `场景 ${index + 1}`,
        description: location.description || "",
        atmosphere: location.atmosphere || "",
        notes: location.notes || "",
        image: location.image,
    }));
    return {
        id: projectId,
        title: project.title?.trim() || "未命名漫画",
        status: project.status === "completed" ? "completed" : "draft",
        stage: project.stage === "script" || project.stage === "cast" || project.stage === "layout" || project.stage === "review" ? project.stage : "concept",
        genre: project.genre || "",
        audience: project.audience || "",
        format: project.format === "strip" ? "strip" : "page",
        direction: project.direction === "ltr" ? "ltr" : "rtl",
        targetPages: typeof project.targetPages === "number" && project.targetPages > 0 ? Math.round(project.targetPages) : undefined,
        logline: project.logline || "",
        synopsis: project.synopsis || "",
        styleGuide: project.styleGuide || "",
        chapters,
        characters,
        locations,
        createdAt: project.createdAt || "",
        updatedAt: project.updatedAt || "",
    };
}

export function createComicPanel(): ComicPanel {
    return { id: nanoid(), description: "", dialogue: "", caption: "", sfx: "", characterBindings: [], characterSuggestions: [] };
}

export function createComicPage(index = 1): ComicPage {
    return { id: nanoid(), title: `第 ${index} 页`, summary: "", panels: [createComicPanel()], reviewStatus: "draft", reviewNotes: "" };
}

export function createComicChapter(index = 1): ComicChapter {
    return { id: nanoid(), title: `第 ${index} 章`, summary: "", pages: [createComicPage(1)] };
}

export function createComicCharacter(index = 1): ComicCharacter {
    return {
        id: nanoid(),
        name: `角色 ${index}`,
        aliases: [],
        role: "",
        visualIdentity: { description: "", ageRange: "", bodyProportions: "", face: "", hairstyle: "", skinTone: "", signatureFeatures: "" },
        defaultLook: { outfit: "", palette: "", fixedProps: "" },
        behavior: { personality: "", speechStyle: "", expressionBaseline: "" },
        constraints: { mustKeep: [], forbidden: [] },
        notes: "",
        references: {},
        variants: [],
    };
}

export function createComicCharacterVariant(index = 1): ComicCharacterVariant {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        name: `变体 ${index}`,
        description: "",
        outfitOverride: "",
        paletteOverride: "",
        propChanges: "",
        stateDescription: "",
        createdAt: now,
        updatedAt: now,
    };
}

export function createComicLocation(index = 1): ComicLocation {
    return { id: nanoid(), name: `场景 ${index}`, description: "", atmosphere: "", notes: "" };
}

export function createComicProject(input: CreateComicProjectInput): ComicProject {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        title: input.title.trim() || "未命名漫画",
        status: "draft",
        stage: "concept",
        genre: input.genre?.trim() || "",
        audience: input.audience?.trim() || "",
        format: input.format || "page",
        direction: input.direction || "rtl",
        logline: input.logline?.trim() || "",
        synopsis: "",
        styleGuide: "",
        chapters: [createComicChapter(1)],
        characters: [],
        locations: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function comicStats(project: ComicProject) {
    const pages = project.chapters.flatMap((chapter) => chapter.pages);
    return {
        chapters: project.chapters.length,
        pages: pages.length,
        panels: pages.reduce((total, page) => total + page.panels.length, 0),
    };
}

export const COMIC_STAGE_LABELS: Record<ComicProject["stage"], string> = { concept: "企划", cast: "设定", script: "剧本", layout: "页布局", review: "审稿" };

export function comicStageLabel(stage: ComicProject["stage"]) {
    return COMIC_STAGE_LABELS[stage];
}

type ComicPageIssue = { level: "error" | "warning"; message: string };

export function comicPageCompositionSize(format: ComicProject["format"]) {
    return format === "strip" ? { width: 1080, height: 1920 } : { width: 1600, height: 2133 };
}

export function comicComposedPageCount(project: ComicProject) {
    const pages = project.chapters.flatMap((chapter) => chapter.pages);
    return { total: pages.length, composed: pages.filter((page) => page.pageImage).length };
}

export function comicPanelRect(page: ComicPage, panel: ComicPanel, index: number): ComicPanelLayout {
    if (panel.layout) return panel.layout;
    const count = Math.max(1, page.panels.length);
    const gap = 0.02;
    const height = (1 - gap * (count + 1)) / count;
    return { x: 0.03, y: gap + index * (height + gap), w: 0.94, h: height };
}

export function equalVerticalLayouts(count: number): ComicPanelLayout[] {
    const gap = 0.02;
    const height = (1 - gap * (count + 1)) / Math.max(1, count);
    return Array.from({ length: count }, (_, index) => ({ x: 0.03, y: gap + index * (height + gap), w: 0.94, h: height }));
}

export function equalGridLayouts(count: number): ComicPanelLayout[] {
    const columns = count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / columns);
    const gap = 0.025;
    const width = (1 - gap * (columns + 1)) / columns;
    const height = (1 - gap * (rows + 1)) / rows;
    return Array.from({ length: count }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return { x: gap + column * (width + gap), y: gap + row * (height + gap), w: width, h: height };
    });
}

export function comicPageReviewStatus(page: ComicPage) {
    return page.reviewStatus || "draft";
}

export function resetComicReviewStatus(status?: ComicReviewStatus): ComicReviewStatus {
    return status === "approved" || status === "pending" ? "draft" : status || "draft";
}

export function comicPageIssues(page: ComicPage): ComicPageIssue[] {
    const issues: ComicPageIssue[] = [];
    if (!page.summary.trim()) issues.push({ level: "warning", message: "本页缺少叙事梗概" });
    if (!page.panels.length) issues.push({ level: "error", message: "本页没有页格" });
    page.panels.forEach((panel, index) => {
        if (!panel.description.trim()) issues.push({ level: "error", message: `第 ${index + 1} 格缺少画面描述` });
        if (!panel.dialogue.trim() && !panel.caption.trim() && !panel.sfx.trim()) issues.push({ level: "warning", message: `第 ${index + 1} 格没有对白、旁白或拟声，确认是无声演出` });
    });
    return issues;
}

export function comicReviewProgress(project: ComicProject) {
    const pages = project.chapters.flatMap((chapter) => chapter.pages);
    const counts = { draft: 0, pending: 0, approved: 0, changes: 0 };
    pages.forEach((page) => { counts[comicPageReviewStatus(page)] += 1; });
    return { total: pages.length, ...counts };
}

export function updateComicChapter(project: ComicProject, chapterId: string, patch: Partial<ComicChapter>): ComicProject {
    return { ...project, chapters: project.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...patch } : chapter) };
}

export function updateComicPage(project: ComicProject, chapterId: string, pageId: string, patch: Partial<ComicPage>): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => chapter.id === chapterId
            ? { ...chapter, pages: chapter.pages.map((page) => page.id === pageId ? { ...page, ...patch } : page) }
            : chapter),
    };
}

export function updateComicPanel(project: ComicProject, chapterId: string, pageId: string, panelId: string, patch: Partial<ComicPanel>): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => chapter.id === chapterId
            ? { ...chapter, pages: chapter.pages.map((page) => page.id === pageId ? { ...page, panels: page.panels.map((panel) => panel.id === panelId ? { ...panel, ...patch } : panel) } : page) }
            : chapter),
    };
}

export function invalidateComicPageCompositions(project: ComicProject): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((page) => page.pageImage || page.compositionContext ? { ...page, pageImage: undefined, compositionContext: undefined } : page),
        })),
    };
}

export function invalidateComicPagesForCharacter(project: ComicProject, characterId: string): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((page) => page.panels.some((panel) => panel.characterBindings.some((binding) => binding.characterId === characterId)) ? { ...page, pageImage: undefined, compositionContext: undefined } : page),
        })),
    };
}

export function moveComicPanel(page: ComicPage, panelId: string, offset: number): ComicPage {
    const fromIndex = page.panels.findIndex((panel) => panel.id === panelId);
    const toIndex = fromIndex + offset;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= page.panels.length) return page;
    const panels = [...page.panels];
    const [moved] = panels.splice(fromIndex, 1);
    panels.splice(toIndex, 0, moved);
    return { ...page, panels };
}

export function serializeComicProject(project: ComicProject) {
    return JSON.stringify({ app: "infinite-canvas-comic", version: 1, exportedAt: new Date().toISOString(), project }, null, 2);
}

export function parseComicProjectBackup(text: string): ComicProject {
    const data = JSON.parse(text) as { project?: LegacyComicProject } | null;
    const source = data?.project;
    if (!source || typeof source.title !== "string" || !Array.isArray(source.chapters)) throw new Error("不是有效的漫画项目备份");
    const now = new Date().toISOString();
    const projectId = source.id || nanoid();
    return normalizeComicProject({ ...source, createdAt: source.createdAt || now, updatedAt: now }, projectId);
}
