import assert from "node:assert/strict";
import test from "node:test";

import {
    compileMarketingSnapshot,
    createMarketingBrand,
    createMarketingLocation,
    createMarketingOffering,
    createMarketingWorkspace,
    marketingSelectionAssetIds,
    marketingSnapshotKey,
    summarizeMarketingWorkspace,
    type MarketingImageAsset,
    type MarketingSelection,
} from "./marketing";

test("marketing factories create independent default entities", () => {
    const workspace = createMarketingWorkspace({ name: "直营餐饮", industry: "餐饮" });
    const other = createMarketingWorkspace();
    assert.notEqual(workspace.id, other.id);
    assert.deepEqual([workspace.name, workspace.industry, workspace.revision, workspace.ownerUserId], ["直营餐饮", "餐饮", 0, ""]);
    assert.deepEqual([workspace.brands, workspace.locations, workspace.offerings, workspace.listings], [[], [], [], []]);
    assert.deepEqual([workspace.facts, workspace.assets, workspace.forbidden], [[], [], []]);

    const brand = createMarketingBrand(workspace.id, { name: "好味道" });
    const location = createMarketingLocation(workspace.id, brand.id, { name: "西湖店", city: "杭州" });
    const offering = createMarketingOffering(workspace.id, brand.id, { name: "招牌饭" });
    assert.equal(brand.workspaceId, workspace.id);
    assert.equal(location.brandId, brand.id);
    assert.equal(offering.brandId, brand.id);
    assert.equal(location.kind, "store");
    assert.equal(offering.kind, "product");
    assert.notEqual(location.id, offering.id);
    assert.deepEqual([location.facts, location.assets, offering.forbidden], [[], [], []]);
});

function marketingFixture() {
    const workspace = createMarketingWorkspace({ name: "山外餐饮", industry: "餐饮" });
    workspace.id = "workspace-1";
    workspace.description = "社区餐饮品牌";
    workspace.audience = "附近居民";
    workspace.guidance = "语气朴实";
    workspace.forbidden = ["全市第一"];
    workspace.facts = [{ id: "workspace-fact", label: "创立年份", value: "2018 年", source: "企业档案", approved: true, validUntil: "" }];
    workspace.assets = [{ assetId: "asset-logo", role: "品牌标识" }];

    const brand = createMarketingBrand(workspace.id, { name: "山外小馆" });
    brand.id = "brand-1";
    brand.description = "社区现做简餐";
    brand.audience = "上班族";
    brand.guidance = "轻松但不过度活泼";
    brand.forbidden = ["全市第一", "绝对有效"];
    brand.facts = [{ id: "brand-fact", label: "品牌理念", value: "现做热食", source: "品牌手册", approved: true, validUntil: "" }];
    brand.assets = [{ assetId: "asset-logo", role: "门店招牌" }];

    const location = createMarketingLocation(workspace.id, brand.id, { name: "西湖店", city: "杭州", district: "西湖区", localContext: "午间写字楼客群较多" });
    location.id = "location-1";
    location.description = "社区门店";
    location.facts = [
        { id: "location-fact", label: "营业时间", value: "10:00-21:00", source: "门店公示", approved: true, validUntil: "2027-12-31T23:59:59+08:00" },
        { id: "draft-fact", label: "待核实优惠", value: "八折", source: "口头通知", approved: false, validUntil: "" },
        { id: "expired-fact", label: "旧活动", value: "已结束", source: "旧海报", approved: true, validUntil: "2026-01-01T00:00:00+08:00" },
    ];
    location.assets = [{ assetId: "asset-store", role: "门店环境" }];

    const offering = createMarketingOffering(workspace.id, brand.id, { name: "招牌饭", category: "简餐" });
    offering.id = "offering-1";
    offering.description = "每日现做套餐";
    offering.audience = "午餐人群";
    offering.facts = [{ id: "offering-fact", label: "套餐内容", value: "一荤一素一饭", source: "当前菜单", approved: true, validUntil: "" }];
    offering.assets = [{ assetId: "asset-product", role: "套餐主图" }];

    const unavailable = createMarketingOffering(workspace.id, brand.id, { name: "暂停套餐" });
    unavailable.id = "offering-2";

    workspace.brands = [brand];
    workspace.locations = [location];
    workspace.offerings = [offering, unavailable];
    workspace.listings = [
        { workspaceId: workspace.id, locationId: location.id, offeringId: offering.id, available: true, highlights: "午市出餐快", facts: [{ id: "listing-fact", label: "本店价格", value: "38 元", source: "门店菜单", approved: true, validUntil: "" }] },
        { workspaceId: workspace.id, locationId: location.id, offeringId: unavailable.id, available: false, highlights: "", facts: [] },
    ];

    const assets: MarketingImageAsset[] = [
        { id: "asset-logo", kind: "image", title: "品牌 Logo", data: { storageKey: "server:logo", width: 600, height: 600, mimeType: "image/png" } },
        { id: "asset-store", kind: "image", title: "门店环境", data: { storageKey: "server:store", width: 1200, height: 800, mimeType: "image/jpeg" } },
        { id: "asset-product", kind: "image", title: "招牌饭", data: { storageKey: "server:product", width: 1000, height: 1000, mimeType: "image/jpeg" } },
    ];
    return { workspace, brand, location, offering, unavailable, assets };
}

