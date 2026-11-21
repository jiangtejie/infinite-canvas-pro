# 影视 Studio 批次 1B（下）实施计划：视频与绑定编辑（1B-2A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studio 支持单镜视频生成（参考模式）与任务恢复，并能在 Studio 内增删角色/场景/道具绑定、编辑造型/变体/连续性覆盖。

**Architecture:** 视频继续复用画布任务轮询与停止；镜头视频任务以 `filmShot.pendingTask` 持久化，结果用 `withVideoVersion` 写回。绑定真源仍在边：Studio 增删边、编辑边数据，编译器图适配器继续把边映射成镜头绑定；不新增 store/任务。

**Tech Stack:** Next.js App Router、TypeScript、Zustand、Ant Design、Bun test。

**Spec:** `docs/superpowers/specs/2026-11-21-film-studio-shell-design.md`；父 spec `2026-11-21-film-as-canvas-design.md`。

## Global Constraints

- 本计划只做**参考模式视频**；首尾帧模式、首尾帧 UI、资产槽位编辑器在 1B-2B。
- 唯一编译器/任务/同步；视频任务通过 `filmShot.pendingTask` 复用画布轮询与停止。
- 绑定真源在边；不要把这些绑定复制到镜头节点字段。
- Studio 只读写同一份 `CanvasProject`。
- 不自动 `git commit`/`git push`；提交需用户单独授权。
- 真实视频模型依赖用户 AI 配置；未配置时只验证配置入口与错误路径，并标注未实测。

## Scope

本计划覆盖：视频任务写回/轮询/停止、Studio 视频生成（参考模式）与展示、绑定增删与造型/变体/连续性覆盖、单测与浏览器验收。
不覆盖：首尾帧模式与首尾帧选择、资产槽位编辑器、对比/版本面板、批量。

## File Structure

- Create `web/src/app/(user)/canvas/[id]/lib/film-shot-video-task-updates.ts` — 视频任务目标/写回。
- Modify `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-polling.ts` — 镜头视频轮询分支。
- Modify `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-control.ts` — 镜头视频停止。
- Create `web/src/app/(user)/canvas/[id]/lib/film-shot-bindings.ts` — 绑定增删/更新纯函数。
- Modify `web/src/app/(user)/canvas/[id]/lib/film-selectors.ts` — 绑定 chips 带边数据/造型/变体。
- Modify `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts` — 视频/绑定模型字段。
- Modify `web/src/app/(user)/canvas/[id]/canvas-editor.tsx` — 视频生成/停止、绑定动作、模型。
- Modify `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx` — 视频区块、可编辑绑定。
- Modify `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx` — 图片/视频媒体切换与视频展示。
- Modify `web/src/app/(user)/canvas/[id]/components/film-strip.tsx` — 视频状态标记。
- Modify `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx` — 传参 + `V` 生成。
- Tests: `film-shot-video-task-updates.test.ts`、`film-shot-bindings.test.ts`、更新 `film-selectors.test.ts`。

---

### Task 1: 镜头视频任务目标与写回

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-shot-video-task-updates.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-video-task-updates.test.ts`

**Interfaces:**
- Produces: `selectFilmShotVideoTaskTargets(nodes)`；`applyFilmShotVideoTaskUpdate(nodes, shotId, task, clientTaskId?)`。

- [ ] **Step 1: 写失败测试**

新建 `film-shot-video-task-updates.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmGenerationContext } from "@/lib/film/types";
import type { VideoResponse } from "@/services/api/video";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { applyFilmShotVideoTaskUpdate, selectFilmShotVideoTaskTargets } from "./film-shot-video-task-updates";

const context = { inputSignature: "sig-video" } as FilmGenerationContext;

const shotNode = (status: "loading" | "success" | "error" = "loading", clientTaskId = "video-client-1"): CanvasNodeData => ({
    id: "shot",
    type: CanvasNodeType.Shot,
    title: "镜头",
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        status,
        clientTaskId,
        filmShot: {
            shotNo: "01",
            shotType: "",
            cameraMovement: "",
            duration: 4,
            description: "雨夜天台",
            dialogue: "",
            audio: "",
            prompt: "雨夜天台",
            pendingTask: { kind: "video", id: "video-task-1", taskId: "task-id-1", videoId: "video-id-1", startedAt: Date.now(), generationContext: context },
        },
    },
});

test("selects loading shot video tasks only", () => {
    const targets = selectFilmShotVideoTaskTargets([shotNode("loading"), shotNode("success")]);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].id, "shot");
});

