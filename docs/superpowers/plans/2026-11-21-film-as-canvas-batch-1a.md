# 影视并入画布节点 批次 1A（图原语与模式骨架）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在画布上跑通影视图原语：影视画布文档、剧本/场次/镜头/资产节点、绑定/序列/归属边、按场整理与基础编辑，不接模型生成。

**Architecture:** 影视画布 = `CanvasProject(domain: "film")`；节点内容只做摘要展示，点击打开右侧 Drawer 检查器编辑 film payload；连接规则在 `normalizeConnection` 前置影视分支，并用纯函数校验重复绑定、单场景与序列成环；布局由纯函数按场分列。

**Tech Stack:** Next.js App Router、TypeScript、Zustand、Ant Design、Bun test。

**Spec:** `docs/superpowers/specs/2026-11-21-film-as-canvas-design.md`

## Global Constraints

- 唯一真源是画布文档；不新增 `FilmProject` 存储。
- 影视字段只放 `metadata.filmScript/filmScene/filmShot/filmAsset`。
- 本批不接生成、不接编译器、不接 AI 拆镜；这些在批次 1B。
- 旧影视工作台保持原样，不删除；批次 3 统一删除。
- 复用 `createFilmAsset`（`film/utils/film-edits.ts`）作为唯一资产工厂，不复制第二份；批次 3 删除工作台时再迁到 `lib/film/`。
- 影视画布创建入口只在开发开关后可见：`NEXT_PUBLIC_ENABLE_FILM_CANVAS=1`；执行者不修改 `.env.local`，由用户设置并重启 dev。
- 不自动 `git commit` / `git push`；提交与推送需用户单独授权。
- 执行者跑单测；最终构建与类型检查由用户执行（AGENTS.md）。执行者可用 `bun run typecheck` / `bun run lint` 自检。
- 测试命令在 `web/` 下执行，例如 `bun test film-layout`。

## Scope

本计划只覆盖批次 1A（图原语与模式骨架）。批次 1B（编译器改图输入、单镜出图/出视频、任务恢复、资产槽位编辑器）在 1A 验收后另写计划。

---

### Task 1: 影视模式开关、画布文档工厂与开发入口

**Files:**
- Create: `web/src/app/(user)/canvas/utils/film-mode.ts`
- Create: `web/src/app/(user)/canvas/utils/film-canvas-project.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`
- Modify: `web/src/app/(user)/canvas/page.tsx`
- Test: `web/src/app/(user)/canvas/utils/film-mode.test.ts`（新建）
- Test: `web/src/app/(user)/canvas/utils/film-canvas-project.test.ts`（新建）

**Interfaces:**
- Consumes: `CanvasNodeType`、`createCanvasNode`、`createFilmAsset`、`DEFAULT_FILM_STYLE`、`DEFAULT_DIRECTOR_STYLE_ID`。
- Produces: `FILM_CANVAS_DEV`、`isFilmCanvasNodeType(type)`、`buildFilmCanvasProject(title, context)`、store `createFilmProject(title?)`。

- [ ] **Step 1: 写失败测试**

新建 `film-mode.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../types";
import { isFilmCanvasNodeType } from "./film-mode";

test("identifies film node types", () => {
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Script), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Scene), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Shot), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.FilmAsset), true);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Image), false);
    assert.equal(isFilmCanvasNodeType(CanvasNodeType.Text), false);
});
```

新建 `film-canvas-project.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../types";
import { buildFilmCanvasProject } from "./film-canvas-project";

const context = {
    id: "film-1",
    now: "2026-11-21T00:00:00.000Z",
    viewport: { x: 0, y: 0, k: 1 },
    sidePanel: { open: true, width: 280 },
    agentPanel: { open: false, width: 464 },
};

test("builds a film canvas document with script, unique style and one scene", () => {
    const project = buildFilmCanvasProject("测试影视", context);

    assert.equal(project.id, "film-1");
    assert.equal(project.domain, "film");
    assert.equal(project.film?.aspect, "16:9");
    assert.equal(project.nodes.length, 3);
    assert.equal(project.connections.length, 0);

    const scripts = project.nodes.filter((node) => node.type === CanvasNodeType.Script);
    const scenes = project.nodes.filter((node) => node.type === CanvasNodeType.Scene);
    const styles = project.nodes.filter((node) => node.metadata?.filmAsset?.kind === "style");
    assert.equal(scripts.length, 1);
    assert.equal(scenes.length, 1);
    assert.equal(styles.length, 1);
    assert.equal(scripts[0]?.metadata?.filmScript?.text, "");
    assert.equal(scenes[0]?.metadata?.filmScene?.episodeTitle, "第 1 集");
});

test("falls back to a default title", () => {
    const project = buildFilmCanvasProject("   ", context);
    assert.equal(project.title, "未命名影视画布");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-mode`；`cd web && bun test film-canvas-project`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现开关与节点判定**

新建 `web/src/app/(user)/canvas/utils/film-mode.ts`：

```ts
import { CanvasNodeType } from "../types";

export const FILM_CANVAS_DEV = process.env.NEXT_PUBLIC_ENABLE_FILM_CANVAS === "1";

const FILM_NODE_TYPES: CanvasNodeType[] = [
    CanvasNodeType.Script,
    CanvasNodeType.Scene,
    CanvasNodeType.Shot,
    CanvasNodeType.FilmAsset,
];

export function isFilmCanvasNodeType(type: CanvasNodeType) {
    return FILM_NODE_TYPES.includes(type);
}
```

- [ ] **Step 4: 实现画布文档工厂**

新建 `web/src/app/(user)/canvas/utils/film-canvas-project.ts`：

