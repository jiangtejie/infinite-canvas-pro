# Comic as Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If subagents are unavailable, execute inline with the same TDD and verification gates.

**Goal:** 把漫画工作台从独立项目系统收敛为画布内的漫画领域视图，一个漫画项目只保留一份 `CanvasProject`。

**Architecture:** 漫画项目使用 `CanvasProject(domain: "comic")`；漫画册仍是 `CanvasNodeType.Comic` 书节点，漫画页升级为 `CanvasNodeType.ComicPage` 节点；`comic` meta 保存项目元数据、章节顺序和角色/场景副本。现有五阶段 UI 通过 `selectComicProject/applyComicProject` 非持久化投影适配器读写画布，不再使用 `useComicStore`。`/comic` 列表保留，`/comic/library` 母版库保留，`comic-projects` 同步域和画布同步桥删除。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Ant Design、Tailwind、localforage、bun test。

**Spec:** `docs/superpowers/specs/2026-11-24-comic-as-canvas-design.md`

## Global Constraints

- 一个漫画项目 = 一个 `CanvasProject`；不新增第二套项目 store、同步域或持久化任务链。
- 旧漫画项目数据不迁移；按项目规则硬切，不写兼容双轨。
- `ComicProject` 仅作为非持久化视图投影存在，任何阶段组件不得直接写回 localStorage。
- 漫画页序只来自漫画册节点 `pageNodeIds`；章节序只来自 `comic.chapterOrder`；页通过 `chapterId` 归属章节。
- 一个漫画项目只允许一个书节点，`comic.bookNodeId` 是唯一指针。
- `useComicCastStore` 与 `/comic/library` 是母版库，不并入项目真源。
- 每批先写失败测试，再实现；每批结束运行 focused tests、typecheck、lint。
- 不修改影视、通用画布、发布、素材源等非漫画领域行为。
- 执行时不自动 commit/push；计划中的提交步骤只在用户明确授权后执行。

## File Map

**新增**

- `web/src/app/(user)/canvas/[id]/lib/comic-graph-types.ts`：`CanvasComicMeta`、`ComicPageNodeData`、漫画域类型。
- `web/src/app/(user)/canvas/utils/comic-canvas-project.ts`：漫画项目工厂。
- `web/src/app/(user)/canvas/[id]/lib/comic-canvas-projection.ts`：`selectComicProject/applyComicProject`。
- `web/src/app/(user)/canvas/[id]/lib/comic-canvas-projection.test.ts`
- `web/src/app/(user)/canvas/components/comic-page-node-card.tsx`
- `web/src/app/(user)/canvas/[id]/components/comic-view-switch.tsx`
- `web/src/app/(user)/canvas/[id]/components/comic-workbench.tsx`
- `web/src/app/(user)/comic/studio/[id]/page.tsx`

**修改**

- `web/src/app/(user)/canvas/types.ts`：domain、ComicPage 枚举、comic meta、comicPage metadata、CanvasComicBook 简化。
- `web/src/app/(user)/canvas/constants.ts`：ComicPage 默认尺寸/规格。
- `web/src/app/(user)/canvas/stores/use-canvas-store.ts`：`createComicProject`、project patch 支持 `comic`。
- `web/src/app/(user)/canvas/utils/canvas-project-domain.ts`：漫画项目过滤。
- `web/src/app/(user)/canvas/components/canvas-node.tsx`：ComicPage 渲染分发。
- `web/src/app/(user)/canvas/[id]/components/canvas-stage-layer.tsx`：漫画节点通用菜单/面板保护。
- `web/src/app/(user)/canvas/[id]/hooks/use-canvas-clipboard.ts`：漫画节点不参与通用复制。
- `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`：comic domain 壳层与视图模型。
- `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`：漫画壳层挂载。
- `web/src/app/(user)/canvas/components/canvas-project-card.tsx`：漫画项目预览/统计。
- `web/src/app/(user)/comic/page.tsx`：列表切画布 store。
- `web/src/app/(user)/comic/library/page.tsx`：使用统计切画布项目。
- `web/src/app/(user)/comic/utils/comic-library-usage.ts`：扫描 CanvasProject。
- `web/src/app/(user)/canvas/utils/comic-book-state.ts`：页槽/书状态改读 ComicPage + comic meta。
- `web/src/app/(user)/canvas/components/canvas-comic-book-node-card.tsx`
- `web/src/app/(user)/canvas/components/canvas-comic-book-overlay.tsx`
- `web/src/services/creative-sync.ts`：删除 comic-projects 域。
- `web/src/services/api/user-config.ts`：删除漫画项目接口。
- `web/src/constant/navigation-tools.ts`：漫画入口标签。

