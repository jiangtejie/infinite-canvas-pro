# 漫画角色一致性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立结构化漫画角色与具名变体、显式页格绑定、稳定的角色 prompt/参考图编译，以及不丢原图的上下文过期管理。

**Architecture:** 漫画项目中的基础角色、变体、页格绑定与带生成上下文的页格图是角色一致性的唯一真源。AI 拆格只生成可精确匹配的绑定建议；统一纯逻辑编译器从显式绑定生成 prompt、最多 5 张有序参考图及上下文签名；上下文变化保留旧图、标为过期并让合成页失效。媒体引用收集在 Phase A 覆盖漫画项目和角色库。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design、Zustand、localforage、Bun test。

**Spec:** `docs/superpowers/specs/2026-11-15-comic-character-consistency-design.md`

## Global Constraints

- 工作台只负责角色/变体、剧本页格、页格生成与整页拼合；画布漫画册仍独占贴字、页序和成品导出。
- 不新增账号云同步、多人角色权限或影视角色部位矩阵。
- 角色库导入项目是独立副本；不订阅库更新，不静默覆盖项目副本。
- 不从生成时的自然语言隐式猜测角色绑定；AI 拆格建议只有唯一精确匹配才写成绑定。
- 任何设定变化保留旧页格图片；过期或未记录上下文图片只有经用户确认才可参加新的整页合成。
- 单次图片请求最多携带 5 张参考图，首格锚点也占用该预算，角色身份参考优先。
- 旧项目/JSON 备份迁移必须可重复执行且不丢已有文字或图片。
- 每个任务先写失败测试，再实现最小变更并运行对应测试；每个 Phase 独立验证并停在复核点；未经用户明确授权不提交或推送。

---

## 文件结构与职责

### 修改与新增

- `web/src/app/(user)/comic/types.ts`：定义基础角色、角色变体、带稳定 ID/版本的角色参考、页格绑定/建议、生成上下文及带上下文的页格图片类型。
- `web/src/app/(user)/comic/utils/comic-project.ts`：默认实体工厂、以明确 project ID 为输入的旧项目规范化、绑定校验/更新及页面组合计划纯逻辑。
- `web/src/app/(user)/comic/utils/comic-project.test.ts`：默认实体、migration 稳定 ID、JSON 备份往返、绑定及 stale/unrecorded 状态测试。
- `web/src/app/(user)/comic/stores/use-comic-store.ts`：通过 Zustand `version`/`migrate` 对项目数组做一次持久化迁移；`importProject` 与 backup 导入通过同一 normalizer；不新增远端同步。
- `web/src/app/(user)/comic/stores/use-comic-cast-store.ts`：通过同一角色 normalizer 迁移角色库条目并设置 store version；不改变库的本机独立副本语义。
- `web/src/app/(user)/comic/utils/comic-character-binding.ts`（新增）：角色/别名精确匹配、变体归属校验、旧页格文字绑定建议纯逻辑。
- `web/src/app/(user)/comic/utils/comic-character-binding.test.ts`（新增）：唯一匹配、别名、碰撞/歧义、未知角色/变体、绑定 snapshot、库副本 ID/引用测试。
- `web/src/app/(user)/comic/utils/comic-ai.ts`：扩展拆格 JSON schema、做严格角色/变体匹配，并把未解析项保留为建议。
- `web/src/app/(user)/comic/utils/comic-ai.test.ts`：缺省建议、精确姓名/别名、Unicode 规范化、同名歧义、未知角色/变体、错误归属及旧响应兼容测试。
- `web/src/app/(user)/comic/utils/comic-image-generation.ts`：提供同步 prompt/reference descriptor/inputSignature 编译、异步 reference loader 与图片状态派生。
- `web/src/app/(user)/comic/utils/comic-image-generation.test.ts`：覆盖身份/变体继承、prompt 字段消费、图片优先级、5 图预算、首格锚点、失败参考图、签名稳定性和状态派生。
- `web/src/app/(user)/comic/components/comic-character-editor.tsx`（新增）：项目角色与角色库共用的基础身份、变体、参考图包编辑器。
- `web/src/app/(user)/comic/[id]/components/comic-script-stage.tsx`：页格编辑区增加出场角色/变体绑定、多选、移除、未解析建议及显式确认旧项目建议操作。
- `web/src/app/(user)/comic/[id]/components/comic-cast-stage.tsx`：改用共享角色编辑器，保留项目阶段与上下架/删除动作。
- `web/src/app/(user)/comic/library/page.tsx`：搜索、角色编辑/删除与变体/参考图摘要；库仍是独立副本，不订阅项目变更。
- `web/src/app/(user)/comic/[id]/components/comic-layout-stage.tsx`：请求生成前使用统一编译结果，显示绑定/参考图警告及生成图状态。
- `web/src/app/(user)/comic/utils/comic-page-composition.ts`：合成 allowlist 与 `compositionContext` 写入。
- `web/src/services/storage-references.ts`：新增聚合 builder，等待漫画项目与漫画角色库 hydration，并收集当前及其他账号分区的存储引用。
- `web/src/services/storage-references.test.ts`（新增）：聚合 builder 的漫画项目/角色库/跨账号引用保留测试。
- `docs/progress/pending-test.md`：只在对应阶段存在待人工或真实模型验收项时记录实际变更和未实测边界。