test("writes a completed video into filmShot versions and clears the task", () => {
    const task = { id: "video-task-1", status: "completed", video_url: "https://example.com/result.mp4", storageKey: "video:result" } as VideoResponse;
    const next = applyFilmShotVideoTaskUpdate([shotNode()], "shot", task, "video-client-1")[0];
    assert.equal(next.metadata?.status, "success");
    assert.equal(next.metadata?.filmShot?.videoUrl, "https://example.com/result.mp4");
    assert.equal(next.metadata?.filmShot?.videoStorageKey, "video:result");
    assert.equal(next.metadata?.filmShot?.videoVersions?.[0]?.generationContext?.inputSignature, "sig-video");
    assert.equal(next.metadata?.filmShot?.pendingTask, undefined);
    assert.equal(next.metadata?.clientTaskId, undefined);
});

test("writes failure and ignores stale client task ids", () => {
    const failed = { id: "video-task-1", status: "failed", error: { message: "视频模型失败" } } as VideoResponse;
    const next = applyFilmShotVideoTaskUpdate([shotNode()], "shot", failed, "video-client-1")[0];
    assert.equal(next.metadata?.status, "error");
    assert.equal(next.metadata?.filmShot?.errorMessage, "视频模型失败");
    assert.equal(next.metadata?.filmShot?.pendingTask, undefined);
    const stale = applyFilmShotVideoTaskUpdate([shotNode()], "shot", failed, "video-client-old")[0];
    assert.equal(stale.metadata?.status, "loading");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && bun test film-shot-video-task-updates`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现视频任务写回**

新建 `film-shot-video-task-updates.ts`：

```ts
import type { VideoResponse } from "@/services/api/video";
import type { FilmShot } from "@/lib/film/types";
import { withVideoVersion } from "@/app/(user)/film/utils/film-versions";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS } from "./canvas-node-constants";
import { canvasTaskCompleted, canvasTaskFailed } from "./canvas-task-helpers";

export function selectFilmShotVideoTaskTargets(nodes: CanvasNodeData[]) {
    return nodes.filter((node) =>
        node.type === CanvasNodeType.Shot
        && node.metadata?.status === NODE_STATUS_LOADING
        && node.metadata?.filmShot?.pendingTask?.kind === "video");
}

export function applyFilmShotVideoTaskUpdate(nodes: CanvasNodeData[], shotId: string, task: VideoResponse, clientTaskId?: string) {
    return nodes.map((node) => {
        if (node.id !== shotId) return node;
        const payload = node.metadata?.filmShot;
        const pending = payload?.pendingTask;
        if (!payload || pending?.kind !== "video") return node;
        if (clientTaskId && node.metadata?.clientTaskId !== clientTaskId) return node;
        const url = task.video_url || task.url || "";
        const completed = canvasTaskCompleted(task.status) || Boolean(url) || Boolean(task.storageKey);
        const failed = canvasTaskFailed(task.status);
        const progress = typeof task.progress === "number" ? Math.max(0, Math.min(100, task.progress)) : node.metadata?.progress || 0;
        if (failed) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: task.error?.message || "分镜视频生成失败",
                    clientTaskId: undefined,
                    filmShot: { ...payload, errorMessage: task.error?.message || "分镜视频生成失败", pendingTask: undefined },
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
                    videoTaskVideoId: task.video_id || node.metadata?.videoTaskVideoId,
                    filmShot: payload,
                },
            };
        }
        const version = withVideoVersion({
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
                clientTaskId: undefined,
                videoTaskVideoId: task.video_id,
                durationMs: Date.now() - startedAt,
                filmShot: { ...payload, ...version, pendingTask: undefined },
            },
        };
    });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && bun test film-shot-video-task-updates`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 检查点**

汇报。不要提交。

---

### Task 2: 视频轮询与停止

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-polling.ts`
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-canvas-task-control.ts`

**Interfaces:**
- Consumes: `selectFilmShotVideoTaskTargets`、`applyFilmShotVideoTaskUpdate`；`resolveModelForCapability`。
- Produces: 镜头视频任务在画布轮询循环内恢复；停止按视频任务处理。

- [ ] **Step 1: 轮询增加镜头视频分支**

在 `use-canvas-task-polling.ts`：

1. 导入：

```ts
import { resolveModelForCapability } from "@/stores/use-config-store";
import { applyFilmShotVideoTaskUpdate, selectFilmShotVideoTaskTargets } from "../lib/film-shot-video-task-updates";
```

2. 在镜头图片分支之后加入：

```ts
            const filmShotVideoTargets = selectFilmShotVideoTaskTargets(nodesRef.current);
            filmShotVideoTargets.forEach((node) => {
                if (pollingVideoNodeIdsRef.current.has(node.id)) return;
                const pending = node.metadata?.filmShot?.pendingTask;
                if (!pending || pending.kind !== "video") return;
                const videoModel = resolveModelForCapability(effectiveConfig, effectiveConfig.videoModel, "video");
                if (!videoModel) return;
                const config = { ...effectiveConfig, model: videoModel } as AiConfig;
                const controller = new AbortController();
                pollingVideoNodeIdsRef.current.set(node.id, controller);
                void pollVideoGenerationTaskStatus(config, {
                    id: pending.id,
                    task_id: pending.taskId,
                    video_id: pending.videoId,
                } as VideoResponse, controller.signal)
                    .then((result) => {
                        if (controller.signal.aborted) return;
                        const task = rememberNodeTask(node.id, node.metadata?.clientTaskId || pending.id, result);
                        if (!isNodeTaskActive(node.id, node.metadata?.clientTaskId)) return;
                        setNodes((prev) => applyFilmShotVideoTaskUpdate(prev, node.id, task, node.metadata?.clientTaskId));
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        pollingVideoNodeIdsRef.current.delete(node.id);
                    });
            });
