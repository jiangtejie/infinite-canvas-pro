# Film Director Board 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前影视画布重构为以影视专用节点和镜头节点为核心的 Film Director Board，同时收敛 Shot Focus、镜头表、故事板、上下文中心、制作中心、分镜预演、Version Room 和检查中心的职责边界。

**Architecture:** 继续使用一份 `CanvasProject` 作为影视文档真源，复用画布的缩放、选择、持久化、同步、媒体存储和任务轮询；影视模式改用专用节点注册表、影视连接语法和 Director Board 壳层，不再复用通用画布的节点卡片、创建菜单和完整检查器编辑交互。镜头节点是单镜创作单元，Shot Focus 是它的沉浸视图；批量任务、预演、版本和检查均各有唯一主入口。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Zustand、Ant Design 6、Tailwind CSS、现有 CanvasProject/CanvasConnection、Node/Bun test。

**Spec:** `docs/superpowers/specs/2026-11-22-film-director-board-design.md`

## Global Constraints

- 一个影视项目仍然只有一份 `CanvasProject`；不得新增影视项目 store、第二套镜头列表、第二套绑定列表、第二套版本列表、第二套任务轮询或第二套同步链路。
- 影视边类型固定为 `composition`、`sequence`、`context`、`derived`；用户通过领域命令创建关系，不直接选择底层边类型。
- `sequence` 必须是全片唯一线性链；禁止成环、分叉、多前继和非镜头端点。
- 角色身份下游只使用 `character.board`；服装不再作为 Director Board 的一级节点，母版库仍可保留服装数据供角色造型状态引用。
- AI 分析结果必须先进入 transient proposal，用户确认后才写入节点/边；最近 3 次解析快照继续支持撤销。
- 旧影视数据不迁移、不兼容、不保留双轨；新开发和验收使用新建影视项目。旧 `FilmProject`、互动分支、旧场记交接单和旧阶段模型不得继续作为运行时产品概念。
- SketchShot 只借鉴影视语义节点、上下文可见、节点内操作、快速创建并连线和执行中心思想；不得复制其代码、样式、依赖、后端或工作流实现。
- 页面文案保持中文；影视模式默认菜单只显示影视节点和资源动作，通用节点移入“通用资源”。
- 继续使用仓库现有 antd 6 约定：Drawer 使用 `size`，Modal/Drawer 使用 `destroyOnHidden`、`mask={{ closable }}` 和 `styles.*`。
- 本轮已获用户授权开始实施；保持当前工作区，不创建 worktree；不得提交 Git，除非用户另行授权。
- 每个阶段完成后必须运行该阶段列出的 focused tests、`bun run typecheck` 和 `bun run lint --max-warnings=0`；完整浏览器验收集中在最后阶段。

---

## File Map Before Implementation

### Domain contracts and graph operations

- Modify: `web/src/app/(user)/canvas/types.ts` — specialized film node enum values, payloads, `CanvasFilmMeta`, film connection data.
- Modify: `web/src/lib/film/types.ts` — retain library/media types; remove runtime product types replaced by the graph model.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-graph-types.ts` — graph-native public input/output types shared by selectors, generation and review.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-node-commands.ts` — atomic creation/update commands used by cards and quick-connect.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-context-edges.ts` — context/derived edge commands and validation.
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-connections.ts` — validation for the new edge kinds.
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-selectors.ts` — graph-native projections and context summaries.
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.ts` — graph-native generation adapter.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-review-input.ts` — graph-native review input; no `FilmProject` projection.

### Film node runtime and board UI

- Create: `web/src/app/(user)/canvas/[id]/lib/film-node-registry.ts` — node catalog, labels, default sizes, allowed actions and connect targets.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-node-summary.ts` — collapsed-card read models.
- Create: `web/src/app/(user)/canvas/[id]/components/film-node-shell.tsx` — shared film node shell.
- Replace: `web/src/app/(user)/canvas/components/film-node-card.tsx` — specialized script/scene/character/location/prop/style/shot/beat cards.
- Create: `web/src/app/(user)/canvas/[id]/components/film-quick-connect-menu.tsx` — domain-aware create-and-connect menu.
- Create: `web/src/app/(user)/canvas/[id]/components/film-director-layout.tsx` — Director Board layout projection and node placement.
- Create: `web/src/app/(user)/canvas/[id]/components/film-director-board.tsx` — Director Board shell.
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx` and `canvas-editor.tsx` — film board routing and model wiring.
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-top-bar.tsx` — remove generic film scene/arrange controls from the primary board header.

### Shot Focus and director analysis

- Create: `web/src/app/(user)/canvas/[id]/components/film-shot-editor.tsx` — the only full shot editor used by node expansion and Shot Focus.
- Create: `web/src/app/(user)/canvas/[id]/components/film-shot-focus.tsx` — immersive single-shot mode.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-director-analysis.ts` — merged structure/asset proposal normalization and application commands.
- Create: `web/src/app/(user)/canvas/[id]/components/film-director-analysis-dialog.tsx` — merged proposal UI.
- Create: `web/src/app/(user)/canvas/[id]/components/film-beat-node-card.tsx` — optional action-beat node UI.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-beat.ts` — action-beat node commands and selectors.

### Context center and production

