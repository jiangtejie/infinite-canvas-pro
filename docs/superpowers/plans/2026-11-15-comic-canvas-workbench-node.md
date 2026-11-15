# 漫画册画布工作台节点实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将画布漫画册节点升级为轻量工作台状态卡，支持可靠的项目状态展示、漫画册与页图双向高亮、缩略图定位，以及不隐式覆盖贴字的项目关联流程。

**Architecture:** `CanvasComicBook` 继续作为画布册唯一数据源；漫画项目阶段和进度从已 hydration 的本地 `useComicStore` 派生，不将派生状态复制进节点 metadata。纯函数负责解析互相独立的项目关联状态、漫画册页面槽位和高亮关系；画布舞台把这些结果连接到现有 `focusNode`、漫画册 overlay 和漫画项目路由。项目关联只维护 ID 映射，贴字同步独立确认并按映射执行。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Ant Design、Tailwind CSS、`bun test`（Node `node:test` / `node:assert`）。不新增依赖。

**Spec:** `docs/superpowers/specs/2026-11-15-comic-canvas-workbench-node-design.md`

## Global Constraints

- 漫画工作台负责企划、角色、场景、剧本、页格生产和拼合；画布漫画册负责画布页面编排、贴字和最终导出。
- 不在漫画册卡片内加入页格编辑器、拖拽排序或完整项目编辑。
- 不新增第二套贴字参数、成品导出实现或导出预设。
- 不为 `comicBook.pageNodeIds` 创建重复 `CanvasConnection`。
- 项目不可用时保留 `comicProjectId`、`pageProjectIds` 和画布册独立能力；页面丢失时保留引用，不自动删除或重排。
- 项目关联与贴字同步是两个明确动作；项目关联不得覆盖 `lettering`、页序、封面或导出预设。
- 项目 `stage` 为已有持久状态，快捷入口打开项目时沿用该阶段，不临时修改项目阶段。
- 遵守 `AGENTS.md`：前端文案用中文；本项目要求实现前先获得用户明确许可；只运行定向 `bun test`，不运行 build、typecheck 或 lint；隐藏帧下无法真实观察的 hover、rAF、定时行为不得标为已实测。
- 本计划不授权创建 commit；只有用户之后明确要求提交时才提交。

---

## 文件结构与职责

### 新增

- `web/src/app/(user)/canvas/utils/comic-book-state.ts`：按漫画册引用解析有序页面槽位、提供项目状态/进度/主操作纯函数；项目 store 由节点卡片直接订阅。

- `web/src/app/(user)/canvas/utils/comic-book-state.test.ts`：状态组合、槽位顺序、项目进度、主操作优先级测试。
- `web/src/app/(user)/canvas/utils/comic-book-relations.ts`：扩展现有高亮集合的漫画册—页面引用关系纯函数。
- `web/src/app/(user)/canvas/utils/comic-book-relations.test.ts`：双向高亮、多漫画册共享页面、缺失引用测试。
- `web/src/app/(user)/canvas/utils/comic-book-project-link.ts`：项目页映射、关联、贴字同步结果和缺页槽位修复纯函数。
- `web/src/app/(user)/canvas/utils/comic-book-project-link.test.ts`：映射保序、关联不覆盖、贴字按显式映射、缺页修复保留槽位数据测试。

### 修改

- `web/src/app/(user)/canvas/components/canvas-comic-book-node-card.tsx`：工作台状态卡、最多 3 张定位缩略图、一个主动作、一个次动作和“更多”菜单。
- `web/src/app/(user)/canvas/[id]/components/canvas-stage-layer.tsx`：提供漫画项目列表/hydration 状态、页图槽位、选中图片和节点动作回调。
- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`：计算状态和双向高亮，向舞台提供现有 `focusNode`、漫画册 overlay、项目路由和项目关联回调。
- `web/src/app/(user)/canvas/components/canvas-comic-book-overlay.tsx`：用页面槽位显示有效页和缺页；支持同一面板从默认模式或贴字模式打开；拆开项目关联和贴字同步。
- `web/src/app/(user)/comic/utils/comic-canvas-import.ts` 与对应测试：复用稳定页面映射函数，保持现有项目导入/更新布局行为。
- `docs/progress/pending-test.md`：实现完成后记录待用户验收项，不更新 `features.md`，直到用户验收。

---

## Task 1: 项目状态、页面槽位和主动作解析

**Files:**
- Create: `web/src/app/(user)/canvas/utils/comic-book-state.ts`
- Create: `web/src/app/(user)/canvas/utils/comic-book-state.test.ts`
- Reference: `web/src/app/(user)/canvas/types.ts`
- Reference: `web/src/app/(user)/comic/types.ts`
- Reference: `web/src/app/(user)/comic/utils/comic-project.ts`

**Interfaces:**

```ts
export type ComicProjectLinkState =
    | { kind: "loading" }
    | { kind: "standalone" }
    | { kind: "project-missing"; projectId: string }
    | { kind: "linked"; project: ComicProject; progress: ComicProjectProgress };

