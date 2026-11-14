export type MarketingFact = { id: string; label: string; value: string; source: string; approved: boolean; validUntil: string };
export type MarketingAssetReference = { assetId: string; role: string; storageKey?: string };
export type MarketingDetails = { description: string; audience: string; guidance: string; forbidden: string[]; facts: MarketingFact[]; assets: MarketingAssetReference[] };
export type MarketingBrand = MarketingDetails & { id: string; workspaceId: string; name: string };
export type MarketingLocation = MarketingDetails & { id: string; workspaceId: string; brandId: string; name: string; kind: "store" | "service" | "online"; city: string; district: string; address: string; localContext: string };
export type MarketingOffering = MarketingDetails & { id: string; workspaceId: string; brandId: string; name: string; kind: "product" | "service"; category: string };
export type MarketingListing = { workspaceId: string; locationId: string; offeringId: string; available: boolean; highlights: string; facts: MarketingFact[] };
export type MarketingWorkspace = MarketingDetails & { id: string; ownerUserId: string; name: string; industry: string; revision: number; createdAt: string; updatedAt: string; brands: MarketingBrand[]; locations: MarketingLocation[]; offerings: MarketingOffering[]; listings: MarketingListing[] };
export type MarketingSelection = { workspaceId: string; locationId: string; offeringIds: string[] };
export type MarketingAssetSnapshot = { assetId: string; role: string; title: string; storageKey: string; width: number; height: number; mimeType: string };
export type MarketingSnapshot = {
    selection: MarketingSelection;
    workspace: { id: string; name: string; industry: string };
    brand: { id: string; name: string };
    location: { id: string; name: string; kind: string; city: string; district: string; address: string; localContext: string };
    offerings: Array<{ id: string; name: string; kind: string; category: string; description: string; highlights: string }>;
    details: Array<{ subject: string; description: string; audience: string; guidance: string }>;
    forbidden: string[];
    facts: MarketingFact[];
    assets: MarketingAssetSnapshot[];
};
export type MarketingImageAsset = { id: string; kind: string; title: string; data: { dataUrl?: string; storageKey?: string; width?: number; height?: number; mimeType?: string } };

export function emptyMarketingDetails(): MarketingDetails {
    return { description: "", audience: "", guidance: "", forbidden: [], facts: [], assets: [] };
}

export function marketingAssetIds(workspace: MarketingWorkspace) {
    return [...new Set([workspace, ...workspace.brands, ...workspace.locations, ...workspace.offerings].flatMap((item) => item.assets.map((asset) => asset.assetId)))];
}

export function availableMarketingOfferings(workspace: MarketingWorkspace, locationId: string) {
    const ids = new Set(workspace.listings.filter((listing) => listing.locationId === locationId && listing.available).map((listing) => listing.offeringId));
    return workspace.offerings.filter((offering) => ids.has(offering.id));
}

export function buildMarketingSnapshot(workspace: MarketingWorkspace, selection: MarketingSelection, assets: MarketingImageAsset[], now = Date.now()): MarketingSnapshot {
    if (workspace.id !== selection.workspaceId) throw new Error("营销资料空间不匹配");
    const location = workspace.locations.find((item) => item.id === selection.locationId);
    const brand = workspace.brands.find((item) => item.id === location?.brandId);
    if (!location || !brand) throw new Error("请选择当前资料空间中的门店或服务点");
    if (!selection.offeringIds.length || new Set(selection.offeringIds).size !== selection.offeringIds.length) throw new Error("请至少选择一个不重复的商品/服务");
    const available = availableMarketingOfferings(workspace, location.id);
    const offerings = selection.offeringIds.map((id) => {
        const offering = available.find((item) => item.id === id && item.brandId === brand.id);
        if (!offering) throw new Error("选中的商品/服务已不在当前门店提供，请重新选择");
        return offering;
    });
    const listings = workspace.listings.filter((item) => item.locationId === location.id && selection.offeringIds.includes(item.offeringId));
    const details = [workspace, brand, location, ...offerings];
    const facts = [...details.flatMap((item) => item.facts), ...listings.flatMap((item) => item.facts)];
    const approvedFacts = facts.filter((fact) => fact.approved);
    if (approvedFacts.some((fact) => !fact.source.trim() || !fact.value.trim())) throw new Error("已确认的营销事实缺少内容或依据，请先更新资料");
    if (approvedFacts.some((fact) => fact.validUntil && (!Number.isFinite(Date.parse(fact.validUntil)) || Date.parse(fact.validUntil) <= now))) throw new Error("所选资料包含已过期的营销事实，请先更新或取消确认");
    const referenceRoles = new Map<string, string[]>();
    details.flatMap((item) => item.assets).forEach((ref) => referenceRoles.set(ref.assetId, [...(referenceRoles.get(ref.assetId) || []), ref.role]));
    const snapshots = [...referenceRoles].map(([id, roles]): MarketingAssetSnapshot => {
        const asset = assets.find((item) => item.id === id && item.kind === "image");
        if (!asset?.data.storageKey || !asset.data.mimeType?.startsWith("image/")) throw new Error("营销图片尚未持久化，请先同步或重新保存到“我的素材”");
        return { assetId: id, role: [...new Set(roles)].join("、"), title: asset.title, storageKey: asset.data.storageKey, width: asset.data.width || 0, height: asset.data.height || 0, mimeType: asset.data.mimeType };
    });
    return {
        selection: { ...selection, offeringIds: [...selection.offeringIds] },
        workspace: { id: workspace.id, name: workspace.name, industry: workspace.industry },
        brand: { id: brand.id, name: brand.name },
        location: { id: location.id, name: location.name, kind: location.kind, city: location.city, district: location.district, address: location.address, localContext: location.localContext },
        offerings: offerings.map((item) => ({ id: item.id, name: item.name, kind: item.kind, category: item.category, description: item.description, highlights: listings.find((listing) => listing.offeringId === item.id)?.highlights || "" })),
        details: details.map((item) => ({ subject: item.name, description: item.description, audience: item.audience, guidance: item.guidance })),
        forbidden: [...new Set(details.flatMap((item) => item.forbidden))], facts: approvedFacts, assets: snapshots,
    };
}

// Blob URL 在刷新后变化；持久化身份优先使用 storageKey。
export function marketingSnapshotKey(snapshot: MarketingSnapshot) {
    return JSON.stringify(snapshot);
}
