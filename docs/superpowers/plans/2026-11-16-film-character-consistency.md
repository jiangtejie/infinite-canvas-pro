# 影视角色跨分镜一致性落地方案

> **执行者必读：** 按 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐任务实施；每个任务完成后独立复核。步骤使用 checkbox 跟踪。

**目标：** 让每个影视镜头显式绑定角色与造型状态，并让图片/视频生成使用同一份可追踪的角色、连续性与参考图上下文。

**架构：** 保留影视角色工作台的部位参考和场记流程，不与漫画工作台合并。影视侧用角色签名描述当前设定版本、用镜头绑定表达角色/状态、用一个生成上下文编译器为图片与视频选择参考并保存输入快照；镜头媒体历史持有生成上下文，因此角色改动后能判断旧媒体是否过期。

**技术栈：** Next.js App Router、React、TypeScript、Zustand、Ant Design、现有图片/视频任务 API、Bun test。

**规格来源：** 当前对话已确认的“影视角色绑定 + 统一生成上下文 + 角色版本签名 + 结构化镜头状态 + 有配额的参考选择”方向；本批仅创建实施方案，不另建 Spec，不修改业务代码。

## 全局约束

- 角色身份、角色状态、镜头连续性分层：身份由角色资产拥有，造型/身体/情绪状态由具名角色状态和镜头绑定表达，镜头间位置/道具/环境承接仍由场记数据表达。
- `FilmShot.characterIds` 直接替换为 `characterBindings`；不保留双读、旧字段回退或兼容迁移。同步更新所有生产写入点、导入流程和测试夹具。
- 角色与镜头绑定使用稳定 ID；展示名称快照只用于角色删除后的可读性，不参与角色身份判断。
- 图片与视频调用同一个镜头生成上下文编译器；不维护两套角色提示词/参考图实现。
- 角色/状态/参考图变更只让生成签名变化，不删除已有分镜图或视频；媒体历史保留对应生成快照。
- 角色库导入和项目导入必须深拷贝嵌套资料并重建资产 ID；库编辑不静默覆盖已导入项目。
- 不新增多人协作、角色审批、自动双向同步、模型质量评分或第二套角色库。
- 遵循 `agents.md`：不做无关重构；变更完成后检查 `docs/progress/todo.md` 与 `docs/progress/pending-test.md` 是否需要同步；浏览器时序/真实模型效果标注未实测。

---

## 文件结构与职责

### 修改与新增

