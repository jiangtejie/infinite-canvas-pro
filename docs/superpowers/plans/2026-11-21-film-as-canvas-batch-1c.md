# 影视 Studio 独立入口与壳层 批次 1C 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为影视画布增加独立入口 `/film/studio/[id]` 和舞台式 Studio 壳层（单镜舞台 + 胶片条 + 左侧镜头设置），引擎、数据、任务与同步继续复用现有画布。

**Architecture:** 把 `canvas-client-page.tsx` 重命名为共享的 `CanvasEditor`；画布路由与 Studio 路由共用同一个编辑器与同一份 `CanvasWorkspaceModel`。`CanvasWorkspace` 增加可选 `filmStudio`：`studio` 视图渲染新主体，`graph` 视图仍是现有无限画布。Studio 当前镜头、场次切换与胶片条全部由纯 selector 从节点/连线派生，不新增存储。

**Tech Stack:** Next.js App Router、TypeScript、Zustand、Ant Design、Tailwind、Bun test。

**Spec:** `docs/superpowers/specs/2026-11-21-film-studio-shell-design.md`（父 spec：`2026-11-21-film-as-canvas-design.md`）

## Global Constraints

- 唯一真源是 `CanvasProject`；不新增 FilmProject、store、任务或同步。
- Studio 只是同一文档的视图；画布视图继续复用现有 `CanvasWorkspace`。
- 影视字段只读写 `metadata.filmShot/filmScene/filmAsset/filmScript`；不建第二套补丁/排序逻辑。
- 旧 `/film/[id]` 工作台保留到批次 3；1C 不删除旧工作台、不改旧数据。
- 不接生成、对比、版本、槽位编辑器（1B）；不做镜头表/故事板/时间轴（2）。
- 所有颜色走 `canvasThemes` token；不硬编码黑白/slate。
- 不自动 `git commit` / `git push`；提交与推送需用户单独授权。
- 执行者跑单测；最终构建由用户执行（AGENTS.md）。执行者可用 `typecheck`/`lint` 自检。
- 测试命令在 `web/` 下执行，例如 `bun test film-selectors`。

## Scope

本计划只覆盖批次 1C。批次 1B（生成/编译器/任务恢复/槽位编辑器）在 1C 验收后另写计划。

## File Structure

- Create `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts` — Studio 读模型类型。
- Create `web/src/app/(user)/canvas/[id]/lib/film-selectors.ts` — 场次/镜头排序、当前镜回退、绑定 chips、风格名。
- Create `web/src/app/(user)/canvas/[id]/lib/film-node-patch.ts` — 剧集/场次/镜头/资产纯补丁函数。
- Create `web/src/app/(user)/canvas/[id]/lib/film-shot-create.ts` — 在场次末尾追加镜头（节点 + 归属/序列边）。
- Create `web/src/app/(user)/canvas/[id]/components/film-studio-view-switch.tsx` — 浮动 Studio/画布切换。
- Create `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx` — Studio 主体布局 + 键盘 + 面板开合。
- Create `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx` — 左侧镜头设置。
- Create `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx` — 单镜舞台/空镜卡。
- Create `web/src/app/(user)/canvas/[id]/components/film-strip.tsx` — 底部胶片条。
- Rename `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` → `canvas-editor.tsx`。
- Modify `web/src/app/(user)/canvas/[id]/page.tsx` — 渲染 `<CanvasEditor />`。
- Create `web/src/app/(user)/film/studio/[id]/page.tsx` — 渲染 `<CanvasEditor studio />`。
- Create `web/src/app/(user)/film/studio/layout.tsx` — 标题「影视 Studio」。
- Modify `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx` — 可选 filmStudio、Studio 主体、视图切换。
- Modify `web/src/app/(user)/canvas/[id]/components/canvas-top-bar.tsx` — 场次选择、影视菜单文案、Studio 下隐藏侧栏/助手/按场整理。
- Modify `web/src/app/(user)/canvas/[id]/components/canvas-film-inspector.tsx` — 改用共享补丁函数。
- Modify `web/src/app/(user)/canvas/[id]/canvas-editor.tsx` — 影视/画布互相重定向；Studio 状态、actions、filmStudio 模型。
- Modify `web/src/app/(user)/film/page.tsx` — 影视画布入口。
- Modify `web/src/app/(user)/canvas/page.tsx` — 移除 1A 影视开发入口。
- Tests: `film-selectors.test.ts`、`film-node-patch.test.ts`、`film-shot-create.test.ts`。

---

### Task 1: Studio 读模型类型与选择器

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Create: `web/src/app/(user)/canvas/[id]/lib/film-selectors.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-selectors.test.ts`

**Interfaces:**
- Produces: `FilmStudioView`、`FilmSceneEntry`、`FilmShotEntry`、`FilmShotBindingChip`、`FilmStudioModel`；`selectFilmSceneEntries`、`selectActiveFilmShot`、`selectFilmShotBindings`、`selectFilmStyleName`。

- [ ] **Step 1: 写失败测试**

新建 `film-selectors.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { selectActiveFilmShot, selectFilmSceneEntries, selectFilmShotBindings, selectFilmStyleName } from "./film-selectors";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

const scene = (id: string, episodeId: string, name: string) => node(id, CanvasNodeType.Scene, {
    filmScene: { episodeId, episodeTitle: episodeId === "ep1" ? "第 1 集" : "第 2 集", name, location: "", time: "", mood: "" },
});
const shot = (id: string) => node(id, CanvasNodeType.Shot, { filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
const asset = (id: string, kind: "character" | "location" | "style") => node(id, CanvasNodeType.FilmAsset, { filmAsset: { kind, asset: { id, name: id } as FilmAsset } });

const nodes = [
    scene("scene1", "ep1", "场景 1"),
    scene("scene2", "ep2", "场景 2"),
    shot("shot1"),
    shot("shot2"),
    shot("shot3"),
    shot("shot4"),
    asset("char", "character"),
    asset("loc", "location"),
    asset("style", "style"),
];

const connections: CanvasConnection[] = [
    { id: "c1", fromNodeId: "scene1", toNodeId: "shot1", kind: "composition" },
    { id: "c2", fromNodeId: "scene1", toNodeId: "shot2", kind: "composition" },
    { id: "c3", fromNodeId: "scene2", toNodeId: "shot3", kind: "composition" },
    { id: "s1", fromNodeId: "shot2", toNodeId: "shot1", kind: "sequence" },
    { id: "b1", fromNodeId: "char", toNodeId: "shot1", kind: "binding", data: { source: "manual" } },
    { id: "b2", fromNodeId: "loc", toNodeId: "shot1", kind: "binding", data: { source: "manual" } },
];

test("groups scenes by episode and orders shots by sequence", () => {
    const scenes = selectFilmSceneEntries(nodes, connections);
    assert.deepEqual(scenes.map((item) => item.id), ["scene1", "scene2", "unassigned"]);
    assert.deepEqual(scenes[0].shots.map((item) => item.shot.id), ["shot2", "shot1"]);
    assert.deepEqual(scenes[2].shots.map((item) => item.shot.id), ["shot4"]);
});

test("selects the preferred shot, falls back to the scene's first shot, and handles empty scenes", () => {
    const scenes = selectFilmSceneEntries(nodes, connections);
    assert.equal(selectActiveFilmShot(scenes, "scene1", "shot1").shot?.shot.id, "shot1");
    assert.equal(selectActiveFilmShot(scenes, "scene1", "missing").shot?.shot.id, "shot2");
    assert.equal(selectActiveFilmShot(scenes, "unassigned", null).shot?.shot.id, "shot4");
    const emptyScene = scene("scene3", "ep3", "空场");
    const emptyScenes = selectFilmSceneEntries([...nodes, emptyScene], connections);
    const active = selectActiveFilmShot(emptyScenes, "scene3", null);
    assert.equal(active.scene?.id, "scene3");
    assert.equal(active.shot, null);
});

test("collects binding chips and the style name", () => {
    assert.deepEqual(selectFilmShotBindings(nodes, connections, "shot1"), [
        { id: "char", kind: "character", name: "char" },
        { id: "loc", kind: "location", name: "loc" },
    ]);
    assert.equal(selectFilmStyleName(nodes), "style");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-selectors`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现类型与选择器**

