import type { ComicCharacter, ComicLocation, ComicPage, ComicStage } from "@/app/(user)/comic/types";

export type CanvasComicMeta = {
    bookNodeId: string;
    stage: ComicStage;
    format: "page" | "strip";
    direction: "rtl" | "ltr";
    genre: string;
    audience: string;
    targetPages?: number;
    logline: string;
    synopsis: string;
    styleGuide: string;
    status: "draft" | "completed";
    chapterOrder: { id: string; title: string; summary: string }[];
    cast: { characters: ComicCharacter[]; locations: ComicLocation[] };
};

export type ComicPageNodeData = Omit<ComicPage, "id"> & {
    chapterId: string;
};