- Create: `web/src/app/(user)/canvas/[id]/components/film-context-center.tsx` — project context/asset center.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-context-center.ts` — graph-native context-center read model.
- Create: `web/src/app/(user)/canvas/[id]/components/film-production-center.tsx` — unified asset/shot execution UI.
- Create: `web/src/app/(user)/canvas/[id]/lib/film-production-plan.ts` — merged production-center read model.
- Modify: existing `film-asset-production.ts`, `use-film-asset-production.ts`, `use-film-shot-batch.ts`, `film-batch-preflight.ts` — reuse existing execution logic behind the new center.

### Preview, version, review and cleanup

- Modify: `web/src/app/(user)/canvas/[id]/lib/film-animatic-preview.ts` and `film-preview-overlay.tsx` — single preview timeline and playback surface.
- Remove from primary view: `film-timeline-view.tsx` — its timeline behavior moves into preview.
- Modify: `film-version-room-dialog.tsx`, `film-shot-context-panel.tsx`, `film-shot-stage.tsx` — one version/context surface.
- Modify: `film-review.ts`, `film-review-drawer.tsx` — graph-native review and node targeting.
- Modify: `canvas-film-inspector.tsx` — read-only relation/status summary plus “在导演板/镜头聚焦编辑”.
- Delete after reachability verification: `film-branch.ts`, `film-interactive.ts`, `film-continuity-sheet.ts`, old array editors, obsolete stage/task helpers and old film adapter types.
- Modify: `docs/progress/todo.md`, `docs/progress/pending-test.md`, `docs/overview/features.md`, and stale early film docs after implementation milestones.

---

## Phase 0: Freeze Graph Contracts and Hard-Cut Scope

### Task 1: Replace generic film node contracts with specialized film node types

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/lib/film/types.ts`
- Create: `web/src/app/(user)/canvas/[id]/lib/film-graph-types.ts`
- Modify: `web/src/app/(user)/canvas/utils/film-canvas-project.ts`
- Create: `web/src/app/(user)/canvas/[id]/lib/film-asset-factory.ts`
- Modify: `web/src/app/(user)/canvas/utils/film-mode.ts`
- Test: `web/src/app/(user)/canvas/utils/film-canvas-project.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-graph-types.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-asset-factory.test.ts`

**Interfaces:**
- Produces `FilmNodeType = "filmScript" | "filmScene" | "filmShot" | "filmCharacter" | "filmLocation" | "filmProp" | "filmStyle" | "filmBeat"`.
- Produces `FilmConnectionKind = "composition" | "sequence" | "context" | "derived"`.
- Produces `FilmContextRole = "character" | "location" | "prop" | "style" | "beat"`.
- Keeps `FilmAsset`, `FilmImageSlot`, `FilmMediaVersion`, reference-board and library types for library/media behavior.
- Removes `FilmAssetNodeData` as the project-facing generic node payload.

- [ ] **Step 1: Write failing contract tests**

```ts
import { CanvasNodeType } from "../../types";
import { buildFilmCanvasProject } from "../../../utils/film-canvas-project";

test("new film projects use specialized film node types", () => {
    const project = buildFilmCanvasProject("导演板测试", context);
    expect(project.nodes.map((node) => node.type)).toEqual([
        CanvasNodeType.FilmScript,
        CanvasNodeType.FilmStyle,
        CanvasNodeType.FilmScene,
    ]);
    expect(project.nodes.some((node) => node.type === CanvasNodeType.FilmAsset)).toBe(false);
});
```

Add fixtures asserting `FilmContextEdgeData.role` is required and costume is not a project node kind.

- [ ] **Step 2: Run focused tests to verify the current model fails**

Run from `web`:

```bash
bun test "src/app/(user)/canvas/utils/film-canvas-project.test.ts" "src/app/(user)/canvas/[id]/lib/film-graph-types.test.ts"
```

Expected: FAIL because the current factory still creates `script`, `filmAsset` and `scene` nodes and no specialized graph contract exists.

- [ ] **Step 3: Implement the minimum graph contract**

Add specialized enum values and metadata payloads. Keep library `FilmAssetKind` unchanged for mother-library data, but define project node payloads separately:

```ts
export type FilmCharacterNodeData = { asset: FilmAsset };
export type FilmLocationNodeData = { asset: FilmAsset };
export type FilmPropNodeData = { asset: FilmAsset };
export type FilmStyleNodeData = { asset: FilmAsset };

export type FilmContextEdgeData = {
    role: FilmContextRole;
    stateId?: string;
    variantId?: string;
    continuity?: FilmBindingEdgeData["continuity"];
    source: "manual" | "ai";
};
```

Update `CanvasFilmMeta` to remove `interactiveVariables` and `shotGroups`. Update the project factory to create one style node and one scene node using specialized types.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/utils/film-canvas-project.test.ts" "src/app/(user)/canvas/[id]/lib/film-graph-types.test.ts"
bun run typecheck
```

Expected: focused tests pass; typecheck lists consumers still using old enum values. Update those consumers in Task 2 rather than adding compatibility aliases. The new project factory must no longer import `film-edits.ts`; its default style asset comes from `film-asset-factory.ts`.

---

### Task 2: Establish context/derived edge commands and update graph validation

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-context-edges.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-connections.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-shot-bindings.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-selectors.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-shot-create.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-shot-reorder.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-context-edges.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-connections.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-create.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts`

**Interfaces:**
- Produces `addFilmContextEdge(nodes, connections, sourceNodeId, shotId, data): FilmConnectionResult`.
- Produces `removeFilmContextEdge(connections, edgeId): CanvasConnection[]`.
- Produces `updateFilmContextEdge(connections, edgeId, patch): CanvasConnection[]`.
- `selectFilmShotBindings` becomes `selectFilmShotContexts` and returns role/state/variant-aware chips.
- `canAddFilmConnection` validates `composition`, `sequence`, `context`, and `derived` separately.

