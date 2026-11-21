# 影视 Studio 批次 1B（上）实施计划：编译器图输入与单镜出图

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studio 能从图文档编译单镜上下文，提交画布图片任务，展示生成图与版本，并在刷新后恢复进行中的任务。

**Architecture:** 用纯函数把节点/边映射成现有 `buildFilmShotGenerationContext` 的输入；镜头图片任务复用画布 `submitNodeTask` + `use-canvas-task-polling`，结果写回 `filmShot.imageUrl/storageKey/imageVersions`。Studio 只新增生成动作与展示，不新建任务/同步/存储。

**Tech Stack:** Next.js App Router、TypeScript、Zustand、Ant Design、Bun test。

**Spec:** `docs/superpowers/specs/2026-11-21-film-studio-shell-design.md`；父 spec `2026-11-21-film-as-canvas-design.md`。

## Global Constraints

- 唯一编译器 `buildFilmShotGenerationContext`；不复制参考图排序/提示词拼装。
- 唯一任务：复用画布 `submitNodeTask` 与 `use-canvas-task-polling`；不为镜头新建恢复 hook。
- 任务结果写 `filmShot.imageUrl/storageKey/imageVersions` 与 `metadata.status`；不改节点尺寸/位置。
- Studio 只读写同一份 `CanvasProject`；不新增 store。
- 本计划只覆盖**图片**；视频、绑定编辑、资产槽位编辑器在 1B-2 另写。
- 不自动 `git commit`/`git push`；提交需用户单独授权。
- 真实模型出图依赖用户 AI 配置；未配置时只验证配置入口与错误路径，并在验收中标注未实测。

## Scope

本计划覆盖：图编译器适配器、镜头图片任务写回、轮询/停止接入、Studio 生成按钮/进度/图片/胶片条缩略图、刷新恢复、单测与浏览器验收。
不覆盖：视频生成、绑定增删、资产槽位编辑器、对比/版本面板、批量。

## File Structure

- Create `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.ts` — 图 → 编译器输入。
- Modify `web/src/app/(user)/film/utils/film-shot-generation.ts` — 首参收窄为结构子集。
- Create `web/src/app/(user)/canvas/[id]/lib/film-shot-task-updates.ts` — 镜头图片任务目标/写回纯函数。
- Modify `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-polling.ts` — 镜头图片轮询分支。
- Modify `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-control.ts` — 镜头停止按图片任务处理。
- Modify `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts` — 生成状态与动作。
- Modify `web/src/app/(user)/canvas/[id]/canvas-editor.tsx` — 生成/停止动作与模型字段。
- Modify `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx` — 生成状态/按钮。
- Modify `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx` — 图片/进度/错误/生成按钮。
- Modify `web/src/app/(user)/canvas/[id]/components/film-strip.tsx` — 缩略图/状态点。
- Modify `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx` — 传参 + `G` 生成。
- Tests: `film-shot-generation-context.test.ts`、`film-shot-task-updates.test.ts`。

---

### Task 1: 图文档 → 影视编译器输入

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.ts`
- Modify: `web/src/app/(user)/film/utils/film-shot-generation.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts`

**Interfaces:**
- Modify: `buildFilmShotGenerationContext(project: FilmGenerationProjectContext, shot, options)`，`FilmGenerationProjectContext = Pick<FilmProject, "characters" | "locations" | "props" | "costumes" | "style">`。
- Produce: `buildFilmShotGenerationFromGraph(nodes, connections, shotId, options): FilmGenerationContext | null`；`FilmGraphGenerationOptions`。

- [ ] **Step 1: 收窄编译器首参**

在 `film/utils/film-shot-generation.ts` 中加入并改签名：

```ts
export type FilmGenerationProjectContext = Pick<FilmProject, "characters" | "locations" | "props" | "costumes" | "style">;

