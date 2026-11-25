import { nanoid } from "nanoid";

export type MarketingFact = { id: string; label: string; value: string; source: string; approved: boolean; validUntil: string };
export type MarketingAssetReference = { assetId: string; role: string };
export type MarketingDetails = { description: string; audience: string; guidance: string; forbidden: string[]; facts: MarketingFact[]; assets: MarketingAssetReference[] };
export type MarketingBrand = MarketingDetails & { id: string; workspaceId: string; name: string };
export type MarketingLocation = MarketingDetails & { id: string; workspaceId: string; brandId: string; name: string; kind: "store" | "service" | "online"; city: string; district: string; address: string; localContext: string };
export type MarketingOffering = MarketingDetails & { id: string; workspaceId: string; brandId: string; name: string; kind: "product" | "service"; category: string };
export type MarketingListing = { workspaceId: string; locationId: string; offeringId: string; available: boolean; highlights: string; facts: MarketingFact[] };
export type MarketingWorkspace = MarketingDetails & { id: string; ownerUserId: string; name: string; industry: string; revision: number; createdAt: string; updatedAt: string; brands: MarketingBrand[]; locations: MarketingLocation[]; offerings: MarketingOffering[]; listings: MarketingListing[] };
export type MarketingWorkspaceSummary = Pick<MarketingWorkspace, "id" | "ownerUserId" | "name" | "industry" | "revision" | "createdAt" | "updatedAt">;
export type MarketingScope = "workspace" | "brand" | "location" | "offering";
export type MarketingSelection = { workspaceId: string; scope: MarketingScope; brandId?: string; locationId?: string; offeringIds?: string[] };
export type MarketingAssetSnapshot = { assetId: string; role: string; title: string; storageKey: string; width: number; height: number; mimeType: string };
export type MarketingSnapshotFact = MarketingFact & { scope: "workspace" | "brand" | "location" | "offering" | "listing"; entityId: string; subject: string };
export type MarketingSnapshot = {
    selection: MarketingSelection;
    scope: MarketingScope;
    workspace: { id: string; name: string; industry: string };
    brand?: { id: string; name: string };
    location?: { id: string; name: string; kind: string; city: string; district: string; address: string; localContext: string };
    offerings: Array<{ id: string; name: string; kind: string; category: string; description: string; highlights: string }>;
    profile: { description: string; audience: string; guidance: string };
    details: Array<{ scope: "workspace" | "brand" | "location" | "offering"; entityId: string; subject: string; description: string; audience: string; guidance: string }>;
    forbidden: string[];
    facts: MarketingSnapshotFact[];
    assets: MarketingAssetSnapshot[];
};
export type MarketingImageAsset = { id: string; kind: string; title: string; data: { dataUrl?: string; storageKey?: string; width?: number; height?: number; mimeType?: string } };
export type MarketingResolvedSelection = {
    scope: MarketingScope;
    workspace: MarketingWorkspace;
    brand?: MarketingBrand;
    location?: MarketingLocation;
    offerings: MarketingOffering[];
    listings: MarketingListing[];
    details: Array<{ scope: "workspace" | "brand" | "location" | "offering"; entityId: string; subject: string; value: MarketingDetails }>;
};
export type MarketingReadinessItem = { scope: MarketingScope; id: string; name: string; suggestions: string[] };

export function emptyMarketingDetails(): MarketingDetails {
    return { description: "", audience: "", guidance: "", forbidden: [], facts: [], assets: [] };
}

export function createMarketingWorkspace(patch: Partial<Pick<MarketingWorkspace, "name" | "industry">> = {}): MarketingWorkspace {
    return { ...emptyMarketingDetails(), id: nanoid(), ownerUserId: "", name: "", industry: "", revision: 0, createdAt: "", updatedAt: "", brands: [], locations: [], offerings: [], listings: [], ...patch };
}

export function createMarketingBrand(workspaceId: string, patch: Partial<Pick<MarketingBrand, "name">> = {}): MarketingBrand {
    return { ...emptyMarketingDetails(), id: nanoid(), workspaceId, name: "", ...patch };
}

export function createMarketingLocation(workspaceId: string, brandId: string, patch: Partial<Pick<MarketingLocation, "name" | "kind" | "city" | "district" | "address" | "localContext">> = {}): MarketingLocation {
    return { ...emptyMarketingDetails(), id: nanoid(), workspaceId, brandId, name: "", kind: "store", city: "", district: "", address: "", localContext: "", ...patch };
}

export function createMarketingOffering(workspaceId: string, brandId: string, patch: Partial<Pick<MarketingOffering, "name" | "kind" | "category">> = {}): MarketingOffering {
    return { ...emptyMarketingDetails(), id: nanoid(), workspaceId, brandId, name: "", kind: "product", category: "", ...patch };
}

export function marketingAssetIds(workspace: MarketingWorkspace) {
    return [...new Set([workspace, ...workspace.brands, ...workspace.locations, ...workspace.offerings].flatMap((item) => item.assets.map((asset) => asset.assetId)))];
}

