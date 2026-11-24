# Comic as Canvas 漫画并入画布设计

> 状态：2026-11-24 已实施并待人工验收；旧独立漫画项目系统已删除，comic domain 漫画册贴字/导出、JSON 备份和页格手动续跑已接入。
>
> 硬约束：一个漫画项目 = 一个 `CanvasProject`；旧漫画数据不迁移；不新增第二套 store、同步域或持久化任务链。漫画工作台只作为画布内的领域视图存在。

## 1. 目标与非目标

### 1.1 目标

1. 漫画项目与普通画布、影视项目共用 `CanvasProject`、项目同步、素材与媒体链路。
2. 保留漫画领域交互：企划、角色/场景、剧本、页格、整页合成、审稿、贴字与导出。
3. 漫画册节点与页节点成为同一份画布文档的可见编排；取消 `ComicProject ↔ CanvasComicBook` 双向同步。
4. `/comic` 保留为漫画项目入口，`/comic/library` 保留为漫画角色/场景母版库。
5. 删除 `useComicStore`、`comic-projects` 同步域、画布导入/回写/同步弹窗，以及对应的旧路由和项目壳。

### 1.2 非目标

- 不迁移已存在的本地/账号漫画项目；项目尚未上线，按项目规则硬切。
- 不复制 SketchShot 或其他外部漫画工具的完整工具箱。
- 不新增独立漫画后端项目表、第二套任务队列或第二套提示词编译器。
- 不改影视、通用画布、发布、素材源等非漫画领域的行为。

## 2. 当前问题与设计依据

当前漫画工作台和画布漫画册是两套项目模型：

- `/comic` 使用 `useComicStore` 保存完整 `ComicProject`，包含章节、页、页格、角色、场景、合成页和审稿状态；账号同步走 `comic-projects` 域。
- 画布 `CanvasComicBook` 节点自己保存 `pageNodeIds`、封面、格式、方向、贴字、导出预设，并通过 `comicProjectId/pageProjectIds` 关联工作台页面。
- 两侧靠 `comic-canvas-import`、`comic-canvas-writeback`、`ComicCanvasSyncDialog` 维持映射，出现“项目页数”和“画布册页数”两套口径。
- 漫画角色/场景库（`useComicCastStore`）是母版库，与项目内角色/场景副本是合理的两层；本次只收敛项目真源，不合并母版库。

结论：漫画领域流程有独立价值，但独立项目系统冗余。应把工作台降为画布视图，把项目数据收敛到画布文档。

## 3. 核心模型

### 3.1 项目

一个漫画项目是一份 `CanvasProject`：

```ts
type CanvasProjectDomain = "film" | "comic";

type CanvasProject = {
    ...
    domain?: CanvasProjectDomain;
    comic?: CanvasComicMeta;
};

type CanvasComicMeta = {
    bookNodeId: string;
    stage: "concept" | "cast" | "script" | "layout" | "review";
    format: "page" | "strip";
    direction: "rtl" | "ltr";
    genre: string;
    audience: string;
    targetPages?: number;
    logline: string;
    synopsis: string;
    styleGuide: string;
    status: "draft" | "completed";
    chapterOrder: { id: string; title: string }[];
    cast: {
        characters: ComicCharacter[];
        locations: ComicLocation[];
    };
};
```

- `comic` 只保存项目级元数据与角色/场景副本，不保存 pages 数组。
- `ComicProject` 保留为**非持久化视图投影**，供现有企划/设定/剧本/页格/审稿组件使用；禁止再写入本地 store。
- `bookNodeId` 指向项目唯一漫画册节点。

### 3.2 漫画页节点

新增专用 `CanvasNodeType.ComicPage`：

```ts
type ComicPageNodeData = {
    title: string;
    summary: string;
    chapterId: string;
    panels: ComicPanel[];
    reviewStatus: "draft" | "pending" | "approved" | "changes";
    reviewNotes: string;
    pageImage?: ComicImageRef;
    compositionContext?: {
        stalePanelIds: string[];
        unrecordedPanelIds: string[];
        incompletePanelIds: string[];
        confirmedAt?: string;
    };
    pendingPanelTask?: {
        panelId: string;
        taskId: string;
        startedAt: number;
    };
};
```

- 页是唯一真源：页格、审稿、合成页图都挂在页节点 `metadata.comicPage`。
- 页序只来自漫画册节点 `pageNodeIds`；章节序来自 `comic.chapterOrder`，页通过 `chapterId` 归属章节。
- 页格图保存在 `ComicPanel.image`，不拆成第二套页格节点。

### 3.3 漫画册节点

现有 `CanvasNodeType.Comic` 继续作为书节点，但简化：

```ts
type CanvasComicBook = {
    pageNodeIds: string[];
    coverNodeId?: string;
    lettering?: Record<string, ComicLetterElement[]>;
    exportPreset?: ComicExportPreset;
};
```

- 删除 `comicProjectId`、`pageProjectIds`。
- 格式/方向以 `CanvasProject.comic.format/direction` 为唯一来源，不在书节点重复保存。
- 一个漫画项目只允许一个书节点；`comic.bookNodeId` 是唯一指针。

### 3.4 母版库

`useComicCastStore`、`/comic/library`、`comic-cast` 同步域保留：

- 母版库存放跨项目角色/场景。
- 项目内副本存 `comic.cast`。
- 母版库使用统计改为扫描 `CanvasProject domain=comic` 的项目副本与页格绑定。

## 4. IA 与路由

```text
创作工作台
  └─ 漫画（/comic）
       ├─ 漫画项目列表：读 CanvasProject domain=comic
       ├─ 新建漫画 -> /comic/studio/[id]
       ├─ /comic/library：漫画角色与场景母版库
       └─ /comic/studio/[id] -> CanvasEditor（comic domain）
            ├─ 漫画册：画布书节点/页节点、贴字、导出
            └─ 漫画工作台：企划 / 设定 / 剧本 / 页格 / 审稿
```

