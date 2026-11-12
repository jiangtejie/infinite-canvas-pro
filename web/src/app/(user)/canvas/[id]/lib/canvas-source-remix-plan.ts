import type { CanvasNodeData } from "../../types";

export type SourceRemixPlan = {
    shared: string;
    images: string[];
};

/** 策划节点输出的是模型生成的 JSON：整组共同设定 + 按原图顺序的逐张提示词。 */
export async function parseSourceRemixPlan(text: string, count: number): Promise<SourceRemixPlan> {
    const { jsonrepair } = await import("jsonrepair");
    const parsed = JSON.parse(jsonrepair(text)) as { shared?: unknown; images?: unknown };
    const shared = typeof parsed.shared === "string" ? parsed.shared.trim() : "";
    const images = Array.isArray(parsed.images)
        ? parsed.images.map((item) => (typeof item === "string" ? item.trim() : ""))
        : [];
    if (!shared || images.length !== count || images.some((item) => !item)) throw new Error("策划输出不完整，请重新生成策划");
    return { shared, images };
}

/** 每张配图拿到的是「整组共同设定 + 本张差异」，生图调用彼此独立，提示词必须自包含。 */
export function remixImagePromptFromPlan(plan: SourceRemixPlan, index: number) {
    return `${plan.shared}\n\n${plan.images[index]}`;
}

export function applySourceRemixPlan(nodes: CanvasNodeData[], imageIds: string[], plan: SourceRemixPlan): CanvasNodeData[] {
    const promptById = new Map(imageIds.map((id, index) => [id, remixImagePromptFromPlan(plan, index)]));
    return nodes.map((node) => promptById.has(node.id)
        ? { ...node, metadata: { ...node.metadata, prompt: promptById.get(node.id) } }
        : node);
}