```

- [ ] **Step 2: 停止支持镜头视频**

在 `use-canvas-task-control.ts` 中把 kind 判断改为：

```ts
        const shotVideo = node.type === CanvasNodeType.Shot && node.metadata?.filmShot?.pendingTask?.kind === "video";
        const kind = isCanvasImageNodeType(node.type)
            ? "image"
            : node.type === CanvasNodeType.Shot
                ? (shotVideo ? "video" : "image")
                : node.type === CanvasNodeType.Video
                    ? "video"
                    : node.type === CanvasNodeType.Audio
                        ? "audio"
                        : node.type === CanvasNodeType.Text
                            ? "text"
                            : null;
```

- [ ] **Step 3: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun test film-shot-video-task-updates`
Expected: 通过。

- [ ] **Step 4: 检查点**

汇报。不要提交。

---

### Task 3: Editor 视频生成/停止动作与模型

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`

**Interfaces:**
- Consumes: `createVideoGenerationTask`、`filmVideoTaskRef`、`filmVideoAspect`、`filmVideoReferenceLimit`、`clampFilmVideoDuration`。
- Produces: `generateFilmShotVideo`、`stopFilmShotVideo`；模型 `videoGenerating/videoError/canGenerateVideo/onGenerateVideo/onStopVideo`。

- [ ] **Step 1: 扩展模型类型**

在 `film-studio-types.ts` 的 `FilmStudioModel` 中加入：

```ts
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: () => void;
    onStopVideo: () => void;