```ts
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { DEFAULT_DIRECTOR_STYLE_ID } from "@/lib/film/director-styles";
import { DEFAULT_FILM_STYLE } from "@/lib/film/film-styles";
import { createCanvasNode } from "../[id]/lib/canvas-node-factory";
import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType } from "../types";

export type FilmCanvasProjectContext = {
    id: string;
    now: string;
    viewport: CanvasProject["viewport"];
    sidePanel: CanvasProject["sidePanel"];
    agentPanel: CanvasProject["agentPanel"];
};

export function buildFilmCanvasProject(title: string, context: FilmCanvasProjectContext): CanvasProject {
    const script = createCanvasNode(CanvasNodeType.Script, { x: -560, y: 300 }, {
        filmScript: { text: "", parseSnapshots: [] },
    }, `${context.id}-script`);
    const style = createCanvasNode(CanvasNodeType.FilmAsset, { x: -560, y: -220 }, {
        filmAsset: { kind: "style", asset: createFilmAsset("style", 1) },
    }, `${context.id}-style`);
    const scene = createCanvasNode(CanvasNodeType.Scene, { x: 260, y: 160 }, {
        filmScene: {
            episodeId: "episode-1",
            episodeTitle: "第 1 集",
            name: "场景 1",
            location: "",
            time: "",
            mood: "",
        },
    }, `${context.id}-scene-1`);
    style.title = "风格圣经";

    return {
        id: context.id,
        title: title.trim() || "未命名影视画布",
        createdAt: context.now,
        updatedAt: context.now,
        nodes: [style, script, scene],
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
        domain: "film",
        film: {
            aspect: "16:9",
            stylePresetId: DEFAULT_FILM_STYLE,
            directorStyleId: DEFAULT_DIRECTOR_STYLE_ID,
        },
    };
}
```

- [ ] **Step 5: 给 store 增加 createFilmProject**

在 `web/src/app/(user)/canvas/stores/use-canvas-store.ts`：

1. 增加导入：

```ts
import { buildFilmCanvasProject } from "../utils/film-canvas-project";
```

2. 在 `CanvasStore` 类型中 `createProject` 之后加入：

```ts
    createFilmProject: (title?: string) => string;
```

3. 在 store 实现中 `createProject` 之后加入：

```ts
            createFilmProject: (title = "未命名影视画布") => {
                const project = buildFilmCanvasProject(title, {
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

- [ ] **Step 6: 开发入口与影视画布列表**

在 `web/src/app/(user)/canvas/page.tsx`：

1. 把 `Clapperboard` 并入现有 `lucide-react` 导入，并把域过滤导入合并为一行：

```ts
import { Clapperboard, Download, FileUp, Plus, Trash2 } from "lucide-react";
import { FILM_CANVAS_DEV } from "./utils/film-mode";
import { generalCanvasProjects, isFilmCanvasProject } from "./utils/canvas-project-domain";
```

（原 `import { generalCanvasProjects } ...` 行删除，避免重复导入。）

2. 取 store action：

```ts
    const createFilmProject = useCanvasStore((state) => state.createFilmProject);
```

3. 在 `projects` 之后派生影视列表：

```ts
    const filmProjects = useMemo(
        () => (FILM_CANVAS_DEV ? allProjects.filter(isFilmCanvasProject) : []),
        [allProjects],
    );
```

4. 在 PageHeader 的 `actions` 中「新建画布」后加入：

```tsx
                            {FILM_CANVAS_DEV ? (
                                <Button disabled={!hydrated} icon={<Clapperboard className="size-4" />} onClick={() => enterProject(createFilmProject("未命名影视画布"))}>
                                    新建影视画布（开发）
                                </Button>
                            ) : null}
```

5. 在 PageHeader 之后、项目搜索条之前加入开发用影视列表，避免建完离开后找不到：

```tsx
                {FILM_CANVAS_DEV && filmProjects.length ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/40 p-3">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">影视画布（开发）</span>
                        {filmProjects.map((project) => (
                            <Button key={project.id} size="small" onClick={() => enterProject(project.id)}>
                                {project.title} · {project.nodes.length} 节点
                            </Button>
                        ))}
                    </div>
                ) : null}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `cd web && bun test film-mode`；`cd web && bun test film-canvas-project`
Expected: PASS（3 个用例）。

- [ ] **Step 8: 类型检查**

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 9: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 2: 影视连接规则与绑定/序列/归属边

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/canvas-connections.ts`
- Create: `web/src/app/(user)/canvas/[id]/lib/film-connections.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`（connectNodes）
- Test: `web/src/app/(user)/canvas/[id]/lib/film-connections.test.ts`（新建）

**Interfaces:**
- Consumes: `CanvasNodeData`、`CanvasConnection`、`CanvasConnectionKind`、`FilmBindingEdgeData`、`isFilmCanvasNodeType`。
- Produces: `CanvasNormalizedConnection`；`normalizeConnection` 返回影视边的 `kind/data`；`canAddFilmConnection(connection, nodes, connections)`。

- [ ] **Step 1: 写失败测试**

新建 `film-connections.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { normalizeConnection } from "./canvas-connections";
import { canAddFilmConnection } from "./film-connections";

const asset = (id: string, kind: "character" | "location" | "prop" | "costume" | "style"): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmAsset,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: { filmAsset: { kind, asset: { id, name: id } as FilmAsset } },
});

const node = (id: string, type: CanvasNodeType): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: {},
});

const nodes = [
    asset("char", "character"),
    asset("loc1", "location"),
    asset("loc2", "location"),
    asset("prop", "prop"),
    asset("costume", "costume"),
    asset("style", "style"),
    node("shot", CanvasNodeType.Shot),
    node("scene1", CanvasNodeType.Scene),
    node("scene2", CanvasNodeType.Scene),
];

test("character/location/prop assets bind to shots in the asset direction", () => {
    assert.deepEqual(normalizeConnection("char", "shot", nodes, "source"), {
        fromNodeId: "char",
        toNodeId: "shot",
        kind: "binding",
        data: { source: "manual" },
    });
    assert.deepEqual(normalizeConnection("shot", "char", nodes, "source"), {
        fromNodeId: "char",
        toNodeId: "shot",
        kind: "binding",
        data: { source: "manual" },
    });
});

test("costume/style cannot connect and film nodes never fall back to generic rules", () => {
    assert.equal(normalizeConnection("costume", "shot", nodes, "source"), null);
    assert.equal(normalizeConnection("style", "shot", nodes, "source"), null);
    assert.equal(normalizeConnection("char", "scene1", nodes, "source"), null);
    assert.equal(normalizeConnection("shot", "shot", nodes, "source"), null);
});