- 导航入口建议标签从“漫画工作台”改为“漫画”或“漫画项目”；项目内视图仍叫“漫画工作台”。
- `/comic/[id]` 旧项目页删除，不做重定向或旧数据迁移。
- `/comic/studio/[id]` 复用 `CanvasEditor studio`，由 `project.domain` 决定漫画壳层。
- 漫画项目不出现在普通画布列表、首页最近画布或影视列表；项目卡按 `domain` 过滤。

## 5. 视图与交互

### 5.1 漫画册视图

- 复用画布舞台、书节点、页节点、选择、拖拽、缩放。
- 书节点卡显示页槽、封面、缺页、页数/审稿进度；不再显示“关联漫画项目”“项目不在本机”等双系统状态。
- 页节点点击进入漫画工作台“页格”阶段并选中该页；书节点进入贴字/导出。
- 页序、封面、贴字、导出直接读写书节点和页节点，不再经过同步对话框。

### 5.2 漫画工作台视图

漫画域顶部只保留两个一级视图：**漫画册 / 漫画工作台**。工作台内部保留五阶段：

- 企划：题材、受众、格式、方向、logline、风格指南。
- 设定：角色、场景、变体、参考槽位、母版库导入/更新。
- 剧本：章节、页、页格、AI 拆页。
- 页格：页格布局、逐格生成、整页合成。
- 审稿：页状态、问题、备注、通过/退回。

阶段状态保存在 `comic.stage`。编辑页格、布局、重新出图或格式/风格变化时自动退回草稿，沿用现有规则。

## 6. 数据流与命令

- 新建：`createComicCanvasProject` 创建 `CanvasProject + 漫画册节点 + comic meta`，默认企划阶段。
- 视图读写：`selectComicProject(project)` 从画布投影出非持久化 `ComicProject`；`applyComicProject(project, next)` 把变更写回页节点、书节点和 comic meta。现有五阶段组件继续使用 `ComicProject` 视图模型。
- 页格生成：保留现有页内顺序生成流程，结果写入页节点；不新增独立漫画任务 store。刷新续跑作为后续增强，不阻塞本次项目收敛。
- 整页合成：写页节点 `pageImage` 和 `compositionContext`。
- 审稿：写页节点 `reviewStatus/reviewNotes`。
- 贴字：书节点 `lettering[pageNodeId]` 直接回写对应页节点页格台词/旁白/拟声，不再维护 `pageProjectIds`。
- 同步：漫画项目随 `CanvasProject` 同步；删除 `comic-projects` 同步域与 API，保留 `comic-cast` 母版库同步。
- 素材使用统计：扫描 `CanvasProject domain=comic` 的 `comic.cast` 与页格绑定。

## 7. 删除与保留

### 删除

- `web/src/app/(user)/comic/[id]` 旧项目页与独立壳。
- `useComicStore`、`COMIC_STORE_KEY`、`comic-projects` 同步域、后端漫画项目接口/表/字段。
- `comic-canvas-sync-dialog.tsx`、`comic-canvas-import.ts`、`comic-canvas-writeback.ts` 及其测试。
- `CanvasComicBook.comicProjectId/pageProjectIds`、书节点上的项目关联状态与“关联项目”动作。
- 普通画布列表、首页最近画布、项目卡中的漫画项目混排。

### 保留

- 漫画领域类型、AI 拆页、角色绑定、图片槽位、生成上下文、页合成、贴字、导出。
- `/comic/library`、`useComicCastStore` 与 `comic-cast` 同步。
- 画布漫画册的贴字、翻页、CBZ/PDF/条漫导出。
- 现有五阶段编辑器，通过投影适配器接入画布。

## 8. 分阶段实施

1. **契约与纯逻辑**：domain、comic meta、ComicPage 节点、书节点校验、投影/提交适配器、页/章节派生。先写纯逻辑测试。
2. **项目与节点**：画布 store 增加 `createComicProject`；页节点工厂、卡片、渲染；漫画项目改走画布同步。
3. **视图壳**：`CanvasEditor` 增加 comic domain；漫画册/漫画工作台双视图；书卡与页卡。
4. **阶段迁移**：五阶段组件通过投影适配器接入；贴字直接回写；移除同步桥。
5. **删除与验收**：`/comic` 列表切画布 store，删除旧路由/store/API/桥接；全量测试、typecheck、lint 与浏览器验收。

## 9. 验收

主链：新建漫画 → 企划 → 设定（母版库导入/更新）→ 剧本/AI 拆页 → 页格生成 → 整页合成 → 漫画册页序/贴字/导出 → 刷新或重新登录后数据与任务仍一致。

回归：

- 普通画布列表不出现漫画项目；漫画列表不出现普通画布或影视项目。
- 影视项目、通用画布节点、发布、素材源、首页最近画布不受影响。
- 同一漫画项目的页数、审稿进度、贴字和导出只读一份数据。

## 10. 风险与取舍

- **收益**：单一项目/素材/同步/媒体链路；删除双向映射和同步弹窗；漫画册与工作台口径一致。
- **代价**：新增 `ComicPage` 节点，通用渲染、备份、导出、Agent、项目卡都需要覆盖；五阶段组件需要投影适配；旧数据硬切。
- **不迁移**：现有本地/账号漫画项目不会自动变成画布项目；如未来需要保留，另做一次性导入器。
- **保留 `/comic`**：漫画用户仍有独立项目列表和引导入口，但入口只做筛选与打开，不再是第二套项目系统。
