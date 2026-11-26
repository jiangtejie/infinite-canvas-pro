# 影视剧本 → 导演分析 → 落图 体验重构计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 状态：2026-11-26 计划已确认方向；P0–P4 已实施（P4 未抽共享按钮原语、窄屏检查栏为堆叠而非抽屉，视觉与断点截图待浏览器验收）。

**Goal:** 把影视画布中「写/导入剧本 → 导演分析 → 生成节点到画布」从一次性、易丢失、易覆盖的弹窗流程，改造为**可持续、可编辑、可回退、能沉淀用户资产**的导演工作流：分析结果不丢、落图不毁已有成果、布局一致、用户每一次修正都沉淀为下次可复用的资产（母版库资产、别名词典、分析预设、剧本项目）。

**Architecture:** 剧本节点持有一份「分析会话」（待确认草稿 + 状态 + 参数 + 源指纹）；AI 导演分析与剧本工作台发布共用同一个「落图计划」纯函数（新增/更新/保留/受保护/删除差异）与同一个布局引擎 `film-layout.ts`；资产提取先匹配母版库与剧本工作台人物，再让 AI 补充；用户在提案中的修正（改名、合并、改类别、别名）回写母版库与项目词典，下次分析作为上下文输入。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Ant Design 6、Bun Test。

**相关 Spec：**
- `docs/superpowers/specs/2026-11-22-film-director-board-design.md`（导演板目标态，本计划是其第 8 节「剧本与导演分析中心」的深化）
- `docs/superpowers/specs/2026-11-25-script-workspace-architecture-design.md`（剧本工作台与发布刷新）

## Global Constraints

- **本计划阶段不改代码**；实施时按阶段分批，每批独立可验收。
- 一个影视项目仍是一份 `CanvasProject`，不新增第二套项目 store、任务链、提示词编译器或同步链路。
- 分析会话属于剧本节点的待确认数据，**应用前不得写入场次/镜头/资产节点与边**。
- 有媒体（分镜图/视频/版本）、有进行中任务或被人工编辑过的镜头，在默认合并模式下**不得被删除或覆盖**。
- 资产沉淀默认「建议 + 用户确认」，**不得静默写入母版库**；母版库更新沿用现有 `upsertFilmLibraryAsset` / `useFilmCastStore.saveAsset` 语义。
- 尽量不新增后端表；分析预设与项目词典优先挂在已有可同步数据上（见任务 2.4 的调研步骤），确需新表时先更新 `docs/backend/backend-database.md` 并征求确认。
- UI 文案保持中文；Ant Design 使用 6.x API；复用 `64df64b` 收敛后的交互原语，不新增平行组件体系。
- 工作区可能有无关改动，实施时不得回滚、覆盖或清理无关文件；未经用户授权不 `git commit` / `git push`。
- 每批完成后更新 `docs/progress/todo.md` 与 `docs/progress/pending-test.md`；隐藏帧无法验证的 hover/断点/计时器/rAF 行为标注「未实测」。
- 每批在 `web` 目录运行 `bun test`、`bun run typecheck`、`bun run lint --max-warnings=0`。

---

## 0. 已确认的决策

| 议题 | 决策 | 理由 |
|---|---|---|
| 应用方式 | 默认**智能合并**；保留**追加**；**替换**收进「更多」，需二次确认并列出将丢失的镜头数与媒体数 | 保护用户已产出的媒体资产，同时保留重来能力 |
| 分析方式 | **分阶段**：先结构（场次）→ 再逐场分镜（可并行、可单场重试/重做）→ 资产；提供「一键全部分析」跳过中间确认 | 可控、可局部重来、长剧本失败不全盘重跑 |
| 剧本编辑入口 | 画布抽屉用于**快速编辑与导入**；长篇写作去**剧本工作台**；画布原生剧本可一键「转存为剧本项目」 | 剧本本身也是要沉淀和复用的资产 |
| AI 关联 | AI 建立的 context 边显示为「待确认」，接受后转为人工关联 | 避免误绑定污染生成上下文 |

## 1. 现状问题（实施前基线）