**移动**

- `comic/[id]/components/comic-*-stage.tsx`、`comic-image.tsx` → `canvas/[id]/components/comic/`（保留 stage UI，改用投影回调）。
- `comic/components/comic-character-editor.tsx`、`comic-image-slot-editor.tsx` 保持在 `comic/components/`，可被漫画舞台复用。

**删除**

- `web/src/app/(user)/comic/[id]` 旧路由。
- `web/src/app/(user)/comic/stores/use-comic-store.ts`。
- `web/src/app/(user)/comic/[id]/components/comic-canvas-sync-dialog.tsx`。
- `web/src/app/(user)/comic/utils/comic-canvas-import.ts`、`comic-canvas-writeback.ts` 及测试。
- `creative-sync` 的 `comic-projects` 域、`user-config` 的漫画项目接口、后端漫画项目表/路由/handler/repository。
- `COMIC_STORE_KEY` 与旧项目导入/导出依赖（保留母版库 key）。

---

### Task 1: 漫画 domain、项目工厂与列表过滤

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/comic-graph-types.ts`
- Create: `web/src/app/(user)/canvas/utils/comic-canvas-project.ts`
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-project-domain.ts`
- Test: `web/src/app/(user)/canvas/utils/comic-canvas-project.test.ts`

**Interfaces:**
- Produces `CanvasComicMeta`, `CanvasProjectDomain = "film" | "comic"`, `buildComicCanvasProject`, `createComicProject`, `comicCanvasProjects`.

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { CanvasNodeType } from "../types";
import { buildComicCanvasProject } from "./comic-canvas-project";
import { comicCanvasProjects, generalCanvasProjects } from "./canvas-project-domain";

const context = { id: "comic-1", now: "2026-11-24T00:00:00.000Z", viewport: { x: 0, y: 0, k: 1 }, sidePanel: { open: false, width: 320 }, agentPanel: { open: false } } as never;

test("builds a comic canvas project with one book node and comic meta", () => {
    const project = buildComicCanvasProject("雨夜", context);
    assert.equal(project.domain, "comic");
    assert.equal(project.comic?.bookNodeId, `${context.id}-comic-book`);
    assert.equal(project.comic?.stage, "concept");
    assert.equal(project.comic?.format, "page");
    assert.equal(project.comic?.direction, "rtl");
    const book = project.nodes.find((node) => node.type === CanvasNodeType.Comic);
    assert.equal(book?.id, project.comic?.bookNodeId);
    assert.deepEqual(book?.metadata?.comicBook?.pageNodeIds, []);
});