新建 `film-studio-types.ts`：

```ts
import type { FilmAspect, FilmAssetKind } from "@/lib/film/types";
import type { CanvasNodeData } from "../../types";

export type FilmStudioView = "studio" | "graph";

export type FilmShotEntry = {
    shot: CanvasNodeData;
    sceneId: string;
    sceneLabel: string;
    episodeTitle: string;
    index: number;
};

export type FilmSceneEntry = {
    id: string;
    label: string;
    episodeTitle: string;
    name: string;
    scene: CanvasNodeData | null;
    shots: FilmShotEntry[];
};

export type FilmShotBindingChip = {
    id: string;
    kind: FilmAssetKind;
    name: string;
};

export type FilmStudioModel = {
    view: FilmStudioView;
    onViewChange: (view: FilmStudioView) => void;
    aspect: FilmAspect;
    scenes: FilmSceneEntry[];
    shots: FilmShotEntry[];
    activeSceneId: string | null;
    activeShot: FilmShotEntry | null;
    activeBindings: FilmShotBindingChip[];
    styleName: string | null;
    onSceneChange: (sceneId: string) => void;
    onSelectShot: (shotId: string) => void;
    onUpdateShot: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onCreateShot: (sceneId?: string) => void;
    onLocateInGraph: (shotId: string) => void;
};
```

新建 `film-selectors.ts`：

```ts
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { orderSceneShots } from "./film-layout";
import type { FilmSceneEntry, FilmShotBindingChip, FilmShotEntry } from "./film-studio-types";

export const UNASSIGNED_SCENE_ID = "unassigned";

function sceneMeta(node: CanvasNodeData) {
    return node.metadata?.filmScene;
}

function labelFor(scene: CanvasNodeData) {
    const meta = sceneMeta(scene);
    return [meta?.episodeTitle, meta?.name].filter(Boolean).join(" · ") || "未命名场次";
}

function byPosition(a: CanvasNodeData, b: CanvasNodeData) {
    return a.position.y - b.position.y || a.position.x - b.position.x;
}

export function selectFilmSceneEntries(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmSceneEntry[] {
    const shotNodes = nodes.filter((node) => node.type === CanvasNodeType.Shot);
    const shotById = new Map(shotNodes.map((node) => [node.id, node]));
    const shotIds = new Set(shotNodes.map((node) => node.id));
    const scenes = nodes
        .filter((node) => node.type === CanvasNodeType.Scene)
        .slice()
        .sort((a, b) => {
            const left = sceneMeta(a)?.episodeId || "";
            const right = sceneMeta(b)?.episodeId || "";
            return left.localeCompare(right) || byPosition(a, b);
        });
    const composition = new Map<string, string[]>();
    connections.forEach((edge) => {
        if (edge.kind !== "composition" || !shotIds.has(edge.toNodeId)) return;
        composition.set(edge.fromNodeId, [...(composition.get(edge.fromNodeId) || []), edge.toNodeId]);
    });
    const assigned = new Set<string>();
    let index = 0;
    const entries: FilmSceneEntry[] = scenes.map((sceneNode) => {
        const meta = sceneMeta(sceneNode);
        const episodeTitle = meta?.episodeTitle || "";
        const name = meta?.name || "";
        const label = labelFor(sceneNode);
        const directShots = (composition.get(sceneNode.id) || [])
            .map((id) => shotById.get(id))
            .filter((node): node is CanvasNodeData => Boolean(node) && !assigned.has(node!.id));
        directShots.forEach((node) => assigned.add(node.id));
        const ordered = orderSceneShots(directShots, connections);
        return {
            id: sceneNode.id,
            label,
            episodeTitle,
            name,
            scene: sceneNode,
            shots: ordered.map((shot) => ({
                shot,
                sceneId: sceneNode.id,
                sceneLabel: label,
                episodeTitle,
                index: index++,
            })),
        };
    });
    const unassigned = shotNodes.filter((node) => !assigned.has(node.id));
    if (unassigned.length) {
        const ordered = orderSceneShots(unassigned, connections);
        entries.push({
            id: UNASSIGNED_SCENE_ID,
            label: "未分场",
            episodeTitle: "",
            name: "未分场",
            scene: null,
            shots: ordered.map((shot) => ({
                shot,
                sceneId: UNASSIGNED_SCENE_ID,
                sceneLabel: "未分场",
                episodeTitle: "",
                index: index++,
            })),
        });
    }
    return entries;
}

export function selectActiveFilmShot(
    scenes: FilmSceneEntry[],
    preferredSceneId: string | null,
    preferredShotId: string | null,
): { scene: FilmSceneEntry | null; shot: FilmShotEntry | null } {
    let scene = preferredSceneId ? scenes.find((item) => item.id === preferredSceneId) ?? null : null;
    if (!scene && preferredShotId) {
        scene = scenes.find((item) => item.shots.some((entry) => entry.shot.id === preferredShotId)) ?? null;
    }
    scene = scene ?? scenes[0] ?? null;
    if (!scene) return { scene: null, shot: null };
    const shot = (preferredShotId ? scene.shots.find((entry) => entry.shot.id === preferredShotId) : undefined) ?? scene.shots[0] ?? null;
    return { scene, shot };
}

export function selectFilmShotBindings(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string): FilmShotBindingChip[] {
    const seen = new Set<string>();
    return connections
        .filter((edge) => edge.kind === "binding" && edge.toNodeId === shotId)
        .flatMap((edge) => {
            if (seen.has(edge.fromNodeId)) return [];
            const node = nodes.find((item) => item.id === edge.fromNodeId);
            const payload = node?.metadata?.filmAsset;
            if (!node || !payload) return [];
            seen.add(edge.fromNodeId);
            return [{ id: node.id, kind: payload.kind, name: payload.asset.name || node.title }];
        });
}

export function selectFilmStyleName(nodes: CanvasNodeData[]): string | null {
    const style = nodes.find((node) => node.type === CanvasNodeType.FilmAsset && node.metadata?.filmAsset?.kind === "style");
    return style ? style.metadata?.filmAsset?.asset.name || style.title || null : null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && bun test film-selectors`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 2: 共享节点补丁与检查器收敛

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-node-patch.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-node-patch.test.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-film-inspector.tsx`

**Interfaces:**
- Produces: `patchFilmScriptNode`、`patchFilmSceneNode`、`patchFilmShotNode`、`patchFilmAssetNode(node, patch, now?)`。

- [ ] **Step 1: 写失败测试**

新建 `film-node-patch.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { patchFilmAssetNode, patchFilmSceneNode, patchFilmScriptNode, patchFilmShotNode } from "./film-node-patch";