| # | 问题 | 位置 |
|---|---|---|
| 1 | 三套落图算法：导演分析落图、来源刷新、「整理布局」各算各的，分析后的布局与整理后不一致；资产竖排在剧本左侧而非上下文带 | `[id]/lib/film-script-parse.ts:18-20,37-76`、`[id]/lib/film-script-refresh.ts:122-167`、`[id]/lib/film-layout.ts:3-14`、`[id]/lib/film-director-analysis.ts:168-178` |
| 2 | 整理布局 `rowHeight=400` 小于镜头默认高 420，默认尺寸下相邻镜头重叠（待实测确认） | `film-layout.ts:6` vs `constants.ts:27` |
| 3 | 提案只在编辑器 React state，关弹窗/取消/刷新即丢；分析不可中止；分析完成会关闭抽屉，进度入口随之消失 | `[id]/canvas-editor.tsx:190,2310-2359` |
| 4 | 默认「替换现有结构」，会删除全部场次与镜头（含媒体），仅靠 3 份快照撤销；刷新链路已有的保留/受保护语义未复用 | `[id]/components/film-director-analysis-dialog.tsx:34` |
| 5 | 提案只能勾选，不能改名/改镜头/合并拆分/改资产类别/合并资产/单场重做 | 导演分析弹窗及子组件 |
| 6 | 「结构」「镜头」两个标签复用同一浏览器，信息重复；「应用预览」是纯文字 | `film-director-analysis-dialog.tsx:85-170` |
| 7 | 提及关联按子串包含，短名易误绑；`source:"ai"` 的边没有确认入口 | `film-director-analysis.ts:191-201` |
| 8 | `pacing` / `structurePlan` 能力已存在但调用方未传；资产提取不匹配母版库、不利用剧本工作台人物 | `canvas-editor.tsx:2321-2328`、`film/utils/film-ai-parse.ts:48-55`、`[id]/lib/film-script-assets.ts` |
| 9 | 有来源的剧本节点抽屉只显示来源卡片，看不到正文、没有「导演分析」；从工作台导入只写正文，需要再点「预览并刷新」才落图（待实测确认） | `canvas/components/canvas-film-inspector.tsx:269-312` vs `341` |
| 10 | 剧本节点卡片只有摘要与一个按钮，没有分析状态、过期提示、来源更新提示 | `canvas/components/film-node-card.tsx:51-54` |
| 11 | 应用后仅在新建资产时调整视口，新落的场次/镜头不定位、不高亮 | `canvas-editor.tsx:2352-2355` |

## 2. 目标用户旅程

```text
剧本节点（空）
  ├─ 写正文 / 拖入文件 / 粘贴 / 从剧本工作台导入
  ▼
剧本节点（有正文）──卡片显示：字数 · 预估 N 集 M 场 · 「导演分析」
  ▼  选择分析预设（节奏/时长/导演风格/镜头密度/是否提取资产）
分析中 ──卡片进度条，可中止；用户可继续操作画布
  ▼  阶段 1 完成：场次结构
导演分析工作台（可关闭，草稿保存在剧本节点）
  ├─ 分镜：左大纲（勾选/状态）· 中镜头卡（可编辑/排序/合并拆分/单场重做）· 右检查
  ├─ 资产：母版库命中「复用」/ 新建；改名、合并、改类别、别名
  └─ 落图预览：小地图显示新增/更新/保留/受保护/删除
  ▼  应用（默认智能合并）
画布：视口飞到落图区域，新节点高亮；提示含「撤销」与「N 处 AI 关联待确认」
  ▼
沉淀：新资产建议存入母版库；修正过的名称/别名写入词典；参数存为预设；画布剧本可转存为剧本项目
  ▼
正文改动或来源更新 → 卡片提示「提案已过期 / 来源有更新」→ 差异预览 → 智能合并
```

## 3. 数据模型变化（目标）

> 实施时以 `web/src/app/(user)/canvas/types.ts` 为准，字段名可在任务内微调，但语义不变。