- [ ] **Step 1: Write failing tests for domain commands**

```ts
test("adds a role-aware character context edge", () => {
    const result = addFilmContextEdge(nodes, connections, "character-1", "shot-1", {
        role: "character",
        stateId: "injured",
        source: "manual",
    });
    expect(result.connections.at(-1)).toMatchObject({
        kind: "context",
        fromNodeId: "character-1",
        toNodeId: "shot-1",
        data: { role: "character", stateId: "injured", source: "manual" },
    });
});

test("rejects a second location context for one shot", () => {
    expect(addFilmContextEdge(nodesWithLocation, connectionsWithLocation, "location-2", "shot-1", {
        role: "location",
        source: "manual",
    })).toEqual({ error: "每个镜头只能引用一个场景" });
});
```

Also test that `derived` edges never satisfy context selectors and sequence constraints remain linear.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-context-edges.test.ts" "src/app/(user)/canvas/[id]/lib/film-connections.test.ts"
```

Expected: FAIL because the current implementation only recognizes `binding`.

- [ ] **Step 3: Implement edge commands and selectors**

Move binding-edge mutation logic into `film-context-edges.ts`; keep command-level validation there. Update selectors to read `kind === "context"`, derive asset names from source nodes, and preserve state/variant/continuity data without name snapshots. Keep `composition` and `sequence` logic unchanged except for the new node type predicates.

- [ ] **Step 4: Run focused graph tests**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-context-edges.test.ts" "src/app/(user)/canvas/[id]/lib/film-connections.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-create.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts"
```

Expected: PASS with no test using the old `binding` kind.

---

### Task 3: Replace the old FilmProject adapter with graph-native inputs

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-review-input.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.ts`
- Modify: `web/src/app/(user)/film/utils/film-shot-generation.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-review.ts`
- Modify: `web/src/app/(user)/film/utils/film-asset-readiness.ts`
- Modify: `web/src/app/(user)/film/utils/film-ai-consistency.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-review.test.ts`
- Test: `web/src/app/(user)/film/utils/film-asset-readiness.test.ts`

**Interfaces:**
- `buildFilmShotGenerationFromGraph(nodes, connections, shotId, options)` remains the only graph-to-generation adapter.
- Produces `FilmGraphReviewInput` from nodes/connections without constructing a `FilmProject` object.
- `filmAssetReadiness(input, shotIds)` consumes graph-native asset/shot/context projections.
- `requestFilmConsistencyReview(config, input)` consumes the narrow review context, not the old full project type.

- [ ] **Step 1: Write failing tests proving no old project projection is needed**

```ts
test("review input contains graph shots and contexts without episodes arrays", () => {
    const input = selectFilmReviewInput(nodes, connections, filmMeta, "测试项目");
    expect(input.shots).toHaveLength(1);
    expect(input.scenes).toHaveLength(1);
    expect(input.shots[0].contexts[0]).toMatchObject({ role: "character" });
    expect("episodes" in input).toBe(false);
});
```

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-review.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts"
```

Expected: FAIL because review and generation still rely on `FilmProject`-shaped input in several utilities.

- [ ] **Step 3: Implement narrow graph-native projections**

Create `FilmGraphReviewInput` with `scenes`, `shots`, `contexts`, `assets`, `style`, `script`, and `filmMeta`. Adapt readiness and consistency functions to the smallest required input. Keep the prompt compiler as the single renderer; do not add a second prompt path.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-review.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts" "src/app/(user)/film/utils/film-asset-readiness.test.ts"
bun run typecheck
```

Expected: PASS; no production code should import `FilmProject` for the graph review path.

---

## Phase 1: Film Node Registry, Cards and Quick Connect

### Task 4: Add the specialized film node registry and summary projections

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-node-registry.ts`
- Create: `web/src/app/(user)/canvas/[id]/lib/film-node-summary.ts`
- Create: `web/src/app/(user)/canvas/[id]/lib/film-node-summary.test.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Replace: `web/src/app/(user)/canvas/components/film-node-card.tsx`
- Create: `web/src/app/(user)/canvas/[id]/components/film-node-shell.tsx`

**Interfaces:**
- `FILM_NODE_REGISTRY` maps each `FilmNodeType` to `label`, `description`, `defaultSize`, `allowedCreateActions`, and `renderKind`.
- `summarizeFilmNode(node, nodes, connections): FilmNodeSummary` returns collapsed-card data.
- Specialized cards are `FilmScriptNodeCard`, `FilmSceneNodeCard`, `FilmCharacterNodeCard`, `FilmLocationNodeCard`, `FilmPropNodeCard`, `FilmStyleNodeCard`, `FilmShotNodeCard`, and `FilmBeatNodeCard`.

- [ ] **Step 1: Write summary tests**

```ts
test("shot summary exposes scene, contexts, media and refresh state", () => {
    const summary = summarizeFilmNode(shotNode, nodes, connections);
    expect(summary).toMatchObject({
        label: "镜头",
        shotNo: "01",
        sceneLabel: "第 1 集 · 天台",
        contextLabels: ["角色 · 沈迟", "场景 · 天台"],
        media: "image",
    });
});
```

Cover empty shot, missing scene, pending generation, multiple versions and stale generation signature.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-node-summary.test.ts"
```

- [ ] **Step 3: Implement registry, shell and specialized cards**