export function availableMarketingOfferings(workspace: MarketingWorkspace, locationId: string) {
    const ids = new Set(workspace.listings.filter((listing) => listing.locationId === locationId && listing.available).map((listing) => listing.offeringId));
    return workspace.offerings.filter((offering) => ids.has(offering.id));
}

export function resolveMarketingSelection(workspace: MarketingWorkspace, selection: MarketingSelection): MarketingResolvedSelection {
    if (!selection || workspace.id !== selection.workspaceId) throw new Error("营销资料空间不匹配，请重新选择");
    if (!["workspace", "brand", "location", "offering"].includes(selection.scope)) throw new Error("资料范围无效，请重新选择");
    if (selection.scope === "workspace" && (selection.brandId || selection.locationId || selection.offeringIds?.length)) throw new Error("企业范围不能包含品牌、门店或商品，请重新选择");
    if (selection.scope === "brand" && (selection.locationId || selection.offeringIds?.length)) throw new Error("品牌范围不能包含门店或商品，请重新选择");

    const brand = selection.brandId ? workspace.brands.find((item) => item.id === selection.brandId) : undefined;
    if (selection.brandId && !brand) throw new Error("所选品牌已不在当前资料空间，请重新选择");
    const location = selection.locationId ? workspace.locations.find((item) => item.id === selection.locationId) : undefined;
    if (selection.locationId && !location) throw new Error("所选门店或服务点已不在当前资料空间，请重新选择");
    if (location && brand && location.brandId !== brand.id) throw new Error("门店与品牌不匹配，请重新选择资料范围");

    const ids = selection.offeringIds || [];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id)) throw new Error("商品或服务选择无效，请重新选择");
    if (new Set(ids).size !== ids.length) throw new Error("商品或服务不能重复选择");
    if (selection.scope === "brand" && !brand) throw new Error("请选择品牌");
    if (selection.scope === "location" && !location) throw new Error("请选择门店或服务点");
    if (selection.scope === "offering" && !brand) throw new Error("请选择商品所属品牌");
    if (selection.scope === "offering" && !ids.length) throw new Error("商品或服务范围至少选择一个商品");
    if (selection.scope === "location" && !brand) {
        const inferred = workspace.brands.find((item) => item.id === location?.brandId);
        if (!inferred) throw new Error("所选门店缺少有效品牌，请先补充品牌资料");
        return resolveMarketingSelection(workspace, { ...selection, brandId: inferred.id });
    }
    if (selection.scope === "offering" && location && location.brandId !== brand?.id) throw new Error("门店与商品品牌不匹配，请重新选择");

    const offerings = ids.map((id) => {
        const offering = workspace.offerings.find((item) => item.id === id);
        if (!offering || offering.brandId !== brand?.id) throw new Error("所选商品或服务已不在当前品牌下，请重新选择");
        if (location && !workspace.listings.some((listing) => listing.locationId === location.id && listing.offeringId === id && listing.available)) throw new Error("所选商品或服务已不在当前门店提供，请重新选择");
        return offering;
    });
    const listings = location ? workspace.listings.filter((listing) => listing.locationId === location.id && ids.includes(listing.offeringId)) : [];
    const details: MarketingResolvedSelection["details"] = [{ scope: "workspace", entityId: workspace.id, subject: workspace.name, value: workspace }];
    if (brand) details.push({ scope: "brand", entityId: brand.id, subject: brand.name, value: brand });
    if (location) details.push({ scope: "location", entityId: location.id, subject: location.name, value: location });
    offerings.forEach((offering) => details.push({ scope: "offering", entityId: offering.id, subject: offering.name, value: offering }));
    return { scope: selection.scope, workspace, brand, location, offerings, listings, details };
}

export function marketingSelectionAssetIds(workspace: MarketingWorkspace, selection: MarketingSelection) {
    return [...new Set(resolveMarketingSelection(workspace, selection).details.flatMap((detail) => detail.value.assets.map((asset) => asset.assetId)))];
}

export function isMarketingFactValid(fact: MarketingFact, now: number) {
    if (!fact.approved || !fact.label.trim() || !fact.value.trim() || !fact.source.trim()) return false;
    if (!fact.validUntil) return true;
    const expiresAt = Date.parse(fact.validUntil);
    return Number.isFinite(expiresAt) && expiresAt > now;
}

export function marketingImageIssue(role: string, asset: { id: string; kind: string; data: unknown } | undefined) {
    if (!asset) return `营销图片「${role}」缺失，请重新保存到“我的素材”`;
    const data = asset.data as { mimeType?: string; storageKey?: string };
    if (asset.kind !== "image" || !data.mimeType?.startsWith("image/")) return `营销图片「${role}」不是图片，请重新保存到“我的素材”`;
    if (!data.storageKey) return `营销图片「${role}」尚未持久化，请先同步或重新保存到“我的素材”`;
    return "";
}

const uniqueNonEmpty = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const scopedText = (details: MarketingResolvedSelection["details"], field: "description" | "guidance") => details.filter((detail) => detail.value[field].trim()).map((detail) => `【${detail.subject}】${detail.value[field].trim()}`).join("\n");

