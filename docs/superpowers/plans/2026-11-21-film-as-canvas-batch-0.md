# 影视并入画布节点 批次 0（数据地基）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为影视并入画布建立节点类型、连接语义、文档域字段与导入/列表过滤的地基，不改变任何现有用户可见行为。

**Architecture:** `CanvasNodeType` 增加 `script/scene/shot/filmAsset`；影视载荷挂在 `CanvasNodeMetadata` 的 `film*` 字段；`CanvasConnection` 增加 `kind/data`；`CanvasProject` 增加 `domain/film`，导入保留域字段，画布列表过滤影视文档。

**Tech Stack:** Next.js App Router、TypeScript、Zustand、Bun test。

**Spec:** `docs/superpowers/specs/2026-11-21-film-as-canvas-design.md`

## Global Constraints

- 唯一真源是画布文档；本批不新增任何 `FilmProject` 存储。
- 旧数据不迁移；本批不涉及删除，批次 3 统一删除。
- 影视字段只放 `metadata.filmScript` / `filmScene` / `filmShot` / `filmAsset`，不污染通用字段。
- 不新增第二套生成、任务、导出、同步。
- 不修改无关文件，不顺手重构。
- 不自动 `git commit` / `git push`；提交与推送需用户单独授权（项目约定）。
- 执行者跑单测；最终构建与类型检查由用户执行（AGENTS.md）。新增枚举可能触发全量 `Record<CanvasNodeType, ...>` 映射遗漏，执行者可用 `bun run typecheck` 自检，但不作为交付硬门槛。
- 测试命令统一在 `web/` 下执行，例如 `bun test canvas-film-node-factory`。

## Scope

本计划只覆盖 spec 的批次 0（数据地基）。批次 1（图原语）、批次 2（视图与批量）、批次 3（切换与删除）在本批落地后分别另写计划，避免在未落地的类型上臆造代码。

---

### Task 1: 影视节点类型与默认规格

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`（节点枚举、影视载荷、metadata 字段、连接类型）
- Modify: `web/src/app/(user)/canvas/constants.ts`（四种影视节点的默认尺寸与默认 metadata）
- Test: `web/src/app/(user)/canvas/[id]/lib/canvas-film-node-factory.test.ts`（新建）

**Interfaces:**
- Consumes: `CanvasNodeType`、`CanvasNodeMetadata`、`createCanvasNode`。
- Produces: `CanvasNodeType.Script/Scene/Shot/FilmAsset`；`FilmScriptNodeData`、`FilmSceneNodeData`、`FilmShotNodeData`、`FilmAssetNodeData`；`CanvasConnectionKind`、`FilmBindingEdgeData`；`metadata.filmScript/filmScene/filmShot/filmAsset`。

- [ ] **Step 1: 写失败测试**

新建 `web/src/app/(user)/canvas/[id]/lib/canvas-film-node-factory.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";

test("creates film script, scene and shot nodes with payload defaults", () => {
    const script = createCanvasNode(CanvasNodeType.Script, { x: 0, y: 0 });
    assert.equal(script.title, "剧本");
    assert.equal(script.metadata?.filmScript?.text, "");
    assert.deepEqual(script.metadata?.filmScript?.parseSnapshots, []);

    const scene = createCanvasNode(CanvasNodeType.Scene, { x: 0, y: 0 });
    assert.equal(scene.title, "场次");
    assert.equal(scene.metadata?.filmScene?.mood, "");

    const shot = createCanvasNode(CanvasNodeType.Shot, { x: 0, y: 0 });
    assert.equal(shot.title, "镜头");
    assert.equal(shot.metadata?.filmShot?.shotNo, "");
    assert.equal(shot.metadata?.filmShot?.duration, 4);
});