const script = { id: "s", type: CanvasNodeType.Script, title: "剧本", position: { x: 1, y: 2 }, width: 100, height: 100, metadata: { filmScript: { text: "旧", parseSnapshots: [] } } } as CanvasNodeData;
const scene = { id: "c", type: CanvasNodeType.Scene, title: "场次", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: "旧场", location: "", time: "", mood: "" } } } as CanvasNodeData;
const shot = { id: "h", type: CanvasNodeType.Shot, title: "镜头", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmShot: { shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "旧", dialogue: "", audio: "", prompt: "" } } } as CanvasNodeData;
const asset = { id: "a", type: CanvasNodeType.FilmAsset, title: "角色", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { filmAsset: { kind: "character", asset: { id: "a", name: "旧名", updatedAt: "2026-01-01T00:00:00.000Z" } as FilmAsset } } } as CanvasNodeData;

test("patches payloads without touching identity or other metadata", () => {
    assert.equal(patchFilmScriptNode(script, { text: "新" }).metadata?.filmScript?.text, "新");
    assert.equal(patchFilmSceneNode(scene, { name: "新场" }).metadata?.filmScene?.name, "新场");
    assert.equal(patchFilmShotNode(shot, { shotNo: "02" }).metadata?.filmShot?.description, "旧");
    assert.equal(patchFilmShotNode(shot, { duration: 8 }).position.x, 0);
});

