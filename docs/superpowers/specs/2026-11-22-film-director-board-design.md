# Film Director Board 影视导演板设计

> 状态：2026-11-22 已确认目标方向，待实施。
>
> 本设计基于当前影视画布实现、`docs/superpowers/specs/2026-11-21-film-as-canvas-design.md`、`docs/superpowers/specs/2026-11-21-film-studio-shell-design.md` 与本地 SketchShot 参考整理。目标不是继续给现有 Studio 增加功能，而是把影视画布重构为真正的影视专用导演板。
>
> 本设计保留“一个影视项目 = 一份 `CanvasProject`、单一同步/任务/媒体链路、旧影视数据不迁移”的硬约束；影视节点、视图和交互按本设计重做。SketchShot 只借鉴产品语法和交互，不复制代码、依赖或后端。

## 1. 目标与非目标

### 1.1 目标

1. 影视模式成为独立的领域交互，而不是通用画布叠加影视字段。
2. 镜头节点成为第一公民：折叠态可读，展开态可编辑、可查看上下文、可生成、可预览和可进入版本评审。
3. 场次、角色、场景、道具、风格和动作节拍成为有明确影视职责的上下文节点。
4. 画布只负责导演关系编排；镜头聚焦模式负责单镜沉浸创作；镜头表和故事板负责规模化浏览/排序；制作中心负责批量执行。
5. 所有视图和节点写入同一份节点/边数据，不产生第二份镜头列表、绑定列表、版本列表或任务链。
6. 通过影视专用快速创建和连线语法，让用户不必理解底层连接类型就能完成“新增镜头、创建后续镜头、引用角色、加入动作节拍”等动作。
7. 删除低价值或与线性影视范围冲突的概念：独立时间轴一级视图、互动分支、旧场记交接单、泛化 `filmAsset` 节点 UI、独立服装节点、重复批量入口。

### 1.2 非目标

- 不新增影视专用后端项目表、第二套 store、第二套任务轮询、第二套同步或第二套提示词编译器。
- 不复制 SketchShot 的图片生成节点、视频生成节点、TTS、数字人、视频编辑等完整工具箱。
- 不在本期实现完整 NLE、字幕/音频轨、成片导出、平台交付或多人审片权限。
- 不为当前已经存在的旧影视画布文档编写迁移器或兼容双轨；开发切换按项目既定规则硬切，旧数据不迁移。
- 不改漫画、通用画布、发布、素材源等非影视领域的领域交互。

## 2. 当前问题与设计依据

当前影视节点只是摘要卡，主要内容集中在 [web/src/app/(user)/canvas/components/film-node-card.tsx](../../../web/src/app/(user)/canvas/components/film-node-card.tsx)；镜头真正的字段、绑定、上下文和生成操作集中在 Studio 左栏 [web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx](../../../web/src/app/(user)/canvas/[id]/components/film-shot-panel.tsx)，版本和生成上下文又分散在舞台与多个弹窗。这造成以下问题：

- 影视节点不能独立完成影视创作动作。
- Studio、节点检查器、镜头表都像镜头的“编辑真源”。
- 影视画布仍然沿用通用画布的创建菜单和节点交互。
- 时间轴、预演、制作队列、版本室和检查入口之间的职责边界不清。
- 资产节点用统一 `filmAsset` 处理角色、场景、道具、服装和风格，交互无法体现不同领域职责。

SketchShot 提供的可借鉴证据包括：