const NOW = Date.parse("2026-11-24T12:00:00+08:00");

test("企业和品牌范围不要求门店或商品", () => {
    const { workspace, assets } = marketingFixture();
    const enterprise = compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "workspace" }, assets, NOW);
    assert.equal(enterprise.scope, "workspace");
    assert.equal(enterprise.brand, undefined);
    assert.equal(enterprise.location, undefined);
    assert.deepEqual(enterprise.offerings, []);

    const brand = compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "brand", brandId: "brand-1" }, assets, NOW);
    assert.equal(brand.scope, "brand");
    assert.equal(brand.brand?.name, "山外小馆");
    assert.equal(brand.location, undefined);
    assert.deepEqual(brand.offerings, []);
});

test("门店范围允许空商品，商品范围支持有门店和无门店", () => {
    const { workspace, assets } = marketingFixture();
    const location = compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "location", locationId: "location-1" }, assets, NOW);
    assert.equal(location.scope, "location");
    assert.equal(location.brand?.id, "brand-1");
    assert.equal(location.location?.id, "location-1");
    assert.deepEqual(location.offerings, []);

    const offering = compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", offeringIds: ["offering-1"] }, assets, NOW);
    assert.equal(offering.location, undefined);
    assert.deepEqual(offering.offerings.map((item) => item.id), ["offering-1"]);

    const inStore = compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", locationId: "location-1", offeringIds: ["offering-1"] }, assets, NOW);
    assert.equal(inStore.location?.id, "location-1");
    assert.equal(inStore.offerings[0]?.highlights, "午市出餐快");
    assert.ok(inStore.facts.some((fact) => fact.id === "listing-fact" && fact.scope === "listing"));
});

test("范围解析拒绝跨品牌、重复商品和门店不可售商品", () => {
    const { workspace, assets } = marketingFixture();
    const otherBrand = createMarketingBrand(workspace.id, { name: "其他品牌" });
    otherBrand.id = "brand-2";
    const otherLocation = createMarketingLocation(workspace.id, otherBrand.id, { name: "其他门店" });
    otherLocation.id = "location-2";
    workspace.brands.push(otherBrand);
    workspace.locations.push(otherLocation);
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", locationId: "location-2", offeringIds: ["offering-1"] }, assets, NOW), /品牌不匹配/);
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", offeringIds: [] }, assets, NOW), /至少选择一个商品/);
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", offeringIds: ["offering-1", "offering-1"] }, assets, NOW), /重复/);
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "location", locationId: "location-1", offeringIds: ["offering-2"] }, assets, NOW), /不在当前门店/);
});