```ts
/** 剧本节点上的分析会话；只保留最近一次。应用后清空 draft，仅保留摘要，控制文档体积。 */
type FilmAnalysisSession = {
    id: string;
    status: "running" | "structure-ready" | "ready" | "applied" | "failed" | "cancelled";
    sourceHash: string;              // 发起分析时的正文指纹，用于过期判断
    options: FilmAnalysisOptions;    // 节奏、目标时长、导演风格、镜头密度、是否提取资产、沿用工作台结构
    progress?: { stage: "structure" | "shots" | "assets"; done: number; total: number };
    draft?: FilmAnalysisDraft;       // 可编辑提案：集/场/镜头 + 资产（含母版库匹配结果）
    sceneErrors?: Record<string, string>; // 单场失败原因，可单场重试
    summary?: { scenes: number; shots: number; assets: number; appliedAt: string; mode: FilmLandingMode };
    error?: string;
    createdAt: string;
    updatedAt: string;
};

type FilmLandingMode = "merge" | "append" | "replace";

/** 统一落图计划：AI 分析与工作台刷新共用。 */
type FilmLandingPlan = {
    added: LandingItem[];
    updated: LandingItem[];
    kept: LandingItem[];
    protected: LandingItem[];   // 有媒体/任务/人工编辑，合并模式下不改
    removed: LandingItem[];     // 仅 replace 或来源确实删除时出现
    assets: { reuseCanvas: string[]; reuseLibrary: string[]; create: string[] };
    bindings: { pending: number };
};
```

- `FilmScriptNodeData` 新增 `analysis?: FilmAnalysisSession`；现有 `parseSnapshots` 继续作为撤销来源。
- 场次/镜头节点复用现有 `scriptSourceKey` 承载稳定来源键：工作台来源沿用场次/镜头 ID；AI 来源使用「集标题 + 场次名」归一化键与场内序号（具体匹配规则见任务 1.2）。
- context 边沿用 `source: "manual" | "ai"`：`ai` 即「待确认」，用户接受后改为 `manual`，不新增字段。
- 母版库资产沿用 `FilmAsset.aliases` 作为别名词典的落点；项目级「名称归并」记录随项目元数据保存（任务 2.3 确认位置）。

---

## 阶段 P0：止血与快速改善（约 1–2 天）

### 任务 0.1 统一行高，修复整理布局重叠

**文件：** `[id]/lib/film-layout.ts`、`[id]/lib/film-layout.test.ts`

- [x] 写失败测试：默认尺寸的场次下多个镜头，经 `arrangeFilmDirectorBoard` 后相邻镜头不重叠
- [x] 行高改为由 `NODE_DEFAULT_SIZE[FilmShot].height + 间距` 或实际节点高度推导，而不是固定 400
- [x] 跑测试通过

**验收：** 整理布局后任意两个镜头矩形不相交（单测 + 浏览器实测一次）。

### 任务 0.2 导演分析落图改用导演板布局

**文件：** `[id]/lib/film-director-analysis.ts`、`[id]/lib/film-script-parse.ts`、对应测试

- [x] 测试：应用分析后，新场次/镜头/资产的位置与对同一图执行 `arrangeFilmDirectorBoard` 得到的位置一致（追加模式只验证新增部分接在现有列右侧）
- [x] 资产节点放入左侧上下文带，而不是剧本节点左侧竖排
- [x] 追加模式：新场次列从现有最右列之后开始

**验收：** 分析后点「整理布局」，节点不再大幅跳动。

### 任务 0.3 应用后定位与高亮

**文件：** `[id]/canvas-editor.tsx`（应用回调）、高亮可复用现有选中/聚焦能力

- [x] 应用后视口适配到「新增场次 + 镜头 + 资产」整体范围
- [x] 新节点短暂高亮（约 3 秒，可复用选中态或新增轻量 class；动画在 `prefers-reduced-motion` 下禁用）
- [x] 成功提示附「撤销」操作

**验收：** 无新资产时也会定位；提示中的「撤销」可用。

### 任务 0.4 默认应用方式与来源剧本入口

**文件：** `[id]/components/film-director-analysis-dialog.tsx`、`canvas/components/canvas-film-inspector.tsx`

- [x] 画布已有镜头时，默认选「追加」（P1 落地智能合并后改为默认合并）；无镜头时默认替换等价于新建
- [x] 「替换」需二次确认，文案列出将删除的场次数、镜头数、带媒体镜头数
- [x] 有来源的剧本节点：抽屉显示只读正文预览（可折叠）与「导演分析」入口
- [x] 从剧本工作台导入后，若画布还没有该来源的场次，直接弹出落图预览（复用现有刷新预览），一步落图

