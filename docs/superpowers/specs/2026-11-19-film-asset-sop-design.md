# 影视资产沉淀 SOP 化改造设计（资产即画质版）

> 方向已确认：资产沉淀是重点板块，资产质量直接决定画质。对标真实电影剧组前制（角色妆发/服装组/场景气氛/关键道具/风格圣经），把影视资产改造成可长期打磨、可跨项目复用的母版体系。分五批实施。
> 本 spec 取代同日早先的「流程闭环版」设计；旧版批次划分作废。

## 目标

1. 参考图可长期打磨：每个图槽位都是「版本池 + 选定参考 + 锁定」，生成不覆盖历史，选优可回溯，来源可复现（prompt/模型/分辨率）。
2. 资产粒度对齐剧组部门：角色 / 场景 / 道具 / 服装 / 风格五类一等资产；场景有气氛变体，角色有表情集，服装跨角色复用。
3. 镜头绑定到「服装 / 气氛 / 表情」粒度，编译器按镜头语义取最匹配的参考图。
4. 资产库是持续增值的母版：存入去重、显式双向更新、标签与使用统计、成果回流。
5. 批量生产前有设定完成度门禁与按集拆件表；资产库与项目账号级持久化。

## 当前边界

- 库与项目保持「独立副本」语义，不做订阅式母版引用，不做自动双向同步；一致性靠显式「从库更新 / 推送到库」。
- `film-shot-generation.ts` 是唯一参考图编译器，只扩展不新建第二套。
- 项目未上线：模型直接按新设计改，不写旧字段兼容、迁移或清理代码；旧本地项目的废弃字段数据按项目约定丢弃。
- AI 只产出拆件与绑定建议，不自动创建或改写服装、气氛变体等正式设定事实（沿用漫画既定方向）；角色 / 场景 / 道具名称类事实仍按现有模式自动建 idle 资产。

## 一、统一媒体模型（地基）

### 唯一图片类型

升级现有 `FilmImageRef` 为全系统唯一图片类型（不新增平行的 AssetImage 类型）：

```ts
export type FilmImageRef = {
    id: string;
    url: string;
    storageKey?: string;
    source?: "upload" | "generated" | "asset" | "library" | "shot"; // 新增 shot：镜头成果回流
    label?: string;      // 表情名 / 视图名 / 细节部位名
    prompt?: string;     // 生成该图的提示词（可复现）
    model?: string;      // 生成模型标识
    width?: number;
    height?: number;
    rating?: 0 | 1 | 2 | 3; // 人工选优
    notes?: string;
    createdAt?: string;
};
```

### 图槽位

```ts
export type FilmImageSlot = {
    images: FilmImageRef[];   // 版本池，上限 12
    activeImageId?: string;   // 当前选定参考
    locked: boolean;          // 锁定后禁止再生成（沿用现有 locked 语义）
};
```

规则（纯函数实现 + 单测）：
- 生成成功追加版本并自动设为 active（保持现有「新图即当前」体验）；历史版本可随时重新选定。
- 版本池超 12 时淘汰最旧的非 active 版本；active 永不淘汰。
- 锁定只拦生成，不拦选优与评分。
- `activeSlotImage(slot)` 是唯一取图入口；编译器、角色卡、readiness 全部走它。

### 淘汰清单（直接删除，不留兼容）

| 旧设计 | 替代 |
|---|---|
| `FilmAsset.imageUrl / storageKey / views` 覆盖式主图 + 自由视图列表 | 资产 concept / views 槽位 |
| `FilmCharacterPart.images[] + locked` | `FilmCharacterPart = { slot: FilmImageSlot; prompt; notes }`（生成提示词与备注保留） |
| `masterViews / masterLocked` | master 槽位 |
| `card / cardSignature` 裸字段 | card 槽位（签名机制保留） |
| `FilmCharacterProfile.props` / `FilmCharacterProp` | `propIds` 引用项目道具资产 |
| `FilmCharacterState.outfit / heldProps` 文本、单张 `referenceImage` | `costumeId` + `heldPropIds` + state 槽位 |
| 场景无结构视图 | views 槽位（角度/细节，label 区分）+ 气氛变体 |

## 二、五类资产实体

`FilmAssetKind = "character" | "location" | "prop" | "costume" | "style"`。
`FilmAsset` 保留 id / name / aliases / description / visualPrompt / status / errorMessage / pendingTask / sourceLibraryAssetId / createdAt，新增 `updatedAt`；主图字段全部槽位化：

