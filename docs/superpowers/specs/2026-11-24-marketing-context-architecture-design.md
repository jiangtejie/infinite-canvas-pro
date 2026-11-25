# 营销资料与画布复刻的上下文架构设计

日期：2026-11-24

## 1. 背景与问题

当前营销资料已经形成账号级聚合模型，包含资料空间、品牌、门店、商品和门店可售关系，并通过快照进入画布复刻运行。该方向合理，但存在三个高价值问题：

1. 复刻选择强制要求门店和商品，品牌宣传、企业宣传、门店认知等内容没有自然入口。
2. 快照由多个层级直接拼接，字段优先级、事实来源和冲突语义不明确。
3. 营销图片引用同时保存素材 ID 和存储键，形成双真源。

本设计保留现有六张表和聚合保存，收敛选择契约与快照编译，使营销资料成为画布可复用、可审阅、可追溯的上下文来源。

## 2. 目标

- 支持企业、品牌、门店、商品四种资料范围。
- 保留门店与商品的关联价值，同时允许无门店、无商品的内容创作。
- 建立唯一的快照编译入口，明确资料选择、事实可信和图片解析规则。
- 让快照保留事实作用域和来源，提升策划审阅的可解释性。
- 收敛图片引用真源，营销主资料只持有素材引用。
- 保持现有账号隔离、离线缓存、游客接管、聚合事务和版本锁。
- 为后续真实 AI、跨设备和移动端验收提供清晰路径。

## 3. 非目标

- 不新增 Campaign、渠道计划、营销自动化或 CRM。
- 不新增团队、组织和角色权限。
- 不拆分六张营销表，不改为实体级 API。
- 不重写素材库或画布引擎。
- 不为旧复刻运行做数据迁移；旧运行保留可读，但生成前必须按新规则重新策划。

## 4. 当前架构

- 营销页：`web/src/app/(user)/marketing/page.tsx`
- 领域类型与快照：`web/src/lib/marketing.ts`
- 营销状态：`web/src/stores/use-marketing-store.ts`
- 复刻设置：`web/src/app/(user)/canvas/components/canvas-remix-setup.tsx`
- 复刻编译与新鲜度：`web/src/app/(user)/canvas/remix-planner.ts`
- 运行模型：`web/src/app/(user)/canvas/remix-types.ts`
- 后端模型：`model/marketing.go`
- 后端保存：`repository/marketing.go`

当前主链路为：

```text
营销资料聚合
  -> 强制选择空间 / 门店 / 商品
  -> buildMarketingSnapshot 拼接
  -> RemixRun 策划 / 审阅 / 生成 / 发布
```

## 5. 目标架构

```text
营销资料聚合（主数据）
  -> MarketingSelection（本次使用范围）
  -> compileMarketingSnapshot（唯一编译入口）
  -> MarketingSnapshot（带来源的上下文）
  -> RemixRun（策划 / 审阅 / 生成 / 发布）

我的素材（文件与存储键真源）
  -> 按 assetId 解析到 MarketingSnapshot.assets
```

营销资料负责“事实与引用”，画布负责“本次如何使用”，素材库负责“文件在哪里”。

## 6. 领域契约

### 6.1 资料范围

```ts
type MarketingScope = "workspace" | "brand" | "location" | "offering";

type MarketingSelection = {
  workspaceId: string;
  scope: MarketingScope;
  brandId?: string;
  locationId?: string;
  offeringIds?: string[];
};
```

| scope | 必填 | 可选 | 含义 |
| --- | --- | --- | --- |
| workspace | workspaceId | 无 | 企业或空间级内容 |
| brand | workspaceId、brandId | 无 | 品牌级内容 |
| location | workspaceId、locationId | offeringIds | 门店或服务点内容，可带商品 |
| offering | workspaceId、brandId、offeringIds | locationId | 商品或服务内容，可限定本店 |

约束：

- `brandId` 必须属于当前空间。
- `locationId` 必须属于当前空间，其品牌与选择品牌一致。
- `offeringIds` 不得重复，且必须属于同一品牌。
- 选择门店时，商品必须通过该店 `available=true` 的可售关系。
- 不选门店时，可直接选择品牌下的商品。
- `offering` 范围至少选择一个商品；其他范围允许空商品。

### 6.2 字段职责

