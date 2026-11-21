# 影视创作并入画布节点（影视先行）设计

> 状态：2026-11-21 已确认。方向：影视工作台整体推翻，一个影视项目就是一份画布文档；工作台能力以视图、检查器、服务的形式保留。
> 硬约束：旧影视项目数据直接删除、不迁移；不保留第二套生成、任务、导出、同步；每批完成即删被替换代码；改造必须符合画布节点哲学。漫画在批次 4 另行设计。
> 2026-11-21 追加：影视默认入口改为 `/film/studio/[id]` 的 Studio 壳层，画布是同一文档的视图；详见 [Studio 壳层设计](2026-11-21-film-studio-shell-design.md)。

## 目标

1. 一个影视项目 = 一份 `CanvasProject`（`domain: "film"`），集/场/镜/资产/绑定/输出/任务全部在节点与边上。
2. 没有独立阶段页：脚本、选角、分镜、剪辑变成同一文档上的视图切换与检查器。
3. 绑定真源在边，资产真源在资产节点与母版库，风格每份文档唯一节点。
4. 生成、批量、任务恢复、导出、账号同步全部收口到画布既有能力。
5. 旧 `FilmProject` 存储、旧 `film-projects` 同步域、旧影视独立任务与阶段代码全部删除。

## 当前边界

- 旧数据不迁移（用户已确认）：旧本地项目、云端 `film_project_data` 不再读写，本地键在批次 3 清理，云端列在批次 3 删除。
- 影视母版库（`film-library`、角色/场景/道具/服装/风格库）保留，它不是工作台数据；仅影视项目数据删除。
- 不新增成片导出能力：保持顺序预览；影视 JSON 备份由画布项目导出替代，不保留第二条备份路径。
- 不验证真实模型画面效果、真实 S3/WebDAV 跨设备读取；相关项在 pending-test 标注未实测。
- 漫画页布局、页格绑定在批次 4，另写 spec；本期不动漫画。
- 影视专属 Agent 工具不在本期；画布通用节点工具可正常使用。

## 一、目标形态

### 文档与入口

- `CanvasProject` 增加 `domain?: "film"` 与 `film?: CanvasFilmMeta`；影视数据不再写入独立 store。
- `/film` 是影视主入口：影视画布区（画布 store 的 `domain === "film"`）、新建影视画布与母版库入口。
- `/film/studio/[id]` 是影视画布的正式入口，默认 Studio 壳层（单镜舞台 + 胶片条 + 镜头设置）；`/film/[id]` 旧工作台保留到批次 3。
- `/canvas` 列表排除 `domain === "film"` 的文档；`/canvas/[id]` 打开影视文档时重定向到 `/film/studio/[id]`，避免同一项目两个入口。
- `/film/library` 保留，继续使用现有影视母版库 store 与同步域。

### 影视模式

- 节点面板：剧本、场次、镜头、角色/场景/道具/服装/风格资产节点、镜头组（复用分组）；其余通用节点（图片/视频/音频/导演/文本/发布等）保持可用。
- 默认 Studio：单镜舞台 + 底部胶片条 + 左侧镜头设置；顶部浮动切换 Studio / 画布。
- 视图：Studio / 画布（无限画布与检查器）/ 镜头表 / 故事板板 / 时间轴；后三者批次 2。
- 阶段推进（脚本→选角→分镜→剪辑）不再持久化，也不做强制关卡；门禁降为批量生成前、审阅前的检查确认。

## 二、数据模型

### 2.1 文档

```ts
export type CanvasFilmMeta = {
    aspect: FilmAspect;
    stylePresetId: FilmStylePresetId;
    directorStyleId: string;
    targetDuration?: number;
    scriptProjectId?: string;
    scriptHash?: string;
    interactiveVariables?: FilmInteractiveVariable[];
    consistencyReview?: FilmConsistencyReview; // 检查结果缓存，不是真源
};
```

规则：

- `stage` 删除；当前视图是 UI 状态，不写入文档。
- 剧本正文在 `script` 节点；项目视觉风格内容在唯一的风格资产节点。`stylePresetId`、`directorStyleId` 只是渲染预设，不是风格内容，不构成第二真源。
- 文档层不再存 `visualStyle`、`episodes`、`characters`、`locations`、`props`、`costumes`、`style`、`shotGroups`、`shotConnections`、`scriptDocument`、`scriptAnalysis`、`structurePlan`。
- 集不是节点：场次/镜头节点带 `episodeId`、`episodeTitle`，按集分组只影响布局，不形成第二层容器。

### 2.2 节点

`CanvasNodeType` 新增 `script`、`scene`、`shot`、`filmAsset`。影视字段统一放在 `metadata.filmScript` / `filmScene` / `filmShot` / `filmAsset`，不污染通用字段。