### 不修改

- `web/src/app/(user)/canvas/[id]/lib/comic-export.ts`、漫画册贴字与导出文件：职责边界不变。
- `ComicPage.pageImage` 不新增第二套上下文真源；它始终是页格图与布局的派生结果。
- 不新建根级 `CONTEXT.md` 或额外治理文件；本批只实现已批准规格。

---

## Phase A：模型迁移与媒体数据安全

### Task A1：定义结构化角色和页格类型

**Files:**
- Modify: `web/src/app/(user)/comic/types.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-project.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-ai.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-image-generation.ts`
- Modify: `web/src/app/(user)/comic/[id]/components/comic-cast-stage.tsx`
- Modify: `web/src/app/(user)/comic/library/page.tsx`
- Test: `web/src/app/(user)/comic/utils/comic-project.test.ts`
- Test: `web/src/app/(user)/comic/utils/comic-image-generation.test.ts`

**Interfaces:**
- Produces: `ComicCharacter`, `ComicCharacterVariant`, `ComicImageRef`, `ComicCharacterReference`, `ComicGenerationContext`, `ComicGeneratedPanelImage`, `ComicPanelCharacterBinding`, `ComicPanelCharacterSuggestion`。
- `ComicPanel` 增加 `characterBindings` 与 `characterSuggestions`；`image` 改为 `ComicGeneratedPanelImage`。
- `ComicImageRef` 保持现有 `{url, storageKey?, width?, height?}` 通用契约；仅角色/变体参考扩展为 `ComicCharacterReference = ComicImageRef & {id, revision}`。场景图、拼合页图不强制升级。
- `ComicGenerationContext` 保存 `inputSignature`, `compilerVersion`, normalized `prompt`, 成功加载的 references `{id, revision, role}[]`, `missingReferenceIds`, optional `model/size`, `createdAt`；不保存 Data URL。
- 图片上下文有效性由 `resolveComicPanelImageState(panel, currentInputSignature)` 基于当前纯编译结果和签名派生，优先级为 `unrecorded > stale > incomplete > current`；不持久化单独 stale flag。

- [ ] **Step 1: 写默认实体失败测试**

在 `comic-project.test.ts` 增加默认工厂断言：新角色有 `aliases: []`、空 `visualIdentity`/`defaultLook`/`behavior`/`constraints`、`references: {}`、`variants: []`；新页格有 `characterBindings: []`、`characterSuggestions: []`；不预置任何角色、变体或图片。

```ts
const character = createComicCharacter(1);
assert.deepEqual(character.aliases, []);
assert.deepEqual(character.references, {});
assert.deepEqual(character.variants, []);
assert.deepEqual(createComicPanel().characterBindings, []);
assert.deepEqual(createComicPanel().characterSuggestions, []);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-project.test.ts`
Expected: FAIL，因为新字段与默认工厂尚未实现。

- [ ] **Step 3: 定义新类型与最小默认工厂**

按规格的类型块更新 `comic/types.ts`；`createComicCharacter` 创建空别名/约束/参考图/变体集合，`createComicPanel` 创建空 `characterBindings` 和 `characterSuggestions`。不要生成随机变体、默认角色绑定或假图片。

- [ ] **Step 4: 最小适配所有现有字段读取方**

不改交互形态，只把现有读取迁到新结构：`appearance` → `visualIdentity.description`，`wardrobe` → `defaultLook.outfit`，`personality` → `behavior.personality`，`expressions` → `behavior.expressionBaseline`，`image` → `references.primary`。涉及 `comic-ai.ts`（拆格角色摘要）、`comic-image-generation.ts`（旧 prompt/reference 逻辑）、`comic-cast-stage.tsx`、`library/page.tsx`、`comic-project.ts` 的 `parseComicProjectBackup` 默认构造（补 `characterBindings: []` 与新角色字段；A2 再替换成 normalizer）。上传角色图时写入 `references.primary`，用 `<characterId>:primary` 生成稳定 reference id，替换时 revision +1。更新 `comic-project.test.ts`/`comic-image-generation.test.ts` 中的旧字段赋值；旧字段样例仅在 A2 迁移测试中使用。