export type ComicPageSlot =
    | { pageNodeId: string; kind: "available"; page: CanvasNodeData }
    | { pageNodeId: string; kind: "missing" };

export type ComicProjectProgress = {
    stage: ComicStage;
    totalPages: number;
    composedPages?: number;
    approvedPages?: number;
};

export type ComicBookPrimaryAction =
    | "add-selected-pages"
    | "handle-missing-pages"
    | "continue-layout"
    | "continue-review"
    | "open-book";

export function resolveComicPageSlots(input: {
    pageNodeIds: string[];
    nodes: CanvasNodeData[];
}): { pageSlots: ComicPageSlot[]; validPages: CanvasNodeData[]; missingPageIds: string[] };

export function resolveComicProjectLinkState(input: {
    projectId?: string;
    projects: ComicProject[];
    projectsHydrated: boolean;
}): ComicProjectLinkState;

export function resolveComicProjectProgress(project: ComicProject): ComicProjectProgress;

export function resolveComicBookPrimaryAction(input: {
    project: ComicProjectLinkState;
    pageSlots: ComicPageSlot[];
    selectedImageCount: number;
}): ComicBookPrimaryAction;
```

项目状态和页面状态必须正交。例如 `project.kind === "project-missing"` 与 `pageSlots` 中存在 `kind === "missing"` 可以同时出现。

- [ ] **Step 1: 写页面槽位失败测试**

在 `comic-book-state.test.ts` 构造一个引用顺序为 `image-a, gone, image-b` 的漫画册；nodes 中放入两张有 `metadata.content` 的图片和一个同 ID 的无内容节点。测试按现有 Node test 风格写成：

```ts
test("preserves missing comic page slots in book order", () => {
    const state = resolveCanvasComicBookState({
        node: comicNode(["image-a", "gone", "image-b"]),
        nodes: [imageNode("image-a"), imageNode("gone", ""), imageNode("image-b")],
        projects: [],
        projectsHydrated: true,
        selectedImageCount: 0,
    });
    assert.deepEqual(state.pageSlots.map((slot) => slot.kind), ["available", "missing", "available"]);
    assert.deepEqual(state.missingPageIds, ["gone"]);
    assert.deepEqual(state.validPages.map((page) => page.id), ["image-a", "image-b"]);
});
```

在同一测试文件提供 `comicNode(ids)` 与 `imageNode(id, content = "data:image/png;base64,test")` 两个小型 fixture helper，分别返回 `CanvasNodeData` 的 Comic 节点和 Image 节点。

- [ ] **Step 2: 运行定向测试确认 RED**

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-state.test.ts'`
Expected: FAIL，因为状态解析模块尚不存在。

- [ ] **Step 3: 实现槽位解析**

按原始 `pageNodeIds` 遍历，每个 ID 都生成一个槽位；仅接受 `CanvasNodeType.Image` 且 `metadata.content` 非空的节点为有效页；不得排序、去重或过滤槽位。

- [ ] **Step 4: 写独立与关联状态失败测试**

至少覆盖 `resolveComicProjectLinkState`：store 未 hydration 返回 `loading`；没有项目 ID 返回 `standalone`；hydration 完成但项目 ID 未命中返回 `project-missing`；项目存在返回 `linked`。页面槽位 helper 单独运行；验证两者可以组合成“项目缺失 + 缺页”状态，不互相覆盖。

- [ ] **Step 5: 实现项目进度解析**