```ts
export type FilmAsset = {
    // ...上述公共字段
    concept: FilmImageSlot;          // 概念图 / 设定图（所有类型共有）
    views?: FilmImageSlot;           // 角度 / 细节参考（场景 / 道具 / 服装）
    character?: FilmCharacterProfile;
    location?: FilmLocationProfile;
    tags?: string[];                 // 库组织用
};

export type FilmCharacterProfile = {
    parts: Record<FilmCharacterPartKey, FilmCharacterPart>; // { slot: FilmImageSlot; prompt; notes }
    expressions: FilmImageSlot;      // 表情集：label = 喜/怒/哀/惊/平静…
    master: FilmImageSlot;           // 全身三视图合成
    card: FilmImageSlot;             // 角色卡（合成产物）
    cardSignature?: string;          // 合成时的设定签名，用于角色卡过期判定（沿用现机制）
    propIds: string[];               // 标志性道具 → project.props
    states: FilmCharacterState[];
};

export type FilmCharacterState = {
    id: string;
    name: string;
    description: string;
    costumeId?: string;              // → project.costumes
    condition: string;               // 状况：破损/血迹/湿身等（原 physicalCondition）
    heldPropIds: string[];           // → project.props
    look: FilmImageSlot;             // 该造型的专属参考（可选）
};

export type FilmLocationProfile = {
    variants: FilmLocationVariant[];
};

export type FilmLocationVariant = {
    id: string;
    name: string;                    // 如「夜·雨」
    timeOfDay?: string;
    weather?: string;
    mood?: string;
    description: string;
    concept: FilmImageSlot;
};
```

- `FilmProject`：新增 `props / costumes: FilmAsset[]`；`style?: FilmAsset`（项目唯一风格圣经，可存入库跨项目复用，导入即替换）。
- 服装是独立资产：concept = 服装设计图，views = 面料/配饰/鞋细节（label 区分）；一套服装可被多角色多造型引用。
- 风格圣经：concept 槽位放色彩/光影/质感参考（label 区分），`visualPrompt` 放风格规则文本。
- 角色卡合成（`film-character-card.ts`）改为：master + face + 当前造型服装细节 + propIds 道具图；签名机制沿用。

## 三、绑定链与编译器

### 镜头绑定

```ts
export type FilmShotPropBinding = { propId: string; propNameSnapshot: string; source: "manual" | "ai" };

export type FilmShot = {
    // ...现有字段
    propBindings: FilmShotPropBinding[];
    locationVariantId?: string;      // 场景气氛变体
};
```

- 角色 binding 结构不变（characterId + stateId + continuity）；造型通过 state 间接引用服装与道具。
- `binding.continuity.heldProps / outfit` 自由文本保留——它们描述本镜刻意变化，不是资产引用。
- 自动绑定（`film-cast-bind.ts`）：道具按名称/别名唯一命中；场景变体按场次 time/mood 与变体字段匹配建议，歧义留 suggestion 由用户确认。

### 编译器参考优先级

身份包（角色卡或 master active）为必选配额，超出模型上限直接报错（沿用现状）。secondary 队列按序：

1. 服装 concept active（造型引用了服装时）
2. 造型 look active（有专属参考时）
3. 道具 concept active（本镜绑定的道具）
4. 场景变体 concept active → 回退场景 concept active
5. 表情（按 `binding.continuity.emotion` 匹配 expressions 的 label）/ 景别细节（特写取 face，细节戏取 limbs/道具，沿用现规则）
6. 风格圣经参考（最多 2 张，预算不足最先丢）
7. 上一镜 / 锚点 / 分镜图（沿用现规则）

- 风格文本注入：`resolveFilmStyleText` 扩展为合并项目 visualStyle 与风格圣经 visualPrompt。
- `inputSignature` 纳入：propBindings、locationVariantId、服装/道具/变体/风格参考的 id 与 revision。
- 角色签名（`filmCharacterSignature`）纳入引用服装与道具资产的签名——服装母版被打磨更新后，引用它的镜头媒体状态点能感知「设定已变」。

## 四、批次 1：媒体模型 + 五类资产工作台

- 落地第一、二节全部模型与槽位纯函数（追加/选优/淘汰/锁定/取图），配单测。
- 角色工作台改造：部位/三视图/角色卡/表情集全部槽位化，版本对比 UI（缩略图条 + 选定 + 评分 + 锁定）；造型编辑改为服装选择 + 状况 + 持有道具多选。
- 场景工作台：concept + views 槽位化；气氛变体管理（新建/编辑/生成变体概念图）。
- 新组件：道具工作台、服装工作台（concept + 细节图，沿用场景工作台结构）、风格圣经面板（项目设置区，参考图 + 规则文本）。
- `use-film-asset-image` / `use-film-character-image` 生成回写全部改走槽位追加，记录 prompt/model/分辨率；任务恢复（`use-film-task-recovery`）target 扩展 costume/style/variant/expression。
- cast 阶段 tab：角色 / 场景 / 道具 / 服装；风格圣经在项目设置区。
- 剧本解析自动建 idle 道具资产（汇总 scenes[].props 去重，与角色/场景同模式）。

**验收**：五类资产可生成、对比、选优、锁定；刷新后版本池与任务恢复正确；旧覆盖式字段无残留引用。