- 节点类型直接表达场次、角色、风格、镜头和连续动作：[sketchshot/frontend/src/types/nodes.ts](../../../../sketchshot/frontend/src/types/nodes.ts)。
- 镜头节点折叠态展示镜头语义、上下文、参考和结果：[sketchshot/frontend/src/components/Nodes/ShotNode/index.tsx](../../../../sketchshot/frontend/src/components/Nodes/ShotNode/index.tsx)。
- 连续动作节点支持总提示词、逐格编辑、AI 拆解和预览：[sketchshot/frontend/src/components/Nodes/ContinuityNode/index.tsx](../../../../sketchshot/frontend/src/components/Nodes/ContinuityNode/index.tsx)。
- 快速创建菜单只展示当前节点合法的下游节点：[sketchshot/frontend/src/components/QuickConnectMenu/index.tsx](../../../../sketchshot/frontend/src/components/QuickConnectMenu/index.tsx)。
- 执行中心聚合可执行对象、进度、错误、结果和版本：[sketchshot/frontend/src/utils/executionCenter.ts](../../../../sketchshot/frontend/src/utils/executionCenter.ts)。

本项目不复制 SketchShot 的工程结构；只吸收“影视语义节点、上下文可见、节点内就地操作、快速创建并连线、项目级执行中心”这五个产品原则。

## 3. 核心产品模型

### 3.1 产品名称与默认入口

影视 `/film/studio/[id]` 继续是正式入口，但默认内容改称 **Director Board（影视导演板）**。不再把 Director Board 和 Studio/画布视为两个平行工作区。

用户旅程变为：

```text
影视项目列表
  -> Director Board
     -> 点击镜头节点
        -> Shot Focus 镜头聚焦模式
           -> Esc/返回 Director Board
     -> 镜头表 / 故事板：规模化浏览与排序
     -> 制作中心：批量生成、停止、续跑、失败重试
     -> 分镜预演：预览与时间轴跳转
     -> 检查中心：问题、就绪度、过期与 AI 复查
```

### 3.2 交互分层

| 层级 | 唯一职责 | 不负责 |
|---|---|---|
| Director Board | 节点关系、场次布局、上下文编排、结构操作 | 大规模表格编辑、批量执行 |
| 影视节点 | 一个明确的影视创作意图或上下文对象 | 通用节点的所有能力 |
| Shot Focus | 单镜沉浸编辑、生成、版本和上下文查看 | 批量任务、项目级检查 |
| 镜头表 | 全片检索、筛选、批量选中、少量高频字段编辑 | 完整镜头编辑 |
| 故事板 | 视觉浏览、排序、跨场移动、选择 | 复杂字段编辑、直接执行批量任务 |
| 上下文中心 | 角色/场景/道具/风格的引用、就绪和影响范围 | 镜头生产执行 |
| 制作中心 | 资产/镜头队列、执行清单、进度、停止、续跑、失败重试 | 修改镜头创作意图 |
| 分镜预演 | 镜头按全片链播放、跳转、当前镜头打开 | 字幕、音频轨、真正成片导出 |
| 检查中心 | 质量问题、缺失、影响范围、跳转和重新检查 | 替代节点编辑 |

### 3.3 设计不变量

- 底层复用画布引擎；影视模式不复用通用画布菜单、卡片和检查器交互。
- 一个 `CanvasProject` 是唯一持久化真源。
- 一个影视节点只有一个职责；节点内的动作通过领域命令写回节点或边。
- 一个镜头只有一个顺序来源：全片 `sequence` 链。
- 一个绑定只有一个关系来源：`context` 边。
- 一个生成结果只有一个版本历史来源：镜头节点的媒体版本池。
- 一个批量运行只有一个执行入口：制作中心；底层资产队列和镜头队列可以继续分开持久化。
- UI 状态可以使用现有的按项目内存 store，但不能写入项目文档，也不能复制业务列表。

## 4. 目标数据模型

### 4.1 影视节点类型

通用 `CanvasNodeType` 保留通用节点；影视节点替换当前 `script`、`scene`、`shot`、`filmAsset` 的项目交互形态，使用明确的影视节点类型：

```ts
type FilmNodeType =
    | "filmScript"
    | "filmScene"
    | "filmShot"
    | "filmCharacter"
    | "filmLocation"
    | "filmProp"
    | "filmStyle"
    | "filmBeat";
```