The shell owns title editing, collapse state, width resizing, status badges and action slots. Cards must not open a generic “点击编辑” drawer as their only behavior. The shot card shows media/empty frame, context chips, version count, refresh state and direct action buttons.

- [ ] **Step 4: Wire `canvas-node.tsx` and run tests**

Update the node dispatcher to use the specialized types. Run:

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-node-summary.test.ts" "src/app/(user)/canvas/utils/film-canvas-project.test.ts"
bun run typecheck
```

Expected: no `FilmAssetNodeCard` branch remains in the film node renderer.

---

### Task 5: Implement the film-specific quick connect menu

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-quick-connect-menu.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-create-menus.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-node-registry.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-node-registry.test.ts`

**Interfaces:**
- `getFilmQuickConnectActions(sourceNode, nodes, connections): FilmQuickConnectAction[]`.
- Each action has `id`, `label`, `description`, `targetType`, and `create(nodes, connections): FilmCommandResult`.
- `FilmQuickConnectMenu` renders only legal film actions; generic nodes are available under “通用资源”.

- [ ] **Step 1: Write action tests**

```ts
test("scene quick connect offers a new shot and context actions", () => {
    expect(getFilmQuickConnectActions(sceneNode, nodes, connections).map((item) => item.id)).toEqual([
        "create-shot",
        "create-beat",
        "add-character-context",
        "add-location-context",
        "add-prop-context",
        "add-style-context",
    ]);
});

test("shot quick connect does not offer a second location context", () => {
    expect(getFilmQuickConnectActions(shotWithLocation, nodes, connections).map((item) => item.id)).not.toContain("add-location-context");
});
```

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-node-registry.test.ts"
```

- [ ] **Step 3: Implement domain actions**

Use `appendFilmShot`, `addFilmContextEdge` and the specialized node factory. The menu creates the node and edge atomically, selects the new node, and shows a domain-level warning when an action is invalid.

- [ ] **Step 4: Replace film-mode `NodeCreateMenu` branch**

Keep generic `NodeCreateMenu` for non-film projects. In film mode render `FilmQuickConnectMenu`; keep upload/material library under “添加资源” and generic text/image/video/audio/etc. under “通用资源”.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-node-registry.test.ts" "src/app/(user)/canvas/[id]/lib/film-context-edges.test.ts"
bun run typecheck
```

---

## Phase 2: Shot Editor and Shot Focus

### Task 6: Create the single FilmShotEditor

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-shot-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-professional-fields.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-basic-controls.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-node-patch.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-node-patch.test.ts`

**Interfaces:**
- `FilmShotEditorProps` consumes a single `CanvasNodeData` shot node, context chips, image/video context lenses, and command callbacks.
- `FilmShotEditorMode = "node" | "focus"` controls density only; both modes write through `patchFilmShotNode` and context-edge commands.
- Produces one shared editor used by node expansion and Shot Focus; `FilmShotPanel` must not remain a second full editor.

- [ ] **Step 1: Add patch/command tests**

```ts
test("shot editor patch preserves unrelated media and task fields", () => {
    const next = patchFilmShotNode(node, { description: "新的动作" });
    expect(next.metadata?.filmShot?.description).toBe("新的动作");
    expect(next.metadata?.filmShot?.imageVersions).toEqual(node.metadata?.filmShot?.imageVersions);
    expect(next.metadata?.status).toBe(node.metadata?.status);
});
```

Add tests for context add/remove/update commands being separate from shot payload edits.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-node-patch.test.ts"
```

- [ ] **Step 3: Implement the shared editor**

Use five sections: 画面、镜头语言、表演、上下文、生成. Reuse the existing shared option controls and professional field controls, but do not render old continuity-sheet fields. Context chips open a small editor for role/state/variant/continuity; full asset editing routes to the context center or specialized node.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-node-patch.test.ts" "src/app/(user)/canvas/[id]/lib/film-context-edges.test.ts"
bun run typecheck
```

---

### Task 7: Replace Studio with Shot Focus and wire Director Board selection

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-shot-focus.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-strip.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-studio-body.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-selectors.test.ts`

**Interfaces:**
- `FilmShotFocus` consumes `FilmShotEntry`, `FilmShotEditor`, previous/next commands, preview/version callbacks and returns to Director Board through `onClose`.
- `FilmStudioView` is reduced to `"board" | "table" | "storyboard" | "assets"`; `"studio"` and `"graph"` are removed from the film-specific view switch.
- `FilmStudioModel` is renamed or narrowed to `FilmDirectorBoardModel`; no new store is introduced.

- [ ] **Step 1: Add selector tests**

Cover selecting a shot from a board node, opening Shot Focus, returning to the same node, and retaining the active shot after editing.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts"
```

- [ ] **Step 3: Implement Shot Focus**

Move the current stage media display, previous/next navigation, film strip navigation, full-screen preview and generation status into Shot Focus. Render the shared `FilmShotEditor` rather than `FilmShotPanel`. Keep one current-shot selection state in the existing per-project view state.

- [ ] **Step 4: Remove the old parallel Studio/graph branch**

Update `CanvasWorkspace` so film mode renders Director Board plus overlays; generic CanvasStageLayer remains available only for non-film projects and any explicit graph debug route that is still required during the same phase. Do not expose a second film “画布” button after the board replaces it.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-create.test.ts"
bun run typecheck
```

---

## Phase 3: Director Board Layout and Director Analysis

