# 影视画布全片单链与跨场移动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将影视 `sequence` 收敛为全片唯一线性剪辑链，并让故事板跨场移动在一次操作中同步更新场次归属、镜头顺序、时间轴和生成上下文。

**Architecture:** 继续使用同一份 `CanvasProject` 的节点与连接作为真源，不增加影视顺序数组、旧工作台 store 或新的任务链路。场次归属由 `composition` 边表达；全片顺序由 shot→shot 的 `sequence` 边表达，纯 selector 同时提供“按场分组投影”和“全片顺序投影”，以便故事板保持场次分组而 Studio/时间轴/生成上下文使用同一条全片链。故事板移动通过一个纯函数原子重建受影响的 composition/sequence 边。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Node test、现有 CanvasProject/CanvasConnection 模型。

**Spec:** `docs/superpowers/specs/2026-11-21-film-as-canvas-design.md`；本批顺序决策已由用户确认：采用“全片单链（推荐）”。

## Global Constraints

- 影视项目只有一份画布文档；不得恢复 `FilmProject` store、独立顺序数组、独立任务或第二套同步。
- `composition` 只能表达场次归属；`sequence` 只能表达全片线性顺序；`binding` 只能表达资产引用与连续性数据。
- 全片顺序链中每个镜头最多一个前继、最多一个后继；禁止成环、分叉、非镜头端点和重复同向边。
- 跨场移动必须同时更新 composition 与 sequence；不能只改 UI 分组或只改某一类边。
- 未分场镜头作为可见的 `unassigned` 投影存在，但不能被当成持久化场次节点；跨场移动目标必须是真实场次节点。
- 保留工作区已有未提交的降噪和模型选择改动，不回滚、不覆盖、不提交它们。
- 页面文案保持中文；纯逻辑优先放 `web/src/app/(user)/canvas/[id]/lib/` 并配套单测。
- 不在本批实现分支剧情、AI 结构策划、版本对比、批量门禁或成片导出。
- 本批不创建 Git commit；实现和验证完成后保留工作区改动，等待用户单独授权提交。

---