实现上可以继续挂在 `CanvasNodeType` 枚举中，但必须通过影视节点注册表分发，不允许再用一个泛化 `filmAsset` 卡片承载所有资产类型。

### 4.2 剧本节点

```ts
type FilmScriptNodeData = {
    text: string;
    sourceScriptProjectId?: string;
    sourceScriptHash?: string;
    parseSnapshots: FilmParseSnapshot[];
    analysis?: {
        scriptHash: string;
        sceneCount: number;
        shotCount: number;
        assetCount: number;
        createdAt: string;
    };
};
```

结构提案和资产提案属于一次性、待确认的分析会话，不直接作为项目级第二真源；应用后写入节点和边，撤销依赖 `parseSnapshots`。

### 4.3 场次节点

```ts
type FilmSceneNodeData = {
    episodeId: string;
    episodeTitle: string;
    name: string;
    location: string;
    time: string;
    mood: string;
    purpose?: string;
    beatSummary?: string;
    notes?: string;
};
```

场次节点可以显示其下属镜头数量、生成进度、缺失资产和场次目的，但镜头列表从 `composition` + `sequence` 纯派生。

### 4.4 上下文节点

角色、场景、道具和风格节点分别使用明确的节点 payload，但内部复用现有 `FilmAsset`、`FilmImageSlot`、角色参考板、造型状态和场景变体数据。

```ts
type FilmCharacterNodeData = { asset: FilmAsset };
type FilmLocationNodeData = { asset: FilmAsset };
type FilmPropNodeData = { asset: FilmAsset };
type FilmStyleNodeData = { asset: FilmAsset };
```

约束：

- 角色身份下游只使用 `character.board` 作为身份包。
- 角色造型状态属于角色节点内部；服装不再作为项目内一级节点。
- 场景变体属于场景节点内部；镜头通过 context 边记录 `variantId`。
- 风格节点每个项目只有一个；风格内容由节点保存，预设只作为编译参数。该风格圣经全局进入每个镜头的生成与 review；镜头上的 `context(role: "style")` 只表达导演板关系和影响范围，不作为风格生效开关。
- 母版库仍使用现有五类资产 store；“服装”可以继续存在于母版库数据中，但不再出现在 Director Board 的一级节点菜单。

### 4.5 镜头节点

镜头节点是目标态的第一公民，字段分为五组：

```ts
type FilmShotNodeData = {
    shotNo: string;
    title: string;
    duration: number;
    description: string;
    dialogue: string;
    audio: string;
    shotType: string;
    cameraAngle: string;
    cameraMovement: string;
    composition: string;
    lighting: string;
    colorTone: string;
    lens: string;
    transition: string;
    motion: string;
    emotion: string;
    performance?: FilmPerformance;
    soundDesign?: FilmSoundDesign;
    coverage?: string;
    prompt: string;
    negativePrompt?: string;
    videoPrompt?: string;
    videoMode?: FilmVideoMode;
    firstFrame?: FilmFrameSource;
    lastFrame?: FilmFrameSource;
    videoSegments?: FilmVideoSegment[];
    imageUrl?: string;
    storageKey?: string;
    videoUrl?: string;
    videoStorageKey?: string;
    imageVersions?: FilmMediaVersion[];
    videoVersions?: FilmMediaVersion[];
    pendingTask?: FilmShotTask;
    lastFailedTaskKind?: "image" | "video";
};
```

从镜头节点删除：

- `branches`、互动变量引用和互动路线字段。
- 旧 `continuity` 场记交接单字段。
- `characterBindings`、`propBindings`、`locationId`、`locationVariantId` 等关系字段。
- AI 建议直接写入镜头事实的字段。

角色、场景、道具、风格和动作节拍通过 `context` 边派生。

### 4.6 动作节拍节点

动作节拍是可选的过程节点，不是每个镜头的强制阶段：

