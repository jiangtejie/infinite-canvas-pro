import type { CanvasAgentActionName } from "./canvas-agent-tools";

export type CanvasAgentActionRisk = "read" | "write" | "destructive" | "costly";

/** 每个画布工具的风险等级：读取、普通写入、破坏性结构变更、会消耗生成成本。 */
export const CANVAS_AGENT_ACTION_RISK: Record<CanvasAgentActionName, CanvasAgentActionRisk> = {
    get_canvas_summary: "read",
    get_selected_nodes: "read",
    query_canvas_nodes: "read",
    get_node: "read",
    get_upstream_nodes: "read",
    get_downstream_nodes: "read",
    get_connected_nodes: "read",
    get_generation_config: "read",
    get_generation_task: "read",
    read_skill_file: "read",
    get_media_task_status: "read",
    set_agent_state: "write",
    create_primary_script_node: "write",
    create_text_node: "write",
    update_text_node: "write",
    update_node: "write",
    create_connection: "write",
    create_group: "write",
    arrange_nodes: "write",
    delete_node: "destructive",
    delete_connection: "destructive",
    generate_image: "costly",
    edit_image: "costly",
    generate_video: "costly",
    generate_audio: "costly",
};

export function canvasAgentActionRisk(name: string): CanvasAgentActionRisk {
    return Object.prototype.hasOwnProperty.call(CANVAS_AGENT_ACTION_RISK, name) ? CANVAS_AGENT_ACTION_RISK[name as CanvasAgentActionName] : "write";
}

export function isCanvasAgentReadAction(name: string) {
    return canvasAgentActionRisk(name) === "read";
}

/** 破坏性或高成本操作，后续接预览确认时以此为准。 */
export function canvasAgentActionRequiresConfirmation(name: string) {
    const risk = canvasAgentActionRisk(name);
    return risk === "destructive" || risk === "costly";
}

/** 结构写入可在同批次失败时整体回滚；删除、媒体提交和主剧本重命名不可回滚。 */
export function canvasAgentActionReversible(name: string) {
    return canvasAgentActionRisk(name) === "write" && name !== "create_primary_script_node";
}

/** 首次正式主剧本之外的真实写入会结束项目自动标题待定状态。 */
export function canvasAgentClearsAutoTitle(name: string) {
    return name !== "create_primary_script_node" && !isCanvasAgentReadAction(name) && name !== "set_agent_state";
}