- `web/src/lib/film/types.ts`：新增角色别名、角色状态、镜头角色绑定、角色快照、生成参考和生成上下文类型；移除 `FilmShot.characterIds`，替换为 `characterBindings`；媒体版本记录其生成上下文。
- `web/src/app/(user)/film/utils/film-character.ts`：保留角色部位与参考图工具；负责角色设定签名、状态查找、当前角色图卡是否过期等纯逻辑。
- `web/src/app/(user)/film/utils/film-character.test.ts`：覆盖签名变化、状态继承、角色卡过期条件和部位参考选择。
- `web/src/app/(user)/film/utils/film-cast-bind.ts`：实现带别名、最长唯一精确匹配的绑定建议；只将唯一明确匹配写成正式绑定。
- `web/src/app/(user)/film/utils/film-cast-bind.test.ts`：覆盖姓名/别名、名称包含、歧义、手动绑定保留及未匹配候选。
- `web/src/app/(user)/film/utils/film-binding-check.ts`：检查镜头提到已知角色但未绑定、绑定角色已删除、状态不属于角色等问题。
- `web/src/app/(user)/film/utils/film-binding-check.test.ts`：覆盖上述检查规则。
- `web/src/app/(user)/film/utils/film-shot-generation.ts`（新增）：唯一的纯生成上下文编译器；编译角色身份/状态、镜头提示、场记、风格、参考图优先级、签名及可读 warnings。
- `web/src/app/(user)/film/utils/film-shot-generation.test.ts`（新增）：覆盖图像/视频共用角色上下文、状态覆盖、角色参考最低配额、动态预算、遗漏说明、签名变化与稳定性。
- `web/src/app/(user)/film/utils/film-references.ts`：仅负责加载编译器选定的参考图并回报成功/缺失，不再自行决定角色引用顺序或拼接角色 hints。
- `web/src/app/(user)/film/utils/film-versions.ts`：图片/视频版本写入 `FilmGenerationContext`，生成结果不再只有 URL。
- `web/src/app/(user)/film/utils/film-versions.test.ts`：验证媒体版本与上下文一一对应，旧图版本保持不变。
- `web/src/app/(user)/film/hooks/use-film-shot-image.ts`：调用统一编译器和参考加载器；提交任务时把上下文快照写入 pending task；成功后写入媒体版本。
- `web/src/app/(user)/film/hooks/use-film-shot-video.ts`：与图片走同一编译器；首尾帧模式继续按视频 API 的帧输入契约发送，同时把帧 ID 纳入上下文。
- `web/src/app/(user)/film/hooks/use-film-task-recovery.ts`：任务恢复完成时使用 pending task 保存的上下文写入图片/视频版本。
- `web/src/app/(user)/film/utils/film-continuity-sheet.ts`：把镜头绑定中的角色状态编译进场记提示；角色/状态绑定作为角色事实真源，交接单保留跨镜承接信息。
- `web/src/app/(user)/film/utils/film-continuity-sheet.test.ts`：验证场记提示可包含绑定的角色/状态，且上一镜查找保持既有行为。
- `web/src/app/(user)/film/components/film-character-workspace.tsx`：增加角色别名和具名状态的增改删；完善角色签名变化后的角色卡过期反馈。
- `web/src/app/(user)/film/components/film-shot-detail.tsx`：用角色绑定编辑器替代 `characterIds` 多选；显示绑定状态、角色签名和当前媒体上下文状态。
- `web/src/app/(user)/film/components/film-shot-video-panel.tsx`：从正式绑定读取角色名称和状态，不再单独维护字符 ID 映射。
- `web/src/app/(user)/film/components/film-script-stage.tsx`、`film-script-source.tsx`：让剧本导入、追加和自动绑定使用新绑定结果。
- `web/src/app/(user)/film/utils/film-ai-consistency.ts`：一致性审阅上下文包含角色身份、绑定状态与版本签名；问题仍定位到镜头，不新增独立审阅实体。
- `web/src/app/(user)/film/utils/film-ai-consistency.test.ts`：验证审阅输入包含绑定角色/状态和未绑定角色线索。
- `web/src/app/(user)/film/components/film-consistency-review-modal.tsx`：显示角色身份/造型/连续性类别和镜头定位，沿用现有 review issue 模型。
- `web/src/stores/use-film-cast-store.ts`、`web/src/app/(user)/film/utils/film-edits.ts`：深拷贝角色库/项目资产并保留来源资产 ID，不共享嵌套对象。
- `web/src/app/(user)/film/utils/film-cast-bind.test.ts` 或新增 `film-edits.test.ts`：验证嵌套隔离与来源 ID。
- `web/src/services/storage-references.ts`、对应测试：确认角色状态参考图、历史角色卡和媒体上下文引用都阻止误清理。
- 所有 `web/src` 中 `characterIds` 生产调用点及影视测试夹具：统一迁移为 `characterBindings`，不留下旧字段读取。
- `docs/progress/pending-test.md`：记录实现的用户可测变更和真实模型/跨镜视觉效果未实测项；`docs/progress/todo.md` 仅在现有待办被完成或新增时调整。

### 保持不变

- `comic/` 角色结构与漫画生成链路；影视只借鉴显式绑定和生成上下文追踪，不共享跨产品数据模型。
- 影视场景、分支、结构计划、导演风格、视频首尾帧 API 契约。
- 已有生成媒体历史版本保留策略，不为角色一致性重做媒体存储层。

---

## Phase A：建立角色状态与绑定模型

### Task A1：角色状态、绑定和上下文类型

**Files:**
- Modify: `web/src/lib/film/types.ts`
- Modify: `web/src/app/(user)/film/utils/film-character.ts`
- Test: `web/src/app/(user)/film/utils/film-character.test.ts`

**Interfaces:**