**验收：** 浏览器走通「从工作台导入 → 预览 → 落图」与「来源剧本 → 导演分析」两条路径。

---

## 阶段 P1：统一架构（分析会话 + 落图计划 + 布局引擎）

### 任务 1.1 分析会话持久化

**文件：** `canvas/types.ts`、新增 `[id]/lib/film-analysis-session.ts`(+test)、`[id]/canvas-editor.tsx`、`[id]/lib/film-director-analysis.ts`

- [x] 定义 `FilmAnalysisSession` 与纯函数：开始、更新进度、写入草稿、失败、取消、应用后收敛为摘要
- [x] 编辑器的分析状态改为读写剧本节点上的 `analysis`；弹窗关闭不再丢弃草稿
- [x] 刷新页面后：`running` 状态降级为「已中断，可继续/重新分析」（AI 请求不跨刷新续跑），`ready` 可直接打开
- [x] 过期判断：`analysis.sourceHash !== 当前正文指纹` 时标记「提案已过期」，仍可查看但应用前提示
- [x] 应用后清空 `draft`，只保留 `summary`，避免项目文档膨胀
- [x] 单测覆盖状态迁移与过期判断

**验收：** 分析完成 → 关闭弹窗 → 刷新页面 → 从剧本节点「继续确认」打开同一份提案。

### 任务 1.2 统一落图计划（智能合并）

**文件：** 新增 `[id]/lib/film-landing-plan.ts`(+test)；改造 `film-director-analysis.ts`、`film-script-refresh.ts`、`services/script-film-publication.ts`

- [ ] 提取 `film-script-refresh.ts` 中的差异计算为通用 `planFilmLanding(graph, incomingEpisodes, { mode, keyOf })`（未合并为单一函数：新增 `film-landing-plan.ts` 负责 AI 落图计划，来源刷新保留既有差异计算，两者共用同结构字段与保护/布局规则）
- [x] 定义保护规则（纯函数 + 单测）：有当前媒体或版本、有 `pendingTask`、人工改过关键字段（与上次落图快照比对）的镜头进入 `protected`
- [x] AI 来源匹配规则：场次按「集标题 + 场次名」归一化匹配；场内镜头按序号对齐，无法对齐的进入新增/删除；匹配到受保护镜头时只更新未被人工改过的字段
- [x] `merge` / `append` / `replace` 三种模式都生成同一结构的计划；`replace` 同样把受保护镜头列出供确认
- [x] AI 分析应用与工作台刷新都改为「计划 → 预览 → 应用」，并写入 `parseSnapshots` 以支持撤销
- [x] 测试：同一剧本二次分析，带媒体镜头保留且不重复创建；工作台刷新回归测试全部通过

**验收：** 二次导演分析默认不删除任何已有媒体；刷新与分析的预览数字口径一致。

### 任务 1.3 唯一布局引擎

**文件：** `[id]/lib/film-layout.ts`、`film-script-parse.ts`、`film-script-refresh.ts`

- [x] 新增「增量放置」函数：给定已有图与待新增节点，返回新增节点位置（场次接在最右列后，镜头落在所属场次列，资产进上下文带，节拍贴目标镜头）
- [x] `film-script-parse.ts` 与 `film-script-refresh.ts` 删除各自的 `COLUMN_GAP/SHOT_GAP/START_GAP` 常量，改调布局引擎
- [x] 测试：三条入口对同一输入产出一致的位置

**验收：** 代码中只剩 `film-layout.ts` 一处影视布局常量。

### 任务 1.4 剧本节点卡片按状态展示

**文件：** `canvas/components/film-node-card.tsx`、`[id]/lib/film-node-summary.ts`(+test)

- [x] 摘要派生：字数、预估集/场（复用 `parseFilmScriptDocument` 的规则解析，不调 AI）、来源标识、分析状态、过期/来源更新标志
- [x] 主按钮按状态切换：写剧本/导入 → 导演分析 → 中止 → 继续确认 → 重新分析/撤销 → 查看差异并更新
- [x] 分析中显示阶段与进度条

**验收：** 六种状态在浏览器中逐一可见且按钮可用。