```

- [ ] **Step 2: 导入与动作**

在 `canvas-editor.tsx` 顶部加入：

```ts
import { createVideoGenerationTask } from "@/services/api/video";
import { clampFilmVideoDuration, filmVideoAspect, filmVideoReferenceLimit } from "@/app/(user)/film/utils/film-video-limits";
import { filmVideoTaskRef } from "@/app/(user)/film/utils/film-video-task";
```

在 `focusNode` 之后的生成动作区域加入：

```ts
    const generateFilmShotVideo = useCallback(async (shotId: string) => {
        const node = nodesRef.current.find((item) => item.id === shotId);
        const payload = node?.metadata?.filmShot;
        if (!node || !payload) return;
        if (!(payload.prompt || payload.description).trim()) {
            message.warning("先填写画面描述或提示词");
            return;
        }
        if (node.metadata?.status === "loading") return;
        const config = resolveModelConfig("video");
        if (!config) return;
        const model = config.model || config.videoModel || "";
        const videoConfig: AiConfig = {
            ...config,
            size: filmVideoAspect(currentProject?.film?.aspect ?? "16:9", model),
            videoSeconds: String(clampFilmVideoDuration(payload.duration ?? 4, model)),
            ...(payload.negativePrompt ? { videoNegativePrompt: payload.negativePrompt } : {}),
        };
        const context = buildFilmShotGenerationFromGraph(nodesRef.current, connectionsRef.current, shotId, {
            medium: "video",
            maxReferences: filmVideoReferenceLimit(model),
            videoMode: "reference",
            includeStoryboard: true,
        });
        if (!context) return;
        const { images, missingReferenceIds } = await loadFilmShotGenerationReferences(context);
        const generationContext = { ...context, missingReferenceIds };
        const clientTaskId = `client_film_shot_video_${nanoid()}`;
        const startedAt = Date.now();
        setNodes((prev) => prev.map((item) => item.id === shotId && item.metadata?.filmShot ? {
            ...item,
            metadata: {
                ...item.metadata,
                status: "loading",
                clientTaskId,
                startedAt,
                progress: 0,
                errorDetails: undefined,
                filmShot: { ...item.metadata.filmShot, errorMessage: "", pendingTask: undefined },
            },
        } : item));
        try {
            const created = await createVideoGenerationTask(videoConfig, generationContext.prompt, { references: images }, undefined, {
                clientTaskId,
                source: "canvas",
                sourceId: shotId,
                onServerTask: (backend = "account") => setNodes((prev) => prev.map((item) => item.id === shotId ? { ...item, metadata: { ...item.metadata, taskBackend: backend } } : item)),
            });
            if (!isNodeTaskActive(shotId, clientTaskId)) return;
            const taskRef = filmVideoTaskRef(created.task);
            setNodes((prev) => prev.map((item) => item.id === shotId && item.metadata?.filmShot ? {
                ...item,
                metadata: {
                    ...item.metadata,
                    status: "loading",
                    clientTaskId,
                    startedAt,
                    progress: 0,
                    videoTaskVideoId: created.task.video_id,
                    filmShot: { ...item.metadata.filmShot, errorMessage: "", pendingTask: { ...taskRef, generationContext } },
                },
            } : item));
        } catch (error) {
            if (!isNodeTaskActive(shotId, clientTaskId)) return;
            const errorDetails = toErrorMessage(error, "分镜视频生成失败");
            setNodes((prev) => prev.map((item) => item.id === shotId && item.metadata?.filmShot ? {
                ...item,
                metadata: {
                    ...item.metadata,
                    status: "error",
                    errorDetails,
                    clientTaskId: undefined,
                    filmShot: { ...item.metadata.filmShot, errorMessage: errorDetails, pendingTask: undefined },
                },
            } : item));
            message.error(errorDetails);
        }
    }, [connectionsRef, currentProject?.film?.aspect, isNodeTaskActive, message, nodesRef, projectId, resolveModelConfig, setNodes]);

    const stopFilmShotVideo = useCallback(async (shotId: string) => {
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

- [ ] **Step 3: 模型状态与字段**

在构建 `filmStudio` 之前加入：

```ts
    const filmVideoGenerating = activeFilmShotNode?.metadata?.status === "loading" && activeFilmShotPayload?.pendingTask?.kind === "video";
    const filmVideoError = activeFilmShotNode?.metadata?.status === "error"
        ? activeFilmShotNode.metadata.errorDetails || activeFilmShotPayload?.errorMessage || "分镜视频生成失败"
        : null;
    const canGenerateFilmVideo = Boolean(activeFilmShotNode && (activeFilmShotPayload?.prompt || activeFilmShotPayload?.description || "").trim() && !filmVideoGenerating);
```

在 `filmStudio` 对象中加入：

```ts
        videoGenerating: filmVideoGenerating,
        videoError: filmVideoError,
        canGenerateVideo: canGenerateFilmVideo,
        onGenerateVideo: () => {
            if (activeFilmShotNode) void generateFilmShotVideo(activeFilmShotNode.id);
        },
        onStopVideo: () => {
            if (activeFilmShotNode) void stopFilmShotVideo(activeFilmShotNode.id);
        },
```

- [ ] **Step 4: 检查**

Run: `cd web && bun run typecheck`
Expected: 通过。

- [ ] **Step 5: 检查点**

汇报。不要提交。

---

### Task 4: Studio 视频展示与生成入口

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-strip.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx`

**Interfaces:**
- Consumes: 模型视频字段；`useResolvedMediaSrc(..., "media")`。
- Produces: 左栏视频生成/停止/状态；舞台图片/视频媒体切换；胶片条视频标记；`V` 生成。

- [ ] **Step 1: 左栏视频区块**

在 `film-shot-panel.tsx`：

1. Props 加入：

```ts
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: () => void;
    onStopVideo: () => void;
```

2. 在「状态」Section 之后加入：

```tsx
                    <Section theme={theme} title="视频">
                        <div className="flex flex-wrap items-center gap-2">
                            {videoGenerating ? (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStopVideo}>停止生成</button>
                            ) : (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateVideo} onClick={onGenerateVideo}>生成分镜视频</button>
                            )}
                            <span className="text-xs" style={{ color: theme.node.muted }}>
                                {filmShot?.videoUrl ? "已生成" : videoGenerating ? "生成中…" : videoError ? "生成失败" : "未生成"}
                            </span>
                        </div>
                        {videoError ? <div className="text-xs" style={{ color: canvasStatusColors.error }}>{videoError}</div> : null}
                        <div className="text-[11px]" style={{ color: theme.node.muted }}>当前为参考模式；首尾帧模式在下一批接入。</div>
                    </Section>
```

- [ ] **Step 2: 舞台媒体切换**

在 `film-shot-stage.tsx`：

1. Props 加入视频字段：

```ts
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: () => void;
    onStopVideo: () => void;
```

2. 导入 `useState`/`useEffect` 与 `Play` 图标：

```ts
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
```

3. 组件内加入：

```ts
    const videoSrc = useResolvedMediaSrc(filmShot?.videoUrl, filmShot?.videoStorageKey, "media");
    const [media, setMedia] = useState<"image" | "video">("image");
    useEffect(() => {
        setMedia(videoSrc ? "video" : "image");
    }, [shot?.id, videoSrc]);