test("accepts film asset metadata and keeps the type spec", () => {
    const asset = createCanvasNode(CanvasNodeType.FilmAsset, { x: 0, y: 0 }, {
        filmAsset: {
            kind: "character",
            asset: { id: "char-1", name: "沈迟" } as FilmAsset,
        },
    });
    assert.equal(asset.title, "影视资产");
    assert.equal(asset.metadata?.filmAsset?.kind, "character");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test canvas-film-node-factory`
Expected: FAIL，`CanvasNodeType.Script` 等枚举成员不存在（编译失败或用例失败）。

- [ ] **Step 3: 扩展 `canvas/types.ts`**

在文件顶部加入类型导入：

```ts
import type {
    FilmAspect,
    FilmAsset,
    FilmAssetKind,
    FilmConsistencyReview,
    FilmInteractiveVariable,
    FilmShot,
    FilmStructurePlan,
    FilmStylePresetId,
} from "@/lib/film/types";
```

在 `CanvasNodeType` 中加入四个成员：

```ts
export enum CanvasNodeType {
    Image = "image",
    Panorama = "panorama",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Director = "director",
    Group = "group",
    Source = "source",
    Publish = "publish",
    Comic = "comic",
    Script = "script",
    Scene = "scene",
    Shot = "shot",
    FilmAsset = "filmAsset",
}
```

在 `CanvasNodeMetadata` 之前加入影视载荷与连接类型：

```ts
export type CanvasProjectDomain = "film";

export type CanvasFilmMeta = {
    aspect: FilmAspect;
    stylePresetId: FilmStylePresetId;
    directorStyleId: string;
    targetDuration?: number;
    scriptProjectId?: string;
    scriptHash?: string;
    interactiveVariables?: FilmInteractiveVariable[];
    consistencyReview?: FilmConsistencyReview;
};

export type CanvasConnectionKind = "binding" | "sequence" | "composition";

export type FilmBindingEdgeData = {
    stateId?: string;
    continuity?: {
        outfit?: string;
        physicalCondition?: string;
        heldProps?: string[];
        emotion?: string;
        intentionalChange?: string;
    };
    variantId?: string;
    source: "manual" | "ai";
};

export type FilmParseSnapshot = {
    id: string;
    createdAt: string;
    mode: "overwrite" | "append";
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

export type FilmScriptNodeData = {
    text: string;
    sourceScriptProjectId?: string;
    sourceScriptHash?: string;
    parseSnapshots: FilmParseSnapshot[];
    structurePlan?: FilmStructurePlan;
};

export type FilmSceneNodeData = {
    episodeId: string;
    episodeTitle: string;
    name: string;
    location: string;
    time: string;
    mood: string;
    notes?: string;
};

export type FilmShotNodeData = Omit<
    FilmShot,
    "id" | "characterBindings" | "propBindings" | "locationId" | "locationVariantId"
>;

export type FilmAssetNodeData = {
    kind: FilmAssetKind;
    asset: FilmAsset;
};
```

在 `CanvasNodeMetadata` 的闭合大括号前追加：

```ts
    filmScript?: FilmScriptNodeData;
    filmScene?: FilmSceneNodeData;
    filmShot?: FilmShotNodeData;
    filmAsset?: FilmAssetNodeData;
```

把 `CanvasConnection` 改为：

```ts
export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    kind?: CanvasConnectionKind;
    data?: FilmBindingEdgeData;
};
```

- [ ] **Step 4: 扩展 `canvas/constants.ts`**

在 `NODE_DEFAULT_SIZE` 中加入：

```ts
    [CanvasNodeType.Script]: { width: 520, height: 380, title: "剧本" },
    [CanvasNodeType.Scene]: { width: 360, height: 240, title: "场次" },
    [CanvasNodeType.Shot]: { width: 420, height: 320, title: "镜头" },
    [CanvasNodeType.FilmAsset]: { width: 360, height: 420, title: "影视资产" },
```

在 `NODE_SPECS` 中加入：

```ts
    [CanvasNodeType.Script]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Script],
        metadata: { status: "idle", filmScript: { text: "", parseSnapshots: [] } },
    },
    [CanvasNodeType.Scene]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Scene],
        metadata: {
            status: "idle",
            filmScene: { episodeId: "", episodeTitle: "", name: "", location: "", time: "", mood: "" },
        },
    },
    [CanvasNodeType.Shot]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Shot],
        metadata: {
            status: "idle",
            filmShot: {
                shotNo: "",
                shotType: "",
                cameraMovement: "",
                duration: 4,
                description: "",
                dialogue: "",
                audio: "",
                prompt: "",
            },
        },
    },
    [CanvasNodeType.FilmAsset]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.FilmAsset],
        metadata: { status: "idle" },
    },
