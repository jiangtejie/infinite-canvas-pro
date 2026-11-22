# 影视画布 Version Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** 支持当前镜头双版本并排对比并设为当前，以及批量逐镜挑选最佳版本后一次应用。

**Architecture:** 版本仍只存在于镜头 `imageVersions/videoVersions`；新增纯选择器读取版本与当前引用，新增纯应用函数只替换当前 URL/storageKey。弹窗只管理对比与选择状态，不新增 store。

---

### Task 1: 版本纯逻辑

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-version-room.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-version-room.test.ts`

**Interfaces:**
- `selectFilmVersionShots(nodes, connections, kind, { minVersions })` returns global-ordered shots with versions and current id.
- `defaultFilmVersionPair(shot)` returns current + latest other.
- `applyFilmVersionSelections(nodes, selections)` updates only current image/video URL/storageKey, preserves versions and marks success.
- `filmVersionSummary(version)` returns prompt/characters/references/warnings/missing/compiler counts.

- [ ] Tests: filtering, pair defaults, image/video apply, unknown version no-op, summary counts. Red → implement → green.

---

### Task 2: 版本评审弹窗

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-version-room-dialog.tsx`

- [ ] Compare mode: two panes, version selectors, media, metadata, set current.
- [ ] Batch mode: kind switch, shot rows with version thumbnails, pick best per shot, apply all.
- [ ] Theme-token styling, max-height scroll, mobile stacked.

---

### Task 3: 接线

**Files:**
- Modify: `canvas-editor.tsx`, `film-studio-types.ts`, `film-shot-stage.tsx`, `film-studio-view-switch.tsx`, `film-studio-body.tsx`, `canvas-workspace.tsx`

- [ ] Stage version strip “对比” opens compare.
- [ ] Toolbar “版本” with multi-version count opens batch.
- [ ] Editor state/actions apply selections; model exposes room.
- [ ] Workspace renders dialog.

---

### Task 4: 文档与验证

- [ ] Focused/full tests, typecheck, lint.
- [ ] Browser: compare two versions, set current; batch pick and apply; refresh persistence; cleanup.
- [ ] Docs update, no commit.
