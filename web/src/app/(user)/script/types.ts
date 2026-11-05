export type ScriptFormat = "film" | "tv" | "short";

export type ScriptCharacter = {
    id: string;
    name: string;
    role: string;
    want: string;
    need: string;
    flaw: string;
    arc: string;
    description: string;
};

export type ScriptScene = {
    id: string;
    no: number;
    interiorExterior: "内景" | "外景" | "内外景" | "";
    location: string;
    timeOfDay: string;
    characters: string[];
    goal: string;
    conflict: string;
    turn: string;
    outcome: string;
    summary: string;
    content: string;
    notes: string;
};

export type ScriptDraft = {
    id: string;
    label: string;
    createdAt: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    scenes: ScriptScene[];
};

export type ScriptProject = {
    id: string;
    title: string;
    status: "draft" | "locked";
    lockedDraftId?: string;
    filmProjectId?: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    scenes: ScriptScene[];
    drafts: ScriptDraft[];
    createdAt: string;
    updatedAt: string;
};