export function compileMarketingSnapshot(workspace: MarketingWorkspace, selection: MarketingSelection, assets: MarketingImageAsset[], now: number): MarketingSnapshot {
    const resolved = resolveMarketingSelection(workspace, selection);
    const { brand, location, offerings, listings, details } = resolved;
    const normalizedSelection: MarketingSelection = {
        workspaceId: workspace.id,
        scope: selection.scope,
        ...(brand ? { brandId: brand.id } : {}),
        ...(location ? { locationId: location.id } : {}),
        ...(offerings.length ? { offeringIds: offerings.map((item) => item.id) } : {}),
    };
    const factOwners: Array<{ scope: MarketingSnapshotFact["scope"]; entityId: string; subject: string; facts: MarketingFact[] }> = details.map((detail) => ({ scope: detail.scope, entityId: detail.entityId, subject: detail.subject, facts: detail.value.facts }));
    listings.forEach((listing) => factOwners.push({ scope: "listing", entityId: `${listing.locationId}:${listing.offeringId}`, subject: `${location?.name || "门店"} / ${offerings.find((item) => item.id === listing.offeringId)?.name || "商品"}`, facts: listing.facts }));
    const facts: MarketingSnapshotFact[] = factOwners.flatMap((owner) => owner.facts.filter((fact) => isMarketingFactValid(fact, now)).map((fact) => ({ ...fact, scope: owner.scope, entityId: owner.entityId, subject: owner.subject })));

    const referenceRoles = new Map<string, string[]>();
    details.forEach((detail) => detail.value.assets.forEach((ref) => referenceRoles.set(ref.assetId, [...(referenceRoles.get(ref.assetId) || []), ref.role])));
    const snapshots = [...referenceRoles].map(([id, roles]): MarketingAssetSnapshot => {
        const asset = assets.find((item) => item.id === id);
        const role = [...new Set(roles)].join("、");
        const issue = marketingImageIssue(role, asset);
        if (issue) throw new Error(issue);
        return { assetId: id, role, title: asset!.title, storageKey: asset!.data.storageKey!, width: asset!.data.width || 0, height: asset!.data.height || 0, mimeType: asset!.data.mimeType! };
    });

    const offeringAudience = uniqueNonEmpty(offerings.map((item) => item.audience));
    return {
        selection: normalizedSelection,
        scope: selection.scope,
        workspace: { id: workspace.id, name: workspace.name, industry: workspace.industry },
        ...(brand ? { brand: { id: brand.id, name: brand.name } } : {}),
        ...(location ? { location: { id: location.id, name: location.name, kind: location.kind, city: location.city, district: location.district, address: location.address, localContext: location.localContext } } : {}),
        offerings: offerings.map((item) => ({ id: item.id, name: item.name, kind: item.kind, category: item.category, description: item.description, highlights: listings.find((listing) => listing.offeringId === item.id)?.highlights || "" })),
        profile: {
            description: scopedText(details, "description"),
            guidance: scopedText(details, "guidance"),
            audience: offeringAudience.join("；") || location?.audience.trim() || brand?.audience.trim() || workspace.audience.trim(),
        },
        details: details.map((detail) => ({ scope: detail.scope, entityId: detail.entityId, subject: detail.subject, description: detail.value.description, audience: detail.value.audience, guidance: detail.value.guidance })),
        forbidden: uniqueNonEmpty(details.flatMap((detail) => detail.value.forbidden)),
        facts,
        assets: snapshots,
    };
}

export function summarizeMarketingWorkspace(workspace: MarketingWorkspace, now: number): MarketingReadinessItem[] {
    const item = (scope: MarketingScope, id: string, name: string, description: string, localContext: string, factCount: number): MarketingReadinessItem => {
        const suggestions: string[] = [];
        if (!name.trim()) suggestions.push("补充名称");
        if (!description.trim() && !localContext.trim()) suggestions.push("补充基本介绍");
        if (!localContext.trim() && scope === "location") suggestions.push("补充当地特点");
        if (!factCount) suggestions.push("补充已确认事实（具体主张需要依据）");
        return { scope, id, name, suggestions };
    };
    return [
        item("workspace", workspace.id, workspace.name, workspace.description, "", workspace.facts.filter((fact) => isMarketingFactValid(fact, now)).length),
        ...workspace.brands.map((brand) => item("brand", brand.id, brand.name, brand.description, "", brand.facts.filter((fact) => isMarketingFactValid(fact, now)).length)),
        ...workspace.locations.map((location) => item("location", location.id, location.name, location.description, location.localContext, location.facts.filter((fact) => isMarketingFactValid(fact, now)).length)),
        ...workspace.offerings.map((offering) => item("offering", offering.id, offering.name, offering.description, "", offering.facts.filter((fact) => isMarketingFactValid(fact, now)).length)),
    ];
}

// Blob URL 在刷新后变化；持久化身份优先使用 storageKey。
export function marketingSnapshotKey(snapshot: MarketingSnapshot) {
    return JSON.stringify(snapshot);
}