export function buildFilmShotGenerationContext(project: FilmGenerationProjectContext, shot: FilmShot, options: FilmGenerationOptions): FilmGenerationContext {
```

现有传完整 `FilmProject` 的调用与测试天然兼容，不改其余逻辑。

- [ ] **Step 2: 写失败测试**

新建 `film-shot-generation-context.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-21T00:00:00.000Z" });
const withConcept = (asset: FilmAsset, id: string) => ({ ...asset, concept: appendSlotImage(asset.concept, image(id)) });
const assetNode = (id: string, asset: FilmAsset, kind: "character" | "location" | "prop" | "style"): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmAsset,
    title: asset.name,
    position: { x: 0, y: 0 },
    width: 200,
    height: 200,
    metadata: { filmAsset: { kind, asset } },
});
const shotNode = (id: string, payload: Partial<FilmShotNodeData> & { description: string; prompt: string; imageUrl?: string }): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Shot,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        filmShot: {
            shotNo: id,
            shotType: "中景",
            cameraMovement: "推近",
            duration: 4,
            dialogue: "",
            audio: "",
            ...payload,
        },
    },
});

const character = {
    ...createFilmAsset("character", 1),
    name: "沈迟",
    description: "落魄调查记者",
    visualPrompt: "深色风衣，短发",
};
character.character = { ...character.character!, master: appendSlotImage(character.character!.master, image("char-master")) };
const location = { ...withConcept(createFilmAsset("location", 1), "loc-concept"), name: "雨夜天台", description: "暴雨霓虹" };
const prop = { ...withConcept(createFilmAsset("prop", 1), "prop-concept"), name: "录音笔" };
const style = { ...withConcept(createFilmAsset("style", 1), "style-concept"), name: "冷峻电影感", visualPrompt: "冷调、低饱和、霓虹边缘光" };

