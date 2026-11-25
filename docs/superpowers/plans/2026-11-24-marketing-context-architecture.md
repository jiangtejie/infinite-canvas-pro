# Marketing Context Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让营销资料支持企业、品牌、门店、商品四种使用范围，并通过唯一快照编译器为画布复刻提供可审阅、可追溯的上下文。

**Architecture:** 保留现有六张营销表、账号级聚合保存和 `revision` 乐观锁；将“本次使用哪些资料”收敛为 `MarketingSelection`，将快照拼接收敛为纯函数 `compileMarketingSnapshot`。营销主资料只保存 `assetId + role`，文件存储键仍由“我的素材”持有并冻结到当次 `RemixRun` 快照。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Ant Design 6、localforage、Go、Gin、GORM。

**Spec:** `docs/superpowers/specs/2026-11-24-marketing-context-architecture-design.md`

## Global Constraints

- 不新增 Campaign、CRM、团队权限、实体级 API 或营销表；保留现有聚合事务、子表全量重建、账号隔离和 `revision` 乐观锁。
- 项目尚未上线，不做旧字段兼容、旧运行迁移或旧表清理；旧复刻运行保持可读，但生成前必须按 `marketing-remix-2` 重新策划。
- 营销资料主数据中的图片引用只能是 `{ assetId, role }`；不得把 `storageKey` 写回营销引用。
- `compileMarketingSnapshot` 是唯一快照编译入口，必须保持纯函数，不访问 store、网络或未注入的全局时间。
- 画布 UI 继续使用 `canvasThemes`、`useThemeStore` 或 Ant Design token，不新增硬编码黑白/stone/slate 配色。
- Ant Design 6 的新增或改动弹窗使用 `size`、`mask={{ closable }}`、`destroyOnHidden`、`styles.*`，不使用废弃的 `width` / `height` / `maskClosable` / `destroyOnClose` / `bodyStyle` / `drawerStyle`。
- 页面文案保持中文；图标优先使用 `lucide-react` 或项目现有 Ant Design 图标。
- 不修改无关文件，不顺手重构；复杂逻辑优先留在同目录工具函数或纯领域模块。
- 每个任务先写测试或明确断言，再写实现；本计划保留测试代码和人工/CI 执行命令。
- 按项目约定，本会话不自动执行语法检查、构建、lint 或测试；命令由用户或 CI 执行。
- 不创建 Git 提交、不打 tag、不推送；任务结束时只做工作区检查点。
- 完成任务后必须按实际改动更新 `docs/progress/todo.md` 与 `docs/progress/pending-test.md`，再按版本级口径更新 `CHANGELOG.md`；正式功能说明只在用户确认实测后更新。

---

## File Map

### 领域契约与编译器

- Modify: `web/src/lib/marketing.ts`
  - 新增 `MarketingScope`、可选字段的 `MarketingSelection`、带来源的 `MarketingSnapshot`。
  - 新增共享选择解析器 `resolveMarketingSelection`，供编译器与设置预览共用。
  - 用 `compileMarketingSnapshot` 替换 `buildMarketingSnapshot`。
  - 新增营销页完整性摘要 `summarizeMarketingWorkspace`。
- Test: `web/src/lib/marketing.test.ts`
  - 覆盖四种范围、可售关系、事实过滤与来源、资料合并、图片解析、稳定快照键和完整性摘要。
- Modify: `web/src/app/(user)/canvas/[id]/lib/canvas-source-remix.test.ts`
  - 将旧快照 fixture 改为新契约，保留事实、图片、禁用词和结构门禁测试。

### 图片单真源

- Modify: `model/marketing.go`
  - 从 `MarketingAssetReference` 删除 `StorageKey` JSON 字段。
- Modify: `web/src/stores/use-marketing-store.ts`
  - 简化 `persistMarketingAssets`，只触发素材云同步，不再修改营销引用。
- Test: `model/marketing_test.go`
  - 验证图片引用 JSON 只包含 `assetId` 与 `role`。
- Verify only: `web/src/app/(user)/marketing/components/marketing-details-editor.tsx`
  - 现有上传与选择已使用不可变数组更新；只确认没有重新引入 `storageKey` 或直接修改输入对象。

### 营销页分层体验

- Modify: `web/src/app/(user)/marketing/components/marketing-details-editor.tsx`
  - 增加 `variant: "context" | "location" | "offering"`，按层级显示字段。
- Modify: `web/src/app/(user)/marketing/components/marketing-entity-editor.tsx`
  - 按实体类型传入 `variant`，保留现有底层字段和可售关系编辑。
- Modify: `web/src/app/(user)/marketing/page.tsx`
  - 在空间摘要下方展示企业/品牌/门店/商品的可用情况与建议补充项。
- Test: `web/src/lib/marketing.test.ts`
  - 覆盖完整性摘要的稳定输出。

### 画布复刻接入

- Modify: `web/src/app/(user)/canvas/remix-setup-memory.ts`
  - 保存完整 `MarketingSelection`，删除按空间映射门店的旧结构。
- Create: `web/src/app/(user)/canvas/remix-setup-memory.test.ts`
  - 覆盖四种范围、非法结构过滤、失效 ID 保留后由详情解析清理、账号分区读写。
- Modify: `web/src/app/(user)/canvas/components/canvas-remix-setup.tsx`
  - 增加资料范围、条件字段、实体校验和策划前摘要。
- Modify: `web/src/app/(user)/canvas/remix-planner.ts`
  - 改用 `compileMarketingSnapshot`，继续保留账号切换、图片解析和 freshness 门禁。
- Modify: `web/src/app/(user)/canvas/remix-policy.ts`
  - `REMIX_CORE_VERSION` 升级为 `marketing-remix-2`，核心规则改为“选定经营主体”而非固定门店/商品。
- Modify: `web/src/app/(user)/canvas/components/canvas-remix-plan-panel.tsx`
  - 审阅摘要支持可选品牌/门店，并显示事实来源主体与作用域。
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-canvas-remix.tsx`
  - 只调整新选择契约下的错误文案；现有运行、审批和批量生成编排不重写。

### 文档

- Modify: `docs/progress/todo.md`
- Modify: `docs/progress/pending-test.md`
- Modify: `docs/overview/features.md`
- Modify: `CHANGELOG.md`

---

## Task 1: 范围选择契约与唯一快照编译器

**Files:**

- Modify: `web/src/lib/marketing.ts:3-24,51-95`
- Test: `web/src/lib/marketing.test.ts:1-24`
- Modify: `web/src/app/(user)/canvas/[id]/lib/canvas-source-remix.test.ts:51-82`

**Interfaces:**

- Consumes:
  - 现有 `MarketingWorkspace`、`MarketingBrand`、`MarketingLocation`、`MarketingOffering`、`MarketingListing`、`MarketingFact`、`MarketingImageAsset`。
  - 现有 `marketingAssetIds` 与 `availableMarketingOfferings`。
- Produces:

```ts
export type MarketingScope = "workspace" | "brand" | "location" | "offering";

