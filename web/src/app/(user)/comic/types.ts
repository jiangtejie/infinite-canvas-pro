export type ComicFormat = "page" | "strip";
export type ComicDirection = "rtl" | "ltr";
export type ComicStage = "concept" | "cast" | "script" | "layout" | "review";

export type ComicPanelLayout = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export type ComicReviewStatus = "draft" | "pending" | "approved" | "changes";

export type ComicImageRef = {
    url: string;
    storageKey?: string;
    width?: number;
    height?: number;
};

export type ComicCharacter = {
    id: string;
    name: string;
    role: string;
    appearance: string;
    personality: string;
    wardrobe: string;
    expressions: string;
    notes: string;
    image?: ComicImageRef;
};

export type ComicLocation = {
    id: string;
    name: string;
    description: string;
    atmosphere: string;
    notes: string;
    image?: ComicImageRef;
};

export type ComicLibraryCharacter = ComicCharacter & { createdAt: string };
export type ComicLibraryLocation = ComicLocation & { createdAt: string };

export type ComicPanel = {
    id: string;
    description: string;
    dialogue: string;
    caption: string;
    sfx: string;
    layout?: ComicPanelLayout;
    image?: ComicImageRef;
    imageError?: string;
};

export type ComicPage = {
    id: string;
    title: string;
    summary: string;
    panels: ComicPanel[];
    reviewStatus: ComicReviewStatus;
    reviewNotes: string;
    pageImage?: ComicImageRef;
};

export type ComicChapter = {
    id: string;
    title: string;
    summary: string;
    pages: ComicPage[];
};

export type ComicProject = {
    id: string;
    title: string;
    status: "draft" | "completed";
    stage: ComicStage;
    genre: string;
    audience: string;
    format: ComicFormat;
    direction: ComicDirection;
    targetPages?: number;
    logline: string;
    synopsis: string;
    styleGuide: string;
    chapters: ComicChapter[];
    characters: ComicCharacter[];
    locations: ComicLocation[];
    createdAt: string;
    updatedAt: string;
};