```ts
type FilmBeatNodeData = {
    title: string;
    mode: "grid4" | "grid9" | "timeline";
    prompt: string;
    frames: string[];
    firstFrame?: FilmFrameSource;
    lastFrame?: FilmFrameSource;
    duration?: number;
    preview?: FilmImageSlot;
    status: CanvasNodeStatus;
    progress: number;
    errorMessage?: string;
};
```

第一阶段只需要支持 `grid9`；数据模型保留 `grid4` / `timeline` 的扩展位，但不在本轮实现对应编辑器。

### 4.7 边类型

```ts
type FilmConnectionKind = "composition" | "sequence" | "context" | "derived";

type FilmContextRole = "character" | "location" | "prop" | "style" | "beat";

type FilmContextEdgeData = {
    role: FilmContextRole;
    stateId?: string;
    variantId?: string;
    continuity?: {
        outfit?: string;
        physicalCondition?: string;
        heldProps?: string[];
        emotion?: string;
        intentionalChange?: string;
    };
    source: "manual" | "ai";
};

type FilmDerivedEdgeData = {
    source: "script-analysis" | "script-handoff";
    sourceKey?: string;
};
```

关系规则：

- `composition`：`filmScene -> filmShot`，每个镜头必须最多/最终只有一条。
- `sequence`：`filmShot -> filmShot`，全片唯一线性链；禁止成环、分叉、多前继和非镜头端点。
- `context`：上下文节点或动作节拍节点 -> 镜头；角色、场景、道具、风格和节拍由 `role` 区分。
- `derived`：剧本分析产生的来源关系，用虚线展示，不参与生成上下文和顺序。
- 只有 `context` 和 `derived` 可以带影视专用 `data`；`sequence` / `composition` 不带业务 payload。
- 用户不手动选择边类型；领域命令根据创建动作自动建立合法边。

### 4.8 项目元数据

```ts
type CanvasFilmMeta = {
    aspect: FilmAspect;
    stylePresetId: FilmStylePresetId;
    directorStyleId: string;
    targetDuration?: number;
    scriptProjectId?: string;
    scriptHash?: string;
    consistencyReview?: FilmConsistencyReview;
    assetQueue?: CanvasFilmAssetQueue;
    shotQueue?: CanvasFilmShotQueue;
};
```

删除：

- `interactiveVariables`
- `shotGroups`
- 阶段字段
- 项目级镜头/资产数组

镜头选集改为临时 UI 状态或单独轻量选择记录，不作为 Director Board 的结构真源。

## 5. 节点交互设计

### 5.1 通用影视节点外壳

所有影视节点使用统一的 `FilmNodeShell`，支持：

- 节点标题编辑。
- 折叠/展开。
- 节点宽度调整。
- 状态徽标。
- 受影响/需更新徽标。
- 节点级快捷操作。
- 影视主题下的上下文色边。
- 节点内媒体预览。

但每种节点必须有自己的内容组件，不允许再由 `FilmAssetNodeCard` 通过 kind 分支承担所有资产体验。

### 5.2 镜头节点折叠态

折叠态至少展示：

- 镜号、标题和场次。
- 景别、运镜、时长。
- 描述摘要。
- 角色/场景/节拍上下文 chips。
- 参考数量和上一镜信息。
- 当前媒体缩略图或空镜卡。
- 生成状态、版本数量、需更新状态。
- `生成分镜图`、`生成视频`、`打开镜头聚焦`。

### 5.3 镜头节点展开态

展开态固定为：

1. 画面区：当前媒体、版本数量、预览、下载、版本入口。
2. 镜头语言区：景别、机位、运镜、构图、光线、色彩、焦段、转场。
3. 表演区：动作、情绪、目标、潜台词、肢体、强度。
4. 上下文区：场次、角色、场景、道具、风格、上一镜、动作节拍、参考图和最终提示词。
5. 生成区：图片/视频模型、成本提示、生成和停止。

### 5.4 场次/角色/场景/道具/风格节点

各节点展开态必须展示：