test("patches assets with a deterministic updatedAt", () => {
    const next = patchFilmAssetNode(asset, { name: "新名" }, "2026-11-21T00:00:00.000Z");
    assert.equal(next.metadata?.filmAsset?.asset.name, "新名");
    assert.equal(next.metadata?.filmAsset?.asset.updatedAt, "2026-11-21T00:00:00.000Z");
    assert.equal(next.metadata?.filmAsset?.kind, "character");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-node-patch`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现补丁函数**

新建 `film-node-patch.ts`：

```ts
import type { FilmAsset } from "@/lib/film/types";
import type { CanvasNodeData, FilmSceneNodeData, FilmScriptNodeData, FilmShotNodeData } from "../../types";

export function patchFilmScriptNode(node: CanvasNodeData, patch: Partial<FilmScriptNodeData>): CanvasNodeData {
    if (!node.metadata?.filmScript) return node;
    return { ...node, metadata: { ...node.metadata, filmScript: { ...node.metadata.filmScript, ...patch } } };
}

export function patchFilmSceneNode(node: CanvasNodeData, patch: Partial<FilmSceneNodeData>): CanvasNodeData {
    if (!node.metadata?.filmScene) return node;
    return { ...node, metadata: { ...node.metadata, filmScene: { ...node.metadata.filmScene, ...patch } } };
}

export function patchFilmShotNode(node: CanvasNodeData, patch: Partial<FilmShotNodeData>): CanvasNodeData {
    if (!node.metadata?.filmShot) return node;
    return { ...node, metadata: { ...node.metadata, filmShot: { ...node.metadata.filmShot, ...patch } } };
}

export function patchFilmAssetNode(node: CanvasNodeData, patch: Partial<FilmAsset>, now = new Date().toISOString()): CanvasNodeData {
    if (!node.metadata?.filmAsset) return node;
    const payload = node.metadata.filmAsset;
    return {
        ...node,
        metadata: {
            ...node.metadata,
            filmAsset: { ...payload, asset: { ...payload.asset, ...patch, updatedAt: now } },
        },
    };
}
```

- [ ] **Step 4: 收敛画布检查器**

在 `canvas-film-inspector.tsx`：

1. 导入：

```ts
import { patchFilmAssetNode, patchFilmSceneNode, patchFilmScriptNode, patchFilmShotNode } from "../[id]/lib/film-node-patch";
```

2. 把组件内四个内联 patch 函数改为：

```ts
    const patchScript = (patch: Partial<FilmScriptNodeData>) => onChange(node.id, (current) => patchFilmScriptNode(current, patch));
    const patchScene = (patch: Partial<FilmSceneNodeData>) => onChange(node.id, (current) => patchFilmSceneNode(current, patch));
    const patchShot = (patch: Partial<FilmShotNodeData>) => onChange(node.id, (current) => patchFilmShotNode(current, patch));
    const patchAsset = (patch: Partial<FilmAsset>) => onChange(node.id, (current) => patchFilmAssetNode(current, patch));
```

- [ ] **Step 5: 跑测试与检查**

Run: `cd web && bun test film-node-patch`
Run: `cd web && bun run typecheck`
Expected: PASS；类型检查通过。

- [ ] **Step 6: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 3: 场次追加镜头纯函数

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-shot-create.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-create.test.ts`

**Interfaces:**
- Produces: `appendFilmShot(nodes, connections, sceneId, options?)` → `{ nodes, connections, shotId } | null`。

- [ ] **Step 1: 写失败测试**

新建 `film-shot-create.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { appendFilmShot } from "./film-shot-create";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 100, y: 200 },
    width: 300,
    height: 200,
    metadata,
});

const shot = (id: string) => node(id, CanvasNodeType.Shot, { filmShot: { shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });

test("appends a shot to a scene with composition and sequence edges", () => {
    const scene = node("scene", CanvasNodeType.Scene, { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: "场景 1", location: "", time: "", mood: "" } });
    const existing = shot("shot-a");
    const connections: CanvasConnection[] = [{ id: "c", fromNodeId: "scene", toNodeId: "shot-a", kind: "composition" }];
    const result = appendFilmShot([scene, existing], connections, "scene", { nodeId: "shot-b" });
    assert.ok(result);
    const created = result.nodes.find((item) => item.id === "shot-b");
    assert.equal(created?.metadata?.filmShot?.shotNo, "02");
    assert.deepEqual(
        result.connections.slice(-2).map((edge) => ({ from: edge.fromNodeId, to: edge.toNodeId, kind: edge.kind })),
        [
            { from: "scene", to: "shot-b", kind: "composition" },
            { from: "shot-a", to: "shot-b", kind: "sequence" },
        ],
    );
});

test("creates the first shot without a sequence edge and rejects a missing scene", () => {
    const scene = node("scene", CanvasNodeType.Scene, { filmScene: { episodeId: "e", episodeTitle: "第 1 集", name: "场景 1", location: "", time: "", mood: "" } });
    const result = appendFilmShot([scene], [], "scene", { nodeId: "shot-a" });
    assert.ok(result);
    assert.equal(result.nodes.find((item) => item.id === "shot-a")?.metadata?.filmShot?.shotNo, "01");
    assert.equal(result.connections.length, 1);
    assert.equal(appendFilmShot([scene], [], "missing"), null);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-shot-create`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现追加镜头**

新建 `film-shot-create.ts`：

```ts
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { orderSceneShots } from "./film-layout";
import { createCanvasNode } from "./canvas-node-factory";

export type FilmShotCreateResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    shotId: string;
};

export function appendFilmShot(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    sceneId: string,
    options: { nodeId?: string } = {},
): FilmShotCreateResult | null {
    const scene = nodes.find((node) => node.id === sceneId && node.type === CanvasNodeType.Scene);
    if (!scene) return null;
    const shots = nodes.filter((node) => node.type === CanvasNodeType.Shot);
    const sceneShotIds = new Set(
        connections
            .filter((edge) => edge.kind === "composition" && edge.fromNodeId === sceneId)
            .map((edge) => edge.toNodeId),
    );
    const sceneShots = orderSceneShots(shots.filter((shot) => sceneShotIds.has(shot.id)), connections);
    const last = sceneShots[sceneShots.length - 1];
    const shotNo = String(shots.length + 1).padStart(2, "0");
    const shot = createCanvasNode(CanvasNodeType.Shot, {
        x: scene.position.x,
        y: last ? last.position.y + 380 : scene.position.y + scene.height + 60,
    }, {
        filmShot: {
            shotNo,
            shotType: "",
            cameraMovement: "",
            duration: 4,
            description: "",
            dialogue: "",
            audio: "",
            prompt: "",
        },
    }, options.nodeId);
    const nextConnections = [
        ...connections,
        canvasConnection(scene.id, shot.id, { kind: "composition" }),
        ...(last ? [canvasConnection(last.id, shot.id, { kind: "sequence" })] : []),
    ];
    return { nodes: [...nodes, shot], connections: nextConnections, shotId: shot.id };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && bun test film-shot-create`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 检查点**

汇报改动与测试结果。不要提交。

---

### Task 4: CanvasEditor 抽取、Studio 路由与重定向

**Files:**
- Rename: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` → `canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/page.tsx`
- Create: `web/src/app/(user)/film/studio/[id]/page.tsx`
- Create: `web/src/app/(user)/film/studio/layout.tsx`

**Interfaces:**
- Produces: `CanvasEditor({ studio?: boolean })`；`/film/studio/[id]` 路由。

- [ ] **Step 1: 重命名编辑器**

Run:

```bash
cd web
mv "src/app/(user)/canvas/[id]/canvas-client-page.tsx" "src/app/(user)/canvas/[id]/canvas-editor.tsx"
```

把文件中的默认导出改为：

```ts
export default function CanvasEditor({ studio = false }: { studio?: boolean }) {
```

- [ ] **Step 2: 更新画布路由与新增 Studio 路由**

`canvas/[id]/page.tsx`：

```tsx
import CanvasEditor from "./canvas-editor";

export default function CanvasPage() {
    return <CanvasEditor />;
}
```

新建 `film/studio/[id]/page.tsx`：

```tsx
import CanvasEditor from "@/app/(user)/canvas/[id]/canvas-editor";

export default function FilmStudioPage() {
    return <CanvasEditor studio />;
}
```

新建 `film/studio/layout.tsx`：

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "影视 Studio" };

export default function FilmStudioLayout({ children }: { children: ReactNode }) {
    return children;
}
```

- [ ] **Step 3: 加双向重定向**

在 `canvas-editor.tsx` 中，`projectLoaded` 与 `currentProject` 可用之后加入：

```ts
    useEffect(() => {
        if (!projectLoaded || !currentProject) return;
        if (currentProject.domain === "film" && !studio) {
            router.replace(`/film/studio/${projectId}`);
        } else if (currentProject.domain !== "film" && studio) {
            router.replace(`/canvas/${projectId}`);
        }
    }, [currentProject, projectId, projectLoaded, router, studio]);
```

说明：`useEffect` 已在文件顶部导入；不要放在任何提前 `return` 之后。

- [ ] **Step 4: 类型检查**

Run: `cd web && bun run typecheck`
Expected: 通过。此时 `/film/studio/[id]` 先渲染现有影视画布壳层，Studio 主体在后续任务接入。

- [ ] **Step 5: 检查点**

汇报。不要提交。

---

### Task 5: 编辑器接入 Studio 状态、动作与模型

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`（仅类型增加 `filmStudio?`）

**Interfaces:**
- Consumes: selectors、`appendFilmShot`、`FilmStudioModel`。
- Produces: `filmStudio` 模型与 Studio actions；`CanvasWorkspaceModel.filmStudio?`。

- [ ] **Step 1: 导入与状态**

在 `canvas-editor.tsx` 顶部加入：

```ts
import { appendFilmShot } from "./lib/film-shot-create";
import { selectActiveFilmShot, selectFilmSceneEntries, selectFilmShotBindings, selectFilmStyleName } from "./lib/film-selectors";
import type { FilmStudioModel } from "./lib/film-studio-types";
```

在 `filmInspectorNode` 之后加入：

```ts
    const [studioView, setStudioView] = useState<"studio" | "graph">("studio");
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    const [activeShotId, setActiveShotId] = useState<string | null>(null);
    const filmScenes = useMemo(
        () => (filmMode ? selectFilmSceneEntries(nodes, connections) : []),
        [filmMode, nodes, connections],
    );
    const filmShots = useMemo(() => filmScenes.flatMap((scene) => scene.shots), [filmScenes]);
    const activeFilm = useMemo(
        () => selectActiveFilmShot(filmScenes, activeSceneId, activeShotId),
        [activeSceneId, activeShotId, filmScenes],
    );
    const activeFilmBindings = useMemo(
        () => (activeFilm.shot ? selectFilmShotBindings(nodes, connections, activeFilm.shot.shot.id) : []),
        [activeFilm.shot, connections, nodes],
    );
    const filmStyleName = useMemo(() => (filmMode ? selectFilmStyleName(nodes) : null), [filmMode, nodes]);
```

在 store 选择器处加入：

```ts
    const createFilmProject = useCanvasStore((state) => state.createFilmProject);
```

- [ ] **Step 2: 影视新建/删除路由**

把 `createAndOpenProject` 改为：

```ts
    const createAndOpenProject = useCallback(() => {
        if (filmMode) {
            const id = createFilmProject(nextCanvasProjectTitle());
            router.push(`/film/studio/${id}`);
            return;
        }
        const id = createProject(nextCanvasProjectTitle());
        router.push(`/canvas/${id}`);
    }, [createFilmProject, createProject, filmMode, router]);
```

把 `deleteCurrentProject` 的最后一行改为：

```ts
        router.push(filmMode ? "/film" : "/canvas");
```

并把 `filmMode` 加入依赖数组。

- [ ] **Step 3: Studio actions（放在 `focusNode` 之后）**

在 `focusNode` 定义之后加入：

```ts
    const selectFilmShot = useCallback((shotId: string) => {
        setActiveShotId(shotId);
        const entry = filmShots.find((item) => item.shot.id === shotId);
        if (entry) setActiveSceneId(entry.sceneId);
    }, [filmShots]);

    const selectFilmScene = useCallback((sceneId: string) => {
        setActiveSceneId(sceneId);
        const scene = filmScenes.find((item) => item.id === sceneId);
        setActiveShotId(scene?.shots[0]?.shot.id ?? null);
    }, [filmScenes]);

    const createFilmShot = useCallback((sceneId?: string) => {
        const target = sceneId ?? activeFilm.scene?.id;
        if (!target || target === "unassigned") return;
        const result = appendFilmShot(nodesRef.current, connectionsRef.current, target);
        if (!result) return;
        setNodes(result.nodes);
        setConnections(result.connections);
        setActiveSceneId(target);
        setActiveShotId(result.shotId);
    }, [activeFilm.scene?.id, connectionsRef, nodesRef, setConnections, setNodes]);

    const updateFilmShot = useCallback((nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? updater(node) : node)));
    }, [setNodes]);

    const locateFilmShotInGraph = useCallback((shotId: string) => {
        setActiveShotId(shotId);
        setStudioView("graph");
        window.setTimeout(() => focusNode(shotId), 80);
    }, [focusNode]);