总页数取项目章节页面总数；合成数取 `pageImage` 存在的页；通过数按页面有效审稿状态为 `approved` 计数。只在 `layout` 阶段提供合成数，只在 `review` 阶段提供通过数。项目 stage、hydrated 和项目查找由 `CanvasComicBookNodeCard` 直接从 `useComicStore` 读取后传给这些纯函数，不从页面层层透传 projects。

- [ ] **Step 6: 写主动作优先级失败测试**

断言优先级为：无引用页且选中图片数大于 0 → `add-selected-pages`；存在缺页 → `handle-missing-pages`；linked + layout 且未全部合成 → `continue-layout`；linked + review 且仍有未通过页 → `continue-review`；其他情况 → `open-book`。无选中图的空册主动作是 `open-book`，加入图片作为禁用次动作显示。

- [ ] **Step 7: 实现状态和主动作解析并运行定向测试确认 GREEN**

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-state.test.ts'`
Expected: 所有状态、槽位和主动作测试 PASS。

任务 4 卡片动作按独立纯函数测试：无引用页且有选中图片时主动作是 `add-selected-pages`；缺页优先 `handle-missing-pages`；有效 linked/layout 且有未合成页时 `continue-layout`；有效 linked/review 且有未通过页时 `continue-review`；其他情况 `open-book`。`直接贴字` 仅在有有效页面时显示；卡片主动作一项、次动作一项，其余进入“更多”。

## Task 2: 漫画册与页面图片双向高亮

**Files:**
- Create: `web/src/app/(user)/canvas/utils/comic-book-relations.ts`
- Create: `web/src/app/(user)/canvas/utils/comic-book-relations.test.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

**Interface:**

```ts
export function expandComicBookPageRelations(input: {
    activeNodeId: string | null;
    nodes: CanvasNodeData[];
    baseNodeIds: Set<string>;
    baseConnectionIds: Set<string>;
}): { nodeIds: Set<string>; connectionIds: Set<string> };
```

- [ ] **Step 1: 写漫画册选中高亮失败测试**

漫画册引用两张有效图和一个缺失 ID；基础集合只含漫画册 ID。断言结果包含漫画册和两张有效图，不包含缺失 ID，`connectionIds` 与输入完全相同。

- [ ] **Step 2: 运行定向测试确认 RED**

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-relations.test.ts'`
Expected: FAIL，因为关系扩展 helper 尚不存在。

- [ ] **Step 3: 写页面反向高亮和共享页面失败测试**

活动页图被两个漫画册引用；断言结果包含活动页、两个漫画册和两册的有效页图，且不添加 synthetic connection ID。

- [ ] **Step 4: 实现纯关系扩展 helper**

从基础显式连线集合开始；若活动节点为漫画册，将它引用的现存节点加入高亮；若活动节点是被引用页面，将所有引用它的漫画册及其现存页图加入高亮。`connectionIds` 只能来自现有基础集合。

- [ ] **Step 5: 接入 `relatedHighlight` 并运行定向测试**

在 `canvas-client-page.tsx` 保留当前显式 connections 计算，再调用 helper 扩展节点集合。不得写入 `connections` 状态或创建新边。

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-relations.test.ts' 'src/app/(user)/canvas/[id]/lib/canvas-graph.test.ts'`
Expected: PASS。

## Task 3: 项目映射、关联与贴字同步纯逻辑

**Files:**
- Create: `web/src/app/(user)/canvas/utils/comic-book-project-link.ts`
- Create: `web/src/app/(user)/canvas/utils/comic-book-project-link.test.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-canvas-import.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-canvas-import.test.ts`
- Reference: `web/src/app/(user)/comic/utils/comic-project.ts`

**Interfaces:**

```ts
export function mapComicBookPagesToProjectPages(
    pageNodeIds: string[],
    projectPages: ComicPage[],
): Record<string, string>;

export function associateComicProject(
    book: CanvasComicBook,
    projectId: string,
    projectPages: ComicPage[],
): CanvasComicBook;

export function buildComicLetteringSync(input: {
    book: CanvasComicBook;
    pageSlots: ComicPageSlot[];
    project: ComicProject;
}): {
    lettering: Record<string, ComicLetterElement[]>;
    pageProjectIds: Record<string, string>;
    mappedPages: number;
    unmappedPages: number;
    updatedPages: number;
    overwrittenPages: number;
    emptyContentPages: number;
};

export function replaceMissingComicBookPage(input: {
    book: CanvasComicBook;
    missingPageNodeId: string;
    replacementImageNode: CanvasNodeData;
}): { book: CanvasComicBook; replaced: boolean };
```