### Task 1: 建立全片顺序投影与 sequence 单链约束

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-layout.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-layout.test.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-connections.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-connections.test.ts`

**Interfaces:**
- Produces `orderFilmShots(shots: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[]`, which orders all provided shots by the global sequence chain and appends disconnected or malformed leftovers deterministically by position.
- Produces `filmSequenceCheck(nodes: CanvasNodeData[], connections: CanvasConnection[]): { ok: true } | { ok: false; reason: string; nodeIds?: string[] }` for non-shot endpoints, duplicate predecessor/successor, and cycles.
- `canAddFilmConnection` consumes the same invariant and rejects a sequence edge when the source already has a successor, the target already has a predecessor, the candidate creates a cycle, or either endpoint is not a shot.

- [ ] **Step 1: Add the failing global ordering test**

Extend `film-layout.test.ts` with two scenes and four shots. Create sequence edges `a1→a2→b1→b2`, pass the shot nodes in a scrambled order, and assert:

```ts
assert.deepEqual(orderFilmShots([b2, a2, b1, a1], connections).map((node) => node.id), ["a1", "a2", "b1", "b2"]);
```

Add one disconnected shot and assert it is appended by `position.y` then `position.x`, rather than dropped. Keep the existing `orderSceneShots` expectations intact.

- [ ] **Step 2: Run the layout test and verify the new test fails**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-layout.test.ts"`

Expected: FAIL because `orderFilmShots` does not exist yet.

- [ ] **Step 3: Add failing tests for single-chain validation**

Extend `film-connections.test.ts`:

```ts
test("rejects a second predecessor or successor in the global film chain", () => {
    const shot3 = node("shot3", CanvasNodeType.Shot);
    const withShot3 = [...nodes, shot3];
    const existing: CanvasConnection[] = [
        { id: "shot->shot2", fromNodeId: "shot", toNodeId: "shot2", kind: "sequence" },
    ];
    const secondSuccessor = normalizeConnection("shot", "shot3", withShot3, "source")!;
    const secondPredecessor = normalizeConnection("shot3", "shot2", withShot3, "source")!;
    assert.equal(canAddFilmConnection(secondSuccessor, withShot3, existing).ok, false);
    assert.equal(canAddFilmConnection(secondPredecessor, withShot3, existing).ok, false);
});

test("reports non-shot sequence endpoints and branching in an existing graph", () => {
    const invalid = [
        { id: "scene->shot", fromNodeId: "scene1", toNodeId: "shot", kind: "sequence" as const },
        { id: "shot->shot2", fromNodeId: "shot", toNodeId: "shot2", kind: "sequence" as const },
        { id: "shot->shot3", fromNodeId: "shot", toNodeId: "shot3", kind: "sequence" as const },
    ];
    const report = filmSequenceCheck([...nodes, node("shot3", CanvasNodeType.Shot)], invalid);
    assert.equal(report.ok, false);
});
```

- [ ] **Step 4: Run the connection tests and verify they fail for the missing invariant**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-connections.test.ts"`

Expected: FAIL because current validation only rejects cycles and does not reject branching or report malformed existing sequence edges.

- [ ] **Step 5: Implement the global chain traversal**

In `film-layout.ts`, add `orderFilmShots` using this deterministic algorithm:

1. Keep only sequence edges whose endpoints are both in the supplied shot set.
2. Build incoming and outgoing maps.
3. Sort roots (nodes without incoming edges) by `position.y`, then `position.x`, and traverse each root.
4. Follow outgoing successors in position order; guard with a `seen` set so malformed cycles cannot loop.
5. Append all unvisited shots by the same position order.

Refactor `orderSceneShots` to call `orderFilmShots` with the scene subset, preserving its public behavior for local projections. Do not split the chain by episode or scene metadata.

- [ ] **Step 6: Implement single-chain validation**

In `film-connections.ts`, add `filmSequenceCheck`. It must:

- reject a sequence edge whose source or target node is missing or not `CanvasNodeType.Shot`;
- reject more than one incoming edge for a target shot;
- reject more than one outgoing edge for a source shot;
- reject a cycle by walking from each root and then any unvisited node;
- return `ok: true` only when all sequence edges satisfy these rules.

Update `canAddFilmConnection` to perform the local predecessor/successor checks before the cycle walk. Keep binding and composition validation unchanged.

- [ ] **Step 7: Run the focused tests and verify they pass**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-layout.test.ts" "src/app/(user)/canvas/[id]/lib/film-connections.test.ts"`

Expected: all existing and new tests pass.

Do not commit this slice; leave the changes in the working tree for the final user-authorized commit.

---

### Task 2: Add global shot-entry projection and atomic cross-scene move logic

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-selectors.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-selectors.test.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-shot-reorder.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts`

**Interfaces:**
- Produces `selectFilmShotEntries(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmShotEntry[]`, a global sequence projection with scene labels and `unassigned` metadata attached to every shot.
- Produces `moveFilmShotAcrossScenes(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string, targetSceneId: string, targetShotId: string | null, after: boolean): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } | null`.
- `selectFilmSceneEntries` remains the scene-grouped projection used by the storyboard, but each scene’s `shots` are filtered from the global order; `selectFilmShotEntries` is used by Studio/Timeline so interleaved cross-scene sequences still render in true chain order.

- [ ] **Step 1: Add the failing cross-scene reorder tests**

Extend `film-shot-reorder.test.ts` with real scene and shot nodes:

- `scene-a` contains `a1`, `a2`;
- `scene-b` contains `b1`, `b2`;
- composition edges assign each shot;
- sequence chain is `a1→a2→b1→b2`.

Add these behaviors:

```ts
test("moves a shot across scenes and inserts it before a target in the global chain", () => {
    const result = moveFilmShotAcrossScenes(nodes, connections, "a2", "scene-b", "b1", false);
    assert.ok(result);
    assert.equal(result!.connections.filter((edge) => edge.kind === "composition" && edge.toNodeId === "a2").length, 1);
    assert.equal(result!.connections.find((edge) => edge.kind === "composition" && edge.toNodeId === "a2")?.fromNodeId, "scene-b");
    assert.deepEqual(
        result!.connections.filter((edge) => edge.kind === "sequence").map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`),
        ["a1->a2", "a2->b1", "b1->b2"],
    );
});

test("moves a shot to the end of a target scene and preserves one composition edge", () => {
    const result = moveFilmShotAcrossScenes(nodes, connections, "a1", "scene-b", null, true);
    assert.ok(result);
    assert.equal(result!.connections.filter((edge) => edge.kind === "composition" && edge.toNodeId === "a1").length, 1);
    assert.equal(result!.connections.find((edge) => edge.kind === "composition" && edge.toNodeId === "a1")?.fromNodeId, "scene-b");
    assert.deepEqual(
        result!.connections.filter((edge) => edge.kind === "sequence").map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`),
        ["a2->b1", "b1->b2", "b2->a1"],
    );
});
```

Also assert invalid scene ids, invalid target ids, and `targetSceneId === "unassigned"` return `null` without changing the input arrays.

- [ ] **Step 2: Run the reorder tests and verify the new tests fail**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts"`