## 五、批次 2：绑定链 + 编译器 + 拆件建议

- 落地第三节：镜头道具/变体绑定 UI 与自动绑定、编译器优先级与签名扩展。
- 剧本语义解析 payload 增加服装提示（角色 × 服装描述）与气氛提示；在剧本阶段以建议卡片呈现「一键建服装资产 / 一键建场景变体」，用户确认后才写入正式设定。
- 一致性审阅上下文（`film-ai-consistency.ts`）携带服装/道具/变体信息。

**验收**：夜戏绑定夜变体后参考图正确切换；服装更新后引用镜头显示「设定已变」；参考预算超限时按优先级丢弃并有 warning。

## 六、批次 3：沉淀闭环（母版库 + 回流 + 组织）

### 库去重与双向更新

- `use-film-cast-store` 五域：characters / locations / props / costumes / styles。
- 存入按 `sourceLibraryAssetId === asset.id` 去重：已有则原地更新（保留库 id，刷新 `updatedAt`），否则新增。按钮语义「存入 X 库 / 更新 X 库」。
- 「从库更新」：库条目覆盖项目副本内容，保留副本 id 与 sourceLibraryAssetId；「推送到库」：副本写回库条目，未入库等价存入。均走确认弹窗说明覆盖方向；推送时展示使用统计（见下）。
- 导入弹窗展示库 `updatedAt`；副本落后于库时工作台提示「库有更新」。

### 镜头成果回流

镜头媒体版本卡动作：
- 「设为造型参考」→ 本镜绑定角色 + 造型的 look 槽位（source: "shot"，记录镜号）；
- 「设为服装参考」→ 造型引用的服装 concept 槽位；
- 「设为场景参考」→ 本镜变体（无变体则场景 concept）；
- 「设为道具参考」→ 本镜绑定道具 concept；
- 「加入我的素材」→ 图片/视频版本调 `useAssetStore.addAsset`，携带 storageKey，source: "film"。
回流一律追加版本并自动 active，刷新目标资产 updatedAt；引用保护沿用现有影视覆盖。

### 库组织

- 库页面五 tab，统一搜索（名称/别名/标签）、编辑、删除确认、大图预览（对齐漫画角色库）。
- 条目展示：标签、来源项目名、updatedAt、使用统计（扫描影视项目中 sourceLibraryAssetId 指向该条目的副本数与其镜头绑定数）。
- 图片级血缘靠 prompt/model/source 字段天然可查，不另建血缘表。

**验收**：A 项目打磨服装 → 推库 → B 项目从库更新 → 引用镜头签名变化；重复存入只有一条；抽卡好图一键回流各类槽位；视频进「我的素材」。

## 七、批次 4：门禁与拆件表

- `film-asset-readiness.ts`（纯函数 + 单测）：统计全部镜头实际绑定的角色/服装/场景变体/道具；ready = 对应槽位有 active 参考（角色 = 身份包）。未绑定资产不拦；有 active 但未锁定仅提示不拦。
- 分镜批量出图/出视频提交前跑 readiness：缺项弹确认框，「去补全」（切 cast 并选中首个缺项）或「仍要继续」。单镜不拦。
- cast 阶段头部完成度摘要 + 拆件表抽屉：按集 × 资产出场矩阵（数据源 scriptAnalysis + 镜头绑定），标注 ready / 缺参考 / 未锁定 / 未建资产，缺项跳转工作台。

**验收**：缺参考在批量生产前暴露并可跳转补全；拆件表与解析结果一致。

## 八、批次 5：账号级资产库（云同步）

- 复用「我的素材」同步通道（`user-config.ts` fetch/sync 模式 + `account-storage.ts` 键控），两个独立数据域：影视项目列表、五类资产库。
- 冲突策略沿用「我的素材」现行方案（updatedAt 比较的整域覆盖）；项目与库条目每次写入维护 updatedAt。
- 登录接管：本地独有 id 保留，同 id 按 updatedAt 取新，与「我的素材」一致。
- 媒体走 storageKey 引用，同步不传 base64。
- 实施前单独出计划，细化同步时机（防抖/登出/多标签页）与失败重试。

**验收**：跨设备一致；游客数据登录后不丢；断网/未登录完全回落本地。

## 文档与回归

- 每批更新 `docs/progress/todo.md`、`docs/progress/pending-test.md`、`CHANGELOG.md` Unreleased；真实模型效果项标「未实测」。
- 每批跑前端全量回归；新增槽位/编译器/readiness/库去重单测。
- `docs/overview/features.md` 待用户测试确认后更新。

## 明确不做

- 库母版订阅 / 自动双向同步。
- 旧数据迁移代码。
- 影视 → 画布输送（云同步后另议）。
- 图片级血缘表、资产权限门禁（本地单用户无真实支撑）。