```ts
export type FilmCharacterState = {
    id: string;
    name: string;
    description: string;
    outfit: string;
    physicalCondition: string;
    heldProps: string[];
    referenceImage?: FilmImageRef;
};

export type FilmShotCharacterBinding = {
    characterId: string;
    stateId?: string;
    source: "manual" | "ai";
    characterNameSnapshot: string;
    stateNameSnapshot?: string;
    continuity: {
        outfit?: string;
        physicalCondition?: string;
        heldProps?: string[];
        emotion?: string;
        intentionalChange?: string;
    };
};

export type FilmCharacterGenerationSnapshot = {
    characterId: string;
    characterName: string;
    characterSignature: string;
    stateId?: string;
    stateName?: string;
    prompt: string;
    references: FilmGenerationReference[];
};

export type FilmGenerationContext = {
    inputSignature: string;
    compilerVersion: string;
    prompt: string;
    characters: FilmCharacterGenerationSnapshot[];
    references: FilmGenerationReference[];
    missingReferenceIds: string[];
    previousShotId?: string;
    anchorShotId?: string;
    createdAt: string;
};
```

- `FilmAsset` 增加 `aliases: string[]` 和可选 `sourceLibraryAssetId`。
- `FilmCharacterProfile` 增加 `states: FilmCharacterState[]`；现有基础身份/部位/道具字段继续作为身份包来源。
- `FilmShot.characterIds` 删除，改为 `characterBindings: FilmShotCharacterBinding[]`。
- `FilmMediaVersion` 增加可选 `generationContext`；pending shot task 保存提交时的 `generationContext`，角色资产任务不带此字段。
- `filmCharacterSignature(asset)` 返回基于角色身份文本、部位 prompt/notes/锁定图 ID、道具描述/图片 ID、角色状态及状态参考图 ID 的规范 JSON 字符串；签名不包含生成中的临时 UI 状态。

- [ ] **Step 1：先补失败测试**

在 `film-character.test.ts` 增加断言：只改角色别名、描述、部位提示、部位图 ID、道具描述、状态服装或状态参考图 ID 时，`filmCharacterSignature` 改变；同一对象不变时签名稳定；状态查找只接受当前角色自己的 `stateId`。

- [ ] **Step 2：运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/film/utils/film-character.test.ts"`
Expected: 新增签名和状态查找断言失败。

- [ ] **Step 3：定义类型和最小纯函数**

新增类型与 `filmCharacterSignature(asset)`、`findFilmCharacterState(asset, stateId)`。使用明确字段构造规范输入对象并 `JSON.stringify`；不遍历任意对象、不引入散列库、不加入旧结构兼容器。

- [ ] **Step 4：运行角色模型测试**

Run: `cd web && bun test "src/app/(user)/film/utils/film-character.test.ts"`
Expected: 新增及既有角色参考测试通过。

### Task A2：角色状态编辑和角色卡签名

**Files:**
- Modify: `web/src/app/(user)/film/components/film-character-workspace.tsx`
- Modify: `web/src/app/(user)/film/utils/film-character.ts`
- Modify: `web/src/app/(user)/film/utils/film-character-card.ts`
- Test: `web/src/app/(user)/film/utils/film-character.test.ts`

**Interfaces:**
- `createCharacterState(index): FilmCharacterState` 创建空具名状态。
- `characterCardSignature(asset)` 使用同一角色签名函数，不另造一套字段清单。
- 角色工作台状态编辑只负责状态字段和单张状态参考图；新增/编辑/删除均保存在当前角色资产。

- [ ] **Step 1：测试角色卡过期签名**

断言角色描述、部位提示、部位参考图、道具描述、状态设定变化会令角色卡过期；只改与视觉无关的 pending task 信息不改变签名。

- [ ] **Step 2：运行目标测试确认失败**

Run: `cd web && bun test "src/app/(user)/film/utils/film-character.test.ts"`
Expected: 现有签名遗漏的文字字段断言失败。

- [ ] **Step 3：加入状态编辑并接入签名**

在现有角色工作台角色资料区增加简洁的“造型状态”列表：名称、适用说明、服装、身体状态、持有道具、单张状态参考图；由同一角色 `patchCharacter` 写回，不新增独立 store 或状态编辑器转发组件。删除状态时，已有镜头绑定保留名称快照并在镜头绑定检查中显示为待修复。

- [ ] **Step 4：运行角色测试**

Run: `cd web && bun test "src/app/(user)/film/utils/film-character.test.ts"`
Expected: 签名和角色状态纯逻辑测试通过。

- [ ] **Step 5：界面阶段复核**