```

- [ ] **Step 4: 构建 filmStudio 模型**

在 `const workspace: CanvasWorkspaceModel = {` 之前加入：

```ts
    const filmStudio: FilmStudioModel | undefined = filmMode ? {
        view: studioView,
        onViewChange: setStudioView,
        aspect: currentProject?.film?.aspect ?? "16:9",
        scenes: filmScenes,
        shots: filmShots,
        activeSceneId: activeFilm.scene?.id ?? null,
        activeShot: activeFilm.shot,
        activeBindings: activeFilmBindings,
        styleName: filmStyleName,
        onSceneChange: selectFilmScene,
        onSelectShot: selectFilmShot,
        onUpdateShot: updateFilmShot,
        onCreateShot: createFilmShot,
        onLocateInGraph: locateFilmShotInGraph,
    } : undefined;
```

在 `workspace` 对象里加入：

```ts
        filmStudio,
```

- [ ] **Step 5: 扩展 Workspace 类型**

在 `canvas-workspace.tsx` 顶部导入：

```ts
import type { FilmStudioModel } from "../lib/film-studio-types";
```

在 `CanvasWorkspaceModel` 中加入：

```ts
    filmStudio?: FilmStudioModel;
```

- [ ] **Step 6: 类型检查**

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 7: 检查点**

汇报。不要提交。

---

### Task 6: 顶栏场次选择、视图切换与 Workspace 分支

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`
- Create: `web/src/app/(user)/canvas/[id]/components/film-studio-view-switch.tsx`
- Create: `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx`（本任务先放占位主体，Task 7 填充）

**Interfaces:**
- Consumes: `FilmStudioModel`。
- Produces: 顶栏场次 `Select`；浮动 `Studio / 画布`；`CanvasWorkspace` 的 studio/graph 分支。

- [ ] **Step 1: 顶栏新增 props 与场次选择**

在 `canvas-top-bar.tsx`：

1. antd 导入加入 `Select`：

```ts
import { Button, Modal, Select } from "antd";
```

2. 函数参数加入：

```ts
    filmScenes,
    activeSceneId,
    onSceneChange,
    studioView,
```

类型加入：

```ts
    filmScenes?: { id: string; label: string }[];
    activeSceneId?: string | null;
    onSceneChange?: (sceneId: string) => void;
    studioView?: "studio" | "graph";
```

3. 侧栏切换按钮改为只在非 Studio 显示：

```tsx
                    {studioView !== "studio" ? (
                        <button type="button" onClick={onToggleSidePanel} ...>
                            ...
                        </button>
                    ) : null}
```

4. 在标题块 `</div>` 之后、左组 `</div>` 之前插入场次选择：

```tsx
                    {filmScenes?.length ? (
                        <Select
                            size="small"
                            variant="borderless"
                            className="max-w-[220px]"
                            popupMatchSelectWidth={false}
                            value={activeSceneId ?? undefined}
                            options={filmScenes.map((scene) => ({ value: scene.id, label: scene.label }))}
                            onChange={onSceneChange}
                            aria-label="选择场次"
                        />
                    ) : null}
```

5. 影视菜单文案：

```tsx
                                <CanvasMenuItem icon={<Images className="size-4" />} label={filmMode ? "影视项目" : "我的画布"} onClick={() => runMenuAction(onProjects)} />
                                <CanvasMenuItem icon={<Plus className="size-4" />} label={filmMode ? "新建影视画布" : "新建画布"} onClick={() => runMenuAction(onCreateProject)} />
                                <CanvasMenuItem icon={<Trash2 className="size-4" />} label={filmMode ? "删除当前影视画布" : "删除当前画布"} danger onClick={() => runMenuAction(onDeleteProject)} />
```

6. 按场整理只在画布视图显示：

```tsx
                    {filmMode && studioView !== "studio" ? (
```

7. 助手按钮只在非 Studio 显示：

```tsx
                    {assistantCollapsed && studioView !== "studio" ? (
```

- [ ] **Step 2: 浮动视图切换**

新建 `film-studio-view-switch.tsx`：

```tsx
"use client";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmStudioView } from "../lib/film-studio-types";

export function FilmStudioViewSwitch({ view, onChange }: { view: FilmStudioView; onChange: (view: FilmStudioView) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border p-1 shadow-lg max-sm:top-24"
            style={{ zIndex: CANVAS_Z.hoverToolbar, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, backdropFilter: "blur(12px)" }}
        >
            {(["studio", "graph"] as const).map((value) => (
                <button
                    key={value}
                    type="button"
                    className="rounded-full px-3 py-1 text-xs font-medium transition"
                    style={{ background: view === value ? theme.toolbar.activeBg : undefined, color: theme.node.text }}
                    onClick={() => onChange(value)}
                >
                    {value === "studio" ? "Studio" : "画布"}
                </button>
            ))}
        </div>
    );
}
```

- [ ] **Step 3: Workspace 分支**

在 `canvas-workspace.tsx`：

1. 导入：

```ts
import { FilmStudioBody } from "./film-studio-body";
import { FilmStudioViewSwitch } from "./film-studio-view-switch";
```

2. 解构 shell 后取 `filmStudio`：

```ts
    const filmStudio = model.filmStudio;
    const studioMode = filmStudio?.view === "studio";
```

3. 左侧通用面板只在非 Studio 渲染：

```tsx
            {!studioMode ? <CanvasSidePanel ... 原 props ... /> : null}
```

4. 顶栏传入影视 props，并把 `onProjects` 改为影视感知：

```tsx
                <CanvasTopBar
                    ...原 props...
                    onProjects={() => router.push(filmStudio ? "/film" : "/canvas")}
                    filmScenes={filmStudio?.scenes.map((scene) => ({ id: scene.id, label: scene.label }))}
                    activeSceneId={filmStudio?.activeSceneId ?? undefined}
                    onSceneChange={filmStudio?.onSceneChange}
                    studioView={filmStudio?.view}
                />
```

5. 主体分支：

```tsx
                {studioMode && filmStudio ? (
                    <FilmStudioBody model={filmStudio} theme={theme} />
                ) : (
                    <>
                        <CanvasStageLayer model={model.stage} />
                        <CanvasStageOverlays model={model.overlays} />
                    </>
                )}
                <CanvasDialogs model={model.dialogs} />
                {filmStudio ? <FilmStudioViewSwitch view={filmStudio.view} onChange={filmStudio.onViewChange} /> : null}
```

6. 右侧助手只在非 Studio 渲染：

```tsx
            {!studioMode ? (
                <div className="flex h-full shrink-0 transition-opacity duration-300" ...>
                    <CanvasAssistantPane model={model.assistant} />
                </div>
            ) : null}
```

- [ ] **Step 4: 临时主体**

新建 `film-studio-body.tsx`（Task 7 会替换为完整布局）：

```tsx
"use client";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmStudioModel } from "../lib/film-studio-types";

export function FilmStudioBody({ model, theme }: { model: FilmStudioModel; theme: CanvasTheme }) {
    return (
        <div className="absolute inset-x-0 bottom-0 top-16 flex min-h-0 max-sm:top-24" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: theme.node.muted }}>
                Studio 加载中…
            </div>
        </div>
    );
}
```

- [ ] **Step 5: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun run lint`
Expected: 通过。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 7: Studio 左栏、舞台与胶片条

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx`
- Create: `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx`
- Create: `web/src/app/(user)/canvas/[id]/components/film-strip.tsx`
- Replace: `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx`

**Interfaces:**
- Consumes: `FilmStudioModel`、`patchFilmShotNode`。
- Produces: 完整的 Studio 主体。

- [ ] **Step 1: 左侧镜头设置**

新建 `film-shot-panel.tsx`：

```tsx
"use client";

import type { ReactNode } from "react";
import { Input, InputNumber } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { CanvasNodeData } from "../../types";
import { patchFilmShotNode } from "../lib/film-node-patch";
import type { FilmShotBindingChip } from "../lib/film-studio-types";

type FilmShotPanelProps = {
    theme: CanvasTheme;
    shot: CanvasNodeData | null;
    sceneLabel: string;
    bindings: FilmShotBindingChip[];
    styleName: string | null;
    canCreateShot: boolean;
    onCreateShot: () => void;
    onUpdate: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onClose: () => void;
};

function Section({ theme, title, children }: { theme: CanvasTheme; title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
            <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
            {children}
        </section>
    );
}

function Field({ theme, label, children }: { theme: CanvasTheme; label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: theme.node.muted }}>{label}</span>
            {children}
        </label>
    );
}

export function FilmShotPanel({ theme, shot, sceneLabel, bindings, styleName, canCreateShot, onCreateShot, onUpdate, onClose }: FilmShotPanelProps) {
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const filmShot = shot?.metadata?.filmShot;
    const update = (patch: Parameters<typeof patchFilmShotNode>[1]) => {
        if (shot) onUpdate(shot.id, (node) => patchFilmShotNode(node, patch));
    };

    return (
        <div className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-r" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">镜头设置</div>
                    <div className="truncate text-xs" style={{ color: theme.node.muted }}>{sceneLabel}{filmShot?.shotNo ? ` · ${filmShot.shotNo}` : ""}</div>
                </div>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="收起镜头设置">×</button>
            </div>
            {!shot ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="text-sm" style={{ color: theme.node.muted }}>该场次还没有镜头</div>
                    {canCreateShot ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCreateShot}>新增镜头</button> : null}
                </div>
            ) : (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                    <Section theme={theme} title="镜头">
                        <Field theme={theme} label="镜号"><Input size="small" value={filmShot?.shotNo || ""} style={inputStyle} onChange={(event) => update({ shotNo: event.target.value })} /></Field>
                        <Field theme={theme} label="景别"><Input size="small" value={filmShot?.shotType || ""} style={inputStyle} onChange={(event) => update({ shotType: event.target.value })} /></Field>
                        <Field theme={theme} label="时长（秒）"><InputNumber size="small" min={1} max={60} value={filmShot?.duration ?? 4} style={{ ...inputStyle, width: "100%" }} onChange={(value) => update({ duration: value ?? 4 })} /></Field>
                        <Field theme={theme} label="运镜"><Input size="small" value={filmShot?.cameraMovement || ""} style={inputStyle} onChange={(event) => update({ cameraMovement: event.target.value })} /></Field>
                    </Section>
                    <Section theme={theme} title="画面">
                        <Field theme={theme} label="描述"><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={filmShot?.description || ""} style={inputStyle} onChange={(event) => update({ description: event.target.value })} /></Field>
                        <Field theme={theme} label="画面提示词"><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={filmShot?.prompt || ""} style={inputStyle} onChange={(event) => update({ prompt: event.target.value })} /></Field>
                        <Field theme={theme} label="负面提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={filmShot?.negativePrompt || ""} style={inputStyle} onChange={(event) => update({ negativePrompt: event.target.value })} /></Field>
                    </Section>
                    <Section theme={theme} title="上下文">
                        <div className="flex flex-wrap gap-1.5">
                            {bindings.length ? bindings.map((binding) => (
                                <span key={binding.id} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                    {FILM_ASSET_KIND_LABELS[binding.kind]} · {binding.name}
                                </span>
                            )) : <span className="text-xs" style={{ color: theme.node.muted }}>未绑定角色/场景/道具</span>}
                            {styleName ? <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>风格 · {styleName}</span> : null}
                        </div>
                    </Section>
                    <Section theme={theme} title="状态">
                        <div className="text-xs" style={{ color: theme.node.muted }}>
                            分镜图：{filmShot?.imageUrl ? "已生成" : "未生成"}；视频：{filmShot?.videoUrl ? "已生成" : "未生成"}。
                        </div>
                    </Section>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: 单镜舞台**

新建 `film-shot-stage.tsx`：

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "../../types";

type FilmShotStageProps = {
    theme: CanvasTheme;
    shot: CanvasNodeData | null;
    sceneLabel: string;
    aspect: string;
    canCreateShot: boolean;
    onCreateShot: () => void;
    onLocate: (shotId: string) => void;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
};

export function FilmShotStage({ theme, shot, sceneLabel, aspect, canCreateShot, onCreateShot, onLocate, onPrev, onNext, hasPrev, hasNext }: FilmShotStageProps) {
    const filmShot = shot?.metadata?.filmShot;
    const imageUrl = filmShot?.imageUrl;
    const showImage = Boolean(imageUrl && /^(https?:|data:|blob:)/.test(imageUrl));
    const ratio = aspect.replace(":", " / ");

    return (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" style={{ background: theme.canvas.background }}>
            <div className="relative w-full max-w-[960px] overflow-hidden rounded-xl border" style={{ aspectRatio: ratio, background: theme.node.fill, borderColor: theme.node.stroke }}>
                {shot ? (
                    showImage ? (
                        <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                        <div className="flex h-full w-full flex-col justify-between gap-4 p-8 max-sm:p-5">
                            <div className="flex items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span className="truncate">{sceneLabel}</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>分镜图未生成</span>
                            </div>
                            <div className="min-h-0 flex-1">
                                <div className="font-mono text-5xl font-semibold tracking-tight tabular-nums" style={{ color: theme.node.text, opacity: 0.9 }}>
                                    {filmShot?.shotNo || "—"}
                                </div>
                                <div className="mt-4 line-clamp-4 max-w-2xl text-lg leading-8" style={{ color: theme.node.text }}>
                                    {filmShot?.description || filmShot?.prompt || "还没有画面描述"}
                                </div>
                                {filmShot?.prompt ? <div className="mt-3 line-clamp-3 max-w-2xl text-sm leading-7" style={{ color: theme.node.muted }}>{filmShot.prompt}</div> : null}
                            </div>
                            <div className="flex items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span>生成分镜后在这里预览画面</span>
                                <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => onLocate(shot.id)}>在画布中定位</button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
                        <div className="text-sm" style={{ color: theme.node.muted }}>{sceneLabel}</div>
                        {canCreateShot ? <button type="button" className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={onCreateShot}>新增镜头</button> : <div className="text-xs" style={{ color: theme.node.muted }}>切换到画布视图创建场次</div>}
                    </div>
                )}
            </div>
            {shot && hasPrev ? <button type="button" onClick={onPrev} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="上一镜"><ChevronLeft className="size-5" /></button> : null}
            {shot && hasNext ? <button type="button" onClick={onNext} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="下一镜"><ChevronRight className="size-5" /></button> : null}
        </div>
    );
}
```

- [ ] **Step 3: 胶片条**

新建 `film-strip.tsx`：

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmSceneEntry } from "../lib/film-studio-types";