```

说明：`FilmAsset` 节点需要真实的资产 payload，默认 spec 只给空 metadata，由批次 1 的创建命令传入 `filmAsset`。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd web && bun test canvas-film-node-factory`
Expected: PASS（2 个用例）。

- [ ] **Step 6: 自检枚举映射遗漏**

Run: `cd web && bun run typecheck`
Expected: 通过。本项目只有 `constants.ts` 使用全量 `Record<CanvasNodeType, ...>`（已在 Step 4 补齐）；`canvas-node.tsx` 与 `use-canvas-ui-store` 使用 `Partial`，无需新增项。若仍报缺项，按报错位置补齐后重跑。

- [ ] **Step 7: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 2: 连接 `kind/data` 与绑定边助手

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/canvas-connection.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/canvas-connection.test.ts`（新建）

**Interfaces:**
- Consumes: `CanvasConnection`、`CanvasConnectionKind`、`FilmBindingEdgeData`（Task 1）。
- Produces: `canvasConnection(fromNodeId, toNodeId, options?)`，第三参数可选，现有调用不受影响。

- [ ] **Step 1: 写失败测试**

新建 `web/src/app/(user)/canvas/[id]/lib/canvas-connection.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { canvasConnection } from "./canvas-connection";

test("attaches kind and film binding data", () => {
    const edge = canvasConnection("char-1", "shot-1", {
        kind: "binding",
        data: {
            source: "manual",
            stateId: "state-1",
            continuity: { emotion: "压抑", heldProps: ["录音笔"] },
        },
    });

    assert.equal(edge.id, "char-1->shot-1");
    assert.equal(edge.fromNodeId, "char-1");
    assert.equal(edge.toNodeId, "shot-1");
    assert.equal(edge.kind, "binding");
    assert.equal(edge.data?.stateId, "state-1");
    assert.deepEqual(edge.data?.continuity?.heldProps, ["录音笔"]);
});