确认状态属于单一角色、状态参考图进入存储引用收集、角色卡在文字或图片设定变化时准确显示需更新；不增加多个并列角色卡真源。

### Task A3：统一镜头绑定并替换旧字段

**Files:**
- Modify: `web/src/app/(user)/film/utils/film-cast-bind.ts`
- Modify: `web/src/app/(user)/film/utils/film-cast-bind.test.ts`
- Modify: `web/src/app/(user)/film/utils/film-binding-check.ts`
- Modify: `web/src/app/(user)/film/utils/film-binding-check.test.ts`
- Modify: `web/src/app/(user)/film/components/film-shot-detail.tsx`
- Modify: `web/src/app/(user)/film/components/film-shot-video-panel.tsx`
- Modify: `web/src/app/(user)/film/components/film-script-stage.tsx`
- Modify: `web/src/app/(user)/film/components/film-script-source.tsx`
- Modify: `web/src/lib/film/types.ts`
- Modify: all remaining `web/src` production/tests files that read or write `characterIds`

**Interfaces:**
- `suggestFilmCastBindings(episodes, characters, locations)` returns `{ episodes, boundCharacters, boundLocations, characterSuggestions }`.
- Character suggestion is promoted only when the normalized full name or alias has exactly one owner and is not a shorter substring of another matched name.
- `setFilmShotCharacterBindings(shot, bindings, characters)` validates each character/state pair and writes stable IDs plus name snapshots.

- [ ] **Step 1：为绑定行为补失败测试**

覆盖：唯一姓名、唯一别名、同名角色歧义不绑定、长名称优先、已有人工绑定不覆盖、有效状态只接受所属角色、状态已删除时快照仍可展示。

- [ ] **Step 2：运行绑定测试确认失败**

Run: `cd web && bun test "src/app/(user)/film/utils/film-cast-bind.test.ts" "src/app/(user)/film/utils/film-binding-check.test.ts"`
Expected: 新测试失败，指出别名/歧义/状态绑定逻辑尚未实现。

- [ ] **Step 3：实现纯绑定与检查函数**

名称比较使用 `normalize("NFKC").trim()`；正式绑定只写精确唯一匹配；未知/歧义保留建议，不创建虚假角色；检查输出按镜头 ID 和角色 ID 稳定去重。

- [ ] **Step 4：替换所有 `characterIds` UI 和写入点**

镜头详情用 `characterBindings` 展示角色名、基础/具名状态选择和紧凑的服装/身体/情绪/道具变化字段；脚本导入/追加/自动绑定调用同一绑定函数。删除 `characterIds` 类型和所有生产读取，不做双字段映射。

- [ ] **Step 5：运行绑定测试并搜索旧字段**

Run: `cd web && bun test "src/app/(user)/film/utils/film-cast-bind.test.ts" "src/app/(user)/film/utils/film-binding-check.test.ts"`
Expected: 两组测试通过。

Run: 在 `web/src` 搜索 `characterIds`。
Expected: 生产代码不再出现该标识；若某历史迁移工具确实保留它，先检查后直接删除无调用的旧路径，不新增兼容读取。

---

## Phase B：统一图片与视频生成上下文

### Task B1：创建唯一纯生成上下文编译器

**Files:**
- Create: `web/src/app/(user)/film/utils/film-shot-generation.ts`
- Create: `web/src/app/(user)/film/utils/film-shot-generation.test.ts`
- Modify: `web/src/app/(user)/film/utils/film-references.ts`
- Modify: `web/src/app/(user)/film/utils/film-continuity-sheet.ts`

**Interfaces:**

```ts
export type FilmGenerationReferenceRole =
    | "character-package"
    | "character-state"
    | "character-detail"
    | "location"
    | "previous-shot"
    | "anchor-shot"
    | "storyboard"
    | "first-frame"
    | "last-frame";

export type FilmGenerationReference = {
    id: string;
    revision: string;
    role: FilmGenerationReferenceRole;
    characterId?: string;
    label: string;
    image: FilmImageRef;
};

export function buildFilmShotGenerationContext(
    project: FilmProject,
    shot: FilmShot,
    options: {
        medium: "image" | "video";
        maxReferences: number;
        previousShot?: FilmShot;
        anchorShot?: FilmShot;
        includeStoryboard?: boolean;
        videoMode?: FilmVideoMode;
    },
): FilmPanelGenerationContext;

export async function loadFilmShotGenerationReferences(
    context: FilmPanelGenerationContext,
): Promise<FilmLoadedGenerationContext>;
```

