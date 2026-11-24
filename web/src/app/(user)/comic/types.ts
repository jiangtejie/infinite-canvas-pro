export type ComicProjectUpdater = ComicProject | ((current: ComicProject) => ComicProject);

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

export type ComicSlotImage = ComicImageRef & {
    id: string;
    rating?: number;
    label?: string;
    createdAt?: string;
};

export type ComicImageSlot = {
    images: ComicSlotImage[];
    activeImageId?: string;
    locked?: boolean;
};

export type ComicCharacterReference = {
    id: string;
    revision: number;
    slot: ComicImageSlot;
};

export type ComicCharacterVariant = {
    id: string;
    name: string;
    description: string;
    identityOverrides?: Partial<ComicCharacter["visualIdentity"]>;
    outfitOverride?: string;
    paletteOverride?: string;
    propChanges?: string;
    stateDescription?: string;
    referenceImage?: ComicCharacterReference;
    createdAt: string;
    updatedAt: string;
};

export type ComicCharacter = {
    id: string;
    name: string;
    aliases: string[];
    role: string;
    visualIdentity: {
        description: string;
        ageRange: string;
        bodyProportions: string;
        face: string;
        hairstyle: string;
        skinTone: string;
        signatureFeatures: string;
    };
    defaultLook: {
        outfit: string;
        palette: string;
        fixedProps: string;
    };
    behavior: {
        personality: string;
        speechStyle: string;
        expressionBaseline: string;
    };
    constraints: {
        mustKeep: string[];
        forbidden: string[];
    };
    notes: string;
    references: {
        primary?: ComicCharacterReference;
        face?: ComicCharacterReference;
        fullBody?: ComicCharacterReference;
    };
    variants: ComicCharacterVariant[];
    sourceLibraryCharacterId?: string;
    sourceLibraryUpdatedAt?: string;
};

export type ComicLocation = {
    id: string;
    name: string;
    description: string;
    atmosphere: string;
    notes: string;
    image?: ComicImageSlot;
    sourceLibraryLocationId?: string;
    sourceLibraryUpdatedAt?: string;
};

export type ComicLibraryCharacter = ComicCharacter & { createdAt: string; updatedAt?: string };
export type ComicLibraryLocation = ComicLocation & { createdAt: string; updatedAt?: string };

export type ComicPanelCharacterBinding = {
    characterId: string;
    variantId?: string;
    source: "manual" | "ai";
    characterNameSnapshot: string;
    variantNameSnapshot?: string;
};

export type ComicPanelCharacterSuggestion = {
    characterName: string;
    variantName?: string;
    reason: "unknown-character" | "ambiguous-character" | "unknown-variant" | "variant-owner-mismatch";
};

export type ComicGenerationReference = {
    id: string;
    revision: string;
    role: "character-primary" | "character-face" | "character-full-body" | "character-variant" | "location" | "panel-anchor";
    imageKey?: string;
};

export type ComicGenerationContext = {
    inputSignature: string;
    compilerVersion: string;
    prompt: string;
    references: ComicGenerationReference[];
    missingReferenceIds: string[];
    model?: string;
    size?: string;
    createdAt: string;
};

export type ComicGeneratedPanelImage = ComicImageRef & {
    generationContext?: ComicGenerationContext;
};

export type ComicPanel = {
    id: string;
    description: string;
    dialogue: string;
    caption: string;
    sfx: string;
    layout?: ComicPanelLayout;
    characterBindings: ComicPanelCharacterBinding[];
    characterSuggestions?: ComicPanelCharacterSuggestion[];
    image?: ComicGeneratedPanelImage;
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
    compositionContext?: {
        stalePanelIds: string[];
        unrecordedPanelIds: string[];
        incompletePanelIds: string[];
        confirmedAt?: string;
    };
    pendingPanelTask?: {
        panelIds: string[];
        startedAt: number;
    };
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
    pageOrder: string[];
    characters: ComicCharacter[];
    locations: ComicLocation[];
    createdAt: string;
    updatedAt: string;
};
