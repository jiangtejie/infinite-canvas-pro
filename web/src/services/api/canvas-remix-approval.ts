import type { RemixApproval } from "@/app/(user)/canvas/remix-types";
import { currentAccountId } from "@/lib/account-storage";
import { useUserStore } from "@/stores/use-user-store";

export type CanvasRemixApprovalInput = {
    requestId: string;
    runId: string;
    approvalKey: string;
    sourceSignature: string;
    marketingKey?: string;
    coreVersion: string;
    skills: Array<{ id: string; hash: string }>;
    slots: Array<{ nodeId: string; model: string; prompt: string }>;
};

export async function approveCanvasRemix(input: CanvasRemixApprovalInput): Promise<RemixApproval> {
    const { token, user } = useUserStore.getState();
    if (!token || !user?.id) throw new Error("请先登录后再确认复刻策划");
    const response = await fetch("/api/v1/canvas/remix/approvals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, approvalRequestId: input.requestId }),
    });
    const payload = await response.json() as { code?: number; msg?: string; data?: Omit<RemixApproval, "ownerId"> };
    if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.msg || "复刻审批签发失败");
    return { ...payload.data, ownerId: currentAccountId() };
}