test("scene composition and shot sequence directions", () => {
    assert.deepEqual(normalizeConnection("scene1", "shot", nodes, "source"), {
        fromNodeId: "scene1",
        toNodeId: "shot",
        kind: "composition",
    });
    assert.deepEqual(normalizeConnection("shot", "scene1", nodes, "source"), {
        fromNodeId: "scene1",
        toNodeId: "shot",
        kind: "composition",
    });
    const shot2 = node("shot2", CanvasNodeType.Shot);
    const withShot2 = [...nodes, shot2];
    assert.deepEqual(normalizeConnection("shot2", "shot", withShot2, "target"), {
        fromNodeId: "shot",
        toNodeId: "shot2",
        kind: "sequence",
    });
});

test("rejects duplicate binding, duplicate location and duplicate scene", () => {
    const existing: CanvasConnection[] = [
        { id: "e1", fromNodeId: "char", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
        { id: "e2", fromNodeId: "loc1", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
        { id: "e3", fromNodeId: "scene1", toNodeId: "shot", kind: "composition" },
    ];
    assert.equal(canAddFilmConnection(normalizeConnection("char", "shot", nodes, "source")!, nodes, existing).ok, false);
    assert.equal(canAddFilmConnection(normalizeConnection("loc2", "shot", nodes, "source")!, nodes, existing).ok, false);
    assert.equal(canAddFilmConnection(normalizeConnection("scene2", "shot", nodes, "source")!, nodes, existing).ok, false);
});

test("rejects sequence cycles and accepts a valid sequence", () => {
    const shot2 = node("shot2", CanvasNodeType.Shot);
    const withShot2 = [...nodes, shot2];
    const existing: CanvasConnection[] = [{ id: "e1", fromNodeId: "shot2", toNodeId: "shot", kind: "sequence" }];
    const cycle = normalizeConnection("shot", "shot2", withShot2, "source")!;
    assert.equal(canAddFilmConnection(cycle, withShot2, existing).ok, false);

    const valid = normalizeConnection("shot", "shot2", withShot2, "source")!;
    assert.equal(canAddFilmConnection(valid, withShot2, []).ok, true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-connections`
Expected: FAIL，`film-connections` 模块不存在，`normalizeConnection` 没有影视分支。

- [ ] **Step 3: 扩展 normalizeConnection**

在 `web/src/app/(user)/canvas/[id]/lib/canvas-connections.ts`：

1. 导入改为：

```ts
import { CanvasNodeType, type CanvasConnection, type CanvasConnectionKind, type CanvasNodeData, type ConnectionHandle, type FilmBindingEdgeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { isFilmCanvasNodeType } from "../../utils/film-mode";
```

2. 在文件顶部加入类型与影视分支：

```ts
export type CanvasNormalizedConnection = {
    fromNodeId: string;
    toNodeId: string;
    kind?: CanvasConnectionKind;
    data?: FilmBindingEdgeData;
};

function filmAssetKind(node: CanvasNodeData) {
    return node.type === CanvasNodeType.FilmAsset ? node.metadata?.filmAsset?.kind : undefined;
}

function normalizeFilmConnection(
    first: CanvasNodeData,
    second: CanvasNodeData,
    firstHandleType: "source" | "target",
): CanvasNormalizedConnection | null {
    if (first.type === CanvasNodeType.FilmAsset && second.type === CanvasNodeType.Shot) {
        const kind = filmAssetKind(first);
        if (kind === "character" || kind === "location" || kind === "prop") {
            return { fromNodeId: first.id, toNodeId: second.id, kind: "binding", data: { source: "manual" } };
        }
        return null;
    }
    if (first.type === CanvasNodeType.Shot && second.type === CanvasNodeType.FilmAsset) {
        const kind = filmAssetKind(second);
        if (kind === "character" || kind === "location" || kind === "prop") {
            return { fromNodeId: second.id, toNodeId: first.id, kind: "binding", data: { source: "manual" } };
        }
        return null;
    }
    if (first.type === CanvasNodeType.Scene && second.type === CanvasNodeType.Shot) {
        return { fromNodeId: first.id, toNodeId: second.id, kind: "composition" };
    }
    if (first.type === CanvasNodeType.Shot && second.type === CanvasNodeType.Scene) {
        return { fromNodeId: second.id, toNodeId: first.id, kind: "composition" };
    }
    if (first.type === CanvasNodeType.Shot && second.type === CanvasNodeType.Shot) {
        return firstHandleType === "source"
            ? { fromNodeId: first.id, toNodeId: second.id, kind: "sequence" }
            : { fromNodeId: second.id, toNodeId: first.id, kind: "sequence" };
    }
    return null;
}
```

3. 把 `normalizeConnection` 的返回类型改为 `CanvasNormalizedConnection | null`，并在找到 `first/second` 后先走影视分支：

```ts
export function normalizeConnection(
    firstNodeId: string,
    secondNodeId: string,
    nodes: CanvasNodeData[],
    firstHandleType: "source" | "target",
): CanvasNormalizedConnection | null {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    const film = normalizeFilmConnection(first, second, firstHandleType);
    if (film) return film;
    if (isFilmCanvasNodeType(first.type) || isFilmCanvasNodeType(second.type)) return null;
    if (first.type === CanvasNodeType.Group || second.type === CanvasNodeType.Group) return null;
    // 以下保留原有通用规则，不再改动
```

- [ ] **Step 4: 实现连接校验**

新建 `web/src/app/(user)/canvas/[id]/lib/film-connections.ts`：

```ts
import type { CanvasConnection, CanvasNodeData } from "../../types";
import type { CanvasNormalizedConnection } from "./canvas-connections";

export type FilmConnectionCheck = { ok: true } | { ok: false; reason: string };

export function canAddFilmConnection(
    connection: CanvasNormalizedConnection,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
): FilmConnectionCheck {
    if (connections.some((edge) => edge.fromNodeId === connection.fromNodeId && edge.toNodeId === connection.toNodeId)) {
        return { ok: false, reason: "这两个节点已经连接" };
    }
    if (connection.kind === "binding") {
        const source = nodes.find((node) => node.id === connection.fromNodeId);
        if (source?.metadata?.filmAsset?.kind === "location") {
            const hasLocation = connections.some((edge) => {
                if (edge.kind !== "binding" || edge.toNodeId !== connection.toNodeId) return false;
                const edgeSource = nodes.find((node) => node.id === edge.fromNodeId);
                return edgeSource?.metadata?.filmAsset?.kind === "location";
            });
            if (hasLocation) return { ok: false, reason: "每个镜头只能绑定一个场景" };
        }
    }
    if (connection.kind === "composition") {
        const hasScene = connections.some((edge) => edge.kind === "composition" && edge.toNodeId === connection.toNodeId && edge.fromNodeId !== connection.fromNodeId);
        if (hasScene) return { ok: false, reason: "镜头已归属其他场次，先删除旧连线" };
    }
    if (connection.kind === "sequence") {
        const outgoing = new Map<string, string[]>();
        connections.forEach((edge) => {
            if (edge.kind !== "sequence") return;
            outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) || []), edge.toNodeId]);
        });
        const stack = [...(outgoing.get(connection.toNodeId) || [])];
        const seen = new Set<string>();
        while (stack.length) {
            const id = stack.pop()!;
            if (id === connection.fromNodeId) return { ok: false, reason: "连续镜头不能成环" };
            if (seen.has(id)) continue;
            seen.add(id);
            stack.push(...(outgoing.get(id) || []));
        }
    }
    return { ok: true };
}
```

- [ ] **Step 5: connectNodes 写入 kind/data 并校验**

在 `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`：

1. 导入：

```ts
import { canAddFilmConnection } from "./lib/film-connections";
```

2. 把 `connectNodes` 中创建连接的部分改为：

```ts
            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning("这两个节点不能这样连接");
                return;
            }
            if (connection.kind) {
                const check = canAddFilmConnection(connection, nodesRef.current, connectionsRef.current);
                if (!check.ok) {
                    message.warning(check.reason);
                    return;
                }
            }
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === connection.fromNodeId && conn.toNodeId === connection.toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            }
            setContextMenu(null);
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd web && bun test film-connections`；`cd web && bun test canvas-connections`
Expected: 新测试全部 PASS；原有连接测试不回归。

- [ ] **Step 7: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 3: 按场整理布局与顶栏命令

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-layout.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-layout.test.ts`（新建）
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

**Interfaces:**
- Consumes: 节点、连接的 `kind === "sequence"/"composition"`。
- Produces: `orderSceneShots(shots, connections)`、`arrangeFilmNodes(nodes, connections)`、`FILM_LAYOUT`；顶栏 `filmMode`/`onArrangeFilm`。

- [ ] **Step 1: 写失败测试**

新建 `film-layout.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { arrangeFilmNodes, FILM_LAYOUT, orderSceneShots } from "./film-layout";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

const nodes = [
    node("style", CanvasNodeType.FilmAsset, { filmAsset: { kind: "style", asset: { id: "style", name: "风格" } as never } }),
    node("script", CanvasNodeType.Script),
    node("char", CanvasNodeType.FilmAsset, { filmAsset: { kind: "character", asset: { id: "char", name: "角色" } as never } }),
    node("scene1", CanvasNodeType.Scene, { filmScene: { episodeId: "episode-1", episodeTitle: "第 1 集", name: "场景 1", location: "", time: "", mood: "" } }),
    node("scene2", CanvasNodeType.Scene, { filmScene: { episodeId: "episode-2", episodeTitle: "第 2 集", name: "场景 2", location: "", time: "", mood: "" } }),
    node("shot1", CanvasNodeType.Shot),
    node("shot2", CanvasNodeType.Shot),
    node("shot3", CanvasNodeType.Shot),
];

const connections: CanvasConnection[] = [
    { id: "c1", fromNodeId: "scene1", toNodeId: "shot1", kind: "composition" },
    { id: "c2", fromNodeId: "scene1", toNodeId: "shot2", kind: "composition" },
    { id: "s1", fromNodeId: "shot2", toNodeId: "shot1", kind: "sequence" },
];

test("orders shots by sequence chain", () => {
    const ordered = orderSceneShots([nodes[5], nodes[6]], connections);
    assert.deepEqual(ordered.map((item) => item.id), ["shot2", "shot1"]);
});

test("arranges scenes in columns, shots below and assets on the left rail", () => {
    const arranged = arrangeFilmNodes(nodes, connections);
    const position = (id: string) => arranged.find((item) => item.id === id)?.position;
    assert.deepEqual(position("scene1"), { x: 0, y: 0 });
    assert.deepEqual(position("scene2"), { x: FILM_LAYOUT.columnWidth, y: 0 });
    assert.deepEqual(position("shot2"), { x: 0, y: FILM_LAYOUT.sceneHeight });
    assert.deepEqual(position("shot1"), { x: 0, y: FILM_LAYOUT.sceneHeight + FILM_LAYOUT.rowHeight });
    assert.deepEqual(position("shot3"), { x: FILM_LAYOUT.columnWidth * 2, y: 0 });
    assert.deepEqual(position("style"), { x: FILM_LAYOUT.assetX, y: -420 });
    assert.deepEqual(position("script"), { x: FILM_LAYOUT.assetX, y: FILM_LAYOUT.scriptY });
    assert.deepEqual(position("char"), { x: FILM_LAYOUT.assetX, y: 0 });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-layout`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现布局**

新建 `web/src/app/(user)/canvas/[id]/lib/film-layout.ts`：

```ts
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";

export const FILM_LAYOUT = {
    columnWidth: 620,
    rowHeight: 380,
    sceneHeight: 260,
    assetX: -620,
    scriptY: 360,
    assetGap: 460,
} as const;

function byPosition(a: CanvasNodeData, b: CanvasNodeData) {
    return a.position.y - b.position.y || a.position.x - b.position.x;
}

export function orderSceneShots(shots: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const ids = new Set(shots.map((shot) => shot.id));
    const byId = new Map(shots.map((shot) => [shot.id, shot]));
    const sequence = connections.filter((edge) => edge.kind === "sequence" && ids.has(edge.fromNodeId) && ids.has(edge.toNodeId));
    const incoming = new Set(sequence.map((edge) => edge.toNodeId));
    const outgoing = new Map<string, string[]>();
    sequence.forEach((edge) => outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) || []), edge.toNodeId]));
    const ordered: CanvasNodeData[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        const node = byId.get(id);
        if (node) ordered.push(node);
        const next = [...(outgoing.get(id) || [])].sort((left, right) => {
            const a = byId.get(left);
            const b = byId.get(right);
            return a && b ? byPosition(a, b) : 0;
        });
        next.forEach(visit);
    };
    shots.filter((shot) => !incoming.has(shot.id)).sort(byPosition).forEach((shot) => visit(shot.id));
    shots.slice().sort(byPosition).forEach((shot) => visit(shot.id));
    return ordered;
}

export function arrangeFilmNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const scenes = nodes
        .filter((node) => node.type === CanvasNodeType.Scene)
        .slice()
        .sort((a, b) => {
            const left = a.metadata?.filmScene?.episodeId || "";
            const right = b.metadata?.filmScene?.episodeId || "";
            return left.localeCompare(right) || byPosition(a, b);
        });
    const shots = nodes.filter((node) => node.type === CanvasNodeType.Shot);
    const shotById = new Map(shots.map((shot) => [shot.id, shot]));
    const composition = new Map<string, string[]>();
    connections.forEach((edge) => {
        if (edge.kind !== "composition") return;
        composition.set(edge.fromNodeId, [...(composition.get(edge.fromNodeId) || []), edge.toNodeId]);
    });
    const positions = new Map<string, { x: number; y: number }>();
    const assigned = new Set<string>();
    scenes.forEach((scene, index) => {
        positions.set(scene.id, { x: index * FILM_LAYOUT.columnWidth, y: 0 });
        const sceneShots = (composition.get(scene.id) || [])
            .map((id) => shotById.get(id))
            .filter((shot): shot is CanvasNodeData => Boolean(shot));
        sceneShots.forEach((shot) => assigned.add(shot.id));
        orderSceneShots(sceneShots, connections).forEach((shot, shotIndex) => {
            positions.set(shot.id, {
                x: index * FILM_LAYOUT.columnWidth,
                y: FILM_LAYOUT.sceneHeight + shotIndex * FILM_LAYOUT.rowHeight,
            });
        });
    });
    const unassigned = orderSceneShots(shots.filter((shot) => !assigned.has(shot.id)), connections);
    const unassignedX = scenes.length * FILM_LAYOUT.columnWidth;
    unassigned.forEach((shot, index) => {
        positions.set(shot.id, { x: unassignedX, y: index * FILM_LAYOUT.rowHeight });
    });
    const assets = nodes
        .filter((node) => node.type === CanvasNodeType.FilmAsset && node.metadata?.filmAsset?.kind !== "style")
        .slice()
        .sort((a, b) => (a.title || "").localeCompare(b.title || "") || byPosition(a, b));
    assets.forEach((asset, index) => {
        positions.set(asset.id, { x: FILM_LAYOUT.assetX, y: index * FILM_LAYOUT.assetGap });
    });
    const style = nodes.find((node) => node.metadata?.filmAsset?.kind === "style");
    if (style) positions.set(style.id, { x: FILM_LAYOUT.assetX, y: -420 });
    const script = nodes.find((node) => node.type === CanvasNodeType.Script);
    if (script) positions.set(script.id, { x: FILM_LAYOUT.assetX, y: FILM_LAYOUT.scriptY });
    return nodes.map((node) => {
        const next = positions.get(node.id);
        return next ? { ...node, position: next } : node;
    });
}
```

- [ ] **Step 4: 顶栏加入按场整理**

在 `web/src/app/(user)/canvas/[id]/components/canvas-top-bar.tsx`：

1. 从 `lucide-react` 导入 `LayoutGrid`。
2. 函数参数加入 `filmMode` 与 `onArrangeFilm`，类型同步补 `filmMode: boolean; onArrangeFilm: () => void;`。
3. 在 Zen 按钮之前加入：

```tsx
                    {filmMode ? (
                        <button
                            type="button"
                            onClick={onArrangeFilm}
                            className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--canvas-topbar-hover)] [@media(pointer:coarse)]:size-10"
                            style={{ color: theme.node.text }}
                            aria-label="按场整理"
                            title="按场整理：场次分列、镜头按序列排列"
                        >
                            <LayoutGrid className="size-4" />
                        </button>
                    ) : null}
```

- [ ] **Step 5: 串通 workspace 与页面**

1. `canvas-workspace.tsx` 的 `CanvasShellModel` 加入：

```ts
    filmMode: boolean;
    onArrangeFilm: () => void;
```

2. 在 `CanvasWorkspace` 解构中取出这两个值，并在 `<CanvasTopBar ...>` 上传入：

```tsx
                    filmMode={filmMode}
                    onArrangeFilm={onArrangeFilm}
```

3. `canvas-client-page.tsx`：

```ts
import { arrangeFilmNodes } from "./lib/film-layout";
```

4. 在 `currentProject` 可用之后加入：

```ts
    const filmMode = currentProject?.domain === "film";
    const arrangeFilm = useCallback(() => {
        setNodes((prev) => arrangeFilmNodes(prev, connectionsRef.current));
        message.success("已按场整理");
    }, [message]);
```

5. 在构建 `workspace.shell` 时加入：

```ts
            filmMode,
            onArrangeFilm: arrangeFilm,
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd web && bun test film-layout`
Expected: PASS（2 个用例）。

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 7: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 4: 影视节点卡片

**Files:**
- Create: `web/src/app/(user)/canvas/components/film-node-card.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`

**Interfaces:**
- Consumes: `CanvasNodeData`、`CanvasTheme`、`FILM_ASSET_KIND_LABELS`。
- Produces: `FilmScriptNodeCard`、`FilmSceneNodeCard`、`FilmShotNodeCard`、`FilmAssetNodeCard`，并注册到 `nodeContentRenderers`。

- [ ] **Step 1: 实现卡片**

新建 `film-node-card.tsx`：

```tsx
"use client";

import type { ReactNode } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { CanvasNodeData } from "../types";

function CardShell({ theme, label, children }: { theme: CanvasTheme; label: string; children: ReactNode }) {
    return (
        <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-4" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                <span className="font-mono tracking-[0.12em] uppercase">{label}</span>
                <span>点击编辑</span>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto text-sm leading-6" style={{ color: theme.node.muted }}>
                {children}
            </div>
        </div>
    );
}

export function FilmScriptNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const text = node.metadata?.filmScript?.text?.trim() || "";
    return (
        <CardShell theme={theme} label="剧本">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs">{text || "空剧本，点击填写正文"}</pre>
        </CardShell>
    );
}

export function FilmSceneNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const scene = node.metadata?.filmScene;
    const heading = [scene?.episodeTitle, scene?.name].filter(Boolean).join(" · ") || "未命名场次";
    const details = [scene?.location, scene?.time, scene?.mood].filter(Boolean).join(" / ");
    return (
        <CardShell theme={theme} label="场次">
            <div className="font-medium" style={{ color: theme.node.text }}>{heading}</div>
            <div className="mt-1 text-xs">{details || "点击填写地点、时间与气氛"}</div>
            {scene?.notes ? <div className="mt-2 text-xs">{scene.notes}</div> : null}
        </CardShell>
    );
}

export function FilmShotNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const shot = node.metadata?.filmShot;
    return (
        <CardShell theme={theme} label="镜头">
            <div className="font-mono text-xs">{shot?.shotNo || "未编号"}</div>
            <div className="mt-1" style={{ color: theme.node.text }}>{shot?.shotType || "未设置景别"} · {shot?.duration ?? 0}s</div>
            <div className="mt-2 text-xs">{shot?.description || shot?.prompt || "点击填写镜头描述"}</div>
        </CardShell>
    );
}

export function FilmAssetNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const payload = node.metadata?.filmAsset;
    const label = payload ? FILM_ASSET_KIND_LABELS[payload.kind] : "影视资产";
    return (
        <CardShell theme={theme} label={label}>
            <div className="font-medium" style={{ color: theme.node.text }}>{payload?.asset.name || node.title}</div>
            <div className="mt-1 text-xs">{payload?.asset.description || payload?.asset.visualPrompt || "点击填写设定"}</div>
        </CardShell>
    );
}
```

- [ ] **Step 2: 注册节点渲染器**

在 `web/src/app/(user)/canvas/components/canvas-node.tsx`：

1. 导入：

```ts
import { FilmAssetNodeCard, FilmSceneNodeCard, FilmScriptNodeCard, FilmShotNodeCard } from "./film-node-card";
```

2. 在 `nodeContentRenderers` 中加入：

```ts
    [CanvasNodeType.Script]: (props) => <FilmScriptNodeCard node={props.node} theme={props.theme} />,
    [CanvasNodeType.Scene]: (props) => <FilmSceneNodeCard node={props.node} theme={props.theme} />,
    [CanvasNodeType.Shot]: (props) => <FilmShotNodeCard node={props.node} theme={props.theme} />,
    [CanvasNodeType.FilmAsset]: (props) => <FilmAssetNodeCard node={props.node} theme={props.theme} />,
```

- [ ] **Step 3: 类型检查**

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 4: 检查点**

汇报改动。不要提交。

---

### Task 5: 影视检查器 Drawer 与点击编辑

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-film-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-stage-overlays.tsx`

**Interfaces:**
- Consumes: `CanvasNodeData`、`CanvasTheme`、`CANVAS_Z.popover`、影视 payload 类型。
- Produces: `CanvasFilmInspector`；点击影视节点打开右侧 Drawer；隐藏影视节点的通用悬浮工具条。

- [ ] **Step 1: 实现检查器**

新建 `canvas-film-inspector.tsx`：

```tsx
"use client";

import type { ReactNode } from "react";
import { Drawer, Input, InputNumber } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset } from "@/lib/film/types";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../[id]/lib/canvas-layer";
import { CanvasNodeType, type CanvasNodeData, type FilmAssetNodeData, type FilmSceneNodeData, type FilmScriptNodeData, type FilmShotNodeData } from "../types";