export type MarketingSelection = {
    workspaceId: string;
    scope: MarketingScope;
    brandId?: string;
    locationId?: string;
    offeringIds?: string[];
};

export type MarketingResolvedSelection = {
    scope: MarketingScope;
    workspace: MarketingWorkspace;
    brand?: MarketingBrand;
    location?: MarketingLocation;
    offerings: MarketingOffering[];
    listings: MarketingListing[];
    details: Array<{
        scope: "workspace" | "brand" | "location" | "offering";
        entityId: string;
        subject: string;
        value: MarketingDetails;
    }>;
};

export function resolveMarketingSelection(
    workspace: MarketingWorkspace,
    selection: MarketingSelection,
): MarketingResolvedSelection;

export function compileMarketingSnapshot(
    workspace: MarketingWorkspace,
    selection: MarketingSelection,
    assets: MarketingImageAsset[],
    now?: number,
): MarketingSnapshot;

export type MarketingReadinessItem = {
    scope: MarketingScope;
    id: string;
    name: string;
    suggestions: string[];
};

export function summarizeMarketingWorkspace(
    workspace: MarketingWorkspace,
): MarketingReadinessItem[];
```

- `MarketingSnapshot` 精确使用规格第 7.2 节结构：`scope` 必填，`brand` / `location` 可选，新增 `profile`，`details` 与 `facts` 带 `scope/entityId/subject`。

- [ ] **Step 1: 写编译器失败测试**

在 `web/src/lib/marketing.test.ts` 保留现有工厂测试，新增以下 fixture 与断言：

```ts
import {
    compileMarketingSnapshot,
    createMarketingBrand,
    createMarketingLocation,
    createMarketingOffering,
    createMarketingWorkspace,
    marketingSnapshotKey,
    summarizeMarketingWorkspace,
    type MarketingImageAsset,
    type MarketingSelection,
} from "./marketing";

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
    const snapshot = compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", locationId: "location-1", offeringIds: ["offering-1"] }, assets, NOW);
    assert.deepEqual(snapshot.facts.map((fact) => fact.id), ["workspace-fact", "brand-fact", "location-fact", "offering-fact", "listing-fact"]);
    assert.deepEqual(snapshot.facts.map((fact) => fact.subject), ["山外餐饮", "山外小馆", "西湖店", "招牌饭", "西湖店 / 招牌饭"]);
    assert.deepEqual(snapshot.forbidden, ["全市第一", "绝对有效"]);
    assert.equal(snapshot.profile.audience, "午餐人群");
    assert.match(snapshot.profile.description, /【山外餐饮】社区餐饮品牌/);
    assert.equal(snapshot.assets.find((asset) => asset.assetId === "asset-logo")?.role, "品牌标识、门店招牌");
    assert.equal(marketingSnapshotKey(snapshot), marketingSnapshotKey(compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "offering", brandId: "brand-1", locationId: "location-1", offeringIds: ["offering-1"] }, assets, NOW)));
});

test("纳入范围的图片缺失或未持久化时给出用途明确的错误", () => {
    const { workspace } = marketingFixture();
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "workspace" }, [], NOW), /品牌标识.*缺失/);
    const unpersisted: MarketingImageAsset[] = [{ id: "asset-logo", kind: "image", title: "品牌 Logo", data: { width: 600, height: 600, mimeType: "image/png" } }];
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "workspace" }, unpersisted, NOW), /品牌标识.*尚未持久化/);
    const wrongKind: MarketingImageAsset[] = [{ id: "asset-logo", kind: "video", title: "错误类型", data: { storageKey: "server:logo", mimeType: "video/mp4" } }];
    assert.throws(() => compileMarketingSnapshot(workspace, { workspaceId: workspace.id, scope: "workspace" }, wrongKind, NOW), /品牌标识.*图片/);
});

test("营销页完整性摘要按主体给出非阻塞建议", () => {
    const { workspace } = marketingFixture();
    workspace.description = "";
    const summary = summarizeMarketingWorkspace(workspace);
    assert.deepEqual(summary.map((item) => item.scope), ["workspace", "brand", "location", "offering", "offering"]);
    assert.ok(summary[0]!.suggestions.includes("补充基本介绍"));
    assert.ok(summary.find((item) => item.id === "offering-2")!.suggestions.includes("补充基本介绍"));
});
```

- [ ] **Step 2: 记录预期失败**

由用户或 CI 在 `web/` 执行：

```bash
bun test src/lib/marketing.test.ts
```

预期：新测试因 `compileMarketingSnapshot`、`summarizeMarketingWorkspace` 尚不存在而失败；现有工厂测试保持通过。

- [ ] **Step 3: 替换领域类型与旧编译器**

在 `web/src/lib/marketing.ts` 将 `MarketingAssetReference`、`MarketingSelection`、`MarketingSnapshot` 替换为以下契约，并删除 `buildMarketingSnapshot`：

```ts
export type MarketingAssetReference = { assetId: string; role: string };
export type MarketingScope = "workspace" | "brand" | "location" | "offering";
export type MarketingSelection = { workspaceId: string; scope: MarketingScope; brandId?: string; locationId?: string; offeringIds?: string[] };
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
```

- [ ] **Step 4: 实现共享选择解析器**

用同一解析器处理 UI 预览与编译，避免设置弹窗和编译器各自判断实体关系：

```ts
export type MarketingResolvedSelection = {
    scope: MarketingScope;
    workspace: MarketingWorkspace;
    brand?: MarketingBrand;
    location?: MarketingLocation;
    offerings: MarketingOffering[];
    listings: MarketingListing[];
    details: Array<{ scope: "workspace" | "brand" | "location" | "offering"; entityId: string; subject: string; value: MarketingDetails }>;
};