- 先为每个已绑定角色分配一张身份包参考；如绑定角色数超过实际参考预算，返回明确的阻断原因，不静默丢弃某个角色身份。
- 预算剩余部分按“当前角色状态图 → 景别所需部位图/道具图 → 场景 → 上一镜 → 批次锚点/分镜图”分配；视频模型使用 `filmVideoReferenceLimit(model)` 的实际上限。
- 对每个角色编译身份描述、状态差异、镜头级连续性字段；所有参考和文本字段共同进入 `inputSignature`。
- 图片与视频公共身份文本来自同一个函数；视频专有时长/分段仍使用现有 `composeFilmVideoPrompt`，但角色状态只由公共编译器注入一次。
- 首尾帧模式遵循视频 API `firstFrame/lastFrame` 输入，不把帧图伪装成普通 references；帧引用仍写入 generation context。

- [ ] **Step 1：写编译器失败测试**

测试基础身份 + 状态 + 镜头连续性进入 prompt；图片和视频的身份段落相同；变更任一角色签名、状态、绑定、参考图、场记、上一镜或锚点都会改变签名；相同输入签名稳定；身份参考按角色最低配额保留，预算不足有明确错误；遗漏的次级参考出现在 warnings。

- [ ] **Step 2：运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/film/utils/film-shot-generation.test.ts"`
Expected: 因编译器不存在而失败。

- [ ] **Step 3：实现纯编译和排序**

纯编译器只生成提示文本、参考描述符、签名与 warnings，不读浏览器、不加载 Data URL、不调用模型。参考预算仅在一处实现；删除 `film-references.ts` 中重复的角色排序与角色提示拼装。

- [ ] **Step 4：实现参考加载器**

加载器按描述符顺序转换图片，返回成功引用、实际加载描述符和缺失 ID；不在加载失败时重新挑选另一套来源，不生成隐式回退图。

- [ ] **Step 5：运行生成上下文测试**

Run: `cd web && bun test "src/app/(user)/film/utils/film-shot-generation.test.ts"`
Expected: 所有纯编译和加载器测试通过。

### Task B2：图片/视频生成写入同一上下文快照

**Files:**
- Modify: `web/src/app/(user)/film/hooks/use-film-shot-image.ts`
- Modify: `web/src/app/(user)/film/hooks/use-film-shot-video.ts`
- Modify: `web/src/app/(user)/film/utils/film-versions.ts`
- Modify: `web/src/app/(user)/film/utils/film-versions.test.ts`
- Modify: `web/src/lib/film/types.ts`
- Modify: `web/src/app/(user)/film/hooks/use-film-task-recovery.ts`

**Interfaces:**
- `withImageVersion(shot, imageUrl, storageKey, context)` 和 `withVideoVersion(shot, videoUrl, storageKey, context)` 把 context 写进对应 `FilmMediaVersion`。
- 图片/视频 hook 在提交任务前构造编译结果和加载结果；任务恢复时使用任务中保存的同一 context，不重新读取“当前角色”冒充当时输入。

- [ ] **Step 1：扩展版本测试**

构造两个不同角色签名的连续版本，断言各自 `generationContext` 随对应 URL 一起留在历史项；选择旧版本时上下文仍与该版本关联；保留现有最多 6 个媒体版本规则。

- [ ] **Step 2：运行版本测试确认失败**

Run: `cd web && bun test "src/app/(user)/film/utils/film-versions.test.ts"`
Expected: 上下文写入断言失败。

- [ ] **Step 3：接入图片生成**

图片单镜、批量镜头共用编译器；上一镜与锚点作为编译器选项传入；在 `onTask` 时保存完整 context；生成成功使用该 context 调用 `withImageVersion`。

- [ ] **Step 4：接入视频生成**

参考模式使用相同角色上下文和预算策略；首尾帧模式使用相同角色提示文本与帧引用快照。视频分段 prompt 通过 `composeFilmVideoPrompt` 合成后纳入最终签名，不另行拼装角色信息。

- [ ] **Step 5：接入任务恢复与版本工具测试**

