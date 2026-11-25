import type { RemixRun } from "../../remix-types";
import { remixApprovalKey } from "./canvas-source-remix";

export function assertRemixAccountFresh(run: RemixRun, ownerId: string) {
    if ((run.input.ownerId || "guest") !== (ownerId || "guest")) throw new Error("账号已切换，请重新解析素材后再复刻");
}

export function remixApprovalHeaders(run: RemixRun, nodeId: string, model: string, requestPrompt: string, now = Date.now(), ownerId = run.input.ownerId) {
    assertRemixAccountFresh(run, ownerId);
    const approval = run.approval;
    if (approval && approval.ownerId !== (run.input.ownerId || "guest")) throw new Error("账号已切换，请重新审阅");
    const key = remixApprovalKey(run);
    if (run.approvedKey && run.approvedKey !== key) throw new Error("策划已变化，请重新审阅");
    if (!run.plan || run.approvedKey !== key) throw new Error("尚未确认整组策划，请先审阅后生成");
    if (!approval || approval.approvalKey !== key) throw new Error("复刻审批已失效，请重新审阅");
    if (!Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now) throw new Error("复刻审批已过期，请重新审阅");
    const slot = approval.slots.find((item) => item.nodeId === nodeId);
    if (!slot || slot.model !== model || slot.prompt.trim() !== requestPrompt.trim()) throw new Error("模型或最终提示词已变化，请重新审阅");
    if (slot.consumedByTask) throw new Error("审批槽位已使用，请重新审阅后再生成");
    return { approvalId: approval.id, slotId: slot.id };
}