- 自身设定内容。
- 受影响镜头数。
- 缺失/过期状态。
- 快速创建相关镜头。
- 直接生成其核心参考图的入口。
- 打开上下文中心或定位引用镜头的入口。

### 5.5 动作节拍节点

展开态提供：

- 总提示词。
- AI 拆解动作。
- 4/9 格内容编辑，第一期仅启用 9 格。
- 参考图摘要。
- 生成九格预览。
- 连接到镜头的入口。

镜头节点只显示节拍摘要和定位按钮，不再内嵌旧场记交接单字段。

## 6. Director Board 布局与导航

### 6.1 默认布局

Director Board 使用影视专用布局，不渲染通用画布的默认侧栏和通用 Agent 面板：

```text
┌─────────────────────────────────────────────────────────────┐
│ 影视项目 / 当前场次 / 保存 / 主题 / 菜单                     │
├─────────────────────────────────────────────────────────────┤
│ 场次列 1        场次列 2        场次列 3                    │
│ ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
│ │ 场次节点 │    │ 场次节点 │    │ 场次节点 │                 │
│ └─────────┘    └─────────┘    └─────────┘                 │
│    │              │              │                         │
│  镜头链         镜头链         镜头链                       │
│  01 → 02        03 → 04        05 → 06                     │
│                                                             │
│ 左/上：角色、场景、道具、风格上下文带                       │
└─────────────────────────────────────────────────────────────┘
```

- 场次是布局锚点，不是新的持久化容器层。
- 镜头按全片 `sequence` 链顺序排列。
- 上下文节点默认位于镜头链上方或左侧，不遮挡镜头主链。
- `derived` 边虚线显示；`composition`、`sequence`、`context` 使用不同主题色。
- 通过现有视口裁剪支撑 100–300 节点项目；不引入新的持久化布局索引。

### 6.2 Shot Focus

点击镜头节点进入 Shot Focus：

- 当前媒体全幅展示。
- 节点展开编辑器作为侧栏或底部面板。
- 上一镜/下一镜导航。
- 版本、上下文、生成操作可见。
- `Esc` 返回 Director Board。
- 不新增项目数据、不复制镜头字段、不产生第二个任务入口。

当前 `FilmStudioBody`、`FilmShotPanel`、`FilmShotStage` 和 `FilmStrip` 的功能将改造成 Shot Focus 的组件，而不是继续作为独立 Studio 壳层。

### 6.3 视图收敛

一级视图只保留：

1. Director Board。
2. 镜头表。
3. 故事板。
4. 上下文中心。

一级动作保留：

- 导演分析。
- 分镜预演。
- 制作中心。
- 检查中心。

删除独立时间轴一级视图；时间轴能力合并到分镜预演。

## 7. 快速创建和连线语法

影视模式使用 `FilmQuickConnectMenu`，不再直接复用通用 `NodeCreateMenu` 的影视分支。

### 从场次节点创建

- 新增镜头。
- 新增动作节拍。
- 引用角色。
- 引用场景。
- 引用道具。
- 套用风格。

### 从角色节点创建

- 创建角色镜头。
- 创建造型状态。
- 创建动作节拍。

### 从镜头节点创建

- 创建后续镜头。
- 添加动作节拍。
- 引用角色。
- 引用场景。
- 引用道具。

### 快速创建约束

- 菜单只展示当前源节点合法的影视动作。
- 创建动作自动产生节点和正确边。
- 连接失败必须显示领域原因，例如“当前镜头已有场景上下文”。
- 通用文本/图片/视频/音频/发布/漫画节点从影视主菜单移入“通用资源”，不作为默认选项。

## 8. 剧本与导演分析中心

剧本节点提供统一的“导演分析中心”，合并当前结构提案和资产提案两个入口。

标签：

- 结构：场次、节拍、镜头数量、时长冲突。
- 镜头：镜头描述、镜头语言、动作和表演建议。
- 资产：角色、场景、道具提案及别名。
- 应用预览：覆盖/追加、按场选择、绑定预览、冲突提示。