任务恢复将 pending task 的 context 传入版本写入函数；普通媒体资产任务不接触镜头上下文。运行：

Run: `cd web && bun test "src/app/(user)/film/utils/film-versions.test.ts" "src/app/(user)/film/utils/film-shot-generation.test.ts"`
Expected: 版本和上下文测试通过。

### Task B3：存储引用与角色库副本隔离

**Files:**
- Modify: `web/src/app/(user)/film/utils/film-edits.ts`
- Modify: `web/src/stores/use-film-cast-store.ts`
- Modify: `web/src/app/(user)/film/components/film-character-workspace.tsx`
- Modify: `web/src/services/storage-references.ts`
- Test: `web/src/app/(user)/film/utils/film-edits.test.ts` 或 `film-cast-bind.test.ts`
- Test: `web/src/services/storage-references.test.ts`

**Interfaces:**
- `importFilmAsset(assets, asset)` 深拷贝完整角色资产、为项目副本生成新 asset ID 并记录 `sourceLibraryAssetId`。
- `useFilmCastStore.addAsset` 深拷贝项目角色再写入角色库，库副本与来源项目互不共享对象引用。

- [ ] **Step 1：写隔离失败测试**

复制资产后修改嵌套 `parts.face.images`、`states`、`props`、生成包/角色卡和别名，断言来源对象完全不变；断言来源 ID 被记录且副本 ID 不同。

- [ ] **Step 2：扩展媒体引用测试**

给角色状态参考图、角色卡、角色包图和 `FilmGenerationContext.references` 设置同一 storageKey，断言全局清理收集器保留该 key。

- [ ] **Step 3：实现深拷贝和引用收集**

使用项目运行环境支持的 `structuredClone`；不手写递归克隆器。角色包/状态/媒体上下文都纳入既有引用收集入口，不新增平行媒体回收系统。

- [ ] **Step 4：运行隔离与存储测试**

Run: `cd web && bun test "src/app/(user)/film/utils/film-edits.test.ts" "src/services/storage-references.test.ts"`
Expected: 嵌套副本独立，仍被角色或媒体历史引用的图像不会被清理。

---

## Phase C：镜头状态展示与一致性审阅闭环

### Task C1：镜头图/视频历史显示当前性

**Files:**
- Modify: `web/src/app/(user)/film/components/film-shot-detail.tsx`
- Modify: `web/src/app/(user)/film/components/film-shot-video-panel.tsx`
- Modify: `web/src/app/(user)/film/utils/film-shot-generation.ts`
- Test: `web/src/app/(user)/film/utils/film-shot-generation.test.ts`

**Interfaces:**
- `resolveFilmMediaContextState(version, currentSignature): "unrecorded" | "stale" | "incomplete" | "current"` 根据版本 context 派生；不保存额外 stale 布尔值。
- 当前签名通过同一生成编译器按媒体类型和当前模型配置重新计算。

- [ ] **Step 1：写状态派生测试**

覆盖无 context、签名不一致、参考加载缺失、签名一致且参考完整四种结果。

- [ ] **Step 2：实现纯状态函数**

将状态函数放在 `film-shot-generation.ts`；历史列表每个版本只按其自身 context 显示状态，不将当前镜头状态覆盖到旧版本。

- [ ] **Step 3：在镜头 UI 显示精简状态**

镜头详情显示绑定角色的名称/状态及当前媒体的“当前 / 设定已变 / 参考缺失 / 未记录”；展开的生成信息提供实际 prompt、角色签名和已加载/缺失参考列表。不给状态再建单独持久化字段。

- [ ] **Step 4：运行状态测试并核对版本切换**

Run: `cd web && bun test "src/app/(user)/film/utils/film-shot-generation.test.ts" "src/app/(user)/film/utils/film-versions.test.ts"`
Expected: 当前图和历史图状态均按自己的 context 派生。

### Task C2：把角色状态纳入连续性检查

**Files:**
- Modify: `web/src/app/(user)/film/utils/film-continuity-sheet.ts`
- Modify: `web/src/app/(user)/film/utils/film-continuity-sheet.test.ts`
- Modify: `web/src/app/(user)/film/utils/film-ai-consistency.ts`
- Modify: `web/src/app/(user)/film/utils/film-ai-consistency.test.ts`
- Modify: `web/src/app/(user)/film/components/film-consistency-review-modal.tsx`
- Modify: `web/src/app/(user)/film/utils/film-binding-check.ts`

