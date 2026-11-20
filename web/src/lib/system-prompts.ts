export type SystemPromptSettings = {
    image: string;
    video: string;
    text: string;
    workflow: string;
    workflowAgent: string;
};

/** 本地非空提示词优先，否则使用后台公开配置；两边都为空时返回空串。 */
export function resolveSystemPrompts(local: Partial<SystemPromptSettings> | undefined, shared: Partial<SystemPromptSettings> | undefined): SystemPromptSettings {
    return {
        image: local?.image || shared?.image || "",
        video: local?.video || shared?.video || "",
        text: local?.text || shared?.text || "",
        workflow: local?.workflow || shared?.workflow || "",
        workflowAgent: local?.workflowAgent || shared?.workflowAgent || "",
    };
}