- [ ] **Step 5: 运行测试与类型检查**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-project.test.ts src/app/\(user\)/comic/utils/comic-image-generation.test.ts && bun run typecheck`
Expected: PASS；现有角色卡、角色库、拆格提示和页格生成在 Phase A 即可编译运行。

- [ ] **Step 6: 类型阶段复核**

确认基础角色、变体、绑定、生成图上下文字段与规格一致；本步骤暂停，不执行 git add/commit。

### Task A2：实现幂等旧项目与备份整理

**Files:**
- Modify: `web/src/app/(user)/comic/utils/comic-project.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-project.test.ts`
- Modify: `web/src/app/(user)/comic/stores/use-comic-store.ts`
- Modify: `web/src/app/(user)/comic/stores/use-comic-cast-store.ts`

**Interfaces:**
- Produces: `normalizeComicProject(project: LegacyComicProject, projectId: string): ComicProject`，用于 storage hydration、JSON backup 导入与 store `importProject`。
- Produces: `normalizeComicCharacter(character: LegacyComicCharacter, fallbackId: string): ComicCharacter`，项目角色与角色库共用。
- `LegacyComicCharacter` 允许旧 `appearance/personality/wardrobe/expressions/image` 字段；新 `ComicCharacter` 不保留这些旧字段，normalizer 只读它们作迁移输入。
- `parseComicProjectBackup` 在调用 normalizer 前确定项目 ID；store hydration 只整理一次持久化项目数组，不改变项目 ID。两个 store 都通过 persist `version: 1` 与 `migrate` 执行一次，不能同时保留两套读写迁移。

- [ ] **Step 1: 补充边界失败测试**

测试旧单图映射为 `references.primary` 并产生稳定 `legacy:<projectId>:character:<index>:primary` reference ID 与 revision 0；旧文字映射严格按规格；空数组/缺失属性默认安全；已有变体和引用二次整理不变；旧生成图保持无 `generationContext`；不自动猜绑定；坏的可选字段被归一化而不丢有效文本/图片。

```ts
const legacy = { title: "旧项目", chapters: [], characters: [{ name: "林夏", appearance: "短发", image: { url: "blob:a", storageKey: "image:a" } }] };
const once = normalizeComicProject(legacy, "project-1");
const twice = normalizeComicProject(once, "project-1");
assert.deepEqual(twice, once);
assert.equal(once.characters[0]!.references.primary?.id, "legacy:project-1:character:0:primary");
assert.equal(once.characters[0]!.references.primary?.revision, 0);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-project.test.ts`
Expected: 新增的迁移和幂等断言失败。

- [ ] **Step 3: 实现纯 normalizer**

`normalizeComicProject(project, projectId)` 映射现有文本、把 `image` 移入 `references.primary`、用 `legacy:<projectId>:character:<charIdx>:<slot>` 生成稳定 reference ID，revision 0；已有 ID 一律保留。缺失角色/页格/变体 ID 时以 projectId + 固定层级索引派生 `legacy:*` ID，禁止 nanoid/随机数，正常重跑不得生成新 ID。逐页补空绑定/建议集合；保留旧生成图片为无 `generationContext`；不作 AI 推断。角色库用 `normalizeComicCharacter(character, "legacy:cast:<index>")`；store migrate 只调用一次后写 version 1。

- [ ] **Step 4: 接入 hydration/import/backup 并测试**

两个 store 都显式设置 persist `version: 1` 并提供 `migrate`：漫画项目对每个 project 使用 `project.id || "legacy:project:" + index` 作为稳定 ID；漫画角色库逐项使用 `normalizeComicCharacter(item, item.id || "legacy:cast:" + index)`。`importProject` 先确定 `project.id || crypto.randomUUID()`，再调用同一 normalizer；`parseComicProjectBackup` 先取 `source.id || nanoid()`，再调用 normalizer。旧备份仍可导入；不能用随机 ID 作为 normalizer 内部 fallback。

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-project.test.ts src/app/\(user\)/comic/utils/comic-canvas-import.test.ts`
Expected: PASS；旧版备份仍能导入，序列化往返不丢新字段。

- [ ] **Step 5: 数据迁移阶段复核**

确认 persist 只迁移一次、JSON 导入调用同一 normalizer、重复 hydration 不改 ID；本步骤暂停，不执行 git add/commit。

### Task A3：媒体清理保护漫画项目与角色库

**Files:**
- Modify: `web/src/services/storage-references.ts`
- Create: `web/src/services/storage-references.test.ts`

**Interfaces:**
- Produces: `buildStorageReferenceSources(input: StorageReferenceSourceInput): StorageReferenceSources`；input 包含 assets/projects/filmProjects/filmCast/comicProjects/comicCast/skills/extra/logKeys/otherAccounts。
- `collectStorageReferences` 动态导入漫画项目/store，等待 hydration 后用 builder 汇总当前状态；其他账号通过 `COMIC_STORE_KEY`、`COMIC_CAST_STORE_KEY` 的 `readOtherAccountStates` 加入 `otherAccounts`。

- [ ] **Step 1: 写引用聚合失败测试**

新建 `storage-references.test.ts`，调用 `buildStorageReferenceSources`，传入含 `character.references.primary/face/fullBody`、变体 `referenceImage` 的漫画项目，以及含 reference 的漫画库角色，断言结果包含该 comicProjects/comicCast 且 `collectStorageReferenceKeys(result)` 保留同一 `image:` key；再传入其他账号分区对象引用同 key，断言仍保留。移除漫画项目/角色库引用后再断言仅剩其他账号引用时仍保留。