### 任务 1.5 后台分析与中止

**文件：** `film/utils/film-ai-parse.ts`、`film/utils/film-ai-assets.ts`、`[id]/lib/film-director-analysis.ts`、`[id]/canvas-editor.tsx`

- [x] 分析请求接受 `AbortSignal`；剧本节点「中止」后状态为 `cancelled`，已完成的阶段结果保留
- [x] 分析期间不再强制关闭抽屉；完成时以通知提示「提案已就绪」，点击打开工作台
- [x] 结构失败与资产失败分开记录，资产失败不阻断分镜确认

**验收：** 长剧本分析中途中止，再次打开能看到已完成部分。

---

## 阶段 P2：资产沉淀（让每次分析都积累可复用资产）

### 任务 2.1 资产提取优先匹配母版库与剧本人物

**文件：** `[id]/lib/film-script-assets.ts`(+test)、`film/utils/film-ai-assets.ts`、`film/utils/film-library.ts`

- [x] 提案项增加匹配结果：画布已有 → 母版库已有（名称/别名归一化匹配）→ 新建
- [x] 母版库命中时默认「从母版导入副本」，生成的项目资产带 `sourceLibraryAssetId`，复用参考图、造型状态、场景变体
- [x] 剧本来源为工作台时，把工作台 `characters` 作为人物种子，AI 只补充场景/道具与别名
- [x] 把已知资产名与别名作为「已知资产表」传入资产提取提示词，要求 AI 归并到已知名称，减少重复与误分类
- [x] 测试：同名/别名命中库；跨类别同名给出提示而不是静默新建（对应 TODO「服装 ↔ 道具」风险）

**验收：** 在已有母版角色的账号下分析新剧本，角色直接复用母版参考图。

### 任务 2.2 应用后的「存入母版库」建议

**文件：** 导演分析应用回调、新增轻量确认面板组件、`stores/use-film-cast-store.ts`（只调用现有 `saveAsset`）

- [x] 应用成功后，若有新建资产，提示「N 项新资产可存入母版库」，打开清单逐项勾选（默认勾选角色与场景）
- [x] 存入后回写项目资产 `sourceLibraryAssetId`
- [x] 资产后续生成参考图后，上下文中心对「库中无此资产 / 项目副本比库新」给出存库/更新库入口（与现有检查器「存入母版库」同一动作）

**验收：** 一次分析后可批量把角色和场景存入母版库，另一个项目能导入。

### 任务 2.3 名称归并与别名词典

**文件：** `[id]/lib/film-script-assets.ts`、提案编辑相关组件、母版库写入

- [x] 用户在提案里改名、合并两项、改类别、补别名时，记录为归并规则（P3.2 已提供提案编辑；应用时写入 CanvasFilmMeta.assetAliases）
- [x] 对应母版库资产存在时，把新别名合并进 `FilmAsset.aliases`（需用户在应用时确认「同步别名到母版库」）
- [x] 项目级归并规则保存在项目元数据（`CanvasFilmMeta.assetAliases`，不新增表），下次分析作为已知资产表输入
- [x] 测试：合并后再次分析同一剧本，不再产生重复资产（别名命中画布资产复用同一节点）

**验收：** 「小王 / 王队长」合并一次后，后续分析自动归为同一角色。

### 任务 2.4 分析预设

**文件：** 调研现有账号级配置的存储与同步位置；新增预设读写；分析参数面板

- [x] 调研：确认账号级偏好（如 `use-config-store` 或现有 film 配置）能否承载预设并跨设备同步；结论写入本计划
  - 结论：新增 `use-film-analysis-preset-store`，使用与 AI 配置相同的 `accountLocalStorage` + zustand persist；不新增后端表。属于账号本地偏好，**不跨设备同步**；若后续需要跨设备，再评估后端账号偏好接口。
- [x] 支持保存/选择/设默认：节奏、目标时长、导演风格、镜头密度、是否提取资产
- [x] 项目最近一次使用的参数记在 `analysis.options`，下次默认带出

**验收：** 保存的预设在新建影视项目中可选并生效。

### 任务 2.5 画布剧本转存为剧本项目

