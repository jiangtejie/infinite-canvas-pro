# 影视画布母版库双向回流 Implementation Plan

**Goal:** 画布资产可从母版库导入/更新，也可写回母版库；更新前能看到受影响的镜头，来源与库更新时间可见。

**Architecture:** 复用 `film-library.ts` 的查找/覆盖/去重与 `useFilmCastStore`，不新增库存储。为检查器增加库选择弹窗与来源操作；画布只修改资产节点副本。

---

### Task 1: 受影响镜头纯函数

**Files:**
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-library-usage.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-library-usage.test.ts`

- `filmAssetBoundShotNumbers(nodes, connections, assetNodeId)` 按全片链顺序返回 binding 到该资产节点的镜号。
- Tests: 只统计 binding、按全片链排序、忽略其他边。

---

### Task 2: 库选择弹窗

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/components/film-library-picker-dialog.tsx`

- 按当前资产类型筛选库条目，搜索名称/别名/标签，显示缩略图、更新时间、使用统计。
- 底部：替换当前资产、导入为新资产节点；风格只允许替换。
- 无条目时说明先去资产库或从项目存入。

---

### Task 3: 检查器与编辑器接线

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-film-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`

- 检查器显示母版库来源/更新时间；新增“从母版库导入”“存入母版库”。
- 从库更新确认列出受影响镜头号；更新只改当前资产副本。
- 存入库确认覆盖方向；库更新较新时警告；成功后回写 `sourceLibraryAssetId`。
- 编辑器提供“导入为新资产节点”回调与受影响镜头数据。

---

### Task 4: 文档与验证

- [ ] Focused/full tests、typecheck、lint。
- [ ] 浏览器：创建资产节点、存入库、修改后从库更新、导入新节点、刷新保持；清理测试数据。
- [ ] 更新 pending-test/todo；不提交。