```ts
const key = "image:cast";
const sources = buildStorageReferenceSources({
  comicProjects: [{ characters: [{ references: { primary: { storageKey: key } }, variants: [{ referenceImage: { storageKey: key } }] }] }],
  comicCast: { characters: [{ references: { face: { storageKey: key } } }], locations: [] },
  logKeys: [],
  otherAccounts: [{ state: { projects: [{ metadata: { storageKey: key } }] } }],
});
assert.equal(collectStorageReferenceKeys(sources).has(key), true);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/services/storage-references.test.ts`
Expected: FAIL，因为 builder 尚未建立或未接收漫画来源。

- [ ] **Step 3: 扩展存储引用收集**

新增 builder 作为组装纯函数；`collectStorageReferences` 保留异步 store/hydration 逻辑，调用 builder 时传入 `comicProjects`、`comicCast` 及既有来源。不要为角色图片再造一套遍历器；复用 `collectStorageReferenceKeys` 递归。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && bun test src/services/storage-references.test.ts`
Expected: 当前角色/库引用与其他账号引用都阻止删除；移除该类引用后才可清理。

- [ ] **Step 5: 存储安全阶段复核**

确认当前/其他账号漫画项目与角色库引用进入回收集合；本步骤暂停，不执行 git add/commit。

### Task A4：备份往返与 Phase A 回归

**Files:**
- Test: `web/src/app/(user)/comic/utils/comic-project.test.ts`
- Test: `web/src/services/storage-references.test.ts`
- Docs: `docs/progress/pending-test.md`

- [ ] **Step 1: 写完整备份 round-trip 测试**

构造含基础角色参考包、两个变体、页格显式绑定、未解析建议、已生成图上下文签名和现有 pageImage 的项目；序列化并导入后断言每个 ID、变体关系、reference ID/revision、绑定、上下文签名及图片 storageKey 均相等。

- [ ] **Step 2: 运行针对性测试**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-project.test.ts src/services/storage-references.test.ts`
Expected: PASS；现有 pageImage 与审稿数据不变。

- [ ] **Step 3: 更新待测试记录**

仅记录 Phase A 的可人工验证变化（旧角色资料保留、角色图不会被素材删除误删、JSON 导入导出保留引用）；明确未实测范围，不把 A/B/C 未实现内容写成已实现。

- [ ] **Step 4: 跑阶段验证并复核**

Run: `cd web && bun run typecheck && bun run lint && bun test`
Expected: typecheck 通过、lint 0 warning、测试全绿；阶段到此暂停，提交需另获用户授权。

---

## Phase B：显式页格绑定与角色库管理

### Task B1：AI 拆格 schema 与精确绑定解析

**Files:**
- Modify: `web/src/app/(user)/comic/utils/comic-ai.ts`
- Test: `web/src/app/(user)/comic/utils/comic-ai.test.ts`

**Interfaces:**
- `requestComicBreakdown(...)` 仍返回 `ComicPage[]`，内部调用 `parseComicBreakdown(turn.content, project.characters)`；模型每格可以附 `characters: Array<{name: string; variant?: string}>`。
- `parseComicBreakdown(content, projectCharacters: ComicCharacter[] = [])` 只在唯一精确匹配时把建议转成 `characterBindings`；其余存 `characterSuggestions`。

- [ ] **Step 1: 写解析器失败测试**

覆盖：无 `characters` 的旧响应；姓名匹配；别名匹配；NFKC/空格规范化；同名/别名碰撞；未知角色；已知角色但未知变体；变体属于另一角色；有效角色且变体缺省；多角色顺序保持 AI 返回顺序。

```ts
const cast = [{ ...createComicCharacter(1), id: "c1", name: "林夏", aliases: ["小夏"], variants: [{ id: "v1", name: "校服" }] }];
const pages = parseComicBreakdown(JSON.stringify({ pages: [{ panels: [{ description: "小夏站在门口", dialogue: "", caption: "", sfx: "", characters: [{ name: "小夏", variant: "校服" }, { name: "陌生人" }] }] }] }), cast);
assert.deepEqual(pages[0]!.panels[0]!.characterBindings, [{ characterId: "c1", variantId: "v1", source: "ai", characterNameSnapshot: "林夏", variantNameSnapshot: "校服" }]);
assert.equal(pages[0]!.panels[0]!.characterSuggestions?.[0]?.characterName, "陌生人");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-ai.test.ts`
Expected: 新匹配与 unresolved suggestion 断言失败。

- [ ] **Step 3: 修改 breakdown 提示和解析器**