const nodes: CanvasNodeData[] = [
    assetNode("char", character, "character"),
    assetNode("loc", location, "location"),
    assetNode("prop", prop, "prop"),
    assetNode("style", style, "style"),
    shotNode("shot-prev", { description: "主角站在天台边缘", prompt: "雨夜天台远景", imageUrl: "https://example.com/prev.png" }),
    shotNode("shot", { description: "主角回头", prompt: "雨夜天台，主角半侧身回头" }),
];
const connections: CanvasConnection[] = [
    { id: "seq", fromNodeId: "shot-prev", toNodeId: "shot", kind: "sequence" },
    { id: "bc", fromNodeId: "char", toNodeId: "shot", kind: "binding", data: { source: "manual", continuity: { emotion: "压抑" } } },
    { id: "bl", fromNodeId: "loc", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
    { id: "bp", fromNodeId: "prop", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
];

test("compiles a shot from graph nodes and edges", () => {
    const context = buildFilmShotGenerationFromGraph(nodes, connections, "shot", { medium: "image", maxReferences: 10 });
    assert.ok(context);
    assert.equal(context!.characters[0]?.characterId, "char");
    assert.ok(context!.references.some((ref) => ref.role === "character-package"));
    assert.ok(context!.references.some((ref) => ref.role === "location"));
    assert.ok(context!.references.some((ref) => ref.role === "prop"));
    assert.ok(context!.references.some((ref) => ref.role === "previous-shot"));
    assert.ok(context!.prompt.includes("落魄调查记者"));
    assert.ok(context!.prompt.includes("雨夜天台"));
    assert.ok(context!.prompt.includes("冷调、低饱和"));
});

test("can skip the previous shot", () => {
    const context = buildFilmShotGenerationFromGraph(nodes, connections, "shot", { medium: "image", maxReferences: 10, includePreviousShot: false });
    assert.ok(context);
    assert.equal(context!.references.some((ref) => ref.role === "previous-shot"), false);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd web && bun test film-shot-generation-context`
Expected: FAIL，模块不存在；编译器首参尚未收窄。

- [ ] **Step 4: 实现图适配器**

新建 `film-shot-generation-context.ts`：

```ts
import type { FilmAsset, FilmAssetKind, FilmGenerationContext, FilmShot, FilmShotCharacterBinding, FilmShotPropBinding } from "@/lib/film/types";
import { findFilmCharacterState } from "@/app/(user)/film/utils/film-character";
import { buildFilmShotGenerationContext, type FilmGenerationOptions } from "@/app/(user)/film/utils/film-shot-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";

export type FilmGraphGenerationOptions = Omit<FilmGenerationOptions, "previousShot" | "anchorShot"> & {
    includePreviousShot?: boolean;
};

function payloadOf(node: CanvasNodeData | undefined) {
    return node?.type === CanvasNodeType.FilmAsset ? node.metadata?.filmAsset : undefined;
}

function assetsOfKind(nodes: CanvasNodeData[], kind: FilmAssetKind): FilmAsset[] {
    return nodes.flatMap((node) => {
        const payload = payloadOf(node);
        return payload?.kind === kind ? [payload.asset] : [];
    });
}

function shotFromNode(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmShot | null {
    const payload = node.metadata?.filmShot;
    if (!payload) return null;
    const incoming = connections.filter((edge) => edge.kind === "binding" && edge.toNodeId === node.id);
    const characterBindings: FilmShotCharacterBinding[] = incoming.flatMap((edge) => {
        const source = nodes.find((item) => item.id === edge.fromNodeId);
        const assetPayload = payloadOf(source);
        if (!assetPayload || assetPayload.kind !== "character") return [];
        const state = findFilmCharacterState(assetPayload.asset, edge.data?.stateId);
        return [{
            characterId: source!.id,
            stateId: edge.data?.stateId,
            source: edge.data?.source ?? "manual",
            characterNameSnapshot: assetPayload.asset.name,
            stateNameSnapshot: state?.name,
            continuity: edge.data?.continuity ?? {},
        }];
    });
    const propBindings: FilmShotPropBinding[] = incoming.flatMap((edge) => {
        const source = nodes.find((item) => item.id === edge.fromNodeId);
        const assetPayload = payloadOf(source);
        if (!assetPayload || assetPayload.kind !== "prop") return [];
        return [{ propId: source!.id, propNameSnapshot: assetPayload.asset.name, source: edge.data?.source ?? "manual" }];
    });
    const locationEdge = incoming.find((edge) => payloadOf(nodes.find((item) => item.id === edge.fromNodeId))?.kind === "location");
    return {
        ...payload,
        id: node.id,
        characterBindings,
        propBindings,
        locationId: locationEdge?.fromNodeId,
        locationVariantId: locationEdge?.data?.variantId,
    } as FilmShot;
}

function previousShotOf(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string): FilmShot | undefined {
    const edge = connections.find((item) => item.kind === "sequence" && item.toNodeId === shotId);
    const node = edge ? nodes.find((item) => item.id === edge.fromNodeId) : undefined;
    return node ? shotFromNode(node, nodes, connections) ?? undefined : undefined;
}

export function buildFilmShotGenerationFromGraph(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotId: string,
    options: FilmGraphGenerationOptions,
): FilmGenerationContext | null {
    const node = nodes.find((item) => item.id === shotId && item.type === CanvasNodeType.Shot);
    if (!node) return null;
    const shot = shotFromNode(node, nodes, connections);
    if (!shot) return null;
    const { includePreviousShot = true, ...generationOptions } = options;
    const style = nodes.find((item) => payloadOf(item)?.kind === "style");
    return buildFilmShotGenerationContext({
        characters: assetsOfKind(nodes, "character"),
        locations: assetsOfKind(nodes, "location"),
        props: assetsOfKind(nodes, "prop"),
        costumes: assetsOfKind(nodes, "costume"),
        style: style ? payloadOf(style)!.asset : undefined,
    }, shot, {
        ...generationOptions,
        previousShot: includePreviousShot ? previousShotOf(nodes, connections, shotId) : undefined,
    });
}
```

- [ ] **Step 5: 跑测试与现有编译器测试**

Run:

```bash
cd web
bun test film-shot-generation-context
bun test film-shot-generation
```

Expected: 新增 2 条通过；原有编译器测试不回归。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 2: 镜头图片任务目标与写回

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-shot-task-updates.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-task-updates.test.ts`

**Interfaces:**
- Produces: `selectFilmShotImageTaskTargets(nodes)`；`applyFilmShotImageTaskUpdate(nodes, shotId, task, clientTaskId?)`。

- [ ] **Step 1: 写失败测试**

新建 `film-shot-task-updates.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmGenerationContext } from "@/lib/film/types";
import type { CanvasImageTask } from "@/services/api/image";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { applyFilmShotImageTaskUpdate, selectFilmShotImageTaskTargets } from "./film-shot-task-updates";

const context = { inputSignature: "sig-1" } as FilmGenerationContext;

const shotNode = (status: "loading" | "success" | "error" = "loading", clientTaskId = "client-1"): CanvasNodeData => ({
    id: "shot",
    type: CanvasNodeType.Shot,
    title: "镜头",
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        status,
        clientTaskId,
        imageTaskId: "task-1",
        filmShot: {
            shotNo: "01",
            shotType: "",
            cameraMovement: "",
            duration: 4,
            description: "雨夜天台",
            dialogue: "",
            audio: "",
            prompt: "雨夜天台",
            pendingTask: { kind: "image", id: clientTaskId, startedAt: Date.now(), generationContext: context },
        },
    },
});

test("selects loading shot image tasks only", () => {
    const targets = selectFilmShotImageTaskTargets([shotNode("loading"), shotNode("success")]);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].id, "shot");
});

test("writes a completed image into filmShot versions and clears the task", () => {
    const task = { id: "task-1", status: "completed", image_url: "https://example.com/result.png", storageKey: "image:result" } as CanvasImageTask;
    const next = applyFilmShotImageTaskUpdate([shotNode()], "shot", task, "client-1");
    const node = next[0];
    assert.equal(node.metadata?.status, "success");
    assert.equal(node.metadata?.filmShot?.imageUrl, "https://example.com/result.png");
    assert.equal(node.metadata?.filmShot?.storageKey, "image:result");
    assert.equal(node.metadata?.filmShot?.imageVersions?.[0]?.generationContext?.inputSignature, "sig-1");
    assert.equal(node.metadata?.filmShot?.pendingTask, undefined);
    assert.equal(node.metadata?.imageTaskId, undefined);
});

test("writes failure and ignores stale client task ids", () => {
    const failed = { id: "task-1", status: "failed", error: { message: "模型失败" } } as CanvasImageTask;
    const next = applyFilmShotImageTaskUpdate([shotNode()], "shot", failed, "client-1")[0];
    assert.equal(next.metadata?.status, "error");
    assert.equal(next.metadata?.filmShot?.errorMessage, "模型失败");
    assert.equal(next.metadata?.filmShot?.pendingTask, undefined);
    const stale = applyFilmShotImageTaskUpdate([shotNode()], "shot", failed, "client-old");
    assert.equal(stale[0].metadata?.status, "loading");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-shot-task-updates`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现目标筛选与写回**

新建 `film-shot-task-updates.ts`：

```ts
import type { CanvasImageTask } from "@/services/api/image";
import type { FilmShot } from "@/lib/film/types";
import { withImageVersion } from "@/app/(user)/film/utils/film-versions";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS } from "./canvas-node-constants";
import { canvasImageTaskURLs, canvasTaskCompleted, canvasTaskFailed } from "./canvas-task-helpers";

export function selectFilmShotImageTaskTargets(nodes: CanvasNodeData[]) {
    return nodes.filter((node) =>
        node.type === CanvasNodeType.Shot
        && node.metadata?.status === NODE_STATUS_LOADING
        && node.metadata?.imageTaskId
        && node.metadata?.filmShot?.pendingTask?.kind === "image");
}

export function applyFilmShotImageTaskUpdate(nodes: CanvasNodeData[], shotId: string, task: CanvasImageTask, clientTaskId?: string) {
    return nodes.map((node) => {
        if (node.id !== shotId) return node;
        const payload = node.metadata?.filmShot;
        const pending = payload?.pendingTask;
        if (!payload || pending?.kind !== "image") return node;
        if (clientTaskId && node.metadata?.clientTaskId !== clientTaskId) return node;
        const url = canvasImageTaskURLs(task)[0] || "";
        const completed = canvasTaskCompleted(task.status) || Boolean(url);
        const failed = canvasTaskFailed(task.status) || (completed && !url);
        const progress = typeof task.progress === "number" ? Math.max(0, Math.min(100, task.progress)) : node.metadata?.progress || 0;
        if (failed) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: task.error?.message || "分镜图生成失败",
                    imageTaskId: undefined,
                    clientTaskId: undefined,
                    filmShot: { ...payload, errorMessage: task.error?.message || "分镜图生成失败", pendingTask: undefined },
                },
            };
        }
        if (!completed) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_LOADING,
                    progress,
                    imageTaskId: task.id || node.metadata?.imageTaskId,
                    filmShot: payload,
                },
            };
        }
        const version = withImageVersion({
            ...payload,
            id: node.id,
            characterBindings: [],
            propBindings: [],
        } as FilmShot, url, task.storageKey, pending.generationContext);
        const startedAt = node.metadata?.startedAt || pending.startedAt;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: NODE_STATUS_SUCCESS,
                progress: 100,
                errorDetails: undefined,
                imageTaskId: undefined,
                imageTaskResultId: task.id,
                clientTaskId: undefined,
                durationMs: Date.now() - startedAt,
                filmShot: { ...payload, ...version, pendingTask: undefined },
            },
        };
    });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && bun test film-shot-task-updates`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 检查点**

汇报。不要提交。

---

### Task 3: 轮询与停止接入

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-polling.ts`
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-control.ts`

**Interfaces:**
- Consumes: `selectFilmShotImageTaskTargets`、`applyFilmShotImageTaskUpdate`。
- Produces: 镜头图片任务在现有轮询循环内恢复；停止按图片任务处理。

- [ ] **Step 1: 轮询增加镜头图片分支**

在 `use-canvas-task-polling.ts`：

1. 导入：

```ts
import { applyFilmShotImageTaskUpdate, selectFilmShotImageTaskTargets } from "../lib/film-shot-task-updates";
```

2. 在 `imageTargets.forEach(...)` 之后加入：

```ts
            const filmShotTargets = selectFilmShotImageTaskTargets(nodesRef.current);
            filmShotTargets.forEach((node) => {
                if (pollingImageNodeIdsRef.current.has(node.id) || !node.metadata?.imageTaskId) return;
                const controller = new AbortController();
                pollingImageNodeIdsRef.current.set(node.id, controller);
                void pollCanvasImageTaskStatus(node.metadata.imageTaskId, controller.signal)
                    .then((result) => {
                        if (controller.signal.aborted) return;
                        const task = rememberNodeTask(node.id, node.metadata?.clientTaskId || node.metadata?.imageTaskId, result);
                        if (!isNodeTaskActive(node.id, node.metadata?.clientTaskId)) return;
                        setNodes((prev) => applyFilmShotImageTaskUpdate(prev, node.id, task, node.metadata?.clientTaskId));
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        pollingImageNodeIdsRef.current.delete(node.id);
                    });
            });
```

- [ ] **Step 2: 停止支持镜头**

在 `use-canvas-task-control.ts` 中把 kind 判断改为：

```ts
        const kind = isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Shot ? "image" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : node.type === CanvasNodeType.Text ? "text" : null;
```

镜头停止会把节点置为 `stopped`；Studio 的停止动作会再清掉 `pendingTask`。

- [ ] **Step 3: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun test film-shot-task-updates`
Expected: 通过。

- [ ] **Step 4: 检查点**

汇报。不要提交。

---

### Task 4: Editor 生成/停止动作与模型字段

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`

**Interfaces:**
- Consumes: `buildFilmShotGenerationFromGraph`、`loadFilmShotGenerationReferences`、`createCanvasImageTask`、`applyFilmShotImageTaskUpdate`、`submitNodeTask`。
- Produces: `generateFilmShotImage`、`stopFilmShotImage`；模型 `imageGenerating/imageError/canGenerateImage/onGenerateImage/onStopImage`。

- [ ] **Step 1: 扩展模型类型**

在 `film-studio-types.ts` 的 `FilmStudioModel` 中加入：

```ts
    imageGenerating: boolean;
    imageError: string | null;
    canGenerateImage: boolean;
    onGenerateImage: () => void;
    onStopImage: () => void;
```

- [ ] **Step 2: 导入与 hooks**

在 `canvas-editor.tsx` 顶部加入：

```ts
import { createCanvasImageTask, type CanvasImageTask, type SeedableImageConfig } from "@/services/api/image";
import { normalizeFilmAspect } from "@/lib/film/film-aspects";
import { useModelConfig } from "@/hooks/use-model-config";
import { loadFilmShotGenerationReferences } from "@/app/(user)/film/utils/film-references";
import { FILM_IMAGE_REFERENCE_LIMIT } from "@/app/(user)/film/utils/film-shot-generation";
import { buildFilmShotGenerationFromGraph } from "./lib/film-shot-generation-context";
import { applyFilmShotImageTaskUpdate } from "./lib/film-shot-task-updates";
```

在其他全局 hook 附近加入：

```ts
    const resolveModelConfig = useModelConfig();
```

- [ ] **Step 3: 生成/停止动作（放在 `focusNode` 之后）**

```ts
    const generateFilmShotImage = useCallback(async (shotId: string) => {
        const node = nodesRef.current.find((item) => item.id === shotId);
        const payload = node?.metadata?.filmShot;
        if (!node || !payload) return;
        if (!(payload.prompt || payload.description).trim()) {
            message.warning("先填写画面描述或提示词");
            return;
        }
        if (node.metadata?.status === "loading") return;
        const config = resolveModelConfig("image");
        if (!config) return;
        const imageConfig = {
            ...config,
            count: "1",
            size: normalizeFilmAspect(currentProject?.film?.aspect),
        } as SeedableImageConfig;
        const context = buildFilmShotGenerationFromGraph(nodesRef.current, connectionsRef.current, shotId, {
            medium: "image",
            maxReferences: FILM_IMAGE_REFERENCE_LIMIT,
        });
        if (!context) return;
        const { images, missingReferenceIds } = await loadFilmShotGenerationReferences(context);
        const generationContext = { ...context, missingReferenceIds };
        const clientTaskId = `client_film_shot_image_${nanoid()}`;
        const startedAt = Date.now();
        setNodes((prev) => prev.map((item) => item.id === shotId && item.metadata?.filmShot ? {
            ...item,
            metadata: {
                ...item.metadata,
                status: "loading",
                clientTaskId,
                imageTaskId: clientTaskId,
                imageTaskResultId: undefined,
                startedAt,
                progress: 0,
                errorDetails: undefined,
                filmShot: {
                    ...item.metadata.filmShot,
                    errorMessage: "",
                    pendingTask: { kind: "image", id: clientTaskId, startedAt, generationContext },
                },
            },
        } : item));
        try {
            const task = await submitNodeTask(shotId, clientTaskId, (signal, onServerTask) => createCanvasImageTask(imageConfig, generationContext.prompt, images, {
                signal,
                onServerTask,
                nodeId: shotId,
                sourceId: projectId,
                clientTaskId,
            }));
            if (!isNodeTaskActive(shotId, clientTaskId)) return;
            setNodes((prev) => applyFilmShotImageTaskUpdate(prev, shotId, task, clientTaskId));
        } catch (error) {
            if (!isNodeTaskActive(shotId, clientTaskId)) return;
            const errorDetails = errorMessage(error, "分镜图生成失败");
            setNodes((prev) => applyFilmShotImageTaskUpdate(prev, shotId, {
                id: clientTaskId,
                status: "failed",
                error: { message: errorDetails },
            } as CanvasImageTask, clientTaskId));
            message.error(errorDetails);
        }
    }, [connectionsRef, isNodeTaskActive, message, nodesRef, projectId, resolveModelConfig, setNodes, submitNodeTask]);

    const stopFilmShotImage = useCallback(async (shotId: string) => {
        await handleStopNode(shotId);
        setNodes((prev) => prev.map((item) => item.id === shotId && item.metadata?.filmShot ? {
            ...item,
            metadata: {
                ...item.metadata,
                filmShot: { ...item.metadata.filmShot, pendingTask: undefined },
            },
        } : item));
    }, [handleStopNode, setNodes]);
```

- [ ] **Step 4: 计算模型状态并加入 filmStudio**

在构建 `filmStudio` 之前加入：

```ts
    const activeFilmShotNode = activeFilm.shot?.shot ?? null;
    const activeFilmShotPayload = activeFilmShotNode?.metadata?.filmShot;
    const filmImageGenerating = activeFilmShotNode?.metadata?.status === "loading" && activeFilmShotPayload?.pendingTask?.kind === "image";
    const filmImageError = activeFilmShotNode?.metadata?.status === "error"
        ? activeFilmShotNode.metadata.errorDetails || activeFilmShotPayload?.errorMessage || "分镜图生成失败"
        : null;
    const canGenerateFilmImage = Boolean(activeFilmShotNode && (activeFilmShotPayload?.prompt || activeFilmShotPayload?.description || "").trim() && !filmImageGenerating);
```

在 `filmStudio` 对象中加入：

```ts
        imageGenerating: filmImageGenerating,
        imageError: filmImageError,
        canGenerateImage: canGenerateFilmImage,
        onGenerateImage: () => {
            if (activeFilmShotNode) void generateFilmShotImage(activeFilmShotNode.id);
        },
        onStopImage: () => {
            if (activeFilmShotNode) void stopFilmShotImage(activeFilmShotNode.id);
        },
```

- [ ] **Step 5: 检查**

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 5: Studio 生成界面与缩略图

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-strip.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx`

**Interfaces:**
- Consumes: 模型新增生成字段；`useResolvedMediaSrc`。
- Produces: 面板生成/停止/错误；舞台图片/进度/生成按钮；胶片条缩略图/状态点；`G` 生成。

- [ ] **Step 1: 左栏生成状态**

在 `film-shot-panel.tsx`：

1. Props 加入：

```ts
    imageGenerating: boolean;
    imageError: string | null;
    canGenerateImage: boolean;
    onGenerateImage: () => void;
    onStopImage: () => void;
```

2. 导入状态色（与画布统一）：

```ts
import { canvasStatusColors } from "../../lib/canvas-palette";
```

3. 在「状态」Section 中替换为：

```tsx
                    <Section theme={theme} title="状态">
                        <div className="flex flex-wrap items-center gap-2">
                            {imageGenerating ? (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStopImage}>停止生成</button>
                            ) : (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateImage} onClick={onGenerateImage}>生成分镜图</button>
                            )}
                            <span className="text-xs" style={{ color: theme.node.muted }}>
                                {filmShot?.imageUrl ? "已生成" : imageGenerating ? "生成中…" : imageError ? "生成失败" : "未生成"}
                            </span>
                        </div>
                        {imageError ? <div className="text-xs" style={{ color: canvasStatusColors.error }}>{imageError}</div> : null}
                    </Section>
```

- [ ] **Step 2: 舞台图片/进度/生成**

把 `film-shot-stage.tsx` 替换为：

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { CanvasNodeData } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";

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
    imageGenerating: boolean;
    imageError: string | null;
    canGenerateImage: boolean;
    onGenerateImage: () => void;
    onStopImage: () => void;
};

export function FilmShotStage({ theme, shot, sceneLabel, aspect, canCreateShot, onCreateShot, onLocate, onPrev, onNext, hasPrev, hasNext, imageGenerating, imageError, canGenerateImage, onGenerateImage, onStopImage }: FilmShotStageProps) {
    const filmShot = shot?.metadata?.filmShot;
    const imageSrc = useResolvedMediaSrc(filmShot?.imageUrl, filmShot?.storageKey);
    const ratio = aspect.replace(":", " / ");
    const statusLabel = imageSrc ? "已生成" : imageGenerating ? "生成中…" : imageError ? "生成失败" : "分镜图未生成";

    return (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" style={{ background: theme.canvas.background }}>
            <div className="relative w-full max-w-[960px] overflow-hidden rounded-xl border" style={{ aspectRatio: ratio, background: theme.node.fill, borderColor: theme.node.stroke }}>
                {shot ? (
                    imageSrc ? (
                        <img src={imageSrc} alt="" className="h-full w-full object-contain" />
                    ) : (
                        <div className="flex h-full w-full flex-col justify-between gap-4 p-8 max-sm:p-5">
                            <div className="flex items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span className="truncate">{sceneLabel}</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: imageError ? canvasStatusColors.error : theme.node.stroke, color: imageError ? canvasStatusColors.error : theme.node.muted }}>{statusLabel}</span>
                            </div>
                            <div className="min-h-0 flex-1">
                                <div className="font-mono text-5xl font-semibold tracking-tight tabular-nums" style={{ color: theme.node.text, opacity: 0.9 }}>
                                    {filmShot?.shotNo || "—"}
                                </div>
                                <div className="mt-4 line-clamp-4 max-w-2xl text-lg leading-8" style={{ color: theme.node.text }}>
                                    {filmShot?.description || filmShot?.prompt || "还没有画面描述"}
                                </div>
                                {filmShot?.prompt ? <div className="mt-3 line-clamp-3 max-w-2xl text-sm leading-7" style={{ color: theme.node.muted }}>{filmShot.prompt}</div> : null}
                                {imageError ? <div className="mt-3 max-w-2xl text-sm" style={{ color: canvasStatusColors.error }}>{imageError}</div> : null}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span>{imageGenerating ? "正在生成分镜图…" : "生成分镜后在这里预览画面"}</span>
                                <div className="flex items-center gap-2">
                                    {imageGenerating ? (
                                        <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={onStopImage}>停止</button>
                                    ) : (
                                        <button type="button" className="rounded-full border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateImage} onClick={onGenerateImage}>{imageError ? "重试生成" : "生成分镜图"}</button>
                                    )}
                                    <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => onLocate(shot.id)}>在画布中定位</button>
                                </div>
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

- [ ] **Step 3: 胶片条缩略图**

在 `film-strip.tsx`：

1. 导入：

```ts
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { CanvasNodeData } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";
```

2. 新增：

```tsx
function FilmShotThumb({ shot, theme }: { shot: CanvasNodeData; theme: CanvasTheme }) {
    const filmShot = shot.metadata?.filmShot;
    const src = useResolvedMediaSrc(filmShot?.imageUrl, filmShot?.storageKey);
    const status = shot.metadata?.status;
    return (
        <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg" style={{ background: theme.node.fill }}>
            {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: theme.node.text }}>{filmShot?.shotNo || "—"}</span>}
            {status === "loading" ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full" style={{ background: theme.canvas.selectionStroke }} /> : null}
            {status === "error" ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full" style={{ background: canvasStatusColors.error }} /> : null}
        </span>
    );
}
```

3. 把镜头卡片内容改为：

```tsx
                                    <FilmShotThumb shot={entry.shot} theme={theme} />
```

- 保留卡片边框/高亮与 `title`。

- [ ] **Step 4: Studio 主体传参与 `G`**

在 `film-studio-body.tsx`：

1. 给 `FilmShotPanel` 传入：

```tsx
                        imageGenerating={model.imageGenerating}
                        imageError={model.imageError}
                        canGenerateImage={model.canGenerateImage}
                        onGenerateImage={model.onGenerateImage}
                        onStopImage={model.onStopImage}
```

2. 给 `FilmShotStage` 传入同样字段。

3. 键盘处理加入：

```ts
            if (event.key.toLowerCase() === "g" && model.canGenerateImage) {
                event.preventDefault();
                model.onGenerateImage();
            }
```

放在箭头键判断之前/之后均可，保持输入框过滤逻辑不变。

- [ ] **Step 5: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun run lint`
Expected: 通过。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 6: 批次 1B（上）验收

**Files:** 无代码改动。

- [ ] **Step 1: 跑单测与全量检查**

```bash
cd web
bun test film-shot-generation-context
bun test film-shot-task-updates
bun test film-shot-generation
bun test film-selectors
bun test film-node-patch
bun test film-shot-create
bun run typecheck
bun run lint
bun test
```

Expected: 全部通过；测试总数在 631 基础上增加本批用例。

- [ ] **Step 2: 浏览器验收**

在 `NEXT_PUBLIC_ENABLE_FILM_CANVAS=1` 且配置了可用图片模型的 dev 下：

1. `/film` 新建影视画布 → 新增镜头 → 填写画面描述。
2. 左栏/舞台点击「生成分镜图」；状态进入生成中，胶片条出现状态点。
3. 生成完成后舞台显示图片、胶片条出现缩略图；刷新后图片仍在。
4. 生成中刷新页面：轮询继续，完成后图片写回（真实任务恢复）。
5. 生成中点击停止：状态停止、pending 清理，可重新生成。
6. 无可用模型时：打开配置入口/给出错误，不留下 loading 死状态。
7. 画布视图、Studio 切换、既有镜头编辑不回归；无 console 错误。

- [ ] **Step 3: 未实测标注**

若本机未配置真实图片模型：把「真实出图效果、生成中刷新恢复、停止服务端取消」写入验收报告为未实测，不写成已验证。

- [ ] **Step 4: 汇报**

列出改动文件、测试结果、浏览器结果与未实测项；**不提交**，等待用户授权。

## 后续（1B-2）

- 镜头视频生成：视频编译器选项、`createVideoGenerationTask`、视频任务轮询/停止/恢复、`videoVersions`、舞台视频与缩略图。
- 绑定编辑：Studio 内增删角色/场景/道具绑定边、本镜造型/变体覆盖。
- 资产槽位编辑器：角色/场景/道具/服装/风格槽位查看、选图、上传、生成与库更新提示。