- 空间：企业背景、全局受众、全局风格、禁用表述、全局事实、全局图片。
- 品牌：品牌定位、共用语气、品牌事实、品牌图片。
- 门店：本地特点、门店事实、门店图片。
- 商品：商品介绍、分类、商品事实、商品图片。
- 可售关系：是否可售、门店推荐特点、价格与优惠等门店事实。

底层 `MarketingDetails` 字段暂时保留，UI 按层级展示；不做表结构迁移。

## 7. 快照编译器

### 7.1 入口

```ts
compileMarketingSnapshot(
  workspace: MarketingWorkspace,
  selection: MarketingSelection,
  assets: MarketingImageAsset[],
  now?: number,
): MarketingSnapshot
```

该函数为纯函数，不访问 store、网络或全局时间；时间由参数注入。

### 7.2 输出结构

```ts
type MarketingSnapshot = {
  selection: MarketingSelection;
  scope: MarketingScope;
  workspace: { id: string; name: string; industry: string };
  brand?: { id: string; name: string };
  location?: {
    id: string;
    name: string;
    kind: string;
    city: string;
    district: string;
    address: string;
    localContext: string;
  };
  offerings: Array<{
    id: string;
    name: string;
    kind: string;
    category: string;
    description: string;
    highlights: string;
  }>;
  profile: {
    description: string;
    audience: string;
    guidance: string;
  };
  details: Array<{
    scope: "workspace" | "brand" | "location" | "offering";
    entityId: string;
    subject: string;
    description: string;
    audience: string;
    guidance: string;
  }>;
  forbidden: string[];
  facts: Array<MarketingFact & {
    scope: "workspace" | "brand" | "location" | "offering" | "listing";
    entityId: string;
    subject: string;
  }>;
  assets: MarketingAssetSnapshot[];
};
```

### 7.3 编译规则

1. 空间始终纳入。
2. 品牌在 `brand`、`location`、`offering` 范围纳入。
3. 门店在 `location` 范围或 `offering` 带门店时纳入。
4. 商品在 `location` 选择商品或 `offering` 范围纳入。
5. 门店商品只读取对应可售关系；可售关系事实绑定到 `listing` 作用域。
6. `description` 与 `guidance` 保留非空内容，并用作用域标签拼接。
7. `audience` 使用最具体层级的非空值；多个商品取值不同则去重合并。
8. `forbidden` 按出现顺序去重并集。
9. 事实只保留 `approved=true`、内容与依据非空、未过期项。
10. 事实保留 `scope/entityId/subject`，不自动合并同标签但不同来源的事实。
11. 图片从纳入实体收集，按 `assetId` 合并用途；存储键从素材库解析。
12. 任一纳入实体引用的图片缺失、非图片或未持久化时，编译失败并指出图片用途。
13. `highlights` 作为门店创作补充保留；价格、优惠、资质、效果等主张仍必须来自已确认事实。

### 7.4 快照键

`marketingSnapshotKey` 继续对完整编译结果做稳定 JSON 序列化。事实顺序、图片顺序和作用域变化都会使旧策划失效。

## 8. 图片真源

- `MarketingAssetReference` 只保留 `assetId` 与 `role`。
- 删除前端和 Go 模型中的 `storageKey` 字段。
- 删除 `persistMarketingAssets` 向营销引用回写存储键的逻辑。
- 图片上传与云同步仍由素材库负责。
- `MarketingSnapshot.assets` 保留当次运行使用的存储键，供历史运行与参考图节点使用。
- 素材删除引用保护保持不变。

## 9. 画布复刻集成

### 9.1 设置弹窗

“结合营销资料”区域增加“资料范围”选择：

- 企业：选择资料空间。
- 品牌：选择资料空间、品牌。
- 门店：选择资料空间、门店，商品可选。
- 商品：选择资料空间、品牌、商品，门店可选。

切换范围时清理无效下级选择。启动策划前显示摘要：

- 当前主体；
- 已确认事实数量；
- 营销图片数量；
- 缺失或过期项提示。

### 9.2 设置记忆

`remix-setup-memory.ts` 改为保存完整的 `MarketingSelection`，不再维护按空间映射的门店选择。恢复时验证实体与可售关系，只恢复仍有效的范围。

### 9.3 策划与新鲜度

- `currentMarketingSnapshot` 调用统一编译器。
- `assertRemixInputFresh` 比较新的快照键。
- `REMIX_CORE_VERSION` 提升为 `marketing-remix-2`。
- 旧运行不迁移；提示重新策划。

### 9.4 审阅摘要