提示词只要求返回已给目录中的名字/变体建议，缺省空数组可省略；解析器不创建任何角色/变体。姓名规范化只做 NFKC 和首尾 trim，最后精确比较。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-ai.test.ts`
Expected: PASS，旧格式仍完整解析。

- [ ] **Step 5: 拆格匹配阶段复核**

确认旧 JSON 响应兼容、唯一姓名/别名匹配写绑定、未解析建议不阻断导入；本步骤暂停，不执行 git add/commit。

### Task B2：剧本页格角色/变体绑定编辑

**Files:**
- Modify: `web/src/app/(user)/comic/[id]/components/comic-script-stage.tsx`
- Modify: `web/src/app/(user)/comic/utils/comic-character-binding.ts`
- Test: `web/src/app/(user)/comic/utils/comic-character-binding.test.ts`

**Interfaces:**
- Produces: `setComicPanelCharacterBindings(project, chapterId, pageId, panelId, bindings): ComicProject`；校验角色存在、变体属于该角色，写入 `characterNameSnapshot`/`variantNameSnapshot`，并清空所属页 `pageImage`/`compositionContext`。
- Produces: `removeComicPanelCharacterBinding(...)` 复用同一校验和失效路径。

- [ ] **Step 1: 为绑定更新写失败测试**

测试添加/移除角色绑定、切换变体、拒绝不属于该角色的 variantId、同页不同格绑定互不影响；任何绑定修改保留本格图字节与原 generationContext，使当前 inputSignature 与新绑定不一致，从而派生 stale；清空所在页 `pageImage` 与 `compositionContext`，页面状态按现有编辑规则退回草稿；删除角色/变体后绑定保留可读 snapshot 并显示为未解析。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-character-binding.test.ts`
Expected: 绑定更新/失效行为断言失败。

- [ ] **Step 3: 增加每格绑定控件**

每格显示角色多选；每个已选角色提供该角色自己的变体下拉；将 `characterSuggestions` 展示为待处理行，用户能绑定到现有角色/变体或忽略；不得把未解析名字直接写成正式绑定。编辑基于页格 ID 更新单个 panel。

- [ ] **Step 4: 运行针对性测试与类型检查**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-character-binding.test.ts && bun run typecheck`
Expected: 纯逻辑通过，页面控件类型通过。

- [ ] **Step 5: 页格绑定阶段复核**

确认单格多角色/变体绑定、未解析建议处理和旧图保留均通过测试；本步骤暂停，不执行 git add/commit。

### Task B3：既有项目一次性绑定建议

**Files:**
- Modify: `web/src/app/(user)/comic/[id]/components/comic-script-stage.tsx`
- Test: `web/src/app/(user)/comic/utils/comic-character-binding.test.ts`

- [ ] **Step 1: 写绑定建议测试**

用角色姓名/别名直接出现在描述、对白说话人字段匹配、昵称不在别名中、代词“她”、子串碰撞和同名歧义测试：只对唯一姓名/别名精确匹配出建议，不从代词或剧情语义自动绑定；冲突/歧义留待处理；用户确认动作只写入所选建议。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-character-binding.test.ts`
Expected: legacy-text binding suggestion tests fail before the helper exists.

- [ ] **Step 3: 实现建议与显式确认 UI**

从当前页格描述/对白/旁白生成建议列表，不自动改动数据；用户确认单格/单条后调用 `setComicPanelCharacterBindings`，保留旧图、清空 pageImage/compositionContext，过期状态由签名派生。

- [ ] **Step 4: 运行测试**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-character-binding.test.ts`
Expected: PASS；取消确认不改变项目。

- [ ] **Step 5: 旧项目绑定建议阶段复核**

确认建议只在用户确认后写入，歧义/取消都不改变项目数据；本步骤暂停，不执行 git add/commit。

### Task B4：角色与变体编辑、参考图包及库管理

**Files:**
- Create: `web/src/app/(user)/comic/components/comic-character-editor.tsx`
- Modify: `web/src/app/(user)/comic/[id]/components/comic-cast-stage.tsx`
- Modify: `web/src/app/(user)/comic/library/page.tsx`
- Modify: `web/src/app/(user)/comic/stores/use-comic-cast-store.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-character-binding.ts`
- Test: `web/src/app/(user)/comic/utils/comic-character-binding.test.ts`

**Interfaces:**
- `ComicCharacterEditor` 接收 `{ character, onChange, onUploadReference, uploadingSlot }`，统一项目/库的基础身份、变体与参考图包编辑；上传由调用方写入 store，组件不直接持久化。
- Produces: `copyComicCharacterForProject(source): ComicCharacter`；新建角色/变体/参考图 ID，保留 `storageKey/url/width/height`，设置 `sourceLibraryCharacterId`，不共享对象引用。

- [ ] **Step 1: 写变体/库副本纯逻辑测试**

覆盖变体只属于一个角色；变体字段只覆盖明确设定；编辑库副本不修改项目角色；导入副本为新角色/变体/参考图 ID，`storageKey`/URL/尺寸保留，`sourceLibraryCharacterId` 记录来源，删除来源库条目不解绑项目副本。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-character-binding.test.ts`
Expected: 变体与引用副本测试失败。