```

4. 渲染：
   - 当 `media === "video" && videoSrc` 时显示：

```tsx
                        <video src={videoSrc} controls playsInline className="h-full w-full object-contain" />
```

   - 当两者都有时，在状态 chip 旁显示切换：

```tsx
                                <div className="flex items-center gap-1">
                                    <button type="button" className="rounded-full border px-2 py-0.5" style={{ borderColor: media === "image" ? theme.canvas.selectionStroke : theme.node.stroke, color: theme.node.text }} onClick={() => setMedia("image")}>分镜图</button>
                                    <button type="button" className="rounded-full border px-2 py-0.5" style={{ borderColor: media === "video" ? theme.canvas.selectionStroke : theme.node.stroke, color: theme.node.text }} onClick={() => setMedia("video")}>视频</button>
                                </div>
```

   - 无视频但已生成图片时保留图片；无图无视频时保留空镜卡与图片生成按钮。
   - 视频区块的生成/停止按钮由左栏负责；舞台只负责展示和切换。

- [ ] **Step 3: 胶片条视频标记**

在 `film-strip.tsx` 的 `FilmShotThumb` 中，如果 `filmShot?.videoUrl`，显示右下角播放标记：

```tsx
            {filmShot?.videoUrl ? <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-black/55 text-white"><Play className="size-2.5" /></span> : null}
```

导入 `Play`。

- [ ] **Step 4: Studio 主体传参与 `V`**

在 `film-studio-body.tsx`：

1. 给 `FilmShotPanel`/`FilmShotStage` 传入视频字段/动作。

2. 键盘加入：

```ts
            if (event.key.toLowerCase() === "v" && model.canGenerateVideo) {
                event.preventDefault();
                model.onGenerateVideo();
            }
```

- [ ] **Step 5: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun run lint`
Expected: 通过。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 5: 绑定选择器扩展与增删纯函数

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`（`FilmShotBindingChip`）
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-selectors.ts`（绑定详情）
- Create: `web/src/app/(user)/canvas/[id]/lib/film-shot-bindings.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-bindings.test.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-selectors.test.ts`

**Interfaces:**
- Produces: `FilmShotBindingChip` 扩展；`addFilmShotBinding`、`removeFilmShotBinding`、`updateFilmShotBinding`。

- [ ] **Step 1: 扩展 chips 类型与选择器**

在 `film-studio-types.ts` 中把 `FilmShotBindingChip` 改为：

```ts
export type FilmShotBindingChip = {
    id: string;
    edgeId: string;
    kind: FilmAssetKind;
    name: string;
    stateId?: string;
    stateName?: string;
    variantId?: string;
    variantName?: string;
    continuity?: import("../../types").FilmBindingEdgeData["continuity"];
    states: { id: string; name: string }[];
    variants: { id: string; name: string }[];
};
```

在 `film-selectors.ts` 的 `selectFilmShotBindings` 中构造完整字段：

```ts
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
            const asset = payload.asset;
            return [{
                id: node.id,
                edgeId: edge.id,
                kind: payload.kind,
                name: asset.name || node.title,
                stateId: edge.data?.stateId,
                stateName: asset.character?.states.find((state) => state.id === edge.data?.stateId)?.name,
                variantId: edge.data?.variantId,
                variantName: asset.location?.variants.find((variant) => variant.id === edge.data?.variantId)?.name,
                continuity: edge.data?.continuity,
                states: asset.character?.states.map((state) => ({ id: state.id, name: state.name })) ?? [],
                variants: asset.location?.variants.map((variant) => ({ id: variant.id, name: variant.name })) ?? [],
            }];
        });
}
```

更新 `film-selectors.test.ts` 的绑定断言，改为逐项断言：

```ts
    const chips = selectFilmShotBindings(nodes, connections, "shot1");
    assert.deepEqual(chips.map((chip) => ({ id: chip.id, edgeId: chip.edgeId, kind: chip.kind, name: chip.name })), [
        { id: "char", edgeId: "b1", kind: "character", name: "char" },
        { id: "loc", edgeId: "b2", kind: "location", name: "loc" },
    ]);
```

- [ ] **Step 2: 写失败测试**

新建 `film-shot-bindings.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { addFilmShotBinding, removeFilmShotBinding, updateFilmShotBinding } from "./film-shot-bindings";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id, type, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata,
});
const asset = (id: string, kind: "character" | "location" | "prop") => node(id, CanvasNodeType.FilmAsset, {
    filmAsset: { kind, asset: { id, name: id } as FilmAsset },
});
const shot = node("shot", CanvasNodeType.Shot);
const nodes = [asset("char", "character"), asset("loc", "location"), asset("prop", "prop"), shot];

test("adds character and prop bindings, rejects duplicate and second location", () => {
    const first = addFilmShotBinding(nodes, [], "shot", "char");
    assert.ok("connections" in first);
    const second = addFilmShotBinding(nodes, first.connections, "shot", "char");
    assert.ok("error" in second);
    const location = addFilmShotBinding(nodes, first.connections, "shot", "loc");
    assert.ok("connections" in location);
    const secondLocation = addFilmShotBinding(nodes, location.connections, "shot", "loc");
    assert.ok("error" in secondLocation);
    const prop = addFilmShotBinding(nodes, location.connections, "shot", "prop");
    assert.ok("connections" in prop);
    assert.equal(prop.connections.length, 3);
});

test("removes and updates binding edge data", () => {
    const added = addFilmShotBinding(nodes, [], "shot", "char");
    assert.ok("connections" in added);
    const edgeId = added.edgeId;
    const updated = updateFilmShotBinding(added.connections, edgeId, { stateId: "state-1", continuity: { emotion: "压抑" } });
    const edge = updated.find((item) => item.id === edgeId);
    assert.equal(edge?.data?.stateId, "state-1");
    assert.equal(edge?.data?.continuity?.emotion, "压抑");
    assert.equal(removeFilmShotBinding(updated, edgeId).length, 0);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd web && bun test film-shot-bindings`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现绑定纯函数**

新建 `film-shot-bindings.ts`：

```ts
import type { CanvasConnection, CanvasNodeData, FilmBindingEdgeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { canAddFilmConnection } from "./film-connections";

export type FilmBindingAddResult = { connections: CanvasConnection[]; edgeId: string } | { error: string };

export function addFilmShotBinding(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotId: string,
    assetNodeId: string,
    patch: Partial<FilmBindingEdgeData> = {},
): FilmBindingAddResult {
    const asset = nodes.find((node) => node.id === assetNodeId);
    const payload = asset?.metadata?.filmAsset;
    if (!asset || !payload || !["character", "location", "prop"].includes(payload.kind)) {
        return { error: "该资产不能绑定到镜头" };
    }
    const data: FilmBindingEdgeData = { source: "manual", ...patch };
    const check = canAddFilmConnection({ fromNodeId: assetNodeId, toNodeId: shotId, kind: "binding", data }, nodes, connections);
    if (!check.ok) return { error: check.reason };
    const edge = canvasConnection(assetNodeId, shotId, { kind: "binding", data });
    return { connections: [...connections, edge], edgeId: edge.id };
}

export function removeFilmShotBinding(connections: CanvasConnection[], edgeId: string) {
    return connections.filter((edge) => edge.id !== edgeId);
}

export function updateFilmShotBinding(connections: CanvasConnection[], edgeId: string, patch: Partial<FilmBindingEdgeData>) {
    return connections.map((edge) => edge.id === edgeId && edge.kind === "binding"
        ? { ...edge, data: { ...edge.data, source: edge.data?.source ?? "manual", ...patch } }
        : edge);
}
```

- [ ] **Step 5: 跑测试与检查**

Run:

```bash
cd web
bun test film-shot-bindings
bun test film-selectors
bun run typecheck
```

Expected: 通过。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 6: Studio 绑定编辑 UI

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx`

**Interfaces:**
- Consumes: 绑定纯函数、`FilmShotBindingChip`、项目资产节点。
- Produces: `availableAssets/onAddBinding/onRemoveBinding/onUpdateBinding`；左栏绑定编辑。

- [ ] **Step 1: 模型字段**

在 `film-studio-types.ts` 中加入：

```ts
export type FilmBindingAssetOption = {
    nodeId: string;
    kind: FilmAssetKind;
    name: string;
};
```

并在 `FilmStudioModel` 中加入：

```ts
    availableAssets: FilmBindingAssetOption[];
    onAddBinding: (assetNodeId: string) => void;
    onRemoveBinding: (edgeId: string) => void;
    onUpdateBinding: (edgeId: string, patch: Partial<import("../../types").FilmBindingEdgeData>) => void;
```

- [ ] **Step 2: Editor 动作**

在 `canvas-editor.tsx` 导入：

```ts
import { addFilmShotBinding, removeFilmShotBinding, updateFilmShotBinding } from "./lib/film-shot-bindings";
import type { FilmBindingEdgeData } from "../types";
```

在 `filmStudio` 之前派生：

```ts
    const availableFilmAssets = useMemo(() => (filmMode ? nodes.flatMap((node) => {
        const payload = node.metadata?.filmAsset;
        if (!payload || !["character", "location", "prop"].includes(payload.kind)) return [];
        return [{ nodeId: node.id, kind: payload.kind, name: payload.asset.name || node.title }];
    }) : []), [filmMode, nodes]);
```

在 Studio actions 区域加入：

```ts
    const addFilmBinding = useCallback((assetNodeId: string) => {
        if (!activeFilm.shot) return;
        const result = addFilmShotBinding(nodesRef.current, connectionsRef.current, activeFilm.shot.shot.id, assetNodeId);
        if ("error" in result) {
            message.warning(result.error);
            return;
        }
        setConnections(result.connections);
    }, [activeFilm.shot, connectionsRef, message, nodesRef, setConnections]);

    const removeFilmBinding = useCallback((edgeId: string) => {
        setConnections((prev) => removeFilmShotBinding(prev, edgeId));
    }, [setConnections]);

    const updateFilmBinding = useCallback((edgeId: string, patch: Partial<FilmBindingEdgeData>) => {
        setConnections((prev) => updateFilmShotBinding(prev, edgeId, patch));
    }, [setConnections]);
```

在 `filmStudio` 对象中加入：

```ts
        availableAssets: availableFilmAssets,
        onAddBinding: addFilmBinding,
        onRemoveBinding: removeFilmBinding,
        onUpdateBinding: updateFilmBinding,
```

- [ ] **Step 3: 左栏可编辑绑定**

在 `film-shot-panel.tsx`：

1. 导入 `Popover` 与 `Select`：

```ts
import { Input, InputNumber, Popover, Select } from "antd";
import type { FilmAssetKind } from "@/lib/film/types";
import type { FilmBindingAssetOption, FilmShotBindingChip } from "../lib/film-studio-types";
```

2. Props 加入：

```ts
    availableAssets: FilmBindingAssetOption[];
    onAddBinding: (assetNodeId: string) => void;
    onRemoveBinding: (edgeId: string) => void;
    onUpdateBinding: (edgeId: string, patch: Partial<import("../../types").FilmBindingEdgeData>) => void;
```

3. 用以下实现替换「上下文」Section 的只读 chips，并加入两个小组件（同文件）：

```tsx
function BindingEditor({ theme, binding, onUpdate, onClose }: { theme: CanvasTheme; binding: FilmShotBindingChip; onUpdate: (patch: Partial<import("../../types").FilmBindingEdgeData>) => void; onClose: () => void }) {
    const continuity = binding.continuity ?? {};
    const setContinuity = (patch: Partial<typeof continuity>) => onUpdate({ continuity: { ...continuity, ...patch } });
    return (
        <div className="flex w-[260px] flex-col gap-2 rounded-lg border p-2" style={{ color: theme.node.text, background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div className="flex items-center justify-between text-xs font-medium">
                <span>绑定 · {binding.name}</span>
                <button type="button" onClick={onClose} aria-label="关闭">×</button>
            </div>
            {binding.kind === "character" ? (
                <>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: theme.node.muted }}>造型<Select size="small" allowClear value={binding.stateId} options={binding.states.map((state) => ({ value: state.id, label: state.name }))} onChange={(value) => onUpdate({ stateId: value })} /></label>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: theme.node.muted }}>情绪<Input size="small" value={continuity.emotion ?? ""} onChange={(event) => setContinuity({ emotion: event.target.value })} /></label>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: theme.node.muted }}>服装<Input size="small" value={continuity.outfit ?? ""} onChange={(event) => setContinuity({ outfit: event.target.value })} /></label>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: theme.node.muted }}>身体状况<Input size="small" value={continuity.physicalCondition ?? ""} onChange={(event) => setContinuity({ physicalCondition: event.target.value })} /></label>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: theme.node.muted }}>持有道具<Input size="small" value={(continuity.heldProps ?? []).join("、")} onChange={(event) => setContinuity({ heldProps: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) })} /></label>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: theme.node.muted }}>刻意变化<Input size="small" value={continuity.intentionalChange ?? ""} onChange={(event) => setContinuity({ intentionalChange: event.target.value })} /></label>
                </>
            ) : null}
            {binding.kind === "location" ? (
                <label className="flex flex-col gap-1 text-xs" style={{ color: theme.node.muted }}>场景变体<Select size="small" allowClear value={binding.variantId} options={binding.variants.map((variant) => ({ value: variant.id, label: variant.name }))} onChange={(value) => onUpdate({ variantId: value })} /></label>
            ) : null}
            {binding.kind === "prop" ? <div className="text-xs" style={{ color: theme.node.muted }}>道具绑定无额外覆盖。</div> : null}
        </div>
    );
}