- [ ] **Step 1: 写映射 helper 失败测试**

输入页面节点顺序 `node-b, node-a` 与项目页 `page-1, page-2, page-3`；断言映射结果分别为 `node-b -> page-1`、`node-a -> page-2`，额外项目页不加入映射。

- [ ] **Step 2: 运行定向测试确认 RED**

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-project-link.test.ts'`
Expected: FAIL，因为映射模块尚不存在。

- [ ] **Step 3: 写关联保留测试**

用已有 `lettering`、反向页序、封面和导出预设构造 `CanvasComicBook`；调用关联函数后，深比较除 `comicProjectId` 和 `pageProjectIds` 外字段未改变；确保函数不修改输入对象。

- [ ] **Step 4: 实现保序映射和显式关联 helper**

映射使用传入的 `pageNodeIds` 顺序与项目章节展平页序；只映射两边较短的一侧；关联函数浅拷贝 book 并只替换项目 ID 与映射。

- [ ] **Step 5: 写贴字同步映射失败测试**

构造 `pageNodeIds` 顺序与项目原始页序不同、但 `pageProjectIds` 明确映射的漫画册；断言同步根据映射而非数组索引找项目页，未映射页计入 `unmappedPages`，实际会写入的新贴字页计入 `updatedPages`，其中已有贴字页计入 `overwrittenPages`。再构造项目页无对白/旁白/拟声但漫画册已有贴字的案例，断言此页不清空旧贴字并计入 `emptyContentPages`。

- [ ] **Step 6: 实现纯贴字同步结果构建**

复用现有 `comicPanelRect` 和气泡默认规则；只处理存在显式 `pageProjectIds` 且图片节点有效的页面；没有映射时不猜测索引、不覆盖。只在项目页产生至少一个贴字元素时写入该页，保持既有“空白项目页不擦除已有贴字”的行为。返回贴字快照和 `updatedPages`、`unmappedPages`、`overwrittenPages`、`emptyContentPages` 计数，不调用 store、不写入节点。

- [ ] **Step 7: 复用映射函数于 `buildComicCanvasImport` 和 `buildComicCanvasUpdate`**

保持现有页图节点布局、更新、保留贴字/封面行为；仅把 `pageProjectIds` 生成统一到新 helper，并补充已有导入测试断言。

- [ ] **Step 8: 运行映射与回写定向测试**

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-project-link.test.ts' 'src/app/(user)/comic/utils/comic-canvas-import.test.ts' 'src/app/(user)/comic/utils/comic-canvas-writeback.test.ts'`
Expected: PASS。

