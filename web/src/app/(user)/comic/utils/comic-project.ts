import { nanoid } from "nanoid";

import type { ComicChapter, ComicCharacter, ComicCharacterReference, ComicCharacterVariant, ComicImageRef, ComicImageSlot, ComicLocation, ComicPanel, ComicPanelLayout, ComicPage, ComicProject, ComicReviewStatus, ComicSlotImage } from "../types";

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

function normalizeSlotImage(value: unknown, fallbackId: string): ComicSlotImage | undefined {
    if (!value || typeof value !== "object") return undefined;
    const image = value as Partial<ComicSlotImage>;
    if (typeof image.url !== "string" || !image.url) return undefined;
    return {
        id: typeof image.id === "string" && image.id ? image.id : fallbackId,
        url: image.url,
        storageKey: typeof image.storageKey === "string" ? image.storageKey : undefined,
        width: Number.isFinite(image.width) ? Number(image.width) : undefined,
        height: Number.isFinite(image.height) ? Number(image.height) : undefined,
        rating: Number.isFinite(image.rating) ? Math.min(3, Math.max(0, Math.trunc(image.rating as number))) : undefined,
        label: typeof image.label === "string" && image.label ? image.label : undefined,
        createdAt: typeof image.createdAt === "string" ? image.createdAt : undefined,
    };
}

export function normalizeComicImageSlot(value: unknown, fallbackId: string): ComicImageSlot | undefined {
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as Partial<ComicImageSlot> & ComicImageRef;
    const rawImages = Array.isArray(candidate.images) ? candidate.images : [candidate];
    const images = rawImages
        .map((image, index) => normalizeSlotImage(image, `${fallbackId}:image:${index}`))
        .filter((image): image is ComicSlotImage => Boolean(image));
    if (!images.length) return undefined;
    const activeImageId = typeof candidate.activeImageId === "string" && images.some((image) => image.id === candidate.activeImageId)
        ? candidate.activeImageId
        : images[images.length - 1]!.id;
    return { images, activeImageId, locked: candidate.locked === true || undefined };
}

function normalizeReference(reference: unknown, fallbackId: string): ComicCharacterReference | undefined {
    if (!reference || typeof reference !== "object") return undefined;
    const value = reference as Partial<ComicCharacterReference>;
    const slot = normalizeComicImageSlot(value.slot ?? value, `${fallbackId}:slot`);
    if (!slot) return undefined;
    return {
        id: typeof value.id === "string" && value.id ? value.id : fallbackId,
        revision: Number.isFinite(value.revision) ? Math.max(0, Math.trunc(value.revision as number)) : 0,
        slot,
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
        sourceLibraryUpdatedAt: typeof character.sourceLibraryUpdatedAt === "string" ? character.sourceLibraryUpdatedAt : undefined,
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
                pendingPanelTask: page.pendingPanelTask,
            };
        });
        return { id: chapterId, title: chapter.title || `第 ${chapterIndex + 1} 章`, summary: chapter.summary || "", pages };
    });
    const characters = (project.characters || []).map((character, index) => normalizeComicCharacter(character, `legacy:${projectId}:character:${index}`));
    const locations = (project.locations || []).map((location, index) => {
        const id = location.id || `legacy:${projectId}:location:${index}`;
        return {
            id,
            name: location.name || `场景 ${index + 1}`,
            description: location.description || "",
            atmosphere: location.atmosphere || "",
            notes: location.notes || "",
            image: normalizeComicImageSlot(location.image, `${id}:image`),
            sourceLibraryLocationId: typeof location.sourceLibraryLocationId === "string" ? location.sourceLibraryLocationId : undefined,
            sourceLibraryUpdatedAt: typeof location.sourceLibraryUpdatedAt === "string" ? location.sourceLibraryUpdatedAt : undefined,
        };
    });
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
        pageOrder: Array.from(new Set([...(project.pageOrder || []), ...chapters.flatMap((chapter) => chapter.pages.map((page) => page.id))])),
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
    const chapters = [createComicChapter(1)];
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
        chapters,
        pageOrder: chapters.flatMap((chapter) => chapter.pages.map((page) => page.id)),
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

export function comicPagesInBookOrder(project: ComicProject) {
    const entries = project.chapters.flatMap((chapter) => chapter.pages.map((page) => ({ chapter, page })));
    const entryById = new Map(entries.map((entry) => [entry.page.id, entry]));
    const orderedIds = Array.from(new Set([...project.pageOrder, ...entries.map((entry) => entry.page.id)]));
    return orderedIds.flatMap((id) => entryById.has(id) ? [entryById.get(id)!] : []);
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
    if (!patch.pages) return { ...project, chapters: project.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...patch } : chapter) };
    const currentPages = project.chapters.flatMap((chapter) => chapter.pages);
    const replacedPages = project.chapters.find((chapter) => chapter.id === chapterId)?.pages || [];
    const replacedPageIds = new Set(replacedPages.map((page) => page.id));
    const nextPageIds = new Set(patch.pages.map((page) => page.id));
    const insertionIndex = project.pageOrder.findIndex((id) => replacedPageIds.has(id));
    const remainingOrder = project.pageOrder.filter((id) => !replacedPageIds.has(id) || nextPageIds.has(id));
    const insertedPageIds = patch.pages.map((page) => page.id).filter((id) => !remainingOrder.includes(id));
    const anchorId = insertionIndex < 0 ? "" : project.pageOrder[insertionIndex]!;
    const anchorIndex = remainingOrder.indexOf(anchorId);
    const insertAt = insertionIndex < 0 ? remainingOrder.length : anchorIndex < 0 ? project.pageOrder.slice(0, insertionIndex).filter((id) => remainingOrder.includes(id)).length : anchorIndex + 1;
    const pageOrder = [...remainingOrder.slice(0, insertAt), ...insertedPageIds, ...remainingOrder.slice(insertAt)];
    currentPages.forEach((page) => {
        if (!pageOrder.includes(page.id) && !replacedPageIds.has(page.id)) pageOrder.push(page.id);
    });
    return {
        ...project,
        pageOrder,
        chapters: project.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...patch } : chapter),
    };
}

