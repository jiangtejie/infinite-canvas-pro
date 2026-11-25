import { accountLocalStorage } from "@/lib/account-storage";
import type { MarketingScope, MarketingSelection } from "@/lib/marketing";
import type { RemixPlacement, RemixSettings, RemixSkillSelection } from "./remix-types";

export type RemixSetupMemory = {
    mode?: RemixSettings["mode"];
    placement?: RemixPlacement;
    goal?: string;
    selection?: MarketingSelection;
    skills: RemixSkillSelection[];
};

const MEMORY_KEY = "infinite-canvas:remix_setup";
export const REMIX_DEFAULT_GOALS = {
    content: "保留原作的结构与传播逻辑，原创重制",
    marketing: "通过有用、可信的内容建立品牌认知",
} as const;
const emptyMemory = (): RemixSetupMemory => ({ skills: [] });

export function createInitialRemixSettings(memory: RemixSetupMemory, options: { instruction: string; initialSkills: RemixSkillSelection[] }): RemixSettings {
    const mode = memory.mode || "content";
    return {
        mode,
        placement: memory.placement || "natural",
        goal: memory.goal || REMIX_DEFAULT_GOALS[mode],
        instruction: options.instruction,
        skills: options.initialSkills.length ? options.initialSkills : memory.skills,
    };
}

export function changeRemixSettingsMode(settings: RemixSettings, mode: RemixSettings["mode"]): RemixSettings {
    return {
        ...settings,
        mode,
        goal: settings.goal === REMIX_DEFAULT_GOALS[settings.mode] ? REMIX_DEFAULT_GOALS[mode] : settings.goal,
    };
}

function parseSelection(value: unknown): MarketingSelection | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.workspaceId !== "string" || !record.workspaceId) return undefined;
    const scope = record.scope as MarketingScope;
    if (!["workspace", "brand", "location", "offering"].includes(scope)) return undefined;
    if (scope === "brand" && (typeof record.brandId !== "string" || !record.brandId)) return undefined;
    if (scope === "location" && (typeof record.locationId !== "string" || !record.locationId)) return undefined;
    if (scope === "offering") {
        if (typeof record.brandId !== "string" || !record.brandId || !Array.isArray(record.offeringIds)) return undefined;
        const ids = record.offeringIds.filter((id): id is string => typeof id === "string" && Boolean(id)).slice(0, 10);
        if (!ids.length || new Set(ids).size !== ids.length) return undefined;
        return { workspaceId: record.workspaceId, scope, brandId: record.brandId, ...(typeof record.locationId === "string" && record.locationId ? { locationId: record.locationId } : {}), offeringIds: ids };
    }
    if (scope === "workspace" && (record.brandId || record.locationId || record.offeringIds)) return undefined;
    if (scope === "brand" && (record.locationId || record.offeringIds)) return undefined;
    if (scope === "location") {
        const ids = Array.isArray(record.offeringIds) ? record.offeringIds.filter((id): id is string => typeof id === "string" && Boolean(id)).slice(0, 10) : [];
        if (new Set(ids).size !== ids.length) return undefined;
        return { workspaceId: record.workspaceId, scope, ...(typeof record.brandId === "string" && record.brandId ? { brandId: record.brandId } : {}), locationId: record.locationId as string, ...(ids.length ? { offeringIds: ids } : {}) };
    }
    return { workspaceId: record.workspaceId, scope, ...(scope === "brand" ? { brandId: record.brandId as string } : {}) };
}

export function parseRemixSetupMemory(value: unknown): RemixSetupMemory {
    if (!value || typeof value !== "object") return emptyMemory();
    const parsed = value as { mode?: unknown; placement?: unknown; goal?: unknown; selection?: unknown; skills?: unknown };
    const mode = parsed.mode === "content" || parsed.mode === "marketing" ? parsed.mode : undefined;
    const placement = parsed.placement === "natural" || parsed.placement === "recommendation" || parsed.placement === "promotion" ? parsed.placement : undefined;
    const goal = typeof parsed.goal === "string" && parsed.goal.trim() && Array.from(parsed.goal).length <= 1000 ? parsed.goal.trim() : undefined;
    const skills = Array.isArray(parsed.skills)
        ? parsed.skills.filter((skill): skill is RemixSkillSelection => Boolean(skill) && typeof skill === "object" && typeof skill.id === "string" && typeof skill.name === "string" && (skill.source === "system" || skill.source === "user")).slice(0, 5)
        : [];
    return { mode, placement, goal, selection: parseSelection(parsed.selection), skills };
}

export function readRemixSetupMemory(): RemixSetupMemory {
    if (typeof window === "undefined") return emptyMemory();
    try {
        return parseRemixSetupMemory(JSON.parse(accountLocalStorage.getItem(MEMORY_KEY) || "null"));
    } catch {
        return emptyMemory();
    }
}

export function saveRemixSetupMemory(memory: RemixSetupMemory) {
    if (typeof window === "undefined") return;
    try {
        accountLocalStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
    } catch {
        return;
    }
}