type CanvasFilmInspectorProps = {
    open: boolean;
    node: CanvasNodeData | null;
    onClose: () => void;
    onChange: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
};

const TITLES: Partial<Record<CanvasNodeType, string>> = {
    [CanvasNodeType.Script]: "剧本",
    [CanvasNodeType.Scene]: "场次",
    [CanvasNodeType.Shot]: "镜头",
    [CanvasNodeType.FilmAsset]: "影视资产",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ opacity: 0.6 }}>{label}</span>
            {children}
        </label>
    );
}

export function CanvasFilmInspector({ open, node, onClose, onChange }: CanvasFilmInspectorProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const patchScript = (patch: Partial<FilmScriptNodeData>) => onChange(node.id, (current) => ({
        ...current,
        metadata: { ...current.metadata, filmScript: { ...(current.metadata?.filmScript ?? { text: "", parseSnapshots: [] }), ...patch } },
    }));
    const patchScene = (patch: Partial<FilmSceneNodeData>) => onChange(node.id, (current) => ({
        ...current,
        metadata: { ...current.metadata, filmScene: { ...current.metadata?.filmScene!, ...patch } },
    }));
    const patchShot = (patch: Partial<FilmShotNodeData>) => onChange(node.id, (current) => ({
        ...current,
        metadata: { ...current.metadata, filmShot: { ...current.metadata?.filmShot!, ...patch } },
    }));
    const patchAsset = (patch: Partial<FilmAsset>) => onChange(node.id, (current) => {
        const payload = current.metadata?.filmAsset;
        if (!payload) return current;
        return {
            ...current,
            metadata: {
                ...current.metadata,
                filmAsset: { ...payload, asset: { ...payload.asset, ...patch, updatedAt: new Date().toISOString() } },
            },
        };
    });
    const script = node.metadata?.filmScript;
    const scene = node.metadata?.filmScene;
    const shot = node.metadata?.filmShot;
    const payload: FilmAssetNodeData | undefined = node.metadata?.filmAsset;

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size={420}
            zIndex={CANVAS_Z.popover}
            title={`${TITLES[node.type] || "影视节点"} · 编辑`}
            styles={{
                header: { background: theme.node.panel, color: theme.node.text },
                body: { background: theme.node.panel, color: theme.node.text, paddingTop: 12 },
            }}
        >
            <div className="flex flex-col gap-3">
                {node.type === CanvasNodeType.Script ? (
                    <Field label="剧本正文">
                        <Input.TextArea
                            value={script?.text || ""}
                            autoSize={{ minRows: 12, maxRows: 24 }}
                            style={inputStyle}
                            onChange={(event) => patchScript({ text: event.target.value })}
                        />
                    </Field>
                ) : null}
                {node.type === CanvasNodeType.Scene ? (
                    <>
                        <Field label="集标题">
                            <Input value={scene?.episodeTitle || ""} style={inputStyle} onChange={(event) => patchScene({ episodeTitle: event.target.value })} />
                        </Field>
                        <Field label="场次名称">
                            <Input value={scene?.name || ""} style={inputStyle} onChange={(event) => patchScene({ name: event.target.value })} />
                        </Field>
                        <Field label="地点">
                            <Input value={scene?.location || ""} style={inputStyle} onChange={(event) => patchScene({ location: event.target.value })} />
                        </Field>
                        <Field label="时间">
                            <Input value={scene?.time || ""} style={inputStyle} onChange={(event) => patchScene({ time: event.target.value })} />
                        </Field>
                        <Field label="气氛">
                            <Input value={scene?.mood || ""} style={inputStyle} onChange={(event) => patchScene({ mood: event.target.value })} />
                        </Field>
                        <Field label="备注">
                            <Input.TextArea value={scene?.notes || ""} autoSize={{ minRows: 2, maxRows: 6 }} style={inputStyle} onChange={(event) => patchScene({ notes: event.target.value })} />
                        </Field>
                    </>
                ) : null}
                {node.type === CanvasNodeType.Shot ? (
                    <>
                        <Field label="镜号">
                            <Input value={shot?.shotNo || ""} style={inputStyle} onChange={(event) => patchShot({ shotNo: event.target.value })} />
                        </Field>
                        <Field label="景别">
                            <Input value={shot?.shotType || ""} style={inputStyle} onChange={(event) => patchShot({ shotType: event.target.value })} />
                        </Field>
                        <Field label="时长（秒）">
                            <InputNumber min={1} max={60} value={shot?.duration ?? 4} style={{ ...inputStyle, width: "100%" }} onChange={(value) => patchShot({ duration: value ?? 4 })} />
                        </Field>
                        <Field label="运镜">
                            <Input value={shot?.cameraMovement || ""} style={inputStyle} onChange={(event) => patchShot({ cameraMovement: event.target.value })} />
                        </Field>
                        <Field label="画面描述">
                            <Input.TextArea value={shot?.description || ""} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchShot({ description: event.target.value })} />
                        </Field>
                        <Field label="画面提示词">
                            <Input.TextArea value={shot?.prompt || ""} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchShot({ prompt: event.target.value })} />
                        </Field>
                        <Field label="负面提示词">
                            <Input.TextArea value={shot?.negativePrompt || ""} autoSize={{ minRows: 2, maxRows: 6 }} style={inputStyle} onChange={(event) => patchShot({ negativePrompt: event.target.value })} />
                        </Field>
                    </>
                ) : null}
                {node.type === CanvasNodeType.FilmAsset && payload ? (
                    <>
                        <Field label="资产类型">
                            <Input value={FILM_ASSET_KIND_LABELS[payload.kind]} disabled style={inputStyle} />
                        </Field>
                        <Field label="名称">
                            <Input value={payload.asset.name} style={inputStyle} onChange={(event) => patchAsset({ name: event.target.value })} />
                        </Field>
                        <Field label="设定描述">
                            <Input.TextArea value={payload.asset.description} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchAsset({ description: event.target.value })} />
                        </Field>
                        <Field label="视觉提示">
                            <Input.TextArea value={payload.asset.visualPrompt} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchAsset({ visualPrompt: event.target.value })} />
                        </Field>
                        <div className="text-xs" style={{ color: theme.node.muted }}>参考图槽位编辑在批次 1B 接入。</div>
                    </>
                ) : null}
            </div>
        </Drawer>
    );
}
```

- [ ] **Step 2: 页面接入检查器**

在 `canvas-client-page.tsx`：

1. 导入：

```ts
import { CanvasFilmInspector } from "./components/canvas-film-inspector";
import { isFilmCanvasNodeType } from "./utils/film-mode";
```

2. 增加状态（放在其他 `useState` 附近）：

```ts
    const [filmInspectorNodeId, setFilmInspectorNodeId] = useState<string | null>(null);