function BindingPicker({ theme, assets, onAdd, onClose }: { theme: CanvasTheme; assets: FilmBindingAssetOption[]; onAdd: (nodeId: string) => void; onClose: () => void }) {
    return (
        <div className="flex w-[240px] flex-col gap-2 rounded-lg border p-2" style={{ color: theme.node.text, background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div className="flex items-center justify-between text-xs font-medium"><span>添加绑定</span><button type="button" onClick={onClose} aria-label="关闭">×</button></div>
            {(["character", "location", "prop"] as FilmAssetKind[]).map((kind) => {
                const items = assets.filter((asset) => asset.kind === kind);
                return items.length ? (
                    <div key={kind} className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: theme.node.muted }}>{FILM_ASSET_KIND_LABELS[kind]}</span>
                        {items.map((asset) => <button key={asset.nodeId} type="button" className="rounded-lg border px-2 py-1 text-left text-xs" style={{ borderColor: theme.node.stroke }} onClick={() => onAdd(asset.nodeId)}>{asset.name}</button>)}
                    </div>
                ) : null;
            })}
        </div>
    );
}
```

然后在 `FilmShotPanel` 的「上下文」Section 中渲染 chips：

```tsx
                    <Section theme={theme} title="上下文">
                        <div className="flex flex-wrap gap-1.5">
                            {bindings.map((binding) => (
                                <span key={binding.edgeId} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                    <Popover trigger="click" content={<BindingEditor theme={theme} binding={binding} onUpdate={(patch) => onUpdateBinding(binding.edgeId, patch)} onClose={() => undefined} />}>
                                        <button type="button">{FILM_ASSET_KIND_LABELS[binding.kind]} · {binding.name}{binding.stateName ? ` · ${binding.stateName}` : ""}{binding.variantName ? ` · ${binding.variantName}` : ""}</button>
                                    </Popover>
                                    <button type="button" onClick={() => onRemoveBinding(binding.edgeId)} aria-label="移除绑定">×</button>
                                </span>
                            ))}
                            <Popover trigger="click" content={<BindingPicker theme={theme} assets={availableAssets} onAdd={onAddBinding} onClose={() => undefined} />}>
                                <button type="button" className="rounded-full border border-dashed px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>+ 添加绑定</button>
                            </Popover>
                            {styleName ? <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>风格 · {styleName}</span> : null}
                        </div>
                    </Section>