**script**

```ts
type FilmScriptNodeData = {
    text: string;
    sourceScriptProjectId?: string;
    sourceScriptHash?: string;
    parseSnapshots: FilmParseSnapshot[]; // 最多 3 个
    structurePlan?: FilmStructurePlan;
};
```

- `FilmParseSnapshot` 保存本次解析产生的节点/边片段与节点 id；撤销即删除或还原该片段。
- 重新解析沿用现有「覆盖导入 / 追加导入」语义，并同步生成/替换节点与边。

**scene**

```ts
type FilmSceneNodeData = {
    episodeId: string;
    episodeTitle: string;
    name: string;
    location: string;
    time: string;
    mood: string;
    notes?: string;
};
```

**shot**

- 现有 `FilmShot` 字段原样迁入：`shotNo`、`shotType`、`cameraMovement`、`duration`、`description`、`dialogue`、`audio`、`prompt`、`negativePrompt`、`performance`、`soundDesign`、`coverage`、`composition`、`lighting`、`colorTone`、`lens`、`transition`、`branches`、`videoMode`、`characterSuggestions`、`variantSuggestions`、输出图/视频版本、生成签名、warnings、当前任务快照。
- 删除 `characterBindings`、`propBindings`、`locationId`、`locationVariantId`：绑定迁到边。
- 任务与输出沿用画布节点状态约定（status / taskId / error / url / storageKey / history），不再有影视独立任务结构。

**filmAsset**

- 五类资产（角色/场景/道具/服装/风格）统一一种节点，`assetKind` 区分；节点内保存现有 `FilmAsset` 副本与图槽位。
- 保留 `sourceLibraryAssetId`、`sourceLibraryUpdatedAt`，库更新提示继续比较快照。
- 槽位/版本池/当前版本/评分/锁定规则完全沿用，不新写一套。

**shotGroup 与风格**

- 镜头组复用现有分组节点与 `metadata.groupId`，不新增分组类型；4/9 镜一组只是 UI 约定。
- 风格节点是 `assetKind === "style"` 的资产节点，每份影视文档有且只有一个；创建项目时自动生成，删除/新增在命令层拒绝。

### 2.3 连接

```ts
export type CanvasConnectionKind = "binding" | "sequence" | "composition";

export type FilmBindingEdgeData = {
    stateId?: string;
    continuity?: {
        outfit?: string;
        physicalCondition?: string;
        heldProps?: string[];
        emotion?: string;
        intentionalChange?: string;
    };
    variantId?: string; // 场景变体
    source: "manual" | "ai";
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    kind?: CanvasConnectionKind;
    data?: FilmBindingEdgeData;
};
```

规则：

- `binding`：角色/场景/道具资产节点 → 镜头。角色/道具/场景 id 就是源节点 id；`characterNameSnapshot` 等快照字段删除，名称从资产节点读。
- 每个镜头最多一条场景绑定边；角色与道具可多条。
- 服装通过角色绑定的 `stateId` 与 `continuity.outfit` 表达，不单独连边；风格不连边，避免几十条噪音线。
- `sequence`：镜头 → 镜头，表达连续镜头顺序；禁止成环；顺序按边 + 画布位置派生。
- `composition`：场次 → 镜头，表达镜头归属；每个镜头有且只有一条。
- 只有 `binding` 边携带 `data`；`sequence`、`composition` 边不带数据。
- 删除节点级联删除相关边；删除 binding 边即解绑。
- 通用画布连接仍是 `kind` 未定义，不受影响。

### 2.4 读模型

- 影视读模型全部是纯函数 selector，放在 `web/src/app/(user)/canvas/[id]/lib/`：`selectFilmMeta`、`selectFilmScenes`、`selectFilmShots`、`selectShotContext`、`selectFilmReadiness`、`selectFilmConsistencyInput`、`selectLibraryUsage`。
- 读模型不持久化、不参与同步；`FilmProject` / `FilmShot` / `FilmEpisode` / `FilmScene` 运行时兼容层不保留。
- 旧 `FilmProject` 类型在批次 3 删除；`FilmAsset`、`FilmImageRef`、`FilmImageSlot` 等资产与媒体类型保留。

## 三、服务与数据流

### 3.1 剧本与 AI 拆镜

- 剧本节点打开大编辑器（复用 `film-script-stage` / `film-script-source` 的编辑与来源能力）。
- AI 拆镜命令读取剧本节点，生成场次/镜头节点与 composition/sequence 边；覆盖/追加语义保持现状。
- 解析快照保存本次生成的节点与边片段；撤销只处理该片段，保留最近 3 次。
- AI 角色/变体建议写进镜头节点；采纳建议 = 新建 binding 边，不自动改写资产事实。