- [ ] **Step 3: 建立基础角色与变体 UI**

创建 `ComicCharacterEditor` 并把项目设定页角色卡改用该组件。基础卡分“身份与视觉锚点 / 默认造型 / 行为与说话方式 / 保持与禁用”区域；变体列表支持新增、改名、改差异、选择/上传单张状态参考和删除。图片上传继续使用 `uploadImage(..., { localOnly: true })`，写入有 stable `id/revision` 的角色 reference；替换已有参考图时递增 revision。

- [ ] **Step 4: 角色库搜索与编辑**

库列表按姓名/身份搜索；编辑复用 `ComicCharacterEditor`；编辑库条目只更新库 store，项目副本不变；从库重新导入调用 `copyComicCharacterForProject` 生成新 ID 副本，不提供静默更新按钮。

- [ ] **Step 5: 运行测试、类型和 lint**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-character-binding.test.ts && bun run typecheck && bun run lint`
Expected: tests pass，0 warning。

- [ ] **Step 6: 角色与库 UI 阶段复核**

确认项目角色编辑和库编辑字段一致、库导入保持独立副本、reference storageKeys 保留；本步骤暂停，不执行 git add/commit。

### Task B5：Phase B 整体验收、文档与阶段复核

**Files:**
- Modify only if the Phase B implementation has user-testable behavior: `docs/progress/pending-test.md`

- [ ] **Step 1: 运行 comic 测试**

Run: `cd web && bun test "src/app/(user)/comic"`
Expected: comic tests pass。

- [ ] **Step 2: 运行类型与 lint**

Run: `cd web && bun run typecheck && bun run lint`
Expected: typecheck pass、0 warning。

- [ ] **Step 3: 浏览器验收**

手工验证基础角色新增/编辑/删除、主/脸/全身参考上传、具名变体增改删、每格多角色/变体选择、AI 拆格匹配/未知建议/忽略、旧项目建议绑定确认、角色库搜索编辑和副本独立性；不要在用户业务数据里创建或遗留测试项目，使用已备份并可恢复的测试数据。

- [ ] **Step 4: 记录实际变更**

将仅已实现的交互与未实测真实模型项追加到 pending-test；不更新 `features.md`，直到用户验收通过。

- [ ] **Step 5: Phase B 复核停点**

阶段测试与待测记录完成后暂停，等待用户决定下一阶段和提交方式；本步骤不执行 git add/commit。

---

## Phase C：统一生成编译与图片过期管理

### Task C1：角色 prompt 与参考图纯函数编译

**Files:**
- Modify: `web/src/app/(user)/comic/utils/comic-image-generation.ts`
- Test: `web/src/app/(user)/comic/utils/comic-image-generation.test.ts`

**Interfaces:**
- Produces: 同步 `buildComicPanelGenerationContext(project, page, panel, anchor?)` 返回 `{ prompt, referenceDescriptors, warnings, inputSignature }`；异步 `loadComicPanelReferences(referenceDescriptors)` 返回 `{ references, missingReferenceIds }`。
- `referenceDescriptors` 含 `{ id, revision, role, image: ComicImageRef }`；角色图用角色参考 ID/revision，页格锚点用 panel ID/其 inputSignature，场景引用用 location ID/storageKey；只有 loader 将图片解析为 `ReferenceImage.dataUrl`。
- `resolveComicPanelImageState(panel, currentInputSignature)` 返回 `current | stale | unrecorded | incomplete`。

- [ ] **Step 1: 写编译失败测试**

构造两名角色和三种变体，断言 prompt 只包含显式绑定角色；基础身份锚点与变体变化分段；`visualIdentity`（含迁移后的 description）、notes、性格、说话方式、表情基调、固定道具、mustKeep/forbidden 都进入语义正确的分段；未绑定角色不得进入 prompt。

- [ ] **Step 2: 写参考图预算失败测试**

断言绑定顺序决定角色顺序；每个角色主参考优先；最多 5 张且 anchor 计入；预算不够时按规格优先级裁剪并产生 warning；variant reference 不替换 primary；storageKey 读取失败的图被排除并报告；场景候选只由当前已有名称匹配规则产生且不超过角色图之后的预算。

- [ ] **Step 3: 写签名失败测试**

同一规范化上下文得到同一 `inputSignature`；角色/变体/绑定/画风/描述/参考图 revision/模型/size 任一变化都会改变签名；不包含 Data URL 和临时 blob URL。断言只比较固定字段顺序 JSON 字符串，不要求密码学哈希。

```ts
const compiled = buildComicPanelGenerationContext(project, page, page.panels[0]!);
assert.match(compiled.prompt, /林夏/);
assert.match(compiled.prompt, /本次变化/);
assert.doesNotMatch(compiled.prompt, /未绑定角色/);
assert.ok(compiled.referenceDescriptors.length <= 5);
assert.doesNotMatch(compiled.inputSignature, /data:image|blob:/);
const repeated = buildComicPanelGenerationContext(project, page, page.panels[0]!);
assert.equal(repeated.inputSignature, compiled.inputSignature);
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-image-generation.test.ts`
Expected: 新编译器接口不存在，测试失败。

- [ ] **Step 5: 实现同步上下文编译器与参考预算**

按 spec 顺序拼 prompt 分段；用绑定而非字符串 contains 选角色；同步生成 descriptors、warnings 和固定字段顺序 JSON `inputSignature`。5 图预算按角色身份优先级裁剪；不在同步函数中读取 Data URL。

- [ ] **Step 6: 实现异步参考图 loader 与状态派生**

`loadComicPanelReferences` 只加载已选 descriptors，返回成功 ReferenceImage 和 missingReferenceIds；`resolveComicPanelImageState` 同步比较 inputSignature，并把当时存在 missing IDs 的图判为 incomplete。

- [ ] **Step 7: 运行纯逻辑测试**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-image-generation.test.ts`
Expected: 所有 prompt/reference/signature/status 测试通过。