test("keeps general canvas connections kindless", () => {
    const edge = canvasConnection("a", "b");

    assert.equal(edge.kind, undefined);
    assert.equal("data" in edge, false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test canvas-connection.test`
Expected: FAIL，`canvasConnection` 不接受第三个参数或 `data` 属性不存在。

- [ ] **Step 3: 实现助手**

把 `web/src/app/(user)/canvas/[id]/lib/canvas-connection.ts` 改为：

```ts
import type { CanvasConnection, CanvasConnectionKind, FilmBindingEdgeData } from "../../types";

export type CanvasConnectionOptions = {
    kind?: CanvasConnectionKind;
    data?: FilmBindingEdgeData;
};

/** 生成稳定的连线 id：同一对节点只会有一条同向结构边。 */
export function canvasConnection(
    fromNodeId: string,
    toNodeId: string,
    options: CanvasConnectionOptions = {},
): CanvasConnection {
    return {
        id: `${fromNodeId}->${toNodeId}`,
        fromNodeId,
        toNodeId,
        ...options,
    };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && bun test canvas-connection.test`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 3: 文档域字段、导入保留与列表过滤

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`（`CanvasProjectDomain` 已在 Task 1 加入；本任务只在需要时补充类型导出）
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-project-domain.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-project-import.ts`
- Modify: `web/src/app/(user)/canvas/page.tsx`
- Test: `web/src/app/(user)/canvas/utils/canvas-project-domain.test.ts`（新建）
- Test: `web/src/app/(user)/canvas/utils/canvas-project-import.test.ts`（新建）

**Interfaces:**
- Consumes: `CanvasProjectDomain`、`CanvasFilmMeta`（Task 1）。
- Produces: `isFilmCanvasProject(project)`、`generalCanvasProjects(projects)`、`buildImportedCanvasProject(source, context)`；`CanvasProject.domain?`、`CanvasProject.film?`。

- [ ] **Step 1: 写过滤与导入测试**

新建 `web/src/app/(user)/canvas/utils/canvas-project-domain.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { generalCanvasProjects, isFilmCanvasProject } from "./canvas-project-domain";

test("filters film projects out of the general canvas list", () => {
    const projects = [
        { id: "general" },
        { id: "film", domain: "film" as const },
    ];

    assert.deepEqual(
        generalCanvasProjects(projects).map((project) => project.id),
        ["general"],
    );
    assert.equal(isFilmCanvasProject(projects[0]), false);
    assert.equal(isFilmCanvasProject(projects[1]), true);
});
```

新建 `web/src/app/(user)/canvas/utils/canvas-project-import.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildImportedCanvasProject } from "./canvas-project-import";

const context = {
    id: "fixed-id",
    now: "2026-11-21T00:00:00.000Z",
    viewport: { x: 0, y: 0, k: 1 },
    sidePanel: { open: true, width: 280 },
    agentPanel: { open: false, width: 464 },
};

test("keeps film domain fields when importing a project", () => {
    const project = buildImportedCanvasProject({
        title: "影视项目",
        domain: "film",
        film: { aspect: "16:9", stylePresetId: "custom", directorStyleId: "cinematic-classic" },
    }, context);

    assert.equal(project.id, "fixed-id");
    assert.equal(project.title, "影视项目");
    assert.equal(project.domain, "film");
    assert.equal(project.film?.aspect, "16:9");
    assert.equal(project.updatedAt, context.now);
});

test("keeps general canvas imports domainless", () => {
    const project = buildImportedCanvasProject({ title: "普通画布" }, context);

    assert.equal(project.domain, undefined);
    assert.equal(project.film, undefined);
    assert.equal(project.title, "普通画布");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test canvas-project-domain canvas-project-import`
Expected: FAIL，两个模块不存在。

- [ ] **Step 3: 实现过滤助手**

新建 `web/src/app/(user)/canvas/utils/canvas-project-domain.ts`：

```ts
import type { CanvasProjectDomain } from "../types";

export function isFilmCanvasProject(project: { domain?: CanvasProjectDomain }) {
    return project.domain === "film";
}

export function generalCanvasProjects<T extends { domain?: CanvasProjectDomain }>(projects: T[]) {
    return projects.filter((project) => !isFilmCanvasProject(project));
}
```

- [ ] **Step 4: 实现导入构造器**

新建 `web/src/app/(user)/canvas/utils/canvas-project-import.ts`：

```ts
import { detachRemixNodes } from "../[id]/lib/canvas-source-remix";
import type { CanvasProject } from "../stores/use-canvas-store";

type CanvasProjectImportContext = {
    id: string;
    now: string;
    viewport: CanvasProject["viewport"];
    sidePanel: CanvasProject["sidePanel"];
    agentPanel: CanvasProject["agentPanel"];
};

export function buildImportedCanvasProject(
    source: Partial<CanvasProject>,
    context: CanvasProjectImportContext,
): CanvasProject {
    return {
        id: context.id,
        title: source.title || "导入画布",
        createdAt: source.createdAt || context.now,
        updatedAt: context.now,
        nodes: detachRemixNodes(source.nodes || []),
        connections: source.connections || [],
        chatSessions: source.chatSessions || [],
        activeChatId: source.activeChatId || null,
        agentConfig: source.agentConfig || null,
        autoTitlePending: false,
        backgroundMode: source.backgroundMode || "lines",
        showImageInfo: source.showImageInfo || false,
        viewport: source.viewport || context.viewport,
        sidePanel: source.sidePanel || context.sidePanel,
        agentPanel: source.agentPanel || context.agentPanel,
        domain: source.domain,
        film: source.film,
    };
}
```

- [ ] **Step 5: 扩展 `CanvasProject` 与 store**

在 `web/src/app/(user)/canvas/stores/use-canvas-store.ts`：

1. 顶部导入改为同时引入影视类型与导入构造器：

```ts
import { buildImportedCanvasProject } from "../utils/canvas-project-import";
import type { CanvasAgentConfig, CanvasAssistantSession, CanvasConnection, CanvasFilmMeta, CanvasNodeData, CanvasPendingAgentRequest, CanvasProjectDomain, ViewportTransform } from "../types";
```

2. 删除原有的 `detachRemixNodes` 导入（已移入导入构造器）：

```ts
// 删除这一行
import { detachRemixNodes } from "../[id]/lib/canvas-source-remix";
```

3. 在 `CanvasProject` 末尾加入：

```ts
    domain?: CanvasProjectDomain;
    film?: CanvasFilmMeta;
```

4. 在 `updateProject` 的 `Pick` 中加入 `"domain"` 与 `"film"`：

```ts
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "agentConfig" | "autoTitlePending" | "backgroundMode" | "showImageInfo" | "viewport" | "sidePanel" | "agentPanel" | "pendingAgentRequest" | "domain" | "film">>) => void;
```

5. 把 `importProject` 的实现替换为：

```ts
            importProject: (source) => {
                const project = buildImportedCanvasProject(source, {
                    id: nanoid(),
                    now: new Date().toISOString(),
                    viewport: initialViewport,
                    sidePanel: DEFAULT_CANVAS_SIDE_PANEL,
                    agentPanel: DEFAULT_CANVAS_AGENT_PANEL,
                });
                set((state) => ({
                    projects: [project, ...state.projects],
                }));
                queueProjectSave(project);
                return project.id;
            },
```

- [ ] **Step 6: 画布列表过滤影视项目**

在 `web/src/app/(user)/canvas/page.tsx`：

1. 加入导入：

```ts
import { generalCanvasProjects } from "./utils/canvas-project-domain";
```

2. 把原来的：

```ts
    const projects = useCanvasStore((state) => state.projects);
```

改为：

```ts
    const allProjects = useCanvasStore((state) => state.projects);
    const projects = useMemo(() => generalCanvasProjects(allProjects), [allProjects]);
```

说明：`projects` 现在只含通用画布，数量、导出、删除全部、分页与空状态自动跟着过滤；影视项目不会出现在 `/canvas`。

- [ ] **Step 7: 跑测试确认通过**

Run: `cd web && bun test canvas-project-domain canvas-project-import`
Expected: PASS（3 个用例）。

- [ ] **Step 8: 自检类型**

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 9: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 4: 批次 0 验收

**Files:** 无代码改动。

- [ ] **Step 1: 跑影视域新增单测**

依次执行：

```bash
cd web
bun test canvas-film-node-factory
bun test canvas-connection.test
bun test canvas-project-domain
bun test canvas-project-import
```

Expected: 全部 PASS。

- [ ] **Step 2: 手工确认现有画布无回归**

启动 dev（按项目约定可由用户执行），确认：

1. `/canvas` 新建、重命名、删除、导出、导入 JSON 正常。
2. 原有节点创建、连线、批量生成、漫画册、发布入口不变。
3. 画布项目导入后 `domain` 为空、`film` 为空，列表仍显示。
4. 由于本批没有影视文档，`/canvas` 列表内容与改动前一致。

- [ ] **Step 3: 汇报**

列出改动文件、测试结果、手工确认结果；**不提交**，等待用户授权。

---

## 后续批次计划入口

- 批次 1：影视图原语（节点 UI、影视模式、创建项目、剧本/场次/镜头/资产/风格、绑定边、单镜生成、编译器改图输入）。
- 批次 2：视图与批量（镜头表、故事板板、时间轴、检查器、AI 拆镜写图、就绪/一致性/过期/库更新）。
- 批次 3：切换与删除（`/film` 列表切 store、`/film/[id]` 删除、旧 store/sync/任务/后端字段与列删除、同步墓碑与媒体上云）。

每批完成后先验收，再写下一批计划。
