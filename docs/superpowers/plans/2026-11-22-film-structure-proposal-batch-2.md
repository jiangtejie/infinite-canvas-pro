# 影视画布结构提案（Structure Map）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 拆镜先返回可审阅的结构提案，用户按场勾选后替换或追加到画布；补冲突、时长、缺描述提示与导演风格拆镜。

**Architecture:** 新增一个纯函数把 `FilmEpisode[]` 投影成结构提案与冲突列表；弹窗只做选择与确认；最终仍调用现有 `buildFilmParseGraph` 写入同一份画布节点/边，并复用解析快照。不新增结构计划 store 或第二套解析链路。

**Tech Stack:** React、TypeScript、现有 AI 拆镜、CanvasProject/CanvasConnection、Node test。

**Spec:** `docs/superpowers/specs/2026-11-21-film-as-canvas-design.md`；本批设计已由用户确认“完整实施”。

## Global Constraints

- AI 结果在用户确认前不得修改画布。
- 只应用勾选场次；替换模式明确提示会删除现有场次/镜头。
- 继续使用统一 `buildFilmParseGraph` 与最近 3 次快照。
- 导演风格通过现有 `directorStyleFor` 与 `FilmParseOptions.directorStyle` 接入。
- 保留工作区已有未提交改动，不提交 Git。

---

### Task 1: 结构提案纯函数

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-structure-proposal.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-structure-proposal.test.ts`

**Interfaces:**
- `buildFilmStructureProposal(episodes, nodes, connections, film?)` returns scene keys, totals, current counts and issues.
- `filterFilmProposalEpisodes(episodes, selectedKeys)` returns only selected scenes and drops empty episodes.
- Scene key format is `${episodeIndex}:${sceneIndex}`.

- [ ] Tests: totals/duration, current counts, replace warning, missing descriptions, duplicate shot numbers, target duration deviation, filtering.
- [ ] Red → implement → green.

---

### Task 2: 结构提案弹窗

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-structure-proposal-dialog.tsx`

**Interfaces:**
- Props: `theme`, `proposal`, `mode`, `selectedSceneKeys`, `onModeChange`, `onToggleScene`, `onSelectAll`, `onClear`, `onApply`, `onCancel`.
- Shows stats, issues, episode/scene tree with checkboxes, replace/append mode, selected count, apply/cancel.

- [ ] Implement with canvas theme tokens, max-height scroll, mobile width `min(860px, 96vw)`.
- [ ] Show up to 6 shot previews per scene and “等 N 镜”.

---

### Task 3: 编辑器接入与导演风格

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-studio-types.ts`
- Modify: `web/src/app/(user)/canvas/[id]/components/canvas-workspace.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-film-inspector.tsx`

**Interfaces:**
- `parseFilmScript` no longer overwrites immediately; it opens proposal state.
- New editor state: raw episodes, proposal, mode, selected keys.
- Apply callback filters episodes and calls `buildFilmParseGraph` with selected mode.
- Pass director style to `requestFilmAiStoryboard`.
- `FilmStudioModel.structureProposal` exposes dialog state/actions to `CanvasWorkspace`.

- [ ] Implement state/actions; render dialog in workspace; update helper copy.

---

### Task 4: 文档与验证

**Files:**
- Modify: `docs/progress/pending-test.md`
- Modify: `docs/progress/todo.md`

- [ ] Focused tests, full suite, typecheck, lint.
- [ ] Browser acceptance if a real text model is available: proposal opens without graph change, scene selection/mode works, cancel leaves graph unchanged, apply writes only selected scenes, undo restores. Otherwise mark AI call untested.
- [ ] Final diff review; no commit.