规则：

- AI 结果先进入 transient proposal，不直接写入节点。
- 用户确认后，应用命令一次性创建/更新节点和边。
- 最近 3 次解析快照继续支持撤销。
- 独立剧本工作台是写作源；画布剧本节点是已发布到制作的快照，显示来源 hash 和源剧本更新提示。
- 不再维护独立 beats 结构策划代理作为另一套入口；节拍信息进入场次节点或动作节拍节点。

## 9. 上下文中心

上下文中心替换当前资产清单/场景覆盖的混合视图，展示：

- 角色、场景、道具、风格节点。
- 参考图、生成状态、锁定状态。
- 使用镜头、使用场次和影响范围。
- 资产缺失、库更新和媒体过期。
- 一键定位节点或打开受影响镜头。
- 资产生产入口，但不内嵌第二套生产流程。

母版库 `/film/library` 继续保留为跨项目资产管理入口；项目上下文中心只管理当前项目副本和引用关系。

## 10. 制作中心

制作中心是资产队列与镜头队列的统一 UI，底层仍保留 `assetQueue` 和 `shotQueue` 两种业务状态。

标签：

- 全部。
- 资产。
- 镜头。
- 失败。
- 已完成。

统一能力：

- 执行前计划。
- 跳过原因。
- 当前任务与总进度。
- 停止当前任务。
- 失败重试。
- 刷新续跑。
- 定位回原节点。

触发入口：

- 镜头节点单镜生成：直接执行，不打开制作中心。
- 镜头表/故事板/镜头选集批量操作：打开制作中心并带入选中 ID。
- 上下文中心资产生产：打开制作中心并带入资产 ID。

删除故事板组级生成、镜头表独立执行和资产独立生产弹窗的重复 UI；底层 `useFilmShotBatch`、资产生产 hook、任务轮询和停止接口继续复用。

## 11. 分镜预演、版本与检查

### 11.1 分镜预演

分镜预演合并当前时间轴与成片预览：

- 视频优先，图片其次，缺失显示占位。
- 镜头时长、场次分段、播放头和点击跳转。
- 当前镜头打开 Shot Focus。
- 支持镜头选集预演。
- 固定静音；字幕、音频和成片导出不在本期。

`film-animatic-preview.ts` 成为唯一时间线纯逻辑；删除 `FilmTimelineView` 的第二套播放循环。

### 11.2 Version Room

镜头节点只显示当前版本和版本数；Version Room 统一负责：

- 当前镜头图片/视频对比。
- 版本上下文、提示词、参考和警告。
- 设为当前。
- 多镜头批量挑选。

删除舞台版本条和生成信息面板中的重复版本选择逻辑；生成信息只负责上下文和提示词。

### 11.3 检查中心

检查中心聚合：

- 结构完整性。
- 资产准备度。
- 场次覆盖。
- 上下文过期。
- 风格影响。
- 连续性风险。
- AI 一致性复查。

问题必须能跳转到镜头节点或上下文节点；检查中心不直接编辑镜头。

## 12. 删除、合并和保留清单

### 12.1 P0 重做

- 当前影视节点卡片。
- 影视节点注册/渲染分发。
- 影视快速创建/连线菜单。
- 镜头节点内上下文、参考、媒体和生成操作。
- Studio 与画布之间的平行壳层，改为 Director Board + Shot Focus。
- 通用影视检查器的完整镜头编辑能力。

### 12.2 P1 合并

- 时间轴并入分镜预演。
- 资产队列和镜头队列 UI 合并为制作中心。
- 版本条、生成信息、Version Room 合并。
- 结构提案和资产提案合并为导演分析中心。
- 资产视图改为上下文中心。
- 镜头表/故事板批量入口统一打开制作中心。
- 镜头组降级为镜头选集。

### 12.3 P2 删除