- 展示资料范围和企业/品牌/门店/商品主体。
- 事实列表展示来源主体与使用位置。
- 图片引用继续按运行快照解析。

## 10. 营销页与编辑器

- 保留快速创建单店。
- 空间摘要展示可用于复刻的范围与缺失项。
- 编辑器按实体类型展示字段：
  - 空间和品牌保留较完整上下文字段；
  - 门店突出本地特点、事实和图片；
  - 商品突出介绍、分类、事实和图片；
  - 可售关系保留推荐特点和门店事实。
- 不新增独立管理页或复杂矩阵。
- 保存图片引用使用不可变更新，不直接修改输入对象。

## 11. 后端与持久化

- 六张表不变。
- 聚合保存、子表全量重建、`revision` 乐观锁和账号隔离不变。
- `MarketingAssetReference` 删除未使用的 `StorageKey` JSON 字段。
- `MarketingAssetReferenceRecord` 继续只保存素材 ID、用途和归属。
- 现有营销测试继续覆盖 owner 隔离、陈旧版本、关系校验、图片归属和事务回滚。

## 12. 错误处理

- 范围与实体不匹配：提示重新选择资料范围。
- 门店商品不可售：提示商品已不在本店提供。
- 事实过期：提示更新或取消确认。
- 图片未持久化：提示先同步到我的素材。
- 账号切换：中止当前编译或策划。
- 断网：允许查看缓存；新策划需要新鲜资料，不使用过期缓存生成。

## 13. 测试与验收

### 13.1 单元测试

新增 `compileMarketingSnapshot` 测试：

- 企业范围不要求品牌、门店或商品。
- 品牌范围不要求门店。
- 门店范围允许空商品。
- 商品范围支持有门店和无门店。
- 不可售商品被拒绝。
- 未确认和过期事实被排除。
- 事实保留作用域与来源。
- 禁用表述去重并集。
- 图片用途合并。
- 缺失图片给出明确错误。
- 相同输入产生相同快照键。

### 13.2 设置记忆测试

- 四种范围能保存和恢复。
- 删除品牌、门店或商品后自动清理失效选择。
- 账号分区保持隔离。

### 13.3 后端测试

- 保持现有 owner、revision、关系、图片归属和回滚测试。
- 确认营销图片引用不再要求 `storageKey` 字段。

### 13.4 人工验收

- 单店快速创建后可直接做门店 + 商品内容。
- 单店只做门店认知时不要求商品。
- 品牌宣传不要求虚构门店。
- 企业宣传只使用企业资料。
- 审阅摘要能看清事实来源。
- 旧复刻运行提示重新策划。

按项目约定，本实现不自动执行构建或测试；交付测试代码与待实测清单。

## 14. 实施切片

### 切片 1：契约与编译器（最高价值）

- 新增 `MarketingScope` 和可选范围选择。
- 重写 `compileMarketingSnapshot`。
- 更新快照类型和键。
- 增加编译器单测。

### 切片 2：图片单真源与状态更新

- 删除营销引用 `storageKey`。
- 更新 Go 模型和前端类型。
- 简化 `persistMarketingAssets`。
- 使用不可变更新引用。

### 切片 3：营销页分层体验

- 更新分层编辑器。
- 增加资料完整度提示。
- 保留快速创建与引用保护。

### 切片 4：画布复刻接入

- 更新设置弹窗与记忆。
- 接入编译器。
- 更新审阅摘要。
- 升级复刻核心版本。

### 切片 5：文档与待验证

- 更新 `docs/overview/features.md`。
- 更新 `docs/progress/todo.md`。
- 更新 `docs/progress/pending-test.md`。
- `CHANGELOG.md` 只做版本级归纳。

## 15. 风险与回退

- 快照契约变化会使旧策划失效：通过核心版本升级明确提示，不做静默兼容。
- 分层字段可能隐藏用户已填写的同级字段：保留底层数据，仅调整展示，不删除字段。
- 编译器规则可能减少模型可用上下文：通过作用域标签和审阅摘要保证可解释。
- 图片单真源可能暴露素材缺失：在编译阶段明确失败，不静默丢图。

## 16. 完成标准

- 四种资料范围均有可验证路径。
- 画布只通过统一编译器使用营销资料。
- 营销主资料不再保存图片存储键。
- 快照事实带来源，禁用词和图片仍受校验。
- 旧策划按新版本重新策划。
- 高价值切片代码、测试和文档全部落地。
- 真实模型、跨设备与移动端明确列入待实测。