```

3. 派生检查器节点：

```ts
    const filmInspectorNode = filmInspectorNodeId ? nodes.find((node) => node.id === filmInspectorNodeId) ?? null : null;
```

4. `handleNodeClicked` 中加入影视分支（在 Group/Text 判断之前）：

```ts
        if (isFilmCanvasNodeType(clickedNode.type)) {
            setFilmInspectorNodeId(clickedNode.id);
            return;
        }
```

5. 页面返回处加入：

```tsx
        <CanvasFilmInspector
            open={Boolean(filmInspectorNode)}
            node={filmInspectorNode}
            onClose={() => setFilmInspectorNodeId(null)}
            onChange={(nodeId, updater) => {
                setNodes((prev) => prev.map((node) => (node.id === nodeId ? updater(node) : node)));
            }}
        />
```

6. 顺手把 `setFilmInspectorNodeId` 补进 `handleNodeClicked` 的依赖数组（setter 稳定，按现有 lint 习惯显式列出）。

- [ ] **Step 3: 隐藏影视节点的通用悬浮工具条**

在 `canvas-stage-overlays.tsx`：

1. 导入：

```ts
import { isFilmCanvasNodeType } from "../../utils/film-mode";
```

2. 在渲染前派生：

```ts
    const hoverToolbarNode = toolbarNode && !isFilmCanvasNodeType(toolbarNode.type) ? toolbarNode : null;