```

- [ ] **Step 4: Studio 主体传参**

在 `film-studio-body.tsx` 给 `FilmShotPanel` 传入：

```tsx
                        availableAssets={model.availableAssets}
                        onAddBinding={model.onAddBinding}
                        onRemoveBinding={model.onRemoveBinding}
                        onUpdateBinding={model.onUpdateBinding}
```

- [ ] **Step 5: 检查**

Run: `cd web && bun run typecheck`
Run: `cd web && bun run lint`
Expected: 通过。

- [ ] **Step 6: 检查点**

汇报。不要提交。

---

### Task 7: 批次 1B-2A 验收

**Files:** 无代码改动。

- [ ] **Step 1: 跑单测与全量检查**

```bash
cd web
bun test film-shot-video-task-updates
bun test film-shot-bindings
bun test film-selectors
bun test film-shot-task-updates
bun test film-shot-generation-context
bun run typecheck
bun run lint
bun test
```

Expected: 全部通过；测试总数在 636 基础上增加本批用例。

- [ ] **Step 2: 浏览器验收**

在 `NEXT_PUBLIC_ENABLE_FILM_CANVAS=1` 的 dev 下：

1. 新建影视画布 → 新增镜头 → 填写描述。
2. 添加角色/场景/道具绑定；重复添加或第二个场景绑定被拒绝；移除绑定后 chips 与画布边同步。
3. 角色绑定选择造型/情绪/服装/身体状况/持有道具；场景绑定选择变体；刷新后保留；画布视图能看到对应 binding 边。
4. 图片生成仍正常；使用绑定后的提示词/参考图编译（可在生成信息/网络请求中核对）。
5. 配置了视频模型时：生成参考模式视频，状态进入生成中，完成后舞台切到视频可播放；刷新后可恢复；停止后 pending 清理。未配置时：正确打开配置入口，无 loading 死状态。
6. 画布视图、Studio 切换、既有镜头编辑不回归；无 console 错误。

- [ ] **Step 3: 未实测标注**

若本机未配置真实视频模型：把「真实视频生成、生成中刷新恢复、停止服务端取消」标注为未实测。

- [ ] **Step 4: 汇报**

列出改动文件、测试结果、浏览器结果与未实测项；**不提交**，等待用户授权。

## 后续（1B-2B）

- 首尾帧模式与首尾帧选择（从分镜图版本中选首/尾）。
- 资产槽位编辑器：角色/场景/道具/服装/风格槽位查看、选图、上传、生成、库更新提示。
- 视频音频参考/TTS/对口型与多段提示词时间轴（如仍需要）。