Expected: FAIL because `moveFilmShotAcrossScenes` is not defined.

- [ ] **Step 3: Add the failing global projection tests**

Extend `film-selectors.test.ts` with a chain that interleaves scenes, for example `a1→b1→a2`. Assert:

- `selectFilmShotEntries(...).map((entry) => entry.shot.id)` returns `a1, b1, a2`;
- `selectFilmSceneEntries(...).find(scene-a).shots` contains `a1, a2` in their global relative order;
- the scene-grouped projection still includes an empty scene and the `unassigned` group where applicable.

- [ ] **Step 4: Run the selector tests and verify the new assertion fails**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts"`

Expected: FAIL because current `filmShots` is formed by flattening scene groups and cannot represent interleaved global order.

- [ ] **Step 5: Implement the global entry selector**

In `film-selectors.ts`:

1. Build a scene owner map from composition edges, using the first valid composition owner for malformed duplicate data.
2. Build scene-group entries in the existing episode/position order so the storyboard remains a readable scene view.
3. Compute `orderFilmShots(allShotNodes, connections)` once.
4. For each scene entry, filter the global ordered shots by its owner and map them to `FilmShotEntry` with a stable global `index`.
5. Add unassigned shots as their own group, filtered by the same global order.
6. Export `selectFilmShotEntries` by walking the global ordered shots and attaching scene metadata from the owner map.

This keeps scene grouping and global sequence as two projections of the same graph, not two data stores.

- [ ] **Step 6: Implement atomic move and full chain reconstruction**

In `film-shot-reorder.ts`:

1. Validate the shot, target scene, and optional target shot.
2. Reject a persistent target of `unassigned`; an unassigned shot must first be assigned to a real scene.
3. Get the current global shot order with `orderFilmShots`.
4. Remove `shotId` from that order.
5. Insert it before/after `targetShotId`; if `targetShotId` is null, insert after the last shot currently owned by `targetSceneId`, or at the end when that scene is empty.
6. Rebuild every sequence edge among all shot ids from the resulting order while preserving binding, composition, and generic canvas edges.
7. Remove all composition edges targeting `shotId` and append exactly one `canvasConnection(targetSceneId, shotId, { kind: "composition" })`.
8. Return unchanged input arrays through `null` for invalid requests.

Keep `reorderFilmShotSequence` for pure same-list tests, but make it capable of rebuilding the complete chain when passed all shot ids. Do not retain the old behavior of preserving an external sequence edge when the caller explicitly supplies the full shot list.