### Task 8: Implement the Director Board layout and node placement

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-director-layout.tsx`
- Create: `web/src/app/(user)/canvas/[id]/components/film-director-board.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-layout.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-layout.test.ts`

**Interfaces:**
- `arrangeFilmDirectorBoard(nodes, connections): CanvasNodeData[]` places scenes as column anchors, shots by global sequence, context nodes in a context band, and beat nodes near their target shots without mutating edge data.
- `FilmDirectorBoard` consumes the existing stage/viewport/selection model but uses film-specific toolbar, node registry and layout actions.

- [ ] **Step 1: Write layout tests**

```ts
test("director board groups scenes into columns but orders shots by global sequence", () => {
    const arranged = arrangeFilmDirectorBoard(nodes, connections);
    expect(arranged.find((node) => node.id === "scene-1")?.position.x).toBeLessThan(arranged.find((node) => node.id === "scene-2")?.position.x ?? 0);
    expect(arranged.find((node) => node.id === "shot-2")?.position.y).toBeGreaterThan(arranged.find((node) => node.id === "shot-1")?.position.y ?? 0);
});
```

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-layout.test.ts"
```

- [ ] **Step 3: Implement board layout**

Reuse the existing `orderFilmShots`/sequence logic and viewport fit behavior. Add stable spacing constants and keep context nodes outside the primary shot column. Do not persist derived positions separately.

- [ ] **Step 4: Render the Director Board by default**

Remove the film-specific Studio/graph toggle from the primary toolbar. Keep a “镜头表”“故事板”“资产”“画布” replacement only if each label maps to a distinct target-state view; the default is Director Board and the graph is no longer a separate generic canvas shell.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-layout.test.ts" "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts"
bun run typecheck
```

---

### Task 9: Merge AI structure and asset proposals into Director Analysis

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-director-analysis.ts`
- Create: `web/src/app/(user)/canvas/[id]/components/film-director-analysis-dialog.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/components/film-node-card.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-structure-proposal-dialog.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-asset-proposal-dialog.tsx`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-director-analysis.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-script-parse.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-script-assets.test.ts`

**Interfaces:**
- `FilmDirectorAnalysisProposal` contains `structure`, `shots`, `assets`, `conflicts`, `totals`, and source hash.
- `requestFilmDirectorAnalysis(config, scriptNode, options): Promise<FilmDirectorAnalysisProposal>` orchestrates the existing AI parse/assets requests without creating a second task chain.
- `applyFilmDirectorAnalysis(nodes, connections, proposal, selection): FilmCommandResult` creates specialized nodes and `composition/context/sequence/derived` edges atomically.

- [ ] **Step 1: Write failing proposal application tests**

Cover:
1. selected scenes only are applied;
2. existing same-category assets are not duplicated;
3. selected mentions create `context` edges with `source: "ai"`;
4. canceled proposal leaves nodes/connections unchanged;
5. snapshot captures exactly the changed nodes/edges.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-director-analysis.test.ts"
```

- [ ] **Step 3: Implement the merged analysis model and dialog**

Move the existing structure/asset proposal state into one editor-owned transient state. The dialog has tabs `结构`、`镜头`、`资产`、`应用预览`; all selections are applied once. Keep the latest three parse snapshots and the existing overwrite/append semantics.

- [ ] **Step 4: Replace script-node entry points**

The script node card exposes one `导演分析` action. Remove separate top-level `AI 拆镜` and `AI 提取资产` buttons from the primary script editor; the merged dialog can still show separate tabs and progress.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-director-analysis.test.ts" "src/app/(user)/canvas/[id]/lib/film-script-parse.test.ts" "src/app/(user)/canvas/[id]/lib/film-script-assets.test.ts"
bun run typecheck
```

---

### Task 10: Add the optional action-beat node

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-beat.ts`
- Create: `web/src/app/(user)/canvas/[id]/components/film-beat-node-card.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-node-registry.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-context-edges.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-beat.test.ts`

**Interfaces:**
- `createFilmBeatNode(position, mode = "grid9"): CanvasNodeData`.
- `updateFilmBeatFrame(node, index, value): CanvasNodeData`.
- `selectFilmBeatContexts(nodes, connections, beatId): FilmContextSummary`.
- Beat-to-shot relation uses `context` edge `role: "beat"`.

- [ ] **Step 1: Write failing beat tests**

Cover 9-frame editing, context selection from role/location/style nodes, and beat updates invalidating linked shot generation signatures.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-beat.test.ts"
```

- [ ] **Step 3: Implement grid9 beat node**

Provide total prompt, AI frame generation, editable nine-frame grid, preview generation and a “定位引用镜头” action. Do not implement grid4/timeline editor in this phase.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-beat.test.ts" "src/app/(user)/canvas/[id]/lib/film-context-edges.test.ts"
bun run typecheck
```

---

## Phase 4: Context Center and Production Center

### Task 11: Replace the asset overview with the Context Center

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-context-center.ts`
- Create: `web/src/app/(user)/canvas/[id]/components/film-context-center.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-asset-overview-view.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-asset-view.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-library-usage.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-context-center.test.ts`

**Interfaces:**
- `selectFilmContextCenter(nodes, connections): FilmContextCenterView` returns character/location/prop/style groups, usage, missing references, pending tasks and impacted shots.
- `FilmContextCenter` supports node edit, locate, mother-library import/update and “打开制作中心” with selected asset IDs.

- [ ] **Step 1: Write failing read-model tests**

Cover:
1. usage counts from `context` edges;
2. missing reference state from role-specific assets;
3. style node uniqueness;
4. affected shots when a character board changes;
5. costumes are not rendered as a first-level project group.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-context-center.test.ts"
```