### 3.2 编译器

- `buildFilmShotGenerationContext` 改为 `(document, shotNodeId, options)`，沿 binding 边收集上下文；每角色身份包配额、模型预算、参考图排序、warnings、签名规则全部沿用。
- 输入签名、媒体版本上下文状态仍挂在镜头节点；`resolveFilmMediaContextState` 逻辑不变。
- 唯一编译器，不新建第二套参考图拼装或提示词逻辑。

### 3.3 就绪与一致性

- `filmAssetReadiness` 改为 `(document, shotIds)`；批量生成与审阅前调用，不阻塞自由编辑。
- 结构覆盖、连续性、风格漂移、资产绑定检查沿用现有规则，输入改为图；结果缓存到 `film.consistencyReview`。
- 覆盖率按场次节点 + sequence 边计算，不再依赖 `episodes` 数组。

### 3.4 生成与任务

- 镜头出图/出视频使用画布任务与节点状态；单镜与批量同一套。
- 删除 `useFilmTaskRecovery` 与影视独立轮询；画布任务恢复覆盖镜头节点。
- `canvas-batch` 从「仅图片节点」扩展到镜头节点（图片 + 视频），保留提示词为空挡掉、组内节点收集、批量进度与计费口径。
- 批量改景别/时长/删除/分组属于节点命令，不改第二份列表。

### 3.5 资产与母版库

- 母版库、库条目、去重、从库更新、使用统计、反向引用全部保留；引用来源改为从文档图派生。
- 节点保存项目副本；库更新提示按 `sourceLibraryUpdatedAt` 比较，覆盖副本时保留节点 id 与来源关系。
- 资产节点生成、槽位编辑、版本/评分/锁定直接复用现有组件与规则。

### 3.6 账号同步

- 影视项目只走画布项目同步（`/api/v1/canvas/projects`、`/sync`、`/delete`），不再走 `/user-data/film-projects`。
- 画布同步已具备账号分区、游客接管、远端列表、`updatedAt` 合并；必须补齐：
  - 删除墓碑（复用 `lib/sync-tombstones`），防止其他设备把远端已删项目重新推回；
  - 媒体上云（复用 `services/media-promotion`、`services/film-media-sync` 的规则），同步前把本地 IndexedDB 媒体升级为云存储并重写 `storageKey`；
  - 现有断网退避、聚焦拉取、多标签写入语义保持不变。
- 后端批次 3 删除 `/user-data/film-projects` 路由、handler、repository 方法与 `FilmProjectData` 字段/列；`film-library` 同步与字段保留。数据库文档同步更新。
- 旧云端 `film_project_data` 数据随列删除，不做导入或兼容。

### 3.7 导出与备份

- 影视 JSON 备份删除，改用画布项目导出；不保留第二套序列化。
- 顺序预览沿用时间轴 + `film-edit-stage`；分镜表/图片包/成片导出不在本期，进入 todo。

## 四、视图与交互

### Studio 视图（默认）

- 单镜舞台 + 底部胶片条 + 左侧镜头设置，详见 [Studio 壳层设计](2026-11-21-film-studio-shell-design.md)。
- 舞台有图显示分镜图，无图显示空镜卡；胶片条按场分组、点击或键盘切换；左栏编辑当前镜头。
- 画布是 Studio 内的一个视图；切到画布不丢失当前镜头/场次。

### 画布视图（总览）

- 集/场为列锚点，镜头按 sequence 边纵向排列；场次节点在列首。
- 资产节点默认在左侧「上下文带」，风格节点固定一角；镜头组可折叠。
- 「按场整理」按 `episodeId` + 场次顺序 + sequence 排序自动分列，不改变数据。

### 镜头表

- 合并现有列表/表格两种视图，避免同数据两份。
- 列：镜号、场次、景别、运镜、时长、角色、场景、状态、就绪、过期；行内编辑写回镜头节点。
- 多选对接 `canvas-batch`；点行定位画布节点并高亮。

### 故事板板

- 4/9 镜一组；拖拽入组改 `groupId`；组卡片整组出图/出视频；复用 `film-shot-group-panel` 与 `canvas-batch-progress`。

### 时间轴

- 由 sequence 边派生顺序，展示时长、音频、出图/出视频状态；顺序预览沿用 `film-edit-stage`。

### 检查器

- 选中镜头：基础 / 表演·声音 / 画面 / 视频四标签，复用 `film-shot-detail`。
- 选中资产：五类资产工作区、槽位/版本/评分/锁定，复用现有工作区组件。
- 选中风格：style bible。
- 文档级：就绪检查、一致性检查、过期镜头、库更新提示、覆盖率；全部由 selector 计算。

## 五、批次与删除清单

### 批次 0：地基