test("快照保留事实来源、过滤无效事实并合并禁用词与图片用途", () => {
    const { workspace, assets } = marketingFixture();
    const selection: MarketingSelection = { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", locationId: "location-1", offeringIds: ["offering-1"] };
    const snapshot = compileMarketingSnapshot(workspace, selection, assets, NOW);
    assert.deepEqual(snapshot.facts.map((fact) => fact.id), ["workspace-fact", "brand-fact", "location-fact", "offering-fact", "listing-fact"]);
    assert.deepEqual(snapshot.facts.map((fact) => fact.subject), ["山外餐饮", "山外小馆", "西湖店", "招牌饭", "西湖店 / 招牌饭"]);
    assert.deepEqual(snapshot.forbidden, ["全市第一", "绝对有效"]);
    assert.equal(snapshot.profile.audience, "午餐人群");
    assert.match(snapshot.profile.description, /【山外餐饮】社区餐饮品牌/);
    assert.equal(snapshot.assets.find((asset) => asset.assetId === "asset-logo")?.role, "品牌标识、门店招牌");
    assert.equal(marketingSnapshotKey(snapshot), marketingSnapshotKey(compileMarketingSnapshot(workspace, selection, assets, NOW)));
});

test("纳入范围的图片缺失或未持久化时给出用途明确的错误", () => {
    const { workspace } = marketingFixture();
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "workspace" }, [], NOW), /品牌标识.*缺失/);
    const unpersisted: MarketingImageAsset[] = [{ id: "asset-logo", kind: "image", title: "品牌 Logo", data: { width: 600, height: 600, mimeType: "image/png" } }];
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "workspace" }, unpersisted, NOW), /品牌标识.*尚未持久化/);
    const wrongKind: MarketingImageAsset[] = [{ id: "asset-logo", kind: "video", title: "错误类型", data: { storageKey: "server:logo", mimeType: "video/mp4" } }];
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "workspace" }, wrongKind, NOW), /品牌标识.*图片/);
});

test("策划图片收集只包含所选实体，排除未选商品和门店", () => {
    const { workspace } = marketingFixture();
    assert.deepEqual(marketingSelectionAssetIds(workspace, { workspaceId: workspace.id, scope: "workspace" }), ["asset-logo"]);
    assert.deepEqual(marketingSelectionAssetIds(workspace, { workspaceId: workspace.id, scope: "brand", brandId: "brand-1" }), ["asset-logo"]);
    assert.deepEqual(marketingSelectionAssetIds(workspace, { workspaceId: workspace.id, scope: "location", locationId: "location-1" }), ["asset-logo", "asset-store"]);
    assert.deepEqual(marketingSelectionAssetIds(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", offeringIds: ["offering-1"] }), ["asset-logo", "asset-product"]);
    workspace.offerings[1]!.assets = [{ assetId: "asset-unavailable", role: "暂停套餐" }];
    assert.equal(marketingSelectionAssetIds(workspace, { workspaceId: workspace.id, scope: "brand", brandId: "brand-1" }).includes("asset-unavailable"), false);
    assert.throws(() => marketingSelectionAssetIds(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", locationId: "location-1", offeringIds: ["offering-2"] }), /不在当前门店/);
});

test("快照事实有效期只使用注入时间，不读取系统时间", () => {
    const { workspace, assets } = marketingFixture();
    const originalNow = Date.now;
    Date.now = () => Date.parse("2030-01-01T00:00:00Z");
    try {
        const snapshot = compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "location", locationId: "location-1" }, assets, NOW);
        assert.equal(snapshot.facts.some((fact) => fact.id === "location-fact"), true);
        assert.equal(snapshot.facts.some((fact) => fact.id === "expired-fact"), false);
    } finally {
        Date.now = originalNow;
    }
});

test("营销页完整性摘要按主体给出非阻塞建议", () => {
    const { workspace } = marketingFixture();
    workspace.description = "";
    const summary = summarizeMarketingWorkspace(workspace, NOW);
    assert.deepEqual(summary.map((item) => item.scope), ["workspace", "brand", "location", "offering", "offering"]);
    assert.ok(summary[0]!.suggestions.includes("补充基本介绍"));
    assert.ok(summary.find((item) => item.id === "offering-2")!.suggestions.includes("补充基本介绍"));
});

test("完整性摘要不会把缺少事实误判为不可保存", () => {
    const { workspace } = marketingFixture();
    workspace.facts = [];
    const item = summarizeMarketingWorkspace(workspace, NOW)[0]!;
    assert.ok(item.suggestions.includes("补充已确认事实（具体主张需要依据）"));
    assert.equal(item.suggestions.includes("暂停保存"), false);
});

test("完整性摘要不把过期或内容不完整的已确认事实计为有效事实", () => {
    const { workspace, location } = marketingFixture();
    location.facts = [
        { id: "expired", label: "旧活动", value: "已结束", source: "旧海报", approved: true, validUntil: "2026-01-01T00:00:00+08:00" },
        { id: "missing-source", label: "新活动", value: "进行中", source: "", approved: true, validUntil: "" },
    ];
    const item = summarizeMarketingWorkspace(workspace, NOW).find((entry) => entry.id === location.id)!;
    assert.ok(item.suggestions.includes("补充已确认事实（具体主张需要依据）"));
});