- [ ] **Step 3: Implement the context center**

Reuse `FilmAssetThumbnail`, slot editors, library picker and existing usage rules, but render role-specific node cards. Move scene coverage information to the review model; do not keep the old “资产清单/场景覆盖” secondary mode.

- [ ] **Step 4: Replace the assets view and run tests**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-context-center.test.ts" "src/app/(user)/canvas/[id]/lib/film-asset-view.test.ts"
bun run typecheck
```

---

### Task 12: Merge asset and shot queues into the Production Center

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-production-plan.ts`
- Create: `web/src/app/(user)/canvas/[id]/components/film-production-center.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-film-asset-production.ts`
- Modify: `web/src/app/(user)/canvas/[id]/hooks/use-film-shot-batch.ts`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-asset-production-dialog.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-production-dialog.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-selection-bar.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-storyboard-view.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-table-view.tsx`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-production-plan.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-batch-preflight.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-asset-production.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-production.test.ts`

**Interfaces:**
- `selectFilmProductionPlan(nodes, connections, options): FilmProductionPlan` combines asset items, shot items, queue state, failure state and selected IDs.
- `FilmProductionCenter` accepts `initialAssetIds?: string[]`, `initialShotIds?: string[]`, `initialKind?: "asset" | "image" | "video"` and the existing start/stop callbacks.
- Underlying `film.assetQueue`, `film.shotQueue`, `useFilmAssetProduction`, `useFilmShotBatch`, task polling and stop APIs remain the only execution sources.

- [ ] **Step 1: Write failing plan tests**

Cover assets and shots appearing in separate tabs, selected IDs preserved when opened from a view, failed items grouped, queue state reflected, and ready/skipped reasons coming from the existing preflight functions.

- [ ] **Step 2: Run red**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-production-plan.test.ts"
```

- [ ] **Step 3: Implement the merged plan and UI**

Build one modal/drawer with tabs `全部`、`资产`、`镜头`、`失败`、`已完成`. Asset and shot execution controls use the existing hooks. The center must expose current item, progress, stop, retry and locate actions. Do not create a new task runner.

- [ ] **Step 4: Redirect existing batch entry points**

The table selection bar, storyboard selection bar and context center open the production center with selected IDs. Remove “本组出图/本组视频” direct execution buttons. Keep “选择本组” and “存为镜头选集” only if they still route to the center or preview.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-production-plan.test.ts" "src/app/(user)/canvas/[id]/lib/film-batch-preflight.test.ts" "src/app/(user)/canvas/[id]/lib/film-asset-production.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-production.test.ts"
bun run typecheck
```

---

## Phase 5: Preview, Version Room and Review Convergence

### Task 13: Merge Timeline into the single Storyboard Preview

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-animatic-preview.ts`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-preview-overlay.tsx`
- Delete after migration: `web/src/app/(user)/canvas/[id]/components/film-timeline-view.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-view-body.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-studio-view-switch.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-animatic-preview.test.ts`

**Interfaces:**
- `buildFilmPreviewTimeline` is the only time-line builder.
- `FilmPreviewOverlay` owns playback, playhead, scene segments, shot blocks, keyboard controls and opening Shot Focus.
- No `FilmTimelineView` or second interval/playhead implementation remains.

- [ ] **Step 1: Add timeline behavior tests**

Cover image/video/empty media priority, mixed-duration clips, playhead-to-shot selection, scene segments, group preview filtering and end-of-playback behavior.

- [ ] **Step 2: Run red against the new expectations**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-animatic-preview.test.ts"
```

- [ ] **Step 3: Move timeline controls into preview**

Port the current timeline ruler, scene segments and playhead controls into `FilmPreviewOverlay`. Keep preview muted and explicitly label it “分镜预演”; do not add audio/subtitle/export behavior.

- [ ] **Step 4: Remove the timeline view and switch entry**

Delete the timeline view from `FilmStudioView`, `FilmViewBody`, `FilmStudioViewSwitch`, and the per-project view state. Update keyboard help and pending-test text.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-animatic-preview.test.ts"
bun run typecheck
```

---

### Task 14: Make Version Room the only version-management surface

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/components/film-version-room-dialog.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-context-panel.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-shot-stage.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-director-board.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-version-room.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-version-room.test.ts`

**Interfaces:**
- `FilmVersionRoomDialog` handles current-shot compare, media kind switch, context summary, set-current and batch picks.
- `FilmShotContextPanel` becomes context/prompt-only and does not render a selectable version list.
- Shot node/stage shows only current-version label and version count; clicking count opens Version Room.

- [ ] **Step 1: Add version-room tests**

Cover current version detection, batch picks across shots, applying image/video versions without deleting history, and context summary for old/uploaded versions.

- [ ] **Step 2: Implement the single surface**

Move prompt/reference/warning summary into the Version Room panes. Remove inline version selection buttons from the stage and context panel. Preserve `imageVersions`/`videoVersions` and `applyFilmVersionSelections` behavior.

- [ ] **Step 3: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-version-room.test.ts"
bun run typecheck
```

---

### Task 15: Make review graph-native and make the film inspector read-only

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-review.ts`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-review-drawer.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-film-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-review-input.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-review.test.ts`