- `CanvasProject` 增加 `domain/film`；`CanvasProject.updateProject` 补新字段。
- `CanvasConnection` 增加 `kind/data`；`CanvasNodeType` 增加影视节点枚举；metadata 增加影视 payload。
- `/canvas` 列表过滤 `domain`；通用画布行为不变。

### 批次 1：图原语（dev flag，不切用户入口）

- 新增剧本/场次/镜头/资产/风格节点 UI、连线规则、影视模式、按场整理。
- 新建影视项目 = 创建画布文档（剧本节点 + 风格节点 + 默认场次）。
- 单镜出图/出视频接入画布任务；编译器改图输入；资产节点与槽位编辑器接入。
- 此阶段影视模式只在开发开关后可见，旧工作台仍可用。

### 批次 1C：Studio 独立入口与壳层

- 新增 `/film/studio/[id]`、`CanvasEditor` 抽取、`/film` 影视画布入口与 `/canvas` 影视入口移除。
- Studio 左栏/舞台/胶片条、浮动视图切换、镜头追加、`film-selectors`/`film-node-patch`/`film-shot-create` 与单测。
- 详见 [Studio 壳层设计](2026-11-21-film-studio-shell-design.md)。

### 批次 2：视图与批量

- 镜头表、故事板板、时间轴、检查器；批量生成/改参数/分组。
- AI 拆镜写图与快照撤销；就绪/一致性/过期/库更新。
- 组件从 `FilmProject` props 改为节点选择器 + 命令；不保留兼容 props。

### 批次 3：切换与彻底删除

- `/film` 列表切画布 store；旧 `/film/[id]` 工作台删除，旧入口重定向到 `/film/studio/[id]`。
- 删除：`web/src/stores/use-film-store.ts`、影视项目页与阶段壳、`use-film-task-recovery`、项目级备份/解析/生成 hooks 中被画布命令替代的部分、`services/creative-sync.ts` 的 `film-projects` 域、`services/api/user-config.ts` 的影视项目接口、后端影视项目路由/handler/repository/model 字段与数据库列、`lib/film/types.ts` 中 `FilmProject/FilmEpisode/FilmScene/FilmShot/FilmShotConnection/FilmShotCharacterBinding/FilmShotPropBinding`。
- 保留：影视母版库及其同步、资产/媒体/槽位类型、可复用视图与检查器组件。
- 清理旧本地键；不做数据导入、不做旧字段兼容；更新 `docs/backend/backend-database.md`、`docs/progress/pending-test.md`、`docs/progress/todo.md`、`docs/overview/features.md`。

### 批次 4：漫画（后续）

- 页面节点 + 专用页编辑器 + 页格绑定；漫画工作台退成视图；复用同一画布文档、同步与任务模型。另写 spec。

## 六、验收与测试

### 主链验收

- 新建影视项目 → 剧本编辑/导入 → AI 拆场拆镜 → 资产节点与母版库 → 绑定边 → 单镜出图 → 视频 → 检查器就绪/过期提示 → 时间轴预览 → 刷新/重新登录后任务与数据恢复。

### 回归

- 通用画布节点、分组、批量、漫画册、发布、Agent、画布项目导出不受影响。
- 画布列表不出现影视项目；影视列表不出现通用画布。

### 同步

- 游客创建 → 登录接管；双账号隔离；删除墓碑防止复活；断网退避与聚焦拉取；本地媒体上云后跨设备可读。
- 真实模型效果与真实 S3/WebDAV 跨设备读取标注未实测。

### 性能与测试限制

- 100–300 节点的影视项目实测平移、缩放、批量与保存；沿用现有视口裁剪与派生索引。
- 隐藏帧无法验证 hover 时序、断点变化、定时器与 rAF；涉及这些的交互按 AGENTS 标注未实测。
- 单元测试覆盖 selector、绑定边、编译器图输入、快照撤销、就绪/一致性、批量目标、库使用统计、任务恢复。

## 七、风险与对策

- **面条图**：按场整理 + 镜头组折叠 + 镜头表兜底。
- **同步合并**：最大风险；以画布同步为主，移植墓碑与媒体上云，不新建第三套同步；补游客接管、双账号、断网回归。
- **性能**：大项目节点数与文档体积实测；不新增平行索引。
- **组件改造**：一次性把工作台组件改成节点选择器 + 命令，不保留 `FilmProject` 兼容层；改不动的组件直接删掉重写，避免双轨。
- **数据删除**：旧影视项目不可恢复；切换前如需留档，由用户自行使用现有 JSON 备份，产品不提供导入。

## 八、后续

- 漫画画布化（批次 4）。
- 分镜表/图片包/成片导出。
- 影视专属 Agent 工具与技能。
- 多用户审片与权限（当前单用户，价值低）。
