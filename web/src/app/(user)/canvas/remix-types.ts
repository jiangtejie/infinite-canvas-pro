import type { MarketingSnapshot } from "@/lib/marketing";

export type RemixPlacement = "natural" | "recommendation" | "promotion";
export const REMIX_PLACEMENTS: Record<RemixPlacement, string> = { natural: "自然植入", recommendation: "品牌推荐", promotion: "明确促销" };
export type RemixSkillSelection = { id: string; source: "system" | "user"; name: string };
export type RemixSettings = {
    mode: "content" | "marketing";
    goal: string;
    placement: RemixPlacement;
    instruction: string;
    skills: RemixSkillSelection[];
};
export type RemixSkillSnapshot = RemixSkillSelection & { hash: string };
export type RemixSourceImage = { nodeId: string; title: string; url: string; storageKey?: string; width?: number; height?: number; mimeType?: string };
export type RemixInput = {
    ownerId: string;
    sourceNodeId: string;
    sourceSignature: string;
    sourceText: string;
    sourceImages: RemixSourceImage[];
    settings: RemixSettings;
    marketing?: MarketingSnapshot;
    marketingKey?: string;
    skills: RemixSkillSnapshot[];
    coreVersion: string;
};
export type SourceRemixPlan = {
    schemaVersion: 1;
    sourcePattern: { type: string; preserve: string[] };
    copy: { title: string; body: string; tags: string[] };
    marketingPlacement: { mode: "content" | RemixPlacement; reason: string; cta: string };
    factsUsed: Array<{ factId: string; usedIn: string[] }>;
    visual: { sharedAnchors: string[]; images: Array<{ sourceImageId: string; role: string; prompt: string; referenceAssetIds: string[] }> };
};
export type RemixRun = {
    id: string;
    createdAt: string;
    input: RemixInput;
    binding: "active" | "detached";
    plan?: SourceRemixPlan;
    approvedKey?: string;
    error?: string;
};
export type RemixNodeRole = "plan" | "copy" | "image" | "reference" | "publish";