```

3. 把 `CanvasNodeHoverToolbar` 的 `node` 改为：

```tsx
                    node={isNodeDragging || nodeImageSettingsOpen ? null : hoverToolbarNode}
```

- [ ] **Step 4: 类型检查与 lint**

Run: `cd web && bun run typecheck`
Run: `cd web && bun run lint`
Expected: 通过。

- [ ] **Step 5: 检查点**

汇报改动。不要提交。

---

### Task 6: 影视节点创建菜单与资产节点

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-create-menus.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-stage-layer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

**Interfaces:**
- Consumes: `createFilmAsset`、`createCanvasNode`、`FilmAssetKind`。
- Produces: `NodeCreateMenu` 的 `filmMode`/`onCreateFilmAsset`；stage model 的 `filmMode`/`createFilmAssetNode`；页面创建资产节点。

- [ ] **Step 1: 扩展创建菜单**

在 `canvas-create-menus.tsx`：

1. 把新图标并入现有 `lucide-react` 导入（不要新增第二条同源 import）：

```ts
import { BookOpen, Box, Clapperboard, FileText, Globe2, ImageIcon, Images, Layers3, Link2, List, MapPin, Music2, Send, Settings2, Shirt, Upload, UserRound, Video } from "lucide-react";
import type { FilmAssetKind } from "@/lib/film/types";
```

2. `NodeCreateMenu` 参数加入：

```ts
    filmMode?: boolean;
    onCreateFilmAsset?: (kind: FilmAssetKind) => void;