export function removeComicPage(project: ComicProject, chapterId: string, pageId: string): ComicProject {
    const pages = project.chapters.find((chapter) => chapter.id === chapterId)?.pages;
    return pages ? updateComicChapter(project, chapterId, { pages: pages.filter((page) => page.id !== pageId) }) : project;
}

export function updateComicPage(project: ComicProject, chapterId: string, pageId: string, patch: Partial<ComicPage>): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => chapter.id === chapterId
            ? { ...chapter, pages: chapter.pages.map((page) => {
                if (page.id !== pageId) return page;
                const next = { ...page, ...patch };
                const panelIds = new Set(next.panels.map((panel) => panel.id));
                const pendingPanelIds = next.pendingPanelTask?.panelIds.filter((id) => panelIds.has(id));
                return { ...next, pendingPanelTask: pendingPanelIds?.length ? { ...next.pendingPanelTask!, panelIds: pendingPanelIds } : undefined };
            }) }
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

export function recordComicPanelGenerationResult(
    project: ComicProject,
    chapterId: string,
    pageId: string,
    panelId: string,
    result: Partial<Pick<ComicPanel, "image" | "imageError">>,
    remainingPanelIds: string[],
    startedAt: number,
): ComicProject {
    const currentPage = project.chapters.find((chapter) => chapter.id === chapterId)?.pages.find((page) => page.id === pageId);
    const panelIds = new Set(currentPage?.panels.map((panel) => panel.id) || []);
    const remaining = remainingPanelIds.filter((id) => panelIds.has(id));
    const next = updateComicPanel(project, chapterId, pageId, panelId, result);
    const invalidation = result.image && currentPage ? { pageImage: undefined, compositionContext: undefined, reviewStatus: resetComicReviewStatus(currentPage.reviewStatus) } : {};
    return updateComicPage(next, chapterId, pageId, {
        pendingPanelTask: remaining.length ? { panelIds: remaining, startedAt } : undefined,
        ...invalidation,
    });
}

function invalidateComicPage(page: ComicPage): ComicPage {
    return { ...page, pageImage: undefined, compositionContext: undefined, reviewStatus: resetComicReviewStatus(page.reviewStatus) };
}

export function invalidateComicPageCompositions(project: ComicProject): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map(invalidateComicPage),
        })),
    };
}

function cleanComicCharacterBindings(project: ComicProject, characterId: string): ComicProject {
    const variantIds = new Set(project.characters.find((character) => character.id === characterId)?.variants.map((variant) => variant.id) || []);
    return {
        ...project,
        chapters: project.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((page) => ({
                ...page,
                panels: page.panels.map((panel) => {
                    const characterBindings = panel.characterBindings.filter((binding) => binding.characterId !== characterId || !binding.variantId || variantIds.has(binding.variantId));
                    return characterBindings.length === panel.characterBindings.length ? panel : { ...panel, characterBindings };
                }),
            })),
        })),
    };
}

export function invalidateComicPagesForCharacter(project: ComicProject, characterId: string): ComicProject {
    const next = cleanComicCharacterBindings(project, characterId);
    return {
        ...next,
        chapters: next.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((page) => page.panels.some((panel) => panel.characterBindings.some((binding) => binding.characterId === characterId)) ? invalidateComicPage(page) : page),
        })),
    };
}

export function invalidateComicPagesForVariantChanges(project: ComicProject, characterId: string, previous: ComicCharacter): ComicProject {
    const nextCharacter = project.characters.find((character) => character.id === characterId);
    if (!nextCharacter) return project;
    const previousVariants = new Map(previous.variants.map((variant) => [variant.id, variant]));
    const changedVariantIds = new Set(previous.variants.filter((variant) => !nextCharacter.variants.some((item) => item.id === variant.id)).map((variant) => variant.id));
    nextCharacter.variants.forEach((variant) => {
        if (JSON.stringify(previousVariants.get(variant.id)) !== JSON.stringify(variant)) changedVariantIds.add(variant.id);
    });
    const affectedPageIds = new Set(project.chapters.flatMap((chapter) => chapter.pages).filter((page) => page.panels.some((panel) => panel.characterBindings.some((binding) =>
        binding.characterId === characterId && binding.variantId && changedVariantIds.has(binding.variantId)
    ))).map((page) => page.id));
    const next = cleanComicCharacterBindings(project, characterId);
    return {
        ...next,
        chapters: next.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((page) => affectedPageIds.has(page.id) ? invalidateComicPage(page) : page),
        })),
    };
}

export function removeComicCharacterFromProject(project: ComicProject, character: ComicCharacter): ComicProject {
    const names = new Set([character.name, ...character.aliases].map((name) => name.trim()).filter(Boolean));
    return {
        ...project,
        characters: project.characters.filter((item) => item.id !== character.id),
        chapters: project.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((page) => {
                const affected = page.panels.some((panel) => panel.characterBindings.some((binding) => binding.characterId === character.id));
                const panels = page.panels.map((panel) => ({
                    ...panel,
                    characterBindings: panel.characterBindings.filter((binding) => binding.characterId !== character.id),
                    characterSuggestions: (panel.characterSuggestions || []).filter((suggestion) => !names.has(suggestion.characterName.trim())),
                }));
                return affected ? invalidateComicPage({ ...page, panels }) : { ...page, panels };
            }),
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