- [ ] **Step 7: Run selector and reorder tests and verify they pass**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts"`

Expected: all existing and new tests pass.

Do not commit this slice.

---

### Task 3: Wire the editor and generation context to the single-chain projection

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`

**Interfaces:**
- `FilmStudioModel` replaces `onReorderShots(sceneId, orderedShotIds)` with `onMoveShot(shotId, targetSceneId, targetShotId, after)`.
- The editor callback applies `moveFilmShotAcrossScenes` to the current nodes/connections and updates both React states in one operation, then selects the moved shot in the target scene.
- `buildFilmShotGenerationFromGraph` derives `previousShot` from `orderFilmShots` rather than `connections.find`, so cross-scene predecessor selection follows the global chain.

- [ ] **Step 1: Add the failing generation-context test for a cross-scene predecessor**

Extend `film-shot-generation-context.test.ts` with two scenes and a chain where the previous shot belongs to another scene. Assert the target context has `previousShotId` equal to the cross-scene predecessor and includes a `previous-shot` reference when the predecessor has media.

Add a malformed-branch fixture with two incoming sequence edges and assert the deterministic global projection chooses the predecessor defined by `orderFilmShots`, not whichever edge happens to appear first in the array.

- [ ] **Step 2: Run the generation-context tests and verify they fail**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts"`

Expected: FAIL because `previousShotOf` currently uses the first incoming sequence edge directly.

- [ ] **Step 3: Implement global predecessor derivation**

Import `orderFilmShots` into `film-shot-generation-context.ts`. Replace `previousShotOf` with:

```ts
const shots = nodes.filter((item) => item.type === CanvasNodeType.Shot);
const ordered = orderFilmShots(shots, connections);
const index = ordered.findIndex((item) => item.id === shotId);
const previous = index > 0 ? ordered[index - 1] : undefined;
return previous ? shotFromNode(previous, nodes, connections) ?? undefined : undefined;
```

Keep `includePreviousShot` behavior unchanged; frames mode still disables previous-shot references through its existing options.

- [ ] **Step 4: Replace the editor reorder callback**

In `canvas-editor.tsx`, remove the scene-local validation based on `filmScenes`. Add `moveFilmShot` callback that calls `moveFilmShotAcrossScenes(nodesRef.current, connectionsRef.current, shotId, targetSceneId, targetShotId, after)`. On a non-null result, call `setNodes(result.nodes)`, `setConnections(result.connections)`, `setActiveSceneId(targetSceneId)`, and `setActiveShotId(shotId)`. Expose it as `onMoveShot` in the `FilmStudioModel` object.

Do not add a second view-specific order state.

- [ ] **Step 5: Run the focused editor-adjacent tests**

Run: `bun test "src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts" "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts"`

Expected: all pass.

Do not commit this slice.

---