**文件：** `canvas/components/canvas-film-inspector.tsx`、`app/(user)/script/stores/use-script-store.ts`、`services/script-film-publication.ts`

- [x] 无来源的画布剧本提供「转存为剧本项目」：按规则解析为集/场，创建剧本工作台项目并锁定、发布回当前画布，剧本节点转为来源模式
- [x] 转存过程复用 `importScriptPublicationForFilm` 的发布副本语义，不创建第二个影视项目

**验收：** 转存后在 `/script` 列表可见，修改并锁定后画布提示「来源有更新」。

---

## 阶段 P3：可编辑提案与分阶段分析

### 任务 3.1 分阶段分析管线

**文件：** `film/utils/film-ai-parse.ts`、`film/utils/film-ai-structure.ts`、`[id]/lib/film-director-analysis.ts`

- [x] 阶段 1 结构：复用 `structurePlan` 能力产出集/场/节拍；状态 `structure-ready`（当前一键流程自动继续分镜，未在 UI 停留该状态，结构计划保存在会话）
- [x] 阶段 2 分镜：按场请求，传入该场结构计划、导演风格、节奏；有限并发（如 3），单场失败记 `sceneErrors`
- [x] 阶段 3 资产：与阶段 2 并行，按任务 2.1 匹配
- [x] 「一键全部分析」连续执行三阶段，不在结构处停留
- [x] 单场「重新分镜」只替换该场草稿，保留其他场的人工修改
- [x] 测试：单场失败不影响其他场；重做后其他场草稿不变

**验收：** 3 万字剧本分析可看到逐场进度，单场失败可单独重试。

### 任务 3.2 可编辑提案

**文件：** 新增 `[id]/lib/film-analysis-draft.ts`(+test) 承载编辑命令；弹窗组件

- [x] 纯函数编辑命令：改场次名/地点/时间/气氛；改镜头镜号/景别/运镜/时长/描述/台词；新增、删除、排序、合并相邻镜头、拆分镜头；资产改名、改类别、合并、编辑别名、切换复用/新建
- [x] 每次编辑写回 `analysis.draft`（防抖），关闭后不丢
- [x] 编辑后重新计算问题列表（缺描述、重复镜号、时长偏差）

**验收：** 提案中修改的内容原样落图；刷新后修改仍在。

### 任务 3.3 AI 关联确认

**文件：** `film-director-analysis.ts`、镜头卡片/上下文中心、连线渲染

- [x] 提及匹配加最小长度（单字名不自动匹配）与归一化词边界规则，附命中依据
- [x] `source:"ai"` 的 context 边以虚线 + 「AI」标识渲染；镜头卡片显示「N 处待确认」
- [x] 提供接受全部 / 逐条接受 / 移除；接受后改为 `manual`
- [x] 上下文中心可筛选「AI 关联待确认」
- [x] 测试：单字角色名不产生误绑定；接受后边的 source 变化

**验收：** 应用后的提示链接能直达待确认清单。

---

## 阶段 P4：交互与视觉打磨

### 任务 4.1 导演分析工作台三栏布局

**文件：** `film-director-analysis-dialog.tsx`、`film-proposal-scene-browser.tsx`、`film-structure-proposal-dialog.tsx`、`film-asset-proposal-dialog.tsx`

```text
┌─ 大纲（集 > 场） ─┬─ 当前场镜头（可编辑） ─────────┬─ 检查 ──────────┐
│ ☑ 1-1 公路 6镜 新增 │ [01 全景 4s] 描述… ✎ ⋮合并/拆分  │ 时长条 vs 目标   │
│ ☑ 1-2 车内 8镜 更新 │ [02 近景 3s] …    拖拽排序       │ 问题（点击定位） │
│ ☐ 1-3 …  受保护    │ [＋ 加镜头] [↻ 重新分镜本场]      │ 本场资产         │
└──────────────────┴───────────────────────────┴─────────────────┘
 标签：分镜 ｜ 资产 ｜ 落图预览          底栏：方式[智能合并▾] 统计  [应用]
```