- 互动分支/变量模型及其检查逻辑。
- 独立 AI 场记交接单和旧连续性字段集合。
- 旧 `FilmProject` 数组适配层，改为图原生 review input。
- 旧阶段模型。
- 旧影视任务辅助函数。
- 项目内泛化 `filmAsset` 节点 UI。
- 项目内独立服装节点入口。
- 角色独立 `concept` 身份槽位；角色下游身份只认 `board`。
- 独立时间轴组件。
- 故事板组级生成和镜头表独立批量执行 UI。

### 12.4 保留

- CanvasProject 真源。
- 影视母版库及其同步。
- 角色参考板、造型状态、场景变体。
- 统一提示词编译器和媒体版本池。
- 任务轮询、恢复、停止、续跑。
- 全片 sequence 链。
- Context Lens。
- 静态检查与手动 AI 一致性检查。
- 镜头表、故事板、分镜预演和检查中心。

## 13. 实施阶段

### 阶段 0：契约和硬切准备

- 更新影视节点类型、边类型和 payload 类型。
- 删除旧互动、阶段和旧数组式类型的公开入口。
- 更新 fixture 和纯逻辑测试。
- 明确旧 film 文档不迁移；开发环境重新创建影视项目。

验收：类型、连接约束、序列规则和创建工厂全通过；通用画布不受影响。

### 阶段 1：影视节点运行时

- 新增影视节点注册表和专用节点外壳。
- 重做剧本、场次、角色、场景、道具、风格、镜头节点卡片。
- 重做影视创建和快速连线菜单。
- Director Board 使用专用节点渲染。

验收：影视模式主菜单只出现影视语法；镜头折叠态可理解并能执行单镜动作。

### 阶段 2：镜头节点和 Shot Focus

- 抽取唯一 `FilmShotEditor`。
- 镜头节点展开态与 Shot Focus 共用该编辑器。
- 迁移上下文、绑定、媒体、版本和生成操作。
- 通用检查器镜头编辑改为只读/定位。

验收：节点和 Shot Focus 写同一份镜头 payload；主要创作不需要打开通用检查器。

### 阶段 3：上下文边和图原生读模型

- `binding` 替换为 `context`，加入 role。
- 新增 `derived` 来源边。
- 重做 context selector、generation adapter、review input。
- 保留 sequence/composition 约束。

验收：镜头节点能展示真实继承上下文；上游变化能正确改变签名和过期状态。

### 阶段 4：导演分析中心和动作节拍

- 合并结构提案/资产提案。
- 新增 `filmBeat` 节点和 9 格动作编辑。
- 剧本源 hash 和分析状态接入节点。

验收：剧本分析结果可按场/资产人工确认；动作节拍可被镜头引用但不是强制阶段。

### 阶段 5：视图与执行中心收敛

- 删除独立时间轴一级视图，合并到预演。
- 资产视图改为上下文中心。
- 资产队列/镜头队列合并为制作中心。
- 所有批量入口带选择打开制作中心。

验收：项目只有一个批量执行入口；预演只有一套时间线算法；上下文中心不重复实现检查规则。

### 阶段 6：版本与检查收敛

- Version Room 成为唯一版本管理界面。
- 生成信息改为上下文信息。
- 检查中心支持节点跳转和影响范围。

验收：版本切换、对比、批量挑选、提示词和上下文无重复入口。

### 阶段 7：历史代码和文档清理

- 删除旧 `FilmProject` 适配层、互动分支、旧场记、旧阶段、旧任务 helper、旧泛化资产 UI。
- 更新主 spec、Studio spec、功能说明、TODO、pending-test 和早期 `ai-film-plan.md`。
- 保留母版库、媒体类型和统一编译器。

验收：影视源码中不存在已删除产品概念的运行入口；文档与当前代码一致。

## 14. 测试与验收

### 14.1 纯逻辑测试

必须覆盖：