type FilmStripProps = {
    theme: CanvasTheme;
    scenes: FilmSceneEntry[];
    activeShotId: string | null;
    onSelectShot: (shotId: string) => void;
    onCreateShot: (sceneId: string) => void;
};

export function FilmStrip({ theme, scenes, activeShotId, onSelectShot, onCreateShot }: FilmStripProps) {
    const activeRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [activeShotId]);

    return (
        <div className="flex h-[132px] shrink-0 items-stretch gap-4 overflow-x-auto border-t px-4 py-3 max-sm:h-[104px]" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            {scenes.map((scene) => (
                <div key={scene.id} className="flex shrink-0 items-stretch gap-2 border-r pr-4 last:border-r-0" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex w-[96px] shrink-0 flex-col justify-center gap-0.5 text-[11px]" style={{ color: theme.node.muted }}>
                        <span className="truncate font-medium" style={{ color: theme.node.text }}>{scene.episodeTitle || "未分集"}</span>
                        <span className="truncate">{scene.name}</span>
                        <span>{scene.shots.length} 镜</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {scene.shots.map((entry) => {
                            const active = entry.shot.id === activeShotId;
                            const shotNo = entry.shot.metadata?.filmShot?.shotNo || "—";
                            return (
                                <button
                                    key={entry.shot.id}
                                    ref={active ? activeRef : undefined}
                                    type="button"
                                    className="flex h-[92px] w-[148px] shrink-0 flex-col items-center justify-center rounded-lg border text-xs transition max-sm:h-[72px] max-sm:w-[112px]"
                                    style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.fill, color: theme.node.text }}
                                    onClick={() => onSelectShot(entry.shot.id)}
                                    title={entry.shot.metadata?.filmShot?.description || entry.shot.title}
                                >
                                    <span className="font-mono text-lg font-semibold tabular-nums">{shotNo}</span>
                                    <span className="mt-1 max-w-full truncate px-2 text-[10px]" style={{ color: theme.node.muted }}>{entry.sceneLabel}</span>
                                </button>
                            );
                        })}
                        {scene.scene ? (
                            <button type="button" className="grid h-[92px] w-[64px] shrink-0 place-items-center rounded-lg border border-dashed max-sm:h-[72px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => onCreateShot(scene.id)} aria-label={`在${scene.label}新增镜头`}>
                                <Plus className="size-4" />
                            </button>
                        ) : null}
                    </div>
                </div>
            ))}
        </div>
    );
}
```

- [ ] **Step 4: 完整 Studio 主体**

替换 `film-studio-body.tsx`：

```tsx
"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { FilmShotPanel } from "./film-shot-panel";
import { FilmShotStage } from "./film-shot-stage";
import { FilmStrip } from "./film-strip";