**Interfaces:**
- `selectFilmReview` returns graph-native issues with `targetNodeId`, `targetShotId`, `targetContextNodeId` and source category.
- `FilmReviewDrawer` only displays and navigates; it does not edit shot payloads.
- `CanvasFilmInspector` for a shot shows summary, contexts, sequence neighbors, status and actions to open Director Board/Shot Focus.

- [ ] **Step 1: Add targeting tests**

Cover missing reference targeting the context node, sequence/coverage targeting the shot node, style impact targeting the style node, and stale AI review targeting the project review entry.

- [ ] **Step 2: Implement graph-native issue targets**

Remove the `shotNo`-only lookup and use stable node IDs from selectors. Keep static checks and manual AI review; do not block free editing.

- [ ] **Step 3: Remove full shot editing from the generic inspector**

Delete the duplicate basic/professional shot form from `CanvasFilmInspector`. Leave script/scene/context summaries and a direct navigation action to the specialized editor.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-review.test.ts"
bun run typecheck
```

---

## Phase 6: Remove Superseded Product Concepts and Update Documentation

### Task 16: Remove interactive branches, legacy continuity sheets and obsolete stage concepts

**Files:**
- Delete after reachability audit: `web/src/app/(user)/film/utils/film-branch.ts`
- Delete after reachability audit: `web/src/app/(user)/film/utils/film-interactive.ts`
- Delete after reachability audit: `web/src/app/(user)/film/utils/film-continuity-sheet.ts`
- Delete after reachability audit: `web/src/app/(user)/film/utils/film-stages.ts`
- Modify: `web/src/lib/film/types.ts`
- Modify: `web/src/app/(user)/film/utils/film-animatic.ts` or replace with graph-native review rules
- Modify: all tests importing removed product concepts
- Test: full affected `web/src/app/(user)/film/utils/**/*.test.ts` set

**Interfaces:**
- No runtime `FilmShotBranch`, `FilmInteractiveVariable`, `FilmContinuitySheet`, `FilmStage`, `FilmProject`, `FilmEpisode`, `FilmScene`, `FilmShotConnection`, `FilmShotCharacterBinding`, or `FilmShotPropBinding` remain in the product path.
- Continuity data is limited to `FilmContextEdgeData.continuity` and action-beat node data.

- [ ] **Step 1: Run reachability searches before deleting**

Run from repository root:

```bash
rg "FilmProject|FilmEpisode|FilmScene|FilmShotConnection|FilmShotCharacterBinding|FilmShotPropBinding|FilmShotBranch|FilmInteractiveVariable|FilmContinuitySheet|FilmStage|film-branch|film-interactive|film-continuity-sheet|film-stages" web/src
```

Classify each match as a graph-native replacement, a test fixture to rewrite, or a dead export. Do not leave compatibility aliases.

- [ ] **Step 2: Add failing cleanup assertions**

Update affected tests so they build specialized graph fixtures. Add a small test that `FilmGraphReviewInput` and `FilmShotNodeData` do not expose branch/old continuity fields.

- [ ] **Step 3: Delete and replace the old concepts**

Remove branch/interactive logic entirely. Replace old animatic checks with graph-native rules for sequence, scene coverage, duration, context readiness, stale generation and style impact. Keep only manual AI consistency result data in `CanvasFilmMeta.consistencyReview`.

- [ ] **Step 4: Run focused and full tests**

```bash
bun test "src/app/(user)/film/utils" "src/app/(user)/canvas/[id]/lib"
bun run typecheck
```

Expected: no old product concept appears in production imports.

---

### Task 17: Remove duplicate old editors, helpers and first-level costume UI

**Files:**
- Delete after reachability audit: `web/src/app/(user)/film/utils/film-edits.ts`
- Delete after reachability audit: obsolete functions in `web/src/app/(user)/film/utils/film-video-task.ts`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-asset-slot-fields.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-library-picker-dialog.tsx`
- Modify: `web/src/app/(user)/film/library/page.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/components/film-context-center.tsx`
- Test: affected asset/character/library tests

**Interfaces:**
- Project-level asset creation uses specialized character/location/prop/style commands.
- Costume data remains usable by character states and mother-library data, but is absent from Director Board create menu, context-center first-level groups and project asset production plan.
- Character identity uses `board`; `concept` is not a separate downstream identity reference.

- [ ] **Step 1: Run reachability searches**

```bash
rg "film-edits|startFilmVideoTask|pollFilmVideoTask|stopFilmVideoTask|FilmAssetKind.*costume|CREATE_KINDS|character\.concept|concept.*character" web/src
```

- [ ] **Step 2: Update tests to graph-native commands**

Replace tests that call old array editors with node/edge command tests. Add tests that character generation context uses the board and character-state references only.

- [ ] **Step 3: Remove old helpers and first-level costume paths**