### Task 4: Enable cross-scene drag-and-drop in the storyboard

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/components/film-storyboard-view.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts` (only if a UI-independent drag payload helper is extracted)

**Interfaces:**
- Storyboard consumes `model.onMoveShot`.
- A dragged shot can be dropped before/after a card in any real scene, or appended to an empty real scene.
- Same-scene reorder and cross-scene move use the same callback and therefore the same atomic graph operation.

- [ ] **Step 1: Change the storyboard event model**

Replace the current `moveFilmShot` array-only import and `onReorderShots` call with `model.onMoveShot`. The drag ref only needs the dragged shot id; the source scene may remain in local state solely for visual labeling, not validation.

- [ ] **Step 2: Allow card targets from every scene**

Remove the `dragged.sceneId !== entry.sceneId` guards from `onDragOver` and `onDrop`. Pass `entry.sceneId`, `entry.shot.id`, and the computed `after` value to `dropBeforeOrAfter`. Keep the existing suppression that prevents a drag release from opening Studio.

- [ ] **Step 3: Add empty-scene drop targets**

For an empty real scene, make the dashed empty area accept drag-over/drop. On drop call `model.onMoveShot(draggedShotId, scene.id, null, true)`. Keep the `unassigned` group read-only as a projection and do not allow a drop target there.

- [ ] **Step 4: Preserve selection and group behavior**

Do not clear the shared selected shot set when moving. Let the graph update cause scene cards and 4/9 groups to recalculate. Ensure the moved shot becomes active through the editor callback, while the storyboard remains in the board view.

- [ ] **Step 5: Run typecheck and storyboard-adjacent tests**

Run:

```bash
bun test "src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts" "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts"
bun run typecheck
```

Expected: all tests pass and TypeScript reports no errors.

Do not commit this slice.

---

### Task 5: Update graph layout, review projection, documentation, and final verification

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-layout.ts` (if Task 1 leaves layout-specific projection work)
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-review.ts` (only if review order currently diverges from global shot projection)
- Modify: `docs/progress/pending-test.md`
- Modify: `docs/progress/todo.md`

**Interfaces:**
- Canvas “按场整理” keeps scene columns but orders shots inside each column by the global chain projection.
- Timeline and Studio consume `selectFilmShotEntries`, so their flattened order is the global chain even when scenes interleave.
- Review/readiness projection remains scene-grouped but uses the same per-scene relative order and never creates a second order source.

- [ ] **Step 1: Add layout regression coverage for cross-scene chains**

Extend `film-layout.test.ts` so `arrangeFilmNodes` receives `a1→b1→a2` and asserts the positions within scene A place `a1` before `a2`, even though `b1` belongs to another column. Assert every shot remains positioned and no sequence edge is removed by layout.

- [ ] **Step 2: Update layout projection if needed**

Use the global ordered shot list once, then filter it per scene when assigning `position.y`. Do not mutate or rewrite connections from the layout function.

- [ ] **Step 3: Update progress documents**

In `pending-test.md`, add a batch 1 entry stating that full-chain validation, cross-scene move, global Studio/timeline projection, and storyboard cross-scene drag are implemented. Record automated verification separately from untested browser behavior.

In `todo.md`, remove “先收敛 sequence 语义，再实施跨场次移动镜头” from the blocking wording and retain the remaining real-device/model/version-comparison work. Add the explicit unresolved limitation that branching/interactive paths are intentionally out of scope for this batch.

- [ ] **Step 4: Run the complete verification set**

Run:

```bash
cd web
bun test "src/app/(user)/canvas/[id]/lib/film-layout.test.ts" "src/app/(user)/canvas/[id]/lib/film-connections.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-reorder.test.ts" "src/app/(user)/canvas/[id]/lib/film-selectors.test.ts" "src/app/(user)/canvas/[id]/lib/film-shot-generation-context.test.ts"
bun test
bun run typecheck
bun run lint --max-warnings=0
```

Expected: focused tests pass, full suite passes, typecheck exits 0, and lint exits 0. Existing experimental proxy warnings may remain; they are not new lint errors.

- [ ] **Step 5: Browser acceptance**

With the existing film canvas feature enabled, create two scenes with at least two shots each and verify:

1. Storyboard drag within a scene changes the global chain and stays in the board view.
2. Drag a shot to another scene before and after an existing card; the shot appears in the target scene, its composition edge changes once, and the timeline/Studio next/previous order follows the same chain.
3. Drag a shot into an empty scene; it is assigned to that scene and appended to the chain.
4. Open the graph and confirm the moved shot has one composition edge and no duplicate sequence predecessor/successor.
5. Generate the target shot after moving it across scenes and inspect generation information: the previous-shot id/reference follows the new global predecessor.
6. Refresh and repeat the checks; no console errors and no test project remains afterward.

Per project constraints, mark real image/video model output, mobile touch drag, and light-theme behavior as untested unless actually verified in a visible browser.

- [ ] **Step 6: Final worktree review**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Confirm only the intended Batch 1 files plus the pre-existing user changes are present. Do not stage or commit without explicit user authorization.