- 影视节点注册和默认 payload。
- 快速创建动作到节点/边的映射。
- `context` 边角色、状态、变体和来源。
- `derived` 边不进入生成上下文。
- sequence 链无环、无分叉、跨场顺序。
- Director Board 场次布局和节点摘要。
- Shot Focus 编辑补丁。
- 动作节拍选择和镜头引用。
- 图原生生成上下文和签名。
- 图原生 review input。
- 制作中心资产/镜头计划合并。
- 预演时间线唯一实现。
- Version Room 选择和当前版本应用。

### 14.2 命令与组件测试

必须验证：

- 从场次创建镜头自动建立 composition/sequence。
- 从角色/场景/道具/风格创建 context 边。
- 删除节点级联删除边。
- 删除造型或变体时阻止悬空引用，或列出受影响镜头并要求确认。
- 节点和 Shot Focus 编辑结果一致。
- 批量入口都进入制作中心。
- 任务停止、刷新恢复、续跑不产生重复任务。

### 14.3 浏览器验收

临时项目完成以下路径后删除测试项目：

1. `/film` 新建项目进入 Director Board。
2. 从场次节点快速创建镜头。
3. 从角色节点快速创建角色上下文并连入镜头。
4. 镜头折叠态显示场次、角色、参考、状态和结果。
5. 展开镜头节点编辑描述、运镜和动作，Shot Focus 同步更新。
6. 单镜生成、停止、版本切换和上下文预览。
7. 镜头表多选进入制作中心，显示跳过原因并执行。
8. 故事板拖拽改变全片 sequence，预演顺序同步变化。
9. 上下文中心显示引用镜头和缺失参考。
10. 检查中心问题可以定位到镜头或上下文节点。
11. 刷新后项目、任务、媒体和节点状态恢复。
12. 通用 `/canvas`、漫画、发布和 Agent 回归不受影响。

### 14.4 命令

在 `web` 目录运行：

```bash
bun test
bun run typecheck
bun run lint --max-warnings=0
```

依照仓库约束，代码完成后必须在 `docs/progress/pending-test.md` 记录真实浏览器验证和未实测项；不能把隐藏帧无法验证的 hover、断点、计时器和 rAF 行为写成已验证。

## 15. 风险与控制

| 风险 | 控制 |
|---|---|
| 节点内容过大，画布变成长表单 | 默认折叠；展开只显示核心区域；完整专业编辑进入 Shot Focus；沿用视口裁剪 |
| 新旧节点概念并存 | 硬切，不做旧 UI 双轨；阶段完成后删除旧组件和旧类型 |
| 边语义变化影响编译器 | 先建立纯 graph adapter 和测试，再切换 UI；不在组件内解析边 |
| 批量任务被多个入口重新复制 | 所有批量命令统一进入制作中心；底层 hook 只保留一份 |
| 角色/场景/道具 UI 重复 | 专用节点内容复用通用槽位子组件，但节点外壳和领域动作分开 |
| AI 分析误写用户数据 | 所有分析先进入 transient proposal；确认后一次性应用并保存快照 |
| 旧项目无法打开 | 按既定规则不迁移；开发和验收使用新建项目；发布前明确旧文档清理策略 |
| 大项目性能下降 | 不新增持久化派生索引；节点摘要使用 selector/memo；100–300 节点做实测 |
| SketchShot 许可边界 | 只借鉴交互和产品思想，不复制其代码、样式、依赖和后端实现 |

## 16. 完成定义

当以下条件同时满足时，Film Director Board 2.0 才算完成：

- 镜头节点本身可以完成主要影视创作动作。
- Director Board 是唯一默认影视结构工作区，Shot Focus 是镜头节点的沉浸视图。
- Studio、通用画布检查器和镜头表不再形成三套完整镜头编辑真源。
- 影视专用节点和快速连线语法可独立理解，不依赖通用画布知识。
- 批量制作、预演、版本和检查各只有一个主入口。
- 资产、镜头、任务、版本、提示词和同步仍各只有一个真实来源。
- 已删除概念不再存在可见运行入口，文档和测试与新目标态一致。