- [ ] **Step 8: 阶段复核**

检查旧 prompt builder 与 reference collector 已移除且只有一个编译路径；核对 5 图预算、anchor 优先级、签名对 JSON 往返稳定；本任务不自动提交。

### Task C2：页格生成接入编译结果和状态显示

**Files:**
- Modify: `web/src/app/(user)/comic/[id]/components/comic-layout-stage.tsx`
- Modify: `web/src/app/(user)/comic/utils/comic-image-generation.ts`
- Test: `web/src/app/(user)/comic/utils/comic-image-generation.test.ts`

**Interfaces:**
- Produces: `createComicGenerationContext(compiled, references, missingReferenceIds, model, size): ComicGenerationContext`；取 `compiled.prompt/inputSignature/compilerVersion`，references 只含 loader 成功产物。
- Produces: `createComicGeneratedPanelImage(image: ComicImageRef, context: ComicGenerationContext): ComicGeneratedPanelImage`，避免 UI 手拼元数据。

- [ ] **Step 1: 写接入行为测试**

测试成功结果由 `createComicGenerationContext` 保存 inputSignature/prompt/成功 references/missing IDs/model/size/createdAt；失败只写 `imageError` 不伪造上下文；首格锚点描述符传入同一编译器预算；`createComicGeneratedPanelImage` 保留原图片 url/storageKey/width/height。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-image-generation.test.ts`
Expected: 生成上下文持久化断言失败。

- [ ] **Step 3: 更新顺序生成链路**

替换 `collectComicPanelReferences` / `buildComicPanelPrompt` 调用：先用 `buildComicPanelGenerationContext` 得到 prompt/descriptors/inputSignature，再用 `loadComicPanelReferences` 得到成功 references/missing IDs，最后 `requestImages` 使用它们；成功图通过 `createComicGenerationContext` 与 `createComicGeneratedPanelImage` 写入 generationContext。warning 显示在生成确认/进度区，可查看未使用或读取失败的参考图。

- [ ] **Step 4: 显示有效性状态**

布局页格卡使用 `resolveComicPanelImageState` 识别 `current / stale / unrecorded / incomplete`；旧图仍可查看，状态与原因明确展示，不把旧图伪装为当前设定生成。本任务不修改页面数据格式以外的画布漫画册逻辑。

- [ ] **Step 5: 运行测试与类型检查**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-image-generation.test.ts && bun run typecheck`
Expected: PASS。

- [ ] **Step 6: 生成链路阶段复核**

确认每格图保存 inputSignature、成功/失败参考记录，status UI 由签名派生；本步骤暂停，不执行 git add/commit。

### Task C3：统一上下文失效与过期图合成确认

**Files:**
- Modify: `web/src/app/(user)/comic/utils/comic-image-generation.ts`
- Modify: `web/src/app/(user)/comic/utils/comic-project.ts`
- Modify: `web/src/app/(user)/comic/[id]/components/comic-cast-stage.tsx`
- Modify: `web/src/app/(user)/comic/[id]/components/comic-script-stage.tsx`
- Modify: `web/src/app/(user)/comic/[id]/components/comic-layout-stage.tsx`
- Modify: `web/src/app/(user)/comic/utils/comic-page-composition.ts`
- Test: `web/src/app/(user)/comic/utils/comic-project.test.ts`
- Test: `web/src/app/(user)/comic/utils/comic-image-generation.test.ts`

**Interfaces:**
- Produces: `comicPageCompositionWarnings(project, page): { stalePanelIds, unrecordedPanelIds, incompletePanelIds }`，同步纯函数，使用每格当前 inputSignature 和 `resolveComicPanelImageState`。
- Produces: `assertComicPageCompositionConfirmed(project, page, confirmedPanelIds: string[]): void`，对未确认的 stale/unrecorded panel 抛出可读错误；incomplete 不阻断。
- `composeComicPage(project, page, options?: { confirmedPanelIds?: string[] })` 先调用上述断言；成功后写入 pageImage 与 compositionContext（含 stale/unrecorded/incomplete IDs）。

