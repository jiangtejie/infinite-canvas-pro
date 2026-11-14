import { apiDelete, apiGet, apiPost } from "./request";
import type { MarketingWorkspace } from "@/lib/marketing";

export function fetchMarketingWorkspaces(token: string, page = 1) {
    return apiGet<{ items: MarketingWorkspace[]; total: number }>("/api/v1/marketing/workspaces", { page, pageSize: 100 }, token);
}
export function fetchMarketingWorkspace(token: string, id: string) {
    return apiGet<MarketingWorkspace>(`/api/v1/marketing/workspaces/${encodeURIComponent(id)}`, undefined, token);
}
export function saveMarketingWorkspace(token: string, workspace: MarketingWorkspace) {
    return apiPost<MarketingWorkspace>("/api/v1/marketing/workspaces", workspace, token);
}
export function deleteMarketingWorkspace(token: string, id: string, revision: number) {
    return apiDelete<boolean>(`/api/v1/marketing/workspaces/${encodeURIComponent(id)}?revision=${revision}`, token);
}
export function fetchMarketingAssetReferences(token: string) {
    return apiGet<string[]>("/api/v1/marketing/asset-references", undefined, token);
}
