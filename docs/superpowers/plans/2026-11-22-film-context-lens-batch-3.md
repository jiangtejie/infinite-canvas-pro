# 影视画布 Context Lens 与批量前准备度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在生成前解释每个镜头将带上的场次、绑定、风格、上一镜与参考，并把批量生成变成“执行/跳过/提醒”可确认的清单。

**Architecture:** 复用现有 `buildFilmShotGenerationFromGraph` 统一编译器和 `filmAssetReadiness` 资产规则，新增两个纯派生模块：`film-context-lens` 负责单镜上下文与问题，`film-batch-preflight` 负责批量执行清单。UI 只消费这些派生结果，不新增 store、任务或第二套编译逻辑。

**Tech Stack:** Next.js App Router、React、TypeScript、Node test、现有 CanvasProject/CanvasConnection 与全局确认弹窗。

**Spec:** `docs/superpowers/specs/2026-11-21-film-as-canvas-design.md`；本批设计已由用户确认“完整实施”。

## Global Constraints

- 不新增影视 store、顺序数组、任务链路或第二套提示词/参考拼装。
- Context Lens 必须调用现有统一编译器；批量跳过规则必须与单镜生成保持一致。
- 不阻止用户生成，只提供警告、缺失与“仍在继续”的知情确认。
- 保留工作区已有未提交改动，不提交、不回滚、不覆盖。
- 页面文案中文；纯逻辑放 `web/src/app/(user)/canvas/[id]/lib/` 并配套单测。

---

### Task 1: 单镜上下文透镜纯函数

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-context-lens.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-context-lens.test.ts`

**Interfaces:**
- Produces `selectFilmShotContextLens(nodes, connections, shotId, options: { medium: "image" | "video"; maxReferences: number; videoMode?: FilmVideoMode }): FilmContextLens | null`.
- `FilmContextLens` includes `scene`, `styleName`, `previousShot`, `bindings`, `references`, `prompt`, `issues`, `ready`, `compileError`.

- [ ] **Step 1: Write failing tests**

Cover:
1. scene inheritance label/location/time/mood/notes from the shot's composition edge;
2. binding names with state/variant;
3. previous shot from the global chain across scenes;
4. missing scene → warning issue;
5. missing description/prompt → error issue and not ready;
6. compiler throw → error issue and `compileError`.

- [ ] **Step 2: Run red**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-context-lens.test.ts"`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement the pure selector**

Use `selectFilmShotBindings`, `selectFilmStyleName`, `orderFilmShots`, `buildFilmShotGenerationFromGraph`. Issues:
- no shot → null;
- no text → `{ level: "error", message: "缺少画面描述或提示词" }`;
- no composition → warning "镜头未归属场次";
- no style → warning "项目缺少风格圣经";
- compile error → error with message;
- compiler warnings → warning issues.
`ready` is false only when an error issue exists.

- [ ] **Step 4: Run green**

Expected: all tests pass.

---

### Task 2: 批量执行清单纯函数

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-batch-preflight.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-batch-preflight.test.ts`

**Interfaces:**
- Produces `planFilmShotBatch(nodes, connections, shotIds, kind, options: { maxReferences: number }): FilmBatchPlan`.
- `FilmBatchPlan` includes `ready`, `skipped` (reason + message), `warningShots`, `warnings`.

- [ ] **Step 1: Write failing tests**

Cover:
1. selected shots are executed in global chain order, not input order;
2. skip missing text, busy, frames missing first frame, compile error;
3. compiler warning (missing character identity) is recorded but still ready;
4. duplicate ids are deduped.

- [ ] **Step 2: Run red**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-batch-preflight.test.ts"`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement the planner**

Move the existing skip conditions out of `use-film-shot-batch` into this module. Compile each candidate with `buildFilmShotGenerationFromGraph` in a try/catch. Sort selected shots by `orderFilmShots`.

- [ ] **Step 4: Run green**

Expected: all tests pass.

---

### Task 3: 将透镜接入 Studio 数据与视图

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-context-panel.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx`

**Interfaces:**
- `FilmStudioModel` adds `contextLenses: { image: FilmContextLens | null; video: FilmContextLens | null }`.
- Editor memoizes both lenses for the active shot using the unified compiler.
- Context panel shows a “本次将使用” preview when no pending/version context exists.
- Left panel adds a collapsed “上下文” section: scene inheritance, style, previous shot, reference/warning counts; bindings stay in the existing 参考 section.

- [ ] **Step 1: Wire model and editor**

Compute lenses with image limit `FILM_IMAGE_REFERENCE_LIMIT` and video limit `filmVideoReferenceLimit(videoModel)`; pass through `FilmStudioBody` to stage and panel.

- [ ] **Step 2: Extend the context panel**

Accept `preview?: FilmContextLens | null`; when no recorded context, render source summary, compiled prompt, references, issues and compile error. Keep recorded version behavior unchanged.

- [ ] **Step 3: Add the left-panel context section**

Show inherited scene fields, style, global previous shot, image/video reference counts and warning counts. Do not duplicate binding chips.

- [ ] **Step 4: Run focused tests and typecheck**

Run lens tests, selectors/generation-context tests, `bun run typecheck`.

---

### Task 4: 批量前清单接入确认弹窗

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-film-shot-batch.ts`
- Create: `web/src/app/(user)/canvas/[id]/components/film-batch-plan-summary.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`

**Interfaces:**
- `useFilmShotBatch` options add `resolveReferenceLimit(kind)`.
- Hook calls `planFilmShotBatch` and confirms with a `FilmBatchPlanSummary` React element through `createElement`.
- Plan summary shows: 将生成 N 镜；跳过 X 镜及原因/镜头号；参考提醒 Y 镜；明确“跳过不会影响已选中镜头，可返回修改”。

- [ ] **Step 1: Add the summary component**

Group skipped shots by reason, show up to 6 shot numbers per group, then “等 N 镜”. Use semantic text classes only.

- [ ] **Step 2: Replace hook filtering**

Remove inline `skippedText/skippedBusy/skippedFrame`; use plan.ready ids. If no ready, warn with grouped reasons and stop. Otherwise confirm with the summary, then execute plan.ready in global order.

- [ ] **Step 3: Pass the video/image reference limit**

Editor passes image limit and `filmVideoReferenceLimit` for the current video model.

- [ ] **Step 4: Run focused tests, typecheck and lint**

---

### Task 5: 文档与验收

**Files:**
- Modify: `docs/progress/pending-test.md`
- Modify: `docs/progress/todo.md`

- [ ] **Step 1: Update docs**

Record Context Lens, batch preflight, automated counts and untested items.

- [ ] **Step 2: Full verification**

Run focused tests, `bun test`, `bun run typecheck`, `bun run lint --max-warnings=0`.

- [ ] **Step 3: Browser acceptance**

Create a temporary film project; verify:
1. left “上下文” shows scene/style/previous shot and reference counts;
2. generation info before generating shows “本次将使用” prompt/references/warnings;
3. batch dialog lists execute/skip/warning counts and reasons;
4. confirm executes only ready shots; cancel leaves state unchanged;
5. delete the test project afterwards.

- [ ] **Step 4: Final diff review**

Do not commit. Confirm only intended Batch 3 files plus pre-existing changes are present.