Delete only helpers with no remaining production callers. Do not delete shared media/version utilities still used by image/video task updates. Remove costume from project node registry, context-center primary tabs and asset-production plan; retain library storage and state references.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
bun test "src/app/(user)/film/utils/film-character.test.ts" "src/app/(user)/film/utils/film-library.test.ts" "src/app/(user)/canvas/[id]/lib/film-context-center.test.ts"
bun run typecheck
```

---

### Task 18: Update the documentation contract and progress records

**Files:**
- Modify: `docs/superpowers/specs/2026-11-21-film-as-canvas-design.md`
- Modify: `docs/superpowers/specs/2026-11-21-film-studio-shell-design.md`
- Modify: `docs/overview/features.md`
- Modify: `docs/progress/todo.md`
- Modify: `docs/progress/pending-test.md`
- Modify: `docs/progress/ai-film-plan.md`
- Modify: `docs/backend/canvas-data-structure.md` if its film node description is stale

**Interfaces:**
- Existing specs must explicitly link to `2026-11-22-film-director-board-design.md` as the superseding target-state design for film interaction.
- Features documentation describes Director Board, specialized nodes, Shot Focus, Context Center, Production Center and Storyboard Preview.
- TODO/pending-test separates implemented behavior from the new phases and untested browser/model boundaries.

- [ ] **Step 1: Update supersession notes**

At the top of both older film specs, state that the 2026-11-22 Director Board design supersedes their Studio/film-asset UI descriptions while retaining their single-document, single-task, sync and no-migration constraints.

- [ ] **Step 2: Replace stale product descriptions**

Remove descriptions of stage pages, generic `filmAsset` editing, independent timeline view, interactive branches and old FilmProject persistence. Keep historical notes only when labeled as historical.

- [ ] **Step 3: Record current validation state**

Move completed phase items into `pending-test.md` with exact browser evidence; keep real video, cross-device media, mobile/light theme, long queue and platform delivery gaps in `todo.md`.

- [ ] **Step 4: Run documentation consistency searches**

```bash
rg "FilmProject|filmAsset|Studio / 画布|时间轴|互动|阶段|场记交接|服装节点" docs/superpowers/specs docs/overview docs/progress
```

Each remaining match must be either a target-state term, an explicitly historical note, or removed.

---

## Phase 7: Full Verification and Browser Acceptance

### Task 19: Run the complete automated verification set

**Files:**
- No new source files.
- Review all files changed by Tasks 1–18.

- [ ] **Step 1: Run the full test suite**

From `web`:

```bash
bun test
```

Expected: PASS with no skipped assertions added only to hide a behavior change.

- [ ] **Step 2: Run typecheck and lint**

```bash
bun run typecheck
bun run lint --max-warnings=0
```

Expected: PASS.

- [ ] **Step 3: Run targeted searches for forbidden duplicate paths**

```bash
rg "FilmTimelineView|film-asset-production-dialog|film-shot-production-dialog|FilmAssetNodeCard|film-branch|film-interactive|film-continuity-sheet|FilmProject|interactiveVariables|shotGroups" web/src
```

Expected: no production references except explicitly retained library/media types or historical test/document text already marked as such.

---

### Task 20: Browser-verify the Director Board golden path and cleanup test data

**Files:**
- Modify: `docs/progress/pending-test.md`
- Modify: `docs/progress/todo.md`

- [ ] **Step 1: Start the development server**

From `web`:

```bash
bun run dev
```

Use the browser tool against the local app. Do not claim UI completion from typecheck alone.

- [ ] **Step 2: Verify project and node creation**

Create a temporary film project from `/film`. Verify:

1. default route opens Director Board;
2. the film menu shows script/scene/shot/character/location/prop/style/beat and resource actions, not generic nodes by default;
3. scene quick connect creates a shot with `composition` and valid `sequence` edges;
4. character/location/style quick connect creates role-aware `context` edges;
5. node cards show collapsed summaries, context chips, media status and direct actions.

- [ ] **Step 3: Verify Shot Focus and shared editing**

Open a shot from the Director Board, edit description/shot language/action, generate or use configured mock/media behavior, inspect context preview and open Version Room. Return to the board and verify the same node reflects all edits without a second editor state.

- [ ] **Step 4: Verify scale views and execution center**

Open the shot table and storyboard. Select shots and confirm both open the same Production Center. Verify assets open the same center with asset selection. Confirm there is no independent timeline view; open Storyboard Preview and verify playhead, scene segments and opening Shot Focus.

- [ ] **Step 5: Verify review and inspector boundaries**

Open the review center, click a missing-reference/context issue and verify it focuses the correct node. Select a shot in the generic canvas inspector and verify it is read-only with a navigation action rather than a second full shot form.

- [ ] **Step 6: Verify refresh/recovery and unrelated regressions**

Refresh during a configured task or use an existing persisted task fixture; verify the shared polling/queue behavior. Check `/canvas`, a non-film canvas project, comic/publish entry points and account/save controls for regression.

- [ ] **Step 7: Delete temporary test data and document evidence**

Delete the temporary film project and any temporary library entries. Record only actually observed behavior in `docs/progress/pending-test.md`; mark hidden-frame hover, breakpoint, timer and rAF cases as untested when applicable.

---

## Completion Checklist

- [ ] Specialized film node contracts and context/derived edges are implemented and tested.
- [ ] Director Board is the default film interaction; generic film Studio/graph duality is removed.
- [ ] Shot node and Shot Focus share one `FilmShotEditor`.
- [ ] Film quick-connect actions create valid nodes and edges without exposing low-level edge kinds.
- [ ] Director Analysis merges structure and asset proposals without bypassing confirmation.
- [ ] Action Beat node is optional and graph-connected through `context` role `beat`.
- [ ] Context Center replaces the old mixed asset/coverage view.
- [ ] Production Center is the only batch execution UI while preserving separate asset/shot queue persistence.
- [ ] Storyboard Preview is the only timeline/playhead implementation.
- [ ] Version Room is the only version-management surface.
- [ ] Review and generic inspector are graph-native and navigation-focused.
- [ ] Interactive branches, old continuity sheets, old stage model, old FilmProject adapter and duplicate editors are removed after reachability checks.
- [ ] Documentation, tests, typecheck, lint and browser evidence match the target state.