```

3. 在通用节点选项之后加入：

```tsx
                {filmMode ? (
                    <>
                        <div className="px-1 pt-2 text-xs" style={{ color: theme.node.muted }}>影视</div>
                        <ConnectionCreateOption theme={theme} icon={<FileText className="size-5" />} title="剧本" description="剧本正文与拆镜入口" onClick={() => onCreate(CanvasNodeType.Script)} />
                        <ConnectionCreateOption theme={theme} icon={<Clapperboard className="size-5" />} title="场次" description="按集-场组织镜头" onClick={() => onCreate(CanvasNodeType.Scene)} />
                        <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="镜头" description="镜号、表演与画面" onClick={() => onCreate(CanvasNodeType.Shot)} />
                        <ConnectionCreateOption theme={theme} icon={<UserRound className="size-5" />} title="角色资产" onClick={() => onCreateFilmAsset?.("character")} />
                        <ConnectionCreateOption theme={theme} icon={<MapPin className="size-5" />} title="场景资产" onClick={() => onCreateFilmAsset?.("location")} />
                        <ConnectionCreateOption theme={theme} icon={<Box className="size-5" />} title="道具资产" onClick={() => onCreateFilmAsset?.("prop")} />
                        <ConnectionCreateOption theme={theme} icon={<Shirt className="size-5" />} title="服装资产" onClick={() => onCreateFilmAsset?.("costume")} />
                    </>
                ) : null}