## Task 4: 工作台状态卡与画布动作接线

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-comic-book-node-card.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-stage-layer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/utils/comic-book-state.ts`
- Modify: `web/src/app/(user)/canvas/utils/comic-book-state.test.ts`

**Card Interface:**

```ts
type CanvasComicBookNodeCardProps = {
    node: CanvasNodeData;
    state: CanvasComicBookViewState;
    selectedImageCount: number;
    onOpenBook: () => void;
    onEnterLettering: () => void;
    onOpenProject: (projectId: string) => void;
    onAddSelectedPages: () => void;
    onFocusPage: (pageNodeId: string) => void;
    onHandleMissingPages: () => void;
    onAssociateProject: () => void;
};
```

- [ ] **Step 1: 定义主动作和动作可用性测试**

扩展 `comic-book-state.test.ts` 覆盖主动作优先级，并单独断言 `open-project`、`enter-lettering`、`associate-project` 是否只在所需状态可用。项目缺失时允许打开画布册，关联按钮文案为“重新关联”。

- [ ] **Step 2: 重构节点卡片外观与动作优先级**

在原节点默认尺寸内展示标题/状态、封面与最多 3 张页面缩略图、画布册有效页数/格式/方向、独立的项目阶段/统计、缺页数。卡片只保留一个主按钮、一个次按钮和“更多”菜单：主按钮按 resolver 的 `primaryAction`；次按钮在有有效页面时为“直接贴字”，空册时为“打开漫画册”；项目跳转、关联/重新关联、加入选中图片和其余页面管理动作放入“更多”。空册且没有选中图片时“加入选中图片”禁用；没有有效页时隐藏贴字动作。

- [ ] **Step 3: 为缩略图建立可访问语义**

每个缩略图使用原生 button；aria-label 包含页码和图片节点标题；点击事件停止指针/鼠标向节点拖动处理器冒泡，然后只调用 `onFocusPage(pageNodeId)`。

- [ ] **Step 4: 在 `CanvasClientPage` 连接 store 和动作**

读取 `useComicStore` 的 `projects` 与 `hydrated`；以当前 comic node 和 nodes 调用纯状态 resolver。`onOpenProject` 使用现有 router 推到 `/comic/{id}`；`onFocusPage` 调用现有 `focusNode`；加入选中图片只追加有效 image IDs，排除已引用 ID，若旧封面为空则按加入顺序首图设封面，保留其他书籍字段。

- [ ] **Step 5: 传递舞台 props 并运行定向单测**

由 `CanvasStageLayer` 从现有 `selectedNodeIds` 与 `nodes` 计算 `selectedImageCount`，将状态和明确回调传给 `CanvasComicBookNodeCard`。依仓库约束不运行 typecheck/build/lint；运行 Task 1–3 的定向单测，捕获纯逻辑回归。

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-state.test.ts' 'src/app/(user)/canvas/utils/comic-book-relations.test.ts' 'src/app/(user)/canvas/utils/comic-book-project-link.test.ts' 'src/app/(user)/canvas/[id]/lib/canvas-clone.test.ts'`
Expected: PASS。

## Task 5: 缺页修复与项目关联/贴字同步分离

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-comic-book-overlay.tsx`
- Modify: `web/src/app/(user)/canvas/utils/comic-book-project-link.ts`
- Modify: `web/src/app/(user)/canvas/utils/comic-book-project-link.test.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] **Step 1: 为缺页槽位修复写失败测试**

`replaceMissingComicBookPage(book, missingId, selectedImageNode)` 应仅在旧 ID 存在于 `pageNodeIds`、新节点是有效图片且新 ID 未被引用时替换该槽位；保留页序与封面归属；将旧 ID 的 `pageProjectIds` 和 `lettering` 映射迁移到新 ID。传入不符合条件的节点时原对象不变并返回失败结果。

- [ ] **Step 2: 运行定向测试确认 RED，然后实现最小 helper**

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-project-link.test.ts'`
Expected: 新测试先因 helper 缺失失败；实现后通过。

`replaceMissingComicBookPage` 必须拒绝：旧 ID 不在 `pageNodeIds`、replacement 不是有内容的 Image 节点、replacement ID 已被其他槽位引用。成功时只返回不可变的新 book，不直接写 store。

- [ ] **Step 3: 将 overlay 缩略图列表改为页面槽位**

从原始 `pageNodeIds` 建立有序 slots；有效 slot 保持现有图片操作，missing slot 显示占位、页码和“移除此引用”。明确区分两种用户动作：

- “移除此引用”调用现有 `removePage(missingId)`，只从 `pageNodeIds` 移除该 ID，并清除该 ID 的贴字/映射键；不删除任何节点或文件。
- “替换此缺页”只能从用户当前选中的有效图片中选择一个尚未被引用的节点，调用纯 helper 替换原槽位；保持页序与封面归属，并迁移旧槽位的 `pageProjectIds` 与 `lettering` 键到新节点 ID。

页面预览区遇到 missing slot 显示缺页占位，不把后续页面悄悄前移。已有贴字随替换迁移到新图片仍需通过 UI 文字告知用户，替换前必须二次确认。

- [ ] **Step 4: 增加 overlay 初始模式参数**

保持现有默认打开行为；`initialMode="lettering"` 时将 `letteringMode` 初始化为 true，并强制页漫单页模式。当前 `CanvasOverlay` 只有 comic node ID，打开意图应通过稳定的 overlay mode 字段传递，且不同初始模式必须视为不同 overlay 状态，保证 React 能重置本地面板状态。漫画册节点每次打开时按 `comicBook.comicProjectId` 初始化项目选择；节点 ID 或 overlay 打开代次变化时重置本地选择，避免复用同一组件后显示上一次漫画册的项目选择。卡片“直接贴字”调用同一 comic overlay，不生成额外面板。