- [x] 「结构」「镜头」合并为「分镜」；删除重复统计
- [x] 资产标签：按类别分组卡片，标记「画布已有 / 母版库 / 新建」，支持合并与改类别；「资产 × 场次」矩阵预览关联
- [x] 落图预览：小地图按计划着色（新增/更新/保留/受保护/删除）
- [x] 键盘：J/K 切场、空格勾选、⌘/Ctrl+Enter 应用、Esc 关闭（草稿保留）
- [x] 窄屏（<1024）折叠为两栏，<768 单栏 + 抽屉检查（当前窄屏检查栏堆叠在下方，未做抽屉）

### 任务 4.2 视觉规范收敛

**文件：** 上述组件与 `film-node-card.tsx`；共享原语按 `64df64b` 现有组件优先

- [ ] 用共享按钮/标签/统计片/问题行替换导演分析与剧本抽屉中的重复内联样式（沿用现有内联样式，未抽公共原语）
- [x] 字号：正文 ≥12px、辅助 11px；标题与数字建立层级（辅助字号已统一到 11px，正文按现有 11/12px）
- [x] 统一状态色：新增、更新、受保护、删除、AI 待确认在弹窗、刷新预览、画布高亮三处一致；浅色主题逐项核对（弹窗与刷新预览已统一，画布仍用通用选中高亮，浅色主题未逐项截图）
- [x] 剧本节点卡片：元数据行（字数 · 集 · 场 · 来源 · 分析状态），正文按剧本排版（场景标题加粗）
- [x] 场次列头：场号、内外景、时间、气氛色条；镜头空缩略图按项目画幅比例
- [x] 所有空状态给出下一步动作

**验收：** 390 / 768 / 1180 / 1440 宽度与深浅主题截图核对（隐藏帧限制下的断点 change、hover 标注未实测）。

---

## 5. 浏览器验收清单（全部阶段完成后）

在临时影视项目中完成，结束后删除测试项目：

1. 空剧本节点 → 拖入 docx → 卡片显示字数与预估场次。
2. 选择预设发起导演分析 → 中途关闭弹窗、刷新页面 → 从卡片继续确认。
3. 编辑提案：改场次名、合并两个镜头、单场重新分镜、合并两个资产别名。
4. 母版库已有角色被识别为「复用母版」。
5. 智能合并应用 → 视口定位与高亮 → 撤销 → 重新应用。
6. 为若干镜头生成分镜图 → 修改正文 → 卡片显示过期 → 重新分析 → 带图镜头进入受保护且未被删除。
7. 确认 / 移除 AI 关联；上下文中心筛选待确认。
8. 新资产批量存入母版库，另一项目导入成功。
9. 画布剧本转存为剧本项目 → 工作台修改锁定 → 画布提示来源更新 → 差异预览 → 合并。
10. 「整理布局」后节点无重叠，位置与落图一致。
11. 通用画布、漫画、发布与 Agent 回归不受影响。

## 6. 风险与控制

| 风险 | 控制 |
|---|---|
| AI 结果没有稳定 ID，智能合并误匹配 | 匹配规则做成纯函数并充分单测；预览中显示匹配依据；不确定的匹配归为「新增 + 保留旧」而非覆盖 |
| 草稿存入项目文档导致体积膨胀 | 只保留最近一次；应用后清空 draft；超大草稿（如 >500 镜）提示并截断编辑历史 |
| 分阶段增加 AI 调用次数与成本 | 结构阶段轻量；逐场请求有限并发；「一键全部分析」与积分提示复用现有估算 |
| 资产沉淀误写母版库 | 一律建议 + 确认；覆盖库条目沿用现有「库较新」警告 |
| 与导演板 spec 目标冲突 | 本计划不新增一级视图，仅深化剧本节点与导演分析中心；落图默认动作对齐 spec「AI 结果先进入 transient proposal」 |
| 编辑器文件继续膨胀（`canvas-editor.tsx` 3100+ 行） | 分析会话、落图计划、编辑命令全部放 `lib/` 纯函数，编辑器只做编排；必要时抽 `use-film-director-analysis` hook |

## 7. 不在本计划范围

- 关闭页面后 AI 分析在后台继续（需要服务端任务化，另行设计）。
- 多人协作审阅提案、提案评论。
- 镜头级「分镜偏好学习」（从用户修正中自动学习镜头风格），可在资产沉淀稳定后评估。
- 剧本工作台本身的编辑器改造。