test("keeps comic projects out of the general canvas list", () => {
    const project = buildComicCanvasProject("雨夜", context);
    assert.deepEqual(comicCanvasProjects([project]).map((item) => item.id), ["comic-1"]);
    assert.deepEqual(generalCanvasProjects([project]), []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/canvas/utils/comic-canvas-project.test.ts"`
Expected: FAIL because `buildComicCanvasProject` 不存在。

- [ ] **Step 3: 实现类型与工厂**

`comic-graph-types.ts`：

```ts
import type { ComicCharacter, ComicLocation, ComicPage, ComicStage } from "@/app/(user)/comic/types";

export type CanvasComicMeta = {
    bookNodeId: string;
    stage: ComicStage;
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
    cast: { characters: ComicCharacter[]; locations: ComicLocation[] };
};

export type ComicPageNodeData = Omit<ComicPage, "id"> & {
    chapterId: string;
    pendingPanelTask?: { panelId: string; taskId: string; startedAt: number };
};
```

`canvas/types.ts` 修改：

```ts
export type CanvasProjectDomain = "film" | "comic";
// CanvasComicBook 删除 comicProjectId/pageProjectIds/format/direction
// CanvasNodeMetadata 增加 comicPage?: ComicPageNodeData
```

`comic-canvas-project.ts`：

```ts
import { createCanvasNode } from "../[id]/lib/canvas-node-factory";

import { CanvasNodeType, type CanvasComicMeta } from "../types";
import type { CanvasProject } from "../stores/use-canvas-store";

export type ComicCanvasProjectContext = {
    id: string;
    now: string;
    viewport: CanvasProject["viewport"];
    sidePanel: CanvasProject["sidePanel"];
    agentPanel: CanvasProject["agentPanel"];
};

export function buildComicCanvasProject(title: string, context: ComicCanvasProjectContext): CanvasProject {
    const bookId = `${context.id}-comic-book`;
    const book = createCanvasNode(CanvasNodeType.Comic, { x: 0, y: 0 }, {}, bookId);
    book.title = `${title.trim() || "未命名漫画"} 漫画册`;
    book.metadata = { ...book.metadata, comicBook: { pageNodeIds: [] } };
    const comic: CanvasComicMeta = {
        bookNodeId: bookId,
        stage: "concept",
        format: "page",
        direction: "rtl",
        genre: "",
        audience: "",
        logline: "",
        synopsis: "",
        styleGuide: "",
        status: "draft",
        chapterOrder: [],
        cast: { characters: [], locations: [] },
    };
    return {
        id: context.id,
        title: title.trim() || "未命名漫画",
        createdAt: context.now,
        updatedAt: context.now,
        nodes: [book],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        agentConfig: null,
        autoTitlePending: false,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: context.viewport,
        sidePanel: context.sidePanel,
        agentPanel: context.agentPanel,
        domain: "comic",
        comic,
    };
}
```

`use-canvas-store.ts`：

```ts
createComicProject: (title = "未命名漫画") => {
    const project = buildComicCanvasProject(title, {
        id: nanoid(),
        now: new Date().toISOString(),
        viewport: initialViewport,
        sidePanel: DEFAULT_CANVAS_SIDE_PANEL,
        agentPanel: DEFAULT_CANVAS_AGENT_PANEL,
    });
    set((state) => ({ projects: [project, ...state.projects] }));
    queueProjectSave(project);
    return project.id;
},
```

同时把 `createComicProject` 加入 `CanvasStore` 类型和 `CanvasProject` patch 的 `comic` 字段。

`canvas-project-domain.ts`：

```ts
export function isComicCanvasProject(project: { domain?: CanvasProjectDomain }) {
    return project.domain === "comic";
}
export function generalCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter((project) => !project.domain);
}
export function comicCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter(isComicCanvasProject);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && bun test "src/app/(user)/canvas/utils/comic-canvas-project.test.ts"`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/app/(user)/canvas
git commit -m "feat(comic): 增加漫画画布项目与领域元数据"
```

---

### Task 2: ComicPage 节点、默认尺寸与节点工厂

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/constants.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/canvas-node-factory.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/canvas-comic-node-factory.test.ts`

**Interfaces:**
- Consumes `ComicPageNodeData` from Task 1.
- Produces `CanvasNodeType.ComicPage`, default size/spec, `createCanvasNode(ComicPage, ...)` 默认 `comicPage`。

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasNode } from "./canvas-node-factory";
import { CanvasNodeType } from "../../types";

test("creates a comic page node with a page payload", () => {
    const node = createCanvasNode(CanvasNodeType.ComicPage, { x: 0, y: 0 });
    assert.equal(node.type, CanvasNodeType.ComicPage);
    assert.equal(node.metadata?.comicPage?.title, "新页面");
    assert.deepEqual(node.metadata?.comicPage?.panels, []);
    assert.equal(node.metadata?.comicPage?.reviewStatus, "draft");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/canvas-comic-node-factory.test.ts"`
Expected: FAIL because enum/branch 不存在。

- [ ] **Step 3: 实现**

- `CanvasNodeType` 增加 `ComicPage = "comicPage"`。
- `CanvasNodeMetadata` 增加 `comicPage?: ComicPageNodeData`。
- `NODE_DEFAULT_SIZE` 增加 `{ width: 300, height: 420, title: "漫画页" }`。
- `NODE_SPECS` 增加 `ComicPage`。
- `canvas-node-factory.ts` 增加默认漫画 payload，并在 `createCanvasNode` 的 metadata 合并链中调用：

```ts
function defaultComicMetadata(type: CanvasNodeType): CanvasNodeMetadata {
    if (type !== CanvasNodeType.ComicPage) return {};
    return {
        comicPage: {
            title: "新页面",
            summary: "",
            chapterId: "unassigned",
            panels: [],
            reviewStatus: "draft",
            reviewNotes: "",
        },
    };
}

// createCanvasNode 内：
metadata: { ...spec.metadata, ...defaults, ...defaultFilmMetadata(type), ...defaultComicMetadata(type), ...metadata },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/canvas-comic-node-factory.test.ts"`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/app/(user)/canvas
git commit -m "feat(comic): 增加漫画页节点"
```

---

### Task 3: 画布 ↔ ComicProject 投影与提交

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/comic-canvas-projection.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/comic-canvas-projection.test.ts`

**Interfaces:**
- Consumes `CanvasProject.comic`, `CanvasNodeType.Comic`, `CanvasNodeType.ComicPage`.
- Produces `selectComicProject(project): ComicProject | null` 与 `applyComicProject(project, next): CanvasProject`。

- [ ] **Step 1: 写失败测试**

覆盖：书页序投影、章节顺序、页格/审稿 round-trip、新增/删除页、角色/场景副本、页图/生成上下文不丢。

```ts
import type { ComicCharacter, ComicPage, ComicProject } from "@/app/(user)/comic/types";

const context = { id: "comic-1", now: "2026-11-24T00:00:00.000Z", viewport: { x: 0, y: 0, k: 1 }, sidePanel: { open: false, width: 320 }, agentPanel: { open: false } } as const;
const page = (id: string, chapterId: string): ComicPage => ({
    id, title: id, summary: "", reviewStatus: "draft", reviewNotes: "",
    panels: [{ id: `${id}-panel`, description: "画面", dialogue: "", caption: "", sfx: "", characterBindings: [] }],
});
const character = (id: string, name: string) => ({ id, name } as ComicCharacter);
const emptyComicProject = () => ({
    id: "comic-1", title: "", status: "draft", stage: "concept", genre: "", audience: "",
    format: "page", direction: "rtl", logline: "", synopsis: "", styleGuide: "",
    chapters: [], characters: [], locations: [], createdAt: "", updatedAt: "",
} as ComicProject);

test("projects pages in book order and commits panel edits back to page nodes", () => {
    const project = buildComicCanvasProject("雨夜", context);
    const withPages = applyComicProject(project, {
        ...emptyComicProject(),
        title: "雨夜",
        chapters: [
            { id: "ch1", title: "第一幕", summary: "", pages: [page("p1", "ch1"), page("p2", "ch1")] },
        ],
        characters: [character("char-1", "沈迟")],
    });
    const view = selectComicProject(withPages);
    assert.equal(view?.chapters[0].pages[0].id, "p1");
    const edited = {
        ...view!,
        chapters: view!.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((item) => item.id === "p1" ? { ...item, panels: [{ ...item.panels[0], dialogue: "别回头" }] } : item),
        })),
    };
    const committed = applyComicProject(withPages, edited);
    const pageNode = committed.nodes.find((node) => node.id === "p1");
    assert.equal(pageNode?.metadata?.comicPage?.panels[0].dialogue, "别回头");
    assert.deepEqual(selectComicProject(committed)?.chapters[0].pages.map((item) => item.id), ["p1", "p2"]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/comic-canvas-projection.test.ts"`
Expected: FAIL because projection 不存在。

- [ ] **Step 3: 实现**

`selectComicProject`：

```ts
export function selectComicProject(project: CanvasProject): ComicProject | null {
    const comic = project.comic;
    const book = project.nodes.find((node) => node.id === comic?.bookNodeId && node.type === CanvasNodeType.Comic);
    if (!comic || !book) return null;
    const pageById = new Map(project.nodes.filter((node) => node.type === CanvasNodeType.ComicPage).map((node) => [node.id, node]));
    const pages = (book.metadata?.comicBook?.pageNodeIds || []).flatMap((id) => {
        const node = pageById.get(id);
        return node?.metadata?.comicPage ? [{ ...node.metadata.comicPage, id, title: node.metadata.comicPage.title || node.title }] : [];
    });
    const chapters = comic.chapterOrder.map((chapter) => ({
        ...chapter,
        pages: pages.filter((page) => page.chapterId === chapter.id),
    }));
    const unassigned = pages.filter((page) => !comic.chapterOrder.some((chapter) => chapter.id === page.chapterId));
    if (unassigned.length) chapters.push({ id: "unassigned", title: "未分章", summary: "", pages: unassigned });
    return {
        id: project.id,
        title: project.title,
        status: comic.status,
        stage: comic.stage,
        genre: comic.genre,
        audience: comic.audience,
        format: comic.format,
        direction: comic.direction,
        targetPages: comic.targetPages,
        logline: comic.logline,
        synopsis: comic.synopsis,
        styleGuide: comic.styleGuide,
        chapters,
        characters: comic.cast.characters,
        locations: comic.cast.locations,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}
```

`applyComicProject`：

- 更新 title/comic 字段/cast/chapterOrder。
- 以 `next.chapters.flatMap(pages)` 为唯一页序。
- 已存在页节点只替换 `metadata.comicPage`；新页创建 `ComicPage` 节点并追加；删除不在 next 的页节点及引用它们的连线。
- 更新书节点 `pageNodeIds`、`coverNodeId`（原封面不存在时取第一页）、清理已删除页的 lettering。
- 返回新的 `CanvasProject`，`updatedAt` 用当前时间。

> 页节点位置用简单网格：`x = 120 + index % 4 * 360`，`y = 120 + Math.floor(index / 4) * 480`；新建页不覆盖已有位置。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/comic-canvas-projection.test.ts"`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/app/(user)/canvas
git commit -m "feat(comic): 增加画布与漫画视图投影"
```

---

### Task 4: 书卡/页卡与漫画域节点保护

**Files:**
- Create: `web/src/app/(user)/canvas/components/comic-page-node-card.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/utils/comic-book-state.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-comic-book-node-card.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-stage-layer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-canvas-clipboard.ts`
- Test: `web/src/app/(user)/canvas/utils/comic-book-state.test.ts`

**Interfaces:**
- Consumes `ComicPageNodeData`、`comic.bookNodeId`。
- Produces `resolveComicPageSlots` 接受 ComicPage 节点；`ComicPageNodeCard`；漫画节点不进入通用菜单/复制/生成。

- [ ] **Step 1: 写失败测试**

把 `resolveComicPageSlots` 测试 fixture 改为 ComicPage 节点，断言有 `comicPage.pageImage` 为 available，缺图为 missing；书节点页数与项目页数不再依赖 `useComicStore`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/canvas/utils/comic-book-state.test.ts"`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `resolveComicPageSlots` 接受 `node.type === CanvasNodeType.ComicPage`，可用条件为 `Boolean(node.metadata?.comicPage?.pageImage)`。
- `resolveCanvasComicBookState` 删除 `projects/projectsHydrated` 参数，改为从传入 `comic: CanvasComicMeta` 读取阶段/页数；`project` 字段删除或改成 `{ kind: "linked", progress }`，不再有 project-missing/loading。
- `ComicPageNodeCard` 显示页图、标题、页格数、审稿状态；点击由舞台打开漫画工作台页格阶段。
- `CanvasNode` 增加 ComicPage 渲染器；`canvas-stage-layer` 对 Comic/ComicPage 禁止通用右键菜单、提示词面板与通用生成；`use-canvas-clipboard` 与 duplicate 排除漫画节点。
- 书卡删除“关联漫画项目/项目不在本机”动作，改为“打开漫画工作台”；主行动根据阶段/页状态派生。

- [ ] **Step 4: 运行测试与定向类型检查**

Run: `cd web && bun test "src/app/(user)/canvas/utils/comic-book-state.test.ts" && bun run typecheck`
Expected: PASS / 0 errors。

- [ ] **Step 5: 提交**

```bash
git add web/src/app/(user)/canvas
git commit -m "feat(comic): 接入漫画页节点与书卡状态"
```

---

### Task 5: 漫画视图壳与五阶段投影接入

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/comic-view-switch.tsx`
- Create: `web/src/app/(user)/canvas/[id]/components/comic-workbench.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts` 或新增 `comic-view-types.ts`
- Move: `web/src/app/(user)/comic/[id]/components/comic-*-stage.tsx` → `web/src/app/(user)/canvas/[id]/components/comic/`

**Interfaces:**
- Consumes `selectComicProject/applyComicProject`、`CanvasComicMeta`。
- Produces `ComicViewSwitch`（漫画册/漫画工作台）、`ComicWorkbench`（五阶段 + 投影提交）、`CanvasEditor` comic domain。

- [ ] **Step 1: 写纯模型测试**

新增 `comic-view-model.test.ts` 覆盖：默认视图、阶段切换、从页节点打开页格阶段、提交后页节点更新。若需要，把视图决策抽成 `comic-view-model.ts` 纯函数。

- [ ] **Step 2: 实现壳层**

- `CanvasEditor` 增加 `comicMode = currentProject?.domain === "comic"`；构建 `comicStudio` 模型或直接传 `comic` 视图模型。
- `CanvasWorkspace` 在 comic domain 渲染 `ComicViewSwitch` + `ComicViewBody`；漫画册分支复用 `CanvasStageLayer/Overlays`，漫画工作台分支渲染 `ComicWorkbench`。
- `ComicWorkbench` 用 `selectComicProject(project)` 生成视图；`onChange={(next)=>onChangeProject(applyComicProject(project,next))}`；阶段组件保留原 props。
- 顶部只保留“漫画册/漫画工作台”；工作台内部五阶段 segmented 由 `comic.stage` 驱动。
- 漫画域隐藏通用侧栏/助手/影视场次控件；保留顶栏项目、撤销/重做、导出等通用动作。

- [ ] **Step 3: 运行测试、typecheck、lint**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/comic-view-model.test.ts" && bun run typecheck && bun run lint`
Expected: PASS / 0 / 0。

- [ ] **Step 4: 浏览器验收**

临时项目：新建漫画 → 切漫画册/工作台 → 企划改标题/格式 → 设定加角色 → 剧本加页 → 页格加页格 → 切回漫画册看到页节点；完成后删除临时项目。

- [ ] **Step 5: 提交**

```bash
git add web/src/app/(user)/canvas web/src/app/(user)/comic
git commit -m "feat(comic): 增加画布漫画视图壳"
```

---

### Task 6: `/comic` 列表、`/comic/studio/[id]` 与母版库统计

**Files:**
- Create: `web/src/app/(user)/comic/studio/[id]/page.tsx`
- Modify: `web/src/app/(user)/comic/page.tsx`
- Modify: `web/src/app/(user)/comic/library/page.tsx`
- Modify: `web/src/app/(user)/comic/utils/comic-library-usage.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`（项目返回路径 `/comic`）
- Test: `web/src/app/(user)/comic/utils/comic-library-usage.test.ts`

**Interfaces:**
- Consumes `useCanvasStore`、`comicCanvasProjects`、`createComicProject`、`buildComicCanvasProject`。
- Produces 漫画列表/详情路由，母版库使用统计扫描 CanvasProject。

- [ ] **Step 1: 写失败测试**

`comic-library-usage.test.ts` 改为传入 `CanvasProject[]`（domain comic），断言角色/场景库使用统计从 `comic.cast` 与页格绑定读取。

- [ ] **Step 2: 实现**

- `/comic/studio/[id]/page.tsx` 返回 `<CanvasEditor studio />`。
- `/comic/page.tsx` 读 `useCanvasStore`，过滤 `comicCanvasProjects`；新建调用 `createComicProject`，跳 `/comic/studio/${id}`；导入备份改为 JSON -> `importProject`/投影提交。
- `CanvasProjectCard basePath="/comic/studio"`；项目卡预览优先页节点 `comicPage.pageImage`。
- `/comic/library` 使用统计改 `useCanvasStore`。
- 导航 label 改“漫画”。

- [ ] **Step 3: 运行测试**

Run: `cd web && bun test "src/app/(user)/comic/utils/comic-library-usage.test.ts" && bun run typecheck`
Expected: PASS / 0。

- [ ] **Step 4: 提交**

```bash
git add web/src/app/(user)/comic web/src/app/(user)/canvas web/src/constant
git commit -m "feat(comic): 漫画入口切到画布项目"
```

---

### Task 7: 贴字直接回写与同步桥删除

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-comic-book-overlay.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-comic-book-node-card.tsx`
- Delete: `web/src/app/(user)/comic/[id]/components/comic-canvas-sync-dialog.tsx`
- Delete: `web/src/app/(user)/comic/utils/comic-canvas-import.ts`
- Delete: `web/src/app/(user)/comic/utils/comic-canvas-writeback.ts`
- Delete: `web/src/app/(user)/comic/utils/comic-canvas-import.test.ts`
- Delete: `web/src/app/(user)/comic/utils/comic-canvas-writeback.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/comic-lettering-writeback.test.ts`

**Interfaces:**
- Produces `applyComicLetteringToPages(project, book): CanvasProject`，按 pageNodeId 直接更新页格台词/旁白/拟声；删除 mapping/同步。

- [ ] **Step 1: 写失败测试**

构造 ComicPage 节点 + lettering，断言写回对应页格且不修改页序。

- [ ] **Step 2: 实现**

- 把现有 `applyComicCanvasWriteback` 的页格匹配逻辑改成按 `pageNodeId` 查找 ComicPage 节点；不依赖 `pageProjectIds`。
- 书 overlay 读取 `comic` meta 的 format/direction；页槽用 ComicPage；贴字保存直接提交到当前画布项目。
- 删除同步弹窗/导入/回写文件及入口；书卡不再有“关联项目”。

- [ ] **Step 3: 运行测试**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/comic-lettering-writeback.test.ts" && bun run typecheck`
Expected: PASS / 0。

- [ ] **Step 4: 提交**

```bash
git add web/src/app/(user)/canvas web/src/app/(user)/comic
git commit -m "feat(comic): 贴字直接回写漫画页节点"
```

---

### Task 8: 删除旧项目系统、同步域与后端接口

**Files:**
- Delete: `web/src/app/(user)/comic/[id]`（旧路由）
- Delete: `web/src/app/(user)/comic/stores/use-comic-store.ts`
- Modify: `web/src/services/creative-sync.ts`
- Modify: `web/src/services/api/user-config.ts`
- Modify: `web/src/lib/storage-keys.ts`
- Modify: backend comic project model/handler/repository/router/database docs
- Modify: `docs/overview/features.md`、`docs/progress/pending-test.md`、`docs/progress/todo.md`、`CHANGELOG.md`

**Interfaces:**
- 删除 `comic-projects` 域与 `useComicStore`；保留 `comic-cast` 与 `/comic/library`。

- [ ] **Step 1: 删除旧 store 与同步域**

- `creative-sync` 去掉 comic-projects domain、`applyComicProjectMedia`、相关 import。
- `user-config` 去掉 `fetchUserComicProjects/syncUserComicProjects`。
- 删除 `COMIC_STORE_KEY`，保留 `COMIC_CAST_STORE_KEY`。
- 后端删除漫画项目表/路由/字段；更新 `docs/backend/backend-database.md`。

- [ ] **Step 2: 全仓搜索**

Run: `rg "useComicStore|comic-projects|COMIC_STORE_KEY|comicProjectId|pageProjectIds|comic-canvas-(import|writeback|sync)" web/src`
Expected: 0 个生产引用（测试中的旧 fixture 同步删除）。

- [ ] **Step 3: 全量验证**

Run: `cd web && bun test && bun run typecheck && bun run lint`
Expected: 全部通过。

- [ ] **Step 4: 浏览器验收**

临时项目完成：新建漫画 → 企划 → 设定 → 剧本 → 页格 → 合成 → 漫画册贴字/导出 → 刷新恢复；确认 `/canvas` 不出现漫画项目、`/film` 不受影响；删除临时项目。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(comic): 删除独立漫画项目系统"
```