- [ ] **Step 1: 写失效纯函数失败测试**

角色基础/变体/绑定/prompt 输入改变时，`resolveComicPanelImageState` 对受影响 panel 返回 stale，但 image bytes/storageKey 与 generationContext 保留；无关角色或无关页格改变不使其他图过期；变体引用失效不会删图；只有相关页的 pageImage 与 compositionContext 清空。测试状态优先级：无上下文→unrecorded；签名不同→stale；签名相同且有 missingReferenceIds→incomplete；其余→current。

```ts
assert.equal(resolveComicPanelImageState({ ...panel, image: undefined }, "sig"), "unrecorded");
assert.equal(resolveComicPanelImageState({ ...panel, image: { ...image, generationContext: { ...context, inputSignature: "old" } } }, "new"), "stale");
assert.equal(resolveComicPanelImageState({ ...panel, image: { ...image, generationContext: { ...context, inputSignature: "new", missingReferenceIds: ["ref"] } } }, "new"), "incomplete");
assert.equal(resolveComicPanelImageState({ ...panel, image: { ...image, generationContext: { ...context, inputSignature: "new", missingReferenceIds: [] } } }, "new"), "current");
```

- [ ] **Step 2: 写合成警告/确认失败测试**

`comicPageCompositionWarnings` 只返回非 current 页格并分类；无 warning 时断言通过；有 stale/unrecorded 且未确认时 `assertComicPageCompositionConfirmed` 抛错；确认列表包含对应 panel IDs 时通过；incomplete 只警告不阻断。Node 测试覆盖 warning/resolve/allowlist 纯函数，实际 canvas 像素合成由 C4 浏览器验收。

- [ ] **Step 3: 运行测试确认失败**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-project.test.ts src/app/\(user\)/comic/utils/comic-image-generation.test.ts`
Expected: 状态/警告/确认 allowlist 断言失败。

- [ ] **Step 4: 实现输入签名比较与定向 pageImage 失效**

用纯同步 `buildComicPanelGenerationContext` 为受影响绑定计算当前 inputSignature，`resolveComicPanelImageState` 比较生成上下文并派生状态；保留 panel image 与 generationContext，不写 stale flag。角色/变体编辑只检查引用该实体的 panel，页格输入变化只检查所属 panel；如受影响 panel 所在页有 pageImage，则清空 pageImage 与 compositionContext。

- [ ] **Step 5: 实现合成前确认**

`comicPageCompositionWarnings(project, page)` 返回 stale/unrecorded/incomplete panel IDs。无 warnings 时保持现有合成；有 stale/unrecorded 时先展示列表并询问是否继续；取消不改数据。用户确认后将该列表传入 `composeComicPage(project, page, { confirmedPanelIds })`；合成函数拒绝任何未在 allowlist 中的 stale/unrecorded panel。合成成功后存 `page.compositionContext` 的 stale/unrecorded/incomplete IDs 和确认时间，UI 显示该成品包含旧上下文图或不完整参考图。

- [ ] **Step 6: 运行测试与阶段复核**

Run: `cd web && bun test src/app/\(user\)/comic/utils/comic-project.test.ts src/app/\(user\)/comic/utils/comic-image-generation.test.ts && bun run typecheck`
Expected: PASS；检查 pageImage 只存合成结果与 compositionContext，不存第二份输入签名。本任务不自动提交。

### Task C4：真实模型验收、测试、文档与阶段收尾

**Files:**
- Modify only for verified behavior: `docs/progress/pending-test.md`
- Modify `docs/overview/features.md` only after the user confirms acceptance.

- [ ] **Step 1: 运行漫画相关测试**

Run: `cd web && bun test "src/app/(user)/comic"`
Expected: PASS。

- [ ] **Step 2: 运行全量类型、lint、测试**

Run: `cd web && bun run typecheck && bun run lint && bun test`
Expected: typecheck PASS、lint 0 warning、全量测试 PASS。

- [ ] **Step 3: 浏览器验收数据/交互**

使用可恢复测试项目验证旧角色一次性整理、参考图包、变体继承、页格绑定/待处理建议、角色库独立副本、变体/绑定修改后的旧图保留与状态、过期页合成确认/取消。检查桌面与 390px 窄屏，不修改用户真实漫画项目。

- [ ] **Step 4: 真实模型验收**

对同一角色连续生成多格、同一角色在基础造型与具名变体中生成、多角色同格生成；检查身份锚点不漂、变化仅发生在变体指定部分、最多 5 张参考图排序正确、超额时身份参考不被首格锚点挤掉。

- [ ] **Step 5: 记录待测与验收状态**

将未实测模型质量、UI 与数据迁移范围记入 pending-test；只有用户明确确认通过后才更新正式 `features.md`。

- [ ] **Step 6: 最终验收复核**

将实际未测范围写入 pending-test，用户确认通过后再更新 features；本步骤不自动提交或推送。