export function FilmStudioBody({ model, theme }: { model: FilmStudioModel; theme: CanvasTheme }) {
    const [panelOpen, setPanelOpen] = useState(true);
    useEffect(() => {
        if (window.matchMedia("(max-width: 767px)").matches) setPanelOpen(false);
    }, []);

    const activeShot = model.activeShot;
    const activeIndex = activeShot ? model.shots.findIndex((entry) => entry.shot.id === activeShot.shot.id) : -1;
    const prev = activeIndex > 0 ? model.shots[activeIndex - 1] : null;
    const next = activeIndex >= 0 && activeIndex < model.shots.length - 1 ? model.shots[activeIndex + 1] : null;
    const activeScene = model.scenes.find((scene) => scene.id === model.activeSceneId) ?? null;
    const sceneLabel = activeShot?.sceneLabel ?? activeScene?.label ?? "未分场";
    const canCreateShot = Boolean(model.activeSceneId && model.activeSceneId !== "unassigned");

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
            if (event.key === "ArrowLeft" && prev) {
                event.preventDefault();
                model.onSelectShot(prev.shot.id);
            }
            if (event.key === "ArrowRight" && next) {
                event.preventDefault();
                model.onSelectShot(next.shot.id);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [model, next, prev]);

    return (
        <div className="absolute inset-x-0 bottom-0 top-16 flex min-h-0 max-sm:top-24" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {panelOpen ? (
                <aside className="relative z-30 max-md:absolute max-md:inset-y-0 max-md:left-0">
                    <FilmShotPanel
                        theme={theme}
                        shot={activeShot?.shot ?? null}
                        sceneLabel={sceneLabel}
                        bindings={model.activeBindings}
                        styleName={model.styleName}
                        canCreateShot={canCreateShot}
                        onCreateShot={() => model.onCreateShot()}
                        onUpdate={model.onUpdateShot}
                        onClose={() => setPanelOpen(false)}
                    />
                </aside>
            ) : (
                <button type="button" className="absolute left-3 top-3 z-40 grid size-9 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} onClick={() => setPanelOpen(true)} aria-label="打开镜头设置">
                    <SlidersHorizontal className="size-4" />
                </button>
            )}
            {panelOpen ? <button type="button" className="absolute inset-0 z-20 bg-black/30 md:hidden" onClick={() => setPanelOpen(false)} aria-label="关闭镜头设置" /> : null}
            <div className="flex min-w-0 flex-1 flex-col">
                <FilmShotStage
                    theme={theme}
                    shot={activeShot?.shot ?? null}
                    sceneLabel={sceneLabel}
                    aspect={model.aspect}
                    canCreateShot={canCreateShot}
                    onCreateShot={() => model.onCreateShot()}
                    onLocate={model.onLocateInGraph}
                    onPrev={() => prev && model.onSelectShot(prev.shot.id)}
                    onNext={() => next && model.onSelectShot(next.shot.id)}
                    hasPrev={Boolean(prev)}
                    hasNext={Boolean(next)}
                />
                <FilmStrip
                    theme={theme}
                    scenes={model.scenes}
                    activeShotId={activeShot?.shot.id ?? null}
                    onSelectShot={model.onSelectShot}
                    onCreateShot={model.onCreateShot}
                />
            </div>
        </div>
    );
}
```

- [ ] **Step 5: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun run lint`
Expected: 通过。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 8: `/film` 影视画布入口与 `/canvas` 入口移除