export function resolveMarketingSelection(workspace: MarketingWorkspace, selection: MarketingSelection): MarketingResolvedSelection {
    if (!selection || workspace.id !== selection.workspaceId) throw new Error("营销资料空间不匹配，请重新选择");
    if (!["workspace", "brand", "location", "offering"].includes(selection.scope)) throw new Error("资料范围无效，请重新选择");
    const brand = selection.brandId ? workspace.brands.find((item) => item.id === selection.brandId) : undefined;
    if (selection.brandId && !brand) throw new Error("所选品牌已不在当前资料空间，请重新选择");
    const location = selection.locationId ? workspace.locations.find((item) => item.id === selection.locationId) : undefined;
    if (selection.locationId && !location) throw new Error("所选门店或服务点已不在当前资料空间，请重新选择");
    if (location && brand && location.brandId !== brand.id) throw new Error("门店与品牌不匹配，请重新选择资料范围");
    const ids = selection.offeringIds || [];
    if (new Set(ids).size !== ids.length) throw new Error("商品或服务不能重复选择");
    if (selection.scope === "offering" && !ids.length) throw new Error("商品或服务范围至少选择一个商品");
    if (selection.scope === "brand" && !brand) throw new Error("请选择品牌");
    if (selection.scope === "location" && !location) throw new Error("请选择门店或服务点");
    if (selection.scope === "offering" && !brand) throw new Error("请选择商品所属品牌");
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
```

注意：`location` 范围可以从门店反推品牌，但返回快照时仍保存明确的 `brandId`，以便恢复和新鲜度比较可预测。

- [ ] **Step 5: 实现纯快照编译器**

```ts
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
    const factOwners = details.map((detail) => ({ scope: detail.scope, entityId: detail.entityId, subject: detail.subject, facts: detail.value.facts }));
    listings.forEach((listing) => factOwners.push({ scope: "listing", entityId: `${listing.locationId}:${listing.offeringId}`, subject: `${location?.name || "门店"} / ${offerings.find((item) => item.id === listing.offeringId)?.name || "商品"}`, facts: listing.facts }));
    const facts: MarketingSnapshotFact[] = factOwners.flatMap((owner) => owner.facts.filter((fact) => {
        if (!fact.approved || !fact.label.trim() || !fact.value.trim() || !fact.source.trim()) return false;
        if (!fact.validUntil) return true;
        const expiresAt = Date.parse(fact.validUntil);
        return Number.isFinite(expiresAt) && expiresAt > now;
    }).map((fact) => ({ ...fact, scope: owner.scope, entityId: owner.entityId, subject: owner.subject })));
    const referenceRoles = new Map<string, string[]>();
    details.forEach((detail) => detail.value.assets.forEach((ref) => referenceRoles.set(ref.assetId, [...(referenceRoles.get(ref.assetId) || []), ref.role])));
    const snapshots = [...referenceRoles].map(([id, roles]): MarketingAssetSnapshot => {
        const asset = assets.find((item) => item.id === id && item.kind === "image");
        const role = [...new Set(roles)].join("、");
        if (!asset || !asset.data.mimeType?.startsWith("image/")) throw new Error(`营销图片「${role}」缺失或不是图片，请重新保存到“我的素材”`);
        if (!asset.data.storageKey) throw new Error(`营销图片「${role}」尚未持久化，请先同步或重新保存到“我的素材”`);
        return { assetId: id, role, title: asset.title, storageKey: asset.data.storageKey, width: asset.data.width || 0, height: asset.data.height || 0, mimeType: asset.data.mimeType };
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
```

`scopedText` 只保留非空值，标签直接来自同一条详情记录，不会出现标签与内容索引错位。

- [ ] **Step 6: 实现完整性摘要**

```ts
export type MarketingReadinessItem = { scope: MarketingScope; id: string; name: string; suggestions: string[] };

export function summarizeMarketingWorkspace(workspace: MarketingWorkspace): MarketingReadinessItem[] {
    const item = (scope: MarketingScope, id: string, name: string, description: string, localContext: string, factCount: number): MarketingReadinessItem => {
        const suggestions: string[] = [];
        if (!name.trim()) suggestions.push("补充名称");
        if (!description.trim() && !localContext.trim()) suggestions.push("补充基本介绍");
        if (!localContext.trim() && scope === "location") suggestions.push("补充当地特点");
        if (!factCount) suggestions.push("补充已确认事实（具体主张需要依据）");
        return { scope, id, name, suggestions };
    };
    return [
        item("workspace", workspace.id, workspace.name, workspace.description, "", workspace.facts.filter((fact) => fact.approved).length),
        ...workspace.brands.map((brand) => item("brand", brand.id, brand.name, brand.description, "", brand.facts.filter((fact) => fact.approved).length)),
        ...workspace.locations.map((location) => item("location", location.id, location.name, location.description, location.localContext, location.facts.filter((fact) => fact.approved).length)),
        ...workspace.offerings.map((offering) => item("offering", offering.id, offering.name, offering.description, "", offering.facts.filter((fact) => fact.approved).length)),
    ];
}
```

- [ ] **Step 7: 更新复刻结构测试 fixture**

将 `canvas-source-remix.test.ts` 中两处旧 `marketing` fixture 改为新契约：

```ts
marketing: {
    selection: { workspaceId: "w", scope: "offering", brandId: "b", locationId: "l", offeringIds: ["o"] },
    scope: "offering",
    workspace: { id: "w", name: "企业", industry: "餐饮" },
    brand: { id: "b", name: "品牌" },
    location: { id: "l", name: "门店", kind: "store", city: "杭州", district: "西湖", address: "", localContext: "附近写字楼午休客群" },
    offerings: [{ id: "o", name: "招牌菜", kind: "product", category: "餐饮", description: "", highlights: "" }],
    profile: { description: "", audience: "", guidance: "" },
    details: [],
    forbidden: ["闭眼入"],
    facts: [{ id: "fact-1", label: "价格", value: "38 元", source: "门店菜单", approved: true, validUntil: "", scope: "offering", entityId: "o", subject: "招牌菜" }],
    assets: [{ assetId: "asset-1", role: "招牌菜主图", title: "招牌菜", storageKey: "server:product", width: 800, height: 800, mimeType: "image/jpeg" }],
}
```

第二处 fixture 的 `localContext` 为空，其余字段相同。

- [ ] **Step 8: 用户/CI 验证与检查点**

由用户或 CI 执行：

```bash
cd web
bun test src/lib/marketing.test.ts "src/app/(user)/canvas/[id]/lib/canvas-source-remix.test.ts"
```

预期：编译器、范围解析、事实来源、图片用途和既有复刻结构门禁全部通过。检查 `buildMarketingSnapshot` 在 `web/src` 无残留；本任务不提交。

---

## Task 2: 图片引用单真源与后端契约收敛

**Files:**

- Modify: `model/marketing.go:13-17`
- Modify: `web/src/stores/use-marketing-store.ts:47-56`
- Create: `model/marketing_test.go`
- Verify only: `web/src/app/(user)/marketing/components/marketing-details-editor.tsx:33-60`

**Interfaces:**

- Consumes: Task 1 的 `MarketingAssetReference = { assetId: string; role: string }`。
- Produces: Go JSON 契约 `MarketingAssetReference{ assetId, role }`；`persistMarketingAssets(workspace, token): Promise<void>` 不再修改传入对象。
- Later tasks rely on: 营销引用不再有 `storageKey`，运行快照仍从素材库解析存储键。

- [ ] **Step 1: 写后端 JSON 契约测试**

创建 `model/marketing_test.go`：

```go
package model

import (
    "encoding/json"
    "testing"
)

func TestMarketingAssetReferenceJSONHasOnlyIdentityAndRole(t *testing.T) {
    raw := []byte(`{"assetId":"asset-1","role":"招牌菜主图"}`)
    var ref MarketingAssetReference
    if err := json.Unmarshal(raw, &ref); err != nil {
        t.Fatal(err)
    }
    if ref.AssetID != "asset-1" || ref.Role != "招牌菜主图" {
        t.Fatalf("unexpected reference: %#v", ref)
    }
    encoded, err := json.Marshal(ref)
    if err != nil {
        t.Fatal(err)
    }
    if string(encoded) != `{"assetId":"asset-1","role":"招牌菜主图"}` {
        t.Fatalf("storage key leaked into marketing reference: %s", encoded)
    }
}
```

- [ ] **Step 2: 记录预期失败**

由用户或 CI 执行：

```bash
go test ./model -run TestMarketingAssetReferenceJSONHasOnlyIdentityAndRole -v
```

预期：旧结构多输出 `"storageKey":""`，测试失败。

- [ ] **Step 3: 删除 Go 引用中的存储键**

将 `model/marketing.go` 改为：

```go
type MarketingAssetReference struct {
    AssetID string `json:"assetId"`
    Role    string `json:"role"`
}
```

不修改 `MarketingAssetReferenceRecord`，其表结构本来只保存素材 ID、用途和归属。

- [ ] **Step 4: 简化营销素材同步**

将 `web/src/stores/use-marketing-store.ts` 的 `persistMarketingAssets` 改为：

```ts
async function persistMarketingAssets(workspace: MarketingWorkspace, token: string) {
    const ids = marketingAssetIds(workspace);
    if (ids.length) await useAssetStore.getState().syncMarketingAssets(token, ids);
}
```

同步函数上方注释改为“跨设备可用前，先把引用图片同步进账号云存储；营销资料只保留素材引用”。删除读取素材 `storageKey` 并回写 `owner.assets` 的整段逻辑。

- [ ] **Step 5: 确认编辑器保持不可变更新**

检查 `marketing-details-editor.tsx`：

- 上传图片使用 `const refs = [...value.assets]`，每次追加后调用 `onChange({ assets: [...refs] })`。
- 选择、改用途、删除都使用 `value.assets.map` 或 `filter` 创建新数组。
- 不出现 `value.assets.push`、`ref.storageKey = ...` 或直接修改 `value` 的赋值。
- 新引用只创建 `{ assetId: id, role: "营销图片" }`。

若已有实现满足上述条件，本步骤只核对，不重写。

- [ ] **Step 6: 用户/CI 验证与检查点**

由用户或 CI 执行：

```bash
go test ./model ./service ./repository
cd web
bun test src/lib/marketing.test.ts
```

预期：新 JSON 契约通过；既有 owner 隔离、revision、关系、图片归属和事务回滚测试继续通过。全仓搜索确认 `MarketingAssetReference` 无 `StorageKey` 消费者；本任务不提交。

---

## Task 3: 营销页分层编辑与完整性提示

**Files:**

- Modify: `web/src/app/(user)/marketing/components/marketing-details-editor.tsx:26-62`
- Modify: `web/src/app/(user)/marketing/components/marketing-entity-editor.tsx:29-49`
- Modify: `web/src/app/(user)/marketing/page.tsx:8,103-110`
- Test: `web/src/lib/marketing.test.ts`

**Interfaces:**

- Consumes: Task 1 的 `summarizeMarketingWorkspace`。
- Produces:

```ts
export type MarketingDetailsVariant = "context" | "location" | "offering";

export function MarketingDetailsEditor({
    value,
    onChange,
    variant,
}: {
    value: MarketingDetails;
    onChange: (patch: Partial<MarketingDetails>) => void;
    variant: MarketingDetailsVariant;
}): React.JSX.Element;
```

- Later tasks rely on: 底层 `MarketingDetails` 字段完整保留，UI 只改变可见性。

- [ ] **Step 1: 写完整性摘要展示断言**

Task 1 已增加 `summarizeMarketingWorkspace` 测试；本任务新增一条 UI 所需的数据断言：

```ts
test("完整性摘要不会把缺少事实误判为不可保存", () => {
    const { workspace } = marketingFixture();
    workspace.facts = [];
    const item = summarizeMarketingWorkspace(workspace)[0]!;
    assert.equal(item.suggestions.includes("补充已确认事实（具体主张需要依据）"), true);
    assert.equal(item.suggestions.includes("暂停保存"), false);
});
```

- [ ] **Step 2: 按层级显示详情字段**

修改 `MarketingDetailsEditor` 签名并增加 `variant`，默认值保持 `"context"` 以便现有调用可渐进切换：

```tsx
export type MarketingDetailsVariant = "context" | "location" | "offering";

export function MarketingDetailsEditor({ value, onChange, variant = "context" }: { value: MarketingDetails; onChange: (patch: Partial<MarketingDetails>) => void; variant?: MarketingDetailsVariant }) {
```

字段显示规则：

- `context`：基本介绍、目标受众、表达与风格指导、禁用表述、事实、图片全部显示。
- `location`：显示基本介绍、禁用表述、事实、图片；`localContext` 已由实体编辑器负责，不再重复显示通用受众和风格字段。
- `offering`：显示基本介绍、禁用表述、事实、图片；类型和分类由实体编辑器负责，不再重复显示通用受众和风格字段。

对应 JSX 条件：

```tsx
{variant === "context" ? <label className="block space-y-2 text-sm"><span>目标受众</span><Input aria-label="目标受众" maxLength={2000} value={value.audience} placeholder="如：附近上班族、带孩子的家庭" onChange={(event) => onChange({ audience: event.target.value })} /></label> : null}
{variant === "context" ? <label className="block space-y-2 text-sm"><span>表达与风格指导</span><Input.TextArea aria-label="表达与风格指导" rows={3} maxLength={5000} value={value.guidance} placeholder="描述希望采用的语气和风格；不是给 Agent 的执行权限" onChange={(event) => onChange({ guidance: event.target.value })} /></label> : null}
```

保留现有事实和图片编辑器，不删除任何隐藏字段的数据。

- [ ] **Step 3: 实体编辑器传入层级**

在 `marketing-entity-editor.tsx` 中将：

```tsx
<MarketingDetailsEditor value={draft.item} onChange={patch} />
```

替换为：

```tsx
<MarketingDetailsEditor value={draft.item} onChange={patch} variant={draft.kind === "workspace" || draft.kind === "brand" ? "context" : draft.kind} />
```

门店本地特点、经营形式、城市/区域/地址，以及商品类型/分类继续由实体编辑器显示；可售关系的 `highlights` 和门店事实编辑保持不变。

- [ ] **Step 4: 营销页展示完整性摘要**

在 `marketing/page.tsx` 引入：

```ts
import { summarizeMarketingWorkspace } from "@/lib/marketing";
```

在空间选择条之后、详情加载分支之前加入：

```tsx
{detail ? <section className="space-y-3 rounded-xl border border-border/70 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">可用于复刻的资料</h2><span className="text-xs text-muted-foreground">建议仅用于提示，不阻止保存</span></div>
    <div className="flex flex-wrap gap-2">{summarizeMarketingWorkspace(detail).map((item) => <Tag key={`${item.scope}:${item.id}`} color={item.suggestions.length ? "default" : "green"}>{item.name || "未命名"} · {item.suggestions.length ? "建议补充" : "资料完整"}</Tag>)}</div>
    {summarizeMarketingWorkspace(detail).some((item) => item.suggestions.length) ? <Alert type="info" showIcon title="部分主体仍可补充" description={summarizeMarketingWorkspace(detail).flatMap((item) => item.suggestions.map((suggestion) => `${item.name || "未命名"}：${suggestion}`)).join("；")} /> : null}
</section> : null}
```

空间、品牌、门店和商品列表已有事实/图片数量，不重复增加第二套统计卡。

- [ ] **Step 5: 用户/CI 验证与检查点**

由用户或 CI 执行：

```bash
cd web
bun test src/lib/marketing.test.ts
bun run typecheck
```

预期：摘要测试与类型检查通过。人工检查：空间/品牌仍可编辑完整上下文；门店编辑突出本地特点与事实；商品编辑突出介绍/分类与事实；隐藏字段重新打开后数据未丢失。本任务不提交。

---

## Task 4: 画布设置、记忆、策划与审阅接入

**Files:**

- Modify: `web/src/app/(user)/canvas/remix-setup-memory.ts:4-44`
- Create: `web/src/app/(user)/canvas/remix-setup-memory.test.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-remix-setup.tsx:3-105`
- Modify: `web/src/app/(user)/canvas/remix-planner.ts:2,44-66`
- Modify: `web/src/app/(user)/canvas/remix-policy.ts:1-9`
- Modify: `web/src/app/(user)/canvas/components/canvas-remix-plan-panel.tsx:25-40`
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-canvas-remix.tsx:116`
- Test: `web/src/app/(user)/canvas/remix-setup-memory.test.ts`

**Interfaces:**

- Consumes:
  - Task 1 的 `MarketingSelection`、`resolveMarketingSelection`、`compileMarketingSnapshot`。
  - 现有 `availableMarketingOfferings`、`useMarketingStore`、`useAssetStore`。
- Produces:

```ts
export type RemixSetupMemory = {
    selection?: MarketingSelection;
    skills: RemixSkillSelection[];
};

export function parseRemixSetupMemory(value: unknown): RemixSetupMemory;
export function readRemixSetupMemory(): RemixSetupMemory;
export function saveRemixSetupMemory(memory: RemixSetupMemory): void;
```

- `CanvasRemixSetup` 继续返回 `RemixSetupResult = { settings: RemixSettings; selection?: MarketingSelection }`。
- `currentMarketingSnapshot(selection: MarketingSelection): Promise<MarketingSnapshot>` 保持签名，只替换内部编译器。
- `REMIX_CORE_VERSION` 精确为 `"marketing-remix-2"`。

- [ ] **Step 1: 写设置记忆测试**

创建 `web/src/app/(user)/canvas/remix-setup-memory.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUser } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { parseRemixSetupMemory, readRemixSetupMemory, saveRemixSetupMemory } from "./remix-setup-memory";

const selections = [
    { workspaceId: "w", scope: "workspace" },
    { workspaceId: "w", scope: "brand", brandId: "b" },
    { workspaceId: "w", scope: "location", locationId: "l" },
    { workspaceId: "w", scope: "offering", brandId: "b", offeringIds: ["o"] },
] as const;

test("四种资料范围都能保存和恢复", () => {
    for (const selection of selections) {
        const memory = parseRemixSetupMemory({ selection, skills: [] });
        assert.deepEqual(memory.selection, selection);
    }
});

test("非法范围、错误字段和重复商品被过滤", () => {
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "unknown" }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "brand" }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "offering", brandId: "b", offeringIds: [] }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "offering", brandId: "b", offeringIds: ["o", "o"] }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "location", locationId: "l", offeringIds: ["o", "o"] }, skills: [] }).selection, undefined);
    assert.equal(parseRemixSetupMemory({ selection: { workspaceId: "w", scope: "workspace", locationId: "l" }, skills: [] }).selection, undefined);
});

test("记忆按账号分区，不读取其他账号的选择", () => {
    const storage = new Map<string, string>();
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } } });
    try {
        const user = (id: string | null): AuthUser | null => id ? { id, username: id, displayName: id, avatarUrl: "", role: "user", credits: 0, createdAt: "", updatedAt: "" } : null;
        useUserStore.setState({ user: user("a") });
        saveRemixSetupMemory({ selection: selections[1], skills: [] });
        useUserStore.setState({ user: user("b") });
        assert.equal(readRemixSetupMemory().selection, undefined);
        useUserStore.setState({ user: user("a") });
        assert.deepEqual(readRemixSetupMemory().selection, selections[1]);
        useUserStore.setState({ user: null });
    } finally {
        if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
        else Reflect.deleteProperty(globalThis, "window");
    }
});
```

- [ ] **Step 2: 记录预期失败**

由用户或 CI 执行：

```bash
cd web
bun test "src/app/(user)/canvas/remix-setup-memory.test.ts"
```

预期：`parseRemixSetupMemory` 尚不存在而失败。

- [ ] **Step 3: 重写设置记忆契约**

```ts
import { accountLocalStorage } from "@/lib/account-storage";
import type { MarketingScope, MarketingSelection } from "@/lib/marketing";
import type { RemixSkillSelection } from "./remix-types";

export type RemixSetupMemory = { selection?: MarketingSelection; skills: RemixSkillSelection[] };

const MEMORY_KEY = "infinite-canvas:remix_setup";
const emptyMemory = (): RemixSetupMemory => ({ skills: [] });

function parseSelection(value: unknown): MarketingSelection | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.workspaceId !== "string" || !record.workspaceId) return undefined;
    const scope = record.scope as MarketingScope;
    if (!["workspace", "brand", "location", "offering"].includes(scope)) return undefined;
    if (scope === "brand" && (typeof record.brandId !== "string" || !record.brandId)) return undefined;
    if (scope === "location" && (typeof record.locationId !== "string" || !record.locationId)) return undefined;
    if (scope === "offering") {
        if (typeof record.brandId !== "string" || !record.brandId || !Array.isArray(record.offeringIds)) return undefined;
        const ids = record.offeringIds.filter((id): id is string => typeof id === "string" && Boolean(id)).slice(0, 10);
        if (!ids.length || new Set(ids).size !== ids.length) return undefined;
        return { workspaceId: record.workspaceId, scope, brandId: record.brandId, ...(typeof record.locationId === "string" && record.locationId ? { locationId: record.locationId } : {}), offeringIds: ids };
    }
    if (scope === "workspace" && (record.brandId || record.locationId || record.offeringIds)) return undefined;
    if (scope === "brand" && (record.locationId || record.offeringIds)) return undefined;
    if (scope === "location") {
        const ids = Array.isArray(record.offeringIds) ? record.offeringIds.filter((id): id is string => typeof id === "string" && Boolean(id)).slice(0, 10) : [];
        if (new Set(ids).size !== ids.length) return undefined;
        return { workspaceId: record.workspaceId, scope, ...(typeof record.brandId === "string" && record.brandId ? { brandId: record.brandId } : {}), locationId: record.locationId as string, ...(ids.length ? { offeringIds: ids } : {}) };
    }
    return { workspaceId: record.workspaceId, scope, ...(scope === "brand" ? { brandId: record.brandId as string } : {}) };
}

export function parseRemixSetupMemory(value: unknown): RemixSetupMemory {
    if (!value || typeof value !== "object") return emptyMemory();
    const parsed = value as { selection?: unknown; skills?: unknown };
    const skills = Array.isArray(parsed.skills) ? parsed.skills.filter((skill): skill is RemixSkillSelection => Boolean(skill) && typeof skill === "object" && typeof skill.id === "string" && typeof skill.name === "string" && (skill.source === "system" || skill.source === "user")).slice(0, 5) : [];
    return { selection: parseSelection(parsed.selection), skills };
}

export function readRemixSetupMemory(): RemixSetupMemory {
    if (typeof window === "undefined") return emptyMemory();
    try { return parseRemixSetupMemory(JSON.parse(accountLocalStorage.getItem(MEMORY_KEY) || "null")); } catch { return emptyMemory(); }
}

export function saveRemixSetupMemory(memory: RemixSetupMemory) {
    if (typeof window === "undefined") return;
    try { accountLocalStorage.setItem(MEMORY_KEY, JSON.stringify(memory)); } catch { /* 本机配置写入失败不影响本次复刻。 */ }
}
```

- [ ] **Step 4: 设置弹窗改为单一选择状态**

在 `canvas-remix-setup.tsx` 删除独立 `workspaceId/locationId/offeringIds` 状态，改为：

```tsx
const [memory] = useState(readRemixSetupMemory);
const [selection, setSelection] = useState<MarketingSelection>(() => memory.selection || { workspaceId: "", scope: "workspace" });
const workspaceId = selection.workspaceId;
const brandId = selection.brandId || "";
const locationId = selection.locationId || "";
const offeringIds = selection.offeringIds || [];
const scope = selection.scope;
```

引入范围标签，并将 `marketing.ts` 导入补充 `type MarketingScope`：

```ts
const SCOPE_LABELS: Record<MarketingScope, string> = { workspace: "企业", brand: "品牌", location: "门店", offering: "商品" };
```

选择空间时清理所有下级字段：

```tsx
const selectWorkspace = (id: string) => {
    setSelection({ workspaceId: id, scope });
    setError("");
    if (!id || details[id]) return;
    setDetailLoading(true);
    void ensureDetail(id).catch((err) => setError(errorMessage(err, "营销资料加载失败"))).finally(() => setDetailLoading(false));
};
```

切换范围时只保留合法上层字段：

```tsx
const selectScope = (next: MarketingScope) => setSelection((current) => ({
    workspaceId: current.workspaceId,
    scope: next,
    ...(next === "brand" || next === "offering" ? { brandId: next === "brand" ? current.brandId || "" : "" } : {}),
    ...(next === "location" ? { locationId: "" } : {}),
    ...(next === "offering" ? { locationId: "", offeringIds: [] } : {}),
}));
```

品牌变化时清空门店与商品；门店变化时清空商品。商品选项在 `location` 范围使用 `availableMarketingOfferings(detail, locationId)`，在 `offering` 范围使用 `detail.offerings.filter((item) => item.brandId === brandId)`。

- [ ] **Step 5: 恢复记忆时用共享解析器清理失效实体**

详情加载后调用 `resolveMarketingSelection`，失败时保留空间但清空失效范围：

```tsx
const restoreSelection = (workspace: MarketingWorkspace, remembered: MarketingSelection) => {
    try {
        const resolved = resolveMarketingSelection(workspace, remembered);
        setSelection({ workspaceId: workspace.id, scope: remembered.scope, ...(resolved.brand ? { brandId: resolved.brand.id } : {}), ...(resolved.location ? { locationId: resolved.location.id } : {}), ...(resolved.offerings.length ? { offeringIds: resolved.offerings.map((item) => item.id) } : {}) });
    } catch {
        setSelection({ workspaceId: workspace.id, scope: "workspace" });
    }
};
```

首次恢复时，如果记忆空间存在则先 `setSelection({ workspaceId: target.id, scope: remembered.scope })`，再加载详情并执行 `restoreSelection`。不要用旧的 `memory.locations` 映射。

- [ ] **Step 6: 条件显示范围字段**

“使用的经营资料”区域按以下顺序渲染：

1. 资料空间选择，所有范围显示。
2. `Segmented` 资料范围：企业 / 品牌 / 门店 / 商品。
3. `brand` 与 `offering` 范围显示品牌选择。
4. `location` 范围显示门店选择。
5. `offering` 范围显示可选门店选择。
6. `location` 与 `offering` 范围显示商品多选；`location` 文案为“本店可用商品 / 服务（可选）”，`offering` 文案为“品牌商品 / 服务”。

范围字段的基础 JSX：

```tsx
<label className="block space-y-2 text-sm"><span>资料范围</span><Segmented block value={scope} options={(["workspace", "brand", "location", "offering"] as MarketingScope[]).map((value) => ({ value, label: SCOPE_LABELS[value] }))} onChange={(value) => selectScope(value as MarketingScope)} /></label>
{scope === "brand" || scope === "offering" ? <label className="block space-y-2 text-sm"><span>品牌</span><Select className="w-full" aria-label="复刻品牌" placeholder="选择品牌" disabled={!detail || detailLoading} value={brandId || undefined} options={detail?.brands.map((item) => ({ value: item.id, label: item.name }))} onChange={(id) => setSelection((current) => ({ ...current, brandId: id, locationId: undefined, offeringIds: [] }))} /></label> : null}
{scope === "location" || scope === "offering" ? <label className="block space-y-2 text-sm"><span>门店 / 服务点{scope === "offering" ? "（可选）" : ""}</span><Select className="w-full" allowClear={scope === "offering"} showSearch optionFilterProp="label" aria-label="复刻门店" placeholder={scope === "offering" ? "不限门店" : "选择门店 / 服务点"} disabled={!detail || detailLoading || (scope === "offering" && !brandId)} value={locationId || undefined} options={detail?.locations.filter((item) => scope === "offering" ? item.brandId === brandId : true).map((item) => ({ value: item.id, label: `${item.name}${item.city ? ` · ${item.city}` : ""}` }))} onChange={(id) => setSelection((current) => ({ ...current, locationId: id || undefined, offeringIds: [] }))} /></label> : null}
{scope === "location" || scope === "offering" ? <label className="block space-y-2 text-sm"><span>{scope === "location" ? "本店可用商品 / 服务（可选）" : "品牌商品 / 服务"}</span><Select mode="multiple" maxCount={10} className="w-full" aria-label="复刻商品" placeholder={scope === "offering" ? "至少选择一项" : "可留空，只做门店内容"} disabled={!detail || detailLoading || (scope === "location" ? !locationId : !brandId)} value={offeringIds} options={(scope === "location" ? availableMarketingOfferings(detail!, locationId) : detail?.offerings.filter((item) => item.brandId === brandId) || []).map((item) => ({ value: item.id, label: item.name }))} onChange={(ids) => setSelection((current) => ({ ...current, offeringIds: ids }))} /></label> : null}
```

- [ ] **Step 7: 增加策划前摘要与提交校验**

订阅素材并固定弹窗打开时间，避免在渲染中重复读取全局时钟：

```tsx
const assets = useAssetStore((state) => state.assets);
const [openedAt] = useState(() => Date.now());
```

使用共享解析器和当前素材计算摘要：

```tsx
const preview = useMemo(() => {
    if (!detail || !workspaceId) return null;
    try {
        const resolved = resolveMarketingSelection(detail, selection);
        const references = resolved.details.flatMap((item) => item.value.assets);
        const refs = [...new Set(references.map((ref) => ref.assetId))];
        const allFacts = [...resolved.details.flatMap((item) => item.value.facts), ...resolved.listings.flatMap((item) => item.facts)];
        const approvedFacts = allFacts.filter((fact) => fact.approved && fact.value.trim() && fact.source.trim() && (!fact.validUntil || Date.parse(fact.validUntil) > openedAt));
        const issues = [
            ...allFacts.filter((fact) => fact.approved && (!fact.value.trim() || !fact.source.trim() || (fact.validUntil && (!Number.isFinite(Date.parse(fact.validUntil)) || Date.parse(fact.validUntil) <= openedAt)))).map((fact) => `事实「${fact.label || "未命名"}」缺少依据、内容或已过期`),
            ...references.filter((ref) => !assets.some((asset) => asset.id === ref.assetId && asset.kind === "image" && asset.data.storageKey && asset.data.mimeType.startsWith("image/"))).map((ref) => `图片「${ref.role}」尚未同步`),
        ];
        return { subject: [resolved.workspace.name, resolved.brand?.name, resolved.location?.name, ...resolved.offerings.map((item) => item.name)].filter(Boolean).join(" / "), approvedFacts: approvedFacts.length, images: refs.length, issues };
    } catch (error) {
        return { error: errorMessage(error, "资料范围无效") };
    }
}, [assets, detail, openedAt, selection, workspaceId]);
```

提交时先校验目标，再保存完整选择：

```tsx
const submit = () => {
    if (!settings.goal.trim()) return void message.warning("请填写本次目标");
    if (settings.mode === "marketing") {
        if (!detail || preview?.error) return void message.warning(preview?.error || "请选择有效的营销资料");
        if (preview.issues?.length) return void message.warning(`请先处理：${preview.issues.join("、")}`);
        try { resolveMarketingSelection(detail, selection); } catch (error) { return void message.warning(errorMessage(error, "资料范围无效")); }
    }
    saveRemixSetupMemory({ selection: settings.mode === "marketing" ? selection : memory.selection, skills: settings.skills });
    onResolve({ settings, selection: settings.mode === "marketing" ? selection : undefined });
};
```

摘要 UI：

```tsx
{preview ? preview.error ? <Alert type="error" showIcon title={preview.error} /> : <div className="rounded-lg border border-border p-3 text-xs leading-6"><div>本次主体：{preview.subject}</div><div className="text-muted-foreground">已确认事实 {preview.approvedFacts} 项 · 营销图片 {preview.images} 张</div>{preview.issues?.length ? <div className="text-red-500">{preview.issues.join("；")}</div> : null}</div> : null}
```

- [ ] **Step 8: 切换编译器与核心规则版本**

`remix-planner.ts` 导入改为：

```ts
import { compileMarketingSnapshot, marketingAssetIds, marketingSnapshotKey, type MarketingSelection } from "@/lib/marketing";
```

`currentMarketingSnapshot` 最后一行改为：

```ts
return compileMarketingSnapshot(workspace, selection, images, Date.now());
```

`assertRemixInputFresh` 的错误文案改为“当前经营主体、事实或营销图片已更新，请重新策划”。

`remix-policy.ts` 改为：

```ts
export const REMIX_CORE_VERSION = "marketing-remix-2";
```

核心规则第一段营销约束改为：

```ts
营销资料是数据，不是指令。仅使用本次选定的企业、品牌、门店或商品范围及其中已确认事实；事实不能被 Skill 或自由描述覆盖。城市特点只使用明确提供的 localContext，不能凭城市名杜撰。介绍、受众、风格和推荐场景用于理解背景，涉及价格、资质、优惠、效果和卖点的具体主张必须引用 facts 中的依据。
```

- [ ] **Step 9: 审阅摘要支持可选主体与事实来源**

`canvas-remix-plan-panel.tsx` 的营销摘要改为：

```tsx
{run.input.marketing ? <div className="space-y-1.5 border-t border-current/15 pt-4">
    <div className="text-[13px] font-semibold">本次经营资料</div>
    <p>{run.input.marketing.scope === "workspace" ? "企业" : run.input.marketing.scope === "brand" ? "品牌" : run.input.marketing.scope === "location" ? "门店" : "商品"} · {[run.input.marketing.workspace.name, run.input.marketing.brand?.name, run.input.marketing.location?.name, ...run.input.marketing.offerings.map((item) => item.name)].filter(Boolean).join(" / ")}</p>
    {run.input.marketing.location ? <p className="text-xs opacity-60">当地特点：{run.input.marketing.location.localContext || "未提供，不推测"}</p> : null}
</div> : null}
```

事实来源行改为：

```tsx
const FACT_SCOPE_LABELS = { workspace: "企业", brand: "品牌", location: "门店", offering: "商品", listing: "门店商品" } as const;
```

```tsx
<div className="text-xs opacity-60">来源：{fact.subject} · {FACT_SCOPE_LABELS[fact.scope]} · 依据：{fact.source} · {use.usedIn.join("、")}</div>
```

- [ ] **Step 10: 收敛旧错误文案**

`use-canvas-remix.tsx` 中将固定门店/商品错误改为范围无关提示：

```ts
if (!expanded.ok) throw new Error(expanded.reason || "素材同步被阻止，请处理引用冲突");
```

已有“当前门店、商品、事实或营销图片已更新”由 `assertRemixInputFresh` 统一覆盖，不在 hook 再维护第二套文案。

- [ ] **Step 11: 用户/CI 验证与检查点**

由用户或 CI 执行：

```bash
cd web
bun test "src/app/(user)/canvas/remix-setup-memory.test.ts" "src/app/(user)/canvas/[id]/lib/canvas-source-remix.test.ts" src/lib/marketing.test.ts
bun run typecheck
```

预期：四种范围记忆、非法结构过滤、账号隔离、复刻结构门禁和类型检查通过。人工检查：

- 企业范围只选空间即可开始。
- 品牌范围不要求门店。
- 门店范围允许商品为空。
- 商品范围至少一项商品，可选择限定门店。
- 失效品牌/门店/商品恢复时自动清理。
- 旧运行点击生成提示“复刻规则已更新，请重新策划”。
- 审阅弹窗事实能看见来源主体与作用域。

本任务不提交。

---

## Task 5: 文档、待验证项与版本级归纳

**Files:**

- Modify: `docs/progress/todo.md`
- Modify: `docs/progress/pending-test.md`
- Modify: `CHANGELOG.md`
- Deferred until user confirmation: `docs/overview/features.md`
  - 本轮只记录待更新内容，不把未实测能力写成正式功能。

**Interfaces:**

- Consumes: Task 1-4 的实际工作区 diff。
- Produces: 与代码一致的功能说明、待实测清单和一条 `Unreleased` 版本级归纳。
- Later tasks rely on: 用户确认实测后再把正式功能说明从“待验证”升级为已验证。

- [ ] **Step 1: 更新待办**

在 `docs/progress/todo.md`：

- 若有“营销资料范围选择/快照编译器/图片真源/复刻设置分层”对应待办，完成后移到 `pending-test.md`，不要直接写进正式功能说明。
- 保留真实 AI、跨设备、移动端、事实过期 UI 等尚未验证事项。
- 不新增 Campaign、CRM、团队权限等本期非目标待办。

- [ ] **Step 2: 更新待实测清单**

在 `docs/progress/pending-test.md` 新增一节“营销资料范围与画布复刻上下文”，记录：

- 企业、品牌、门店、商品四种范围的真实点击路径。
- 门店无商品、商品无门店、门店商品可售关系失效的行为。
- 已确认事实、未确认事实、过期事实在设置摘要和审阅页的展示。
- 营销图片缺失、未持久化、跨设备读取失败的错误提示。
- 旧 `marketing-remix-1` 运行重新策划提示。
- 登录态游客资料接管、素材云同步、跨设备和移动端仍为未实测。
- 明确写明：单元测试/类型检查是否已通过取决于用户或 CI 的实际输出，不预填“通过”。

- [ ] **Step 3: 记录正式功能说明的后续更新，不在本轮提前改写**

按项目文档规则，本轮不修改 `docs/overview/features.md`。在 `pending-test.md` 的本节末尾记录用户确认后需要完成的准确替换：

- “只保存素材 ID、存储键与用途”改为“只保存素材 ID 与用途；存储键由我的素材持有，并冻结到当次复刻运行快照”。
- 复刻设置由固定“空间/门店/本店商品”改为“企业/品牌/门店/商品四种范围”，说明门店商品可选、商品范围至少一项。
- 增加唯一 `compileMarketingSnapshot`、事实来源、禁用词并集、图片用途合并和快照新鲜度说明。
- 增加编辑器按层级展示、空间完整性建议和快速创建单店保留说明。
- 保留账号隔离、离线缓存、游客接管、引用删除保护和六表聚合保存说明。
- 用户确认实测通过后，才将这些内容正式写入 `docs/overview/features.md`。

- [ ] **Step 4: 更新 CHANGELOG**

在 `CHANGELOG.md` 的 `Unreleased` 顶部增加一条版本级归纳：

```markdown
+ [重构] 营销资料接入画布复刻：支持企业/品牌/门店/商品四种范围，统一快照编译与事实来源，图片引用收敛为素材 ID + 用途，营销页与复刻设置按层级减负
```

不要逐条照搬实现细节，不创建版本号或 tag。

- [ ] **Step 5: 最终检查点**

- [ ] 查看 `git status` 与 `git diff --stat`，确认只包含本计划涉及文件。
- [ ] 搜索确认 `buildMarketingSnapshot`、`memory.locations`、营销引用 `storageKey` 无生产代码残留。
- [ ] 搜索确认 `REMIX_CORE_VERSION === "marketing-remix-2"`。
- [ ] 将用户/CI 实际执行结果补入 `pending-test.md`；未执行的项目明确写“未实测”。
- [ ] 不提交、不推送，等待用户单独授权。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-24-marketing-context-architecture.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — 每个任务使用独立子代理实现，任务间由主代理审查实际 diff；若当前环境子代理不可用，则回退到会话内顺序执行并明确说明。
2. **Inline Execution** — 在当前会话按 `superpowers:executing-plans` 顺序执行，每个任务结束后暂停检查点。

Both options obey the project constraint: no automatic build/test and no Git commit.