```

- [ ] **Step 2: 串通 stage model**

在 `canvas-stage-layer.tsx`：

1. 导入类型：

```ts
import type { FilmAssetKind } from "@/lib/film/types";
```

2. 在 `CanvasStageModel` 中加入：

```ts
    filmMode: boolean;
    createFilmAssetNode: (kind: FilmAssetKind, position?: Position) => void;
```

3. 解构 `filmMode` 与 `createFilmAssetNode`。

4. `<NodeCreateMenu ...>` 加入：

```tsx
                            filmMode={filmMode}
                            onCreateFilmAsset={(kind) => {
                                createFilmAssetNode(kind, nodeCreatePosition);
                                setNodeCreatePosition(null);
                            }}
```

- [ ] **Step 3: 页面创建资产节点**

在 `canvas-client-page.tsx`：

1. 导入：

```ts
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import type { FilmAssetKind } from "@/lib/film/types";
```

2. 在 `createNode` 中修正创建后的浮层路由（影视节点打开检查器，不走图片提示词浮层）：

```ts
            if (type === CanvasNodeType.Comic) openOverlay({ kind: "comic", nodeId: newNode.id });
            else if (isFilmCanvasNodeType(type)) setFilmInspectorNodeId(newNode.id);
            else if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Director) openOverlay({ kind: "prompt", nodeId: newNode.id });
```

3. 在 `createNode` 之后加入：

```ts
    const createFilmAssetNode = useCallback((kind: FilmAssetKind, position?: Position) => {
        const target = position || getCanvasCenter();
        const count = nodesRef.current.filter((node) => node.type === CanvasNodeType.FilmAsset && node.metadata?.filmAsset?.kind === kind).length;
        const node = createCanvasNode(CanvasNodeType.FilmAsset, target, {
            filmAsset: { kind, asset: createFilmAsset(kind, count + 1) },
        });
        setNodes((prev) => [...prev, node]);
        selectOnly(node.id);
        setSelectedConnectionId(null);
        setFilmInspectorNodeId(node.id);
    }, [getCanvasCenter, nodesRef, selectOnly, setSelectedConnectionId, setFilmInspectorNodeId, setNodes]);
```

4. 在 `stage` model 中加入：

```ts
            filmMode,
            createFilmAssetNode,
```

5. 把 `setFilmInspectorNodeId` 补进 `createNode` 的依赖数组。

- [ ] **Step 4: 类型检查**

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 5: 检查点**

汇报改动。不要提交。

---

### Task 7: 批次 1A 验收

**Files:** 无代码改动。

- [ ] **Step 1: 跑新增单测**

依次执行：

```bash
cd web
bun test film-mode
bun test film-canvas-project
bun test film-connections
bun test canvas-connections
bun test film-layout
```

Expected: 全部 PASS。

- [ ] **Step 2: 跑全量检查**

```bash
cd web
bun run typecheck
bun run lint
bun test
```

Expected: 通过；测试总数在批次 0 的 614 基础上增加本批用例。

- [ ] **Step 3: 手工验收（需用户设置开关）**

在 `web/.env.local` 设置 `NEXT_PUBLIC_ENABLE_FILM_CANVAS=1` 并重启 dev：

1. `/canvas` 出现「新建影视画布（开发）」；创建后进入画布，能看到剧本、风格圣经、场次三个节点。
2. 节点创建菜单出现「影视」分区；可创建场次、镜头、角色/场景/道具/服装资产。
3. 角色资产连镜头出现绑定边；场次连镜头出现归属边；镜头连镜头出现序列边；重复场景/成环被拒绝。
4. 点击影视节点打开右侧检查器，编辑剧本正文、场次字段、镜头字段、资产设定；刷新后保留。
5. 点击顶栏「按场整理」，场次分列、镜头按序列纵向排列、资产在左侧、风格与剧本固定。
6. 通用画布节点、批量生成、漫画册、发布不受影响。

- [ ] **Step 4: 汇报**

列出改动文件、测试结果、手工验收结果；**不提交**，等待用户授权。

---

## 后续

- 批次 1B：编译器改图输入（`canvas document + shotNodeId`）、单镜出图/出视频、任务恢复、资产槽位编辑器。
- 批次 2：镜头表/故事板板/时间轴/完整检查器、批量、AI 拆镜写图、就绪/一致性。
- 批次 3：切换与彻底删除旧工作台、同步墓碑与媒体上云。