**Files:**
- Modify: `web/src/app/(user)/film/page.tsx`
- Modify: `web/src/app/(user)/canvas/page.tsx`

**Interfaces:**
- Consumes: canvas store、`createFilmProject`、`FILM_CANVAS_DEV`、`isFilmCanvasProject`。
- Produces: 独立影视入口；`/canvas` 不再出现影视入口。

- [ ] **Step 1: `/film` 接入画布影视项目**

在 `film/page.tsx`：

1. 图标导入加入 `ArrowRight`：

```ts
import { ArrowRight, Clapperboard, Download, Library, Pencil, Plus, Trash2, Upload } from "lucide-react";
```

2. 加入导入：

```ts
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { isFilmCanvasProject } from "@/app/(user)/canvas/utils/canvas-project-domain";
import { FILM_CANVAS_DEV } from "@/app/(user)/canvas/utils/film-mode";
```

3. 在旧 film store 选择器之后加入：

```ts
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const createFilmCanvasProject = useCanvasStore((state) => state.createFilmProject);
    const filmCanvasProjects = useMemo(
        () => (FILM_CANVAS_DEV ? canvasProjects.filter(isFilmCanvasProject).slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)) : []),
        [canvasProjects],
    );
```

4. 加入创建函数（放在其他 handlers 附近）：

```ts
    const createFilmCanvas = () => {
        const id = createFilmCanvasProject("未命名影视画布");
        router.push(`/film/studio/${id}`);
    };
```

5. 在 PageHeader 之后、旧项目列表之前插入影视画布区：

```tsx
                {FILM_CANVAS_DEV ? (
                    <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">影视画布</span>
                                <span className="text-xs text-muted-foreground">{filmCanvasProjects.length} 个</span>
                            </div>
                            <Button disabled={!canvasHydrated} icon={<Clapperboard className="size-4" />} onClick={createFilmCanvas}>
                                新建影视画布
                            </Button>
                        </div>
                        {filmCanvasProjects.length ? (
                            <div className="flex flex-col divide-y divide-border/60">
                                {filmCanvasProjects.map((project) => (
                                    <button key={project.id} type="button" className="flex items-center justify-between gap-3 py-2 text-left" onClick={() => router.push(`/film/studio/${project.id}`)}>
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{project.title}</span>
                                            <span className="text-xs text-muted-foreground">{project.nodes.length} 节点 · {dayjs(project.updatedAt).format("MM-DD HH:mm")}</span>
                                        </span>
                                        <ArrowRight className="size-4 shrink-0 opacity-50" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <span className="text-xs text-muted-foreground">还没有影视画布；新建后会进入 Studio。</span>
                        )}
                    </section>
                ) : null}
```

- [ ] **Step 2: 移除 `/canvas` 影视入口**

在 `canvas/page.tsx`：

1. 删除 `Clapperboard`、`FILM_CANVAS_DEV`、`isFilmCanvasProject` 导入；lucide 导入恢复为：

```ts
import { Download, FileUp, Plus, Trash2 } from "lucide-react";
```

域过滤导入恢复为：

```ts
import { generalCanvasProjects } from "./utils/canvas-project-domain";
```

2. 删除 `createFilmProject` 选择器与 `filmProjects` 派生。
3. 删除 1A 加到 PageHeader 的「新建影视画布（开发）」按钮。
4. 删除 PageHeader 之后的影视画布开发列表整块。

- [ ] **Step 3: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun run lint`
Expected: 通过。

- [ ] **Step 4: 检查点**

汇报。不要提交。

---

### Task 9: 批次 1C 验收

**Files:** 无代码改动。

- [ ] **Step 1: 跑单测与全量检查**

```bash
cd web
bun test film-selectors
bun test film-node-patch
bun test film-shot-create
bun test canvas-connections
bun test film-layout
bun run typecheck
bun run lint
bun test
```

Expected: 全部通过；测试总数在 624 基础上增加本批用例。

- [ ] **Step 2: 浏览器手工验收**

在 `NEXT_PUBLIC_ENABLE_FILM_CANVAS=1` 的 dev 下：

1. `/film` 出现「影视画布」区与「新建影视画布」；`/canvas` 不再出现影视入口。
2. 新建影视画布 → 进入 `/film/studio/[id]`；默认 Studio：左侧镜头设置、中央舞台、底部胶片条。
3. 胶片条点击/`←→` 切换镜头；舞台与左栏同步；`+` 在当前场次新增镜头。
4. 左栏编辑镜号/描述/提示词，舞台空镜卡实时更新；刷新后保留。
5. 浮动 `Studio / 画布` 切换：画布视图保留现有节点/检查器/按场整理；切回 Studio 保留当前镜头。
6. `/canvas/[id]` 打开影视文档会重定向到 `/film/studio/[id]`；`/film/studio/[id]` 打开普通画布会重定向到 `/canvas/[id]`。
7. 窄屏：左栏为浮层，胶片条可用，舞台优先。
8. 测试画布清理；无 console 错误。

- [ ] **Step 3: 汇报**

列出改动文件、测试结果、手工验收结果与未实测项；**不提交**，等待用户授权。

## 后续

- 批次 1B：Studio 接生成/任务恢复/槽位；舞台图片/视频、对比/版本/生成浮动条。
- 批次 2：镜头表/故事板/时间轴、批量、AI 拆镜、就绪/一致性。
- 批次 3：删除旧 `/film/[id]` 工作台，旧入口重定向到 Studio；旧数据、同步域与后端字段清理。
