import { accountLocalStorage } from "@/lib/account-storage";
import type { RemixSkillSelection } from "./remix-types";

export type RemixSetupMemory = {
    workspaceId: string;
    locations: Record<string, { locationId: string; offeringIds: string[] }>;
    skills: RemixSkillSelection[];
};

const MEMORY_KEY = "infinite-canvas:remix_setup";
const emptyMemory = (): RemixSetupMemory => ({ workspaceId: "", locations: {}, skills: [] });

export function readRemixSetupMemory(): RemixSetupMemory {
    if (typeof window === "undefined") return emptyMemory();
    try {
        const parsed = JSON.parse(accountLocalStorage.getItem(MEMORY_KEY) || "null") as Partial<RemixSetupMemory> | null;
        if (!parsed || typeof parsed !== "object") return emptyMemory();
        const locations: RemixSetupMemory["locations"] = {};
        for (const [key, value] of Object.entries(parsed.locations || {})) {
            if (!key || !value || typeof value !== "object") continue;
            const record = value as { locationId?: unknown; offeringIds?: unknown };
            if (typeof record.locationId !== "string") continue;
            locations[key] = {
                locationId: record.locationId,
                offeringIds: Array.isArray(record.offeringIds) ? record.offeringIds.filter((id): id is string => typeof id === "string").slice(0, 10) : [],
            };
        }
        const skills = Array.isArray(parsed.skills)
            ? parsed.skills.filter((skill): skill is RemixSkillSelection => Boolean(skill) && typeof skill === "object" && typeof skill.id === "string" && typeof skill.name === "string" && (skill.source === "system" || skill.source === "user")).slice(0, 5)
            : [];
        return { workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : "", locations, skills };
    } catch {
        return emptyMemory();
    }
}

export function saveRemixSetupMemory(memory: RemixSetupMemory) {
    if (typeof window === "undefined") return;
    try {
        accountLocalStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
    } catch {
        // 本机配置写入失败不影响本次复刻。
    }
}