- [ ] **Step 5: 拆分两个项目操作**

“关联项目”对话框只选择本机项目并调用 `associateComicProject` 写 `comicProjectId/pageProjectIds`；不调用贴字同步。已有不同项目 ID 时先明确确认替换映射。独立的“同步项目贴字”动作调用 `buildComicLetteringSync`，确认描述包含将更新页数、已有贴字将覆盖页数、未映射页数和无文字而保留现有贴字页数；取消时不调用 `onChange`。

- [ ] **Step 6: 添加可独立断言的取消与映射测试**

纯函数测试确认 sync builder 不改变输入 book；UI 交互通过浏览器验证确认取消路径不调用更新、确认路径只写 `lettering/pageProjectIds`。

- [ ] **Step 7: 跑漫画关联、导入和回写定向单测**

Run from `web/`: `bun test 'src/app/(user)/canvas/utils/comic-book-project-link.test.ts' 'src/app/(user)/comic/utils/comic-canvas-import.test.ts' 'src/app/(user)/comic/utils/comic-canvas-writeback.test.ts' 'src/app/(user)/canvas/[id]/lib/canvas-clone.test.ts'`
Expected: PASS。

## Task 6: 浏览器验收与待测记录

**Files:**
- Modify: `docs/progress/pending-test.md`
- Do not modify: `docs/overview/features.md` until user confirms acceptance.

- [ ] **Step 1: 运行前端定向测试全集**

Run from `web/`: `bun test`
Expected: 全部通过；记录实际测试数。遵守 `AGENTS.md`，不运行 build、typecheck 或 lint。

- [ ] **Step 2: 检查服务可用性后使用 ego-browser**

先确认前端 3000 与后端 8080 的监听及首页/API 响应；若服务缺失，仅使用仓库现有 `bun run dev` 和 `go run .` 启动本项目服务，不停止不属于本项目的端口进程。

- [ ] **Step 3: 验证节点状态**

使用临时/可清理的画布 fixture 验证空册、独立漫画册、store loading、已关联项目、项目不存在、缺页及“项目不存在 + 缺页同时发生”。不得在用户真实漫画项目或画布中留下测试数据。

- [ ] **Step 4: 验证画布空间交互**

选中/悬停漫画册确认页图高亮；选中页面图确认反向高亮；点击缩略图确认视口聚焦并选中目标页、漫画册仍按关系高亮；确认不新增连线、不改变页序/封面/贴字。覆盖键盘操作和低缩放；隐藏帧不能观察的 hover 时序标记“未实测”。

- [ ] **Step 5: 验证缺页修复和项目动作**

删除 fixture 中的一页节点后确认保留缺页槽位；替换缺页确认槽位/页序/封面/映射/贴字按 helper 规则保留；移除引用必须由明确操作触发。确认关联项目不改贴字，取消贴字同步不改数据，确认同步使用 `pageProjectIds`。

- [ ] **Step 6: 回归原漫画册功能**

验证加入选中图片、页面排序/移除、设封面、单/双页和条漫预览、贴字、CBZ/PDF/长图导出、复制整册与仅复制册节点；检查 390px 布局、浅/深主题及低画布缩放。

- [ ] **Step 7: 更新 pending-test 记录并检查清理结果**

只记录实际完成的浏览器操作和未实测限制；删除/清理仅限本轮创建的临时 fixture。未获用户验收前不改 `features.md`。

## Self-review coverage

- 节点卡片状态、信息层级和主要/次要动作：Tasks 1、4。
- 项目关联状态与页槽状态正交、loading precedence、独立页数：Task 1。
- 选中/悬停双向高亮、无重复连线、缩略图聚焦：Tasks 2、4、6。
- 空册加入图片、缺页槽位替换/移除、保序与关联数据保留：Tasks 1、4、5。
- 关联项目与贴字同步分离、按 `pageProjectIds` 同步：Tasks 3、5。
- 复制、删除、低缩放、响应式及现有预览/贴字/导出回归：Task 6。
- 待验收记录与禁止过早更新正式功能说明：Task 6。