- [ ] **Step 1：测试角色状态进入审阅上下文**

断言一致性审阅输入包含每个镜头的角色 ID、别名/显示名、角色签名、绑定状态、镜头级服装/身体/道具/情绪变化；不再只传全项目角色名称。

- [ ] **Step 2：测试跨镜状态文本**

断言格式化场记提示按绑定角色输出具名状态与明确变化；未声明变化时将上一镜状态作为连续性要求，声明 `intentionalChange` 时允许本镜差异。

- [ ] **Step 3：实现输入与问题展示**

更新一致性代理提示词，使其分别检查身份漂移、造型/身体状态漂移、道具/场景连续性和绑定错误；结构化问题仍落在既有 `FilmConsistencyIssue`，不新建 review store。

- [ ] **Step 4：运行审阅和场记测试**

Run: `cd web && bun test "src/app/(user)/film/utils/film-continuity-sheet.test.ts" "src/app/(user)/film/utils/film-ai-consistency.test.ts" "src/app/(user)/film/utils/film-binding-check.test.ts"`
Expected: 状态编译、输入结构和镜头问题定位测试通过。

### Task C3：全量静态验证、文档和人工验收清单

**Files:**
- Modify only when actual scope requires it: `docs/progress/todo.md`
- Modify: `docs/progress/pending-test.md`
- No feature-doc update until user confirms acceptance.

- [ ] **Step 1：跑影视相关纯逻辑测试**

Run: `cd web && bun test "src/app/(user)/film/utils"`
Expected: 影视工具测试通过。

- [ ] **Step 2：按项目本轮执行约定处理类型/lint 验证**

Run only if requested by the user or execution-phase instructions permit it: `cd web && bun run typecheck && bun run lint`。
Expected: typecheck 通过、lint 无新增 warning。

- [ ] **Step 3：检查旧入口已完全删除**

搜索 `characterIds`、旧 `cardSignature` 的独立计算、`collectFilmShotReferences` 的旧调用形态。确认镜头角色绑定、图片/视频生成和媒体上下文没有双真源或备用旧路径。

- [ ] **Step 4：记录实际实现与未实测项**

在 pending-test 记录角色状态编辑、绑定建议、镜头版本状态、上下文回写与角色库隔离等真实变更。必须明确标记：真实图片/视频模型下的身份保持效果、批量跨镜头效果及浏览器真实交互尚未实测（若未实测）。不把代码测试通过写成真实模型效果通过。

- [ ] **Step 5：人工验收**

使用可恢复测试项目验证：同一角色跨镜多个镜头；基础造型到受伤/换装状态的显式变化；多角色镜头参考预算；角色修改后旧图标为过期且可查看；重新生成后新版本上下文正确；视频参考模式与首尾帧模式；任务刷新恢复保留提交时上下文；角色库导入副本隔离。不要在用户真实项目中创建或遗留测试数据。

---

## 顺序与停点

1. Phase A 先完成类型、角色状态和显式绑定；此时所有镜头均使用 `characterBindings`，不留 `characterIds` 兼容路径。
2. Phase B 再完成唯一生成编译器、图片/视频接入、任务恢复和 storageKey 保留；在它完成前不实现镜头过期展示，避免 UI 依赖临时生成字段。
3. Phase C 最后加状态派生和视觉审阅；不回头重建另一套角色包或生成配置。
4. 每个 Task 测试通过后作为可独立复核停点；不自动提交、不推送、不发布。
5. 真实模型验收是独立人工阶段；如果模型对身份/状态的保持效果不满足要求，应基于该阶段的具体失败样例调整提示和预算，不预先加入多层重试、降级或兜底机制。

## 方案自检

- 覆盖：角色状态、别名绑定、角色/状态签名、共享图片/视频编译器、参考预算、媒体上下文、任务恢复、角色库深拷贝、存储引用保护、连续性审阅与 UI 派生状态。
- 无旧数据迁移、无双字段兼容、无第二套状态真源；新数据只由当前结构写入。
- 测试命令针对当前仓库的 Bun test 结构；真实模型输出不以单元测试代替。
- 方案没有规定任何未授权的提交、推送、部署或真实用户数据写操作。
