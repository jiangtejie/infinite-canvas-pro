import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasAgentConfig, CanvasAgentSkillSelection } from "../types";

export type CanvasAgentRequestConfig = AiConfig & { textStreaming?: boolean; textReasoningEnabled?: boolean };

export type ResolvedSkillContent = { id: string; source: "system" | "user"; name: string; content: string; hasFiles?: boolean };

type AvailableSkill = { id: string; source: "system" | "user"; name: string; content: string; hasFiles?: boolean; enabled: boolean };

/** 组装助手请求配置：文本模型、接口模式与推理开关跟随 Agent 设置。 */
export function buildCanvasAgentRequestConfig(config: AiConfig, agentConfig: Pick<CanvasAgentConfig, "textApiMode" | "textStreaming" | "textReasoningEnabled">): CanvasAgentRequestConfig {
    return {
        ...config,
        model: config.textModel || config.model,
        apiMode: agentConfig.textApiMode,
        textStreaming: agentConfig.textStreaming === true,
        textReasoningEnabled: agentConfig.textReasoningEnabled === true,
        activeChannelId: config.textChannelId || config.activeChannelId,
        textChannelId: config.textChannelId,
    };
}

/** 同一接口模式下沿用上次的 JSON 回退方式，切换渠道/模型后重新探测。 */
export function canvasAgentJsonFallbackKey(config: AiConfig) {
    return [config.apiMode || "chat", config.textChannelId || config.activeChannelId || config.baseUrl, config.model].join("|");
}

/** 校验所选 Skill 仍可用并取回正文；不可用时返回可读原因。 */
export function resolveCanvasAgentSkillContents(selected: CanvasAgentSkillSelection[], available: AvailableSkill[]) {
    const contents: ResolvedSkillContent[] = [];
    for (const item of selected) {
        const skill = available.find((candidate) => candidate.id === item.id && candidate.source === item.source && candidate.enabled);
        if (!skill) return { ok: false as const, message: `Skill「${item.name}」已不可用，请重新选择` };
        contents.push({ id: skill.id, source: skill.source, name: skill.name, content: skill.content, hasFiles: skill.hasFiles });
    }
    return { ok: true as const, contents };
}
