---
title: 画布数据结构
description: 画布本地存储、节点结构、媒体文件与清理机制
---

# 画布数据结构

本文档说明画布数据的结构、图片文件的存储和清理方式。未登录时画布数据保存在浏览器本地，登录且账号同步可用时同一份数据会同步到后端；各类型完整字段以 `web/src/app/(user)/canvas/types.ts`、`web/src/app/(user)/canvas/stores/use-canvas-store.ts` 的类型定义为准。

## 当前存储位置

画布项目以浏览器本地为主存储，登录后再同步一份到后端：

- 画布项目 JSON：`localForage`，数据库名 `infinite-canvas`，storeName `app_state`，基础键 `infinite-canvas:canvas_store`。
- 我的素材 JSON：同一实例与 storeName，基础键 `infinite-canvas:asset_store`。
- 图片 Blob：单独存到 `localForage` 实例，数据库名 `infinite-canvas`，storeName `image_files`。
- 视频等媒体 Blob：单独存到 `localForage` 实例，数据库名 `infinite-canvas`，storeName `media_files`。

本地业务数据按账号分区：实际键是 `基础键:<accountId>`，未登录统一落在 `:guest`。登录后读账号分区，分区还没有数据时接管游客分区（先写账号分区再清游客分区），保住「先本地创作、登录后同步」，也避免同一浏览器换账号后读到上一个账号的内容。键名集中定义在 `web/src/lib/storage-keys.ts`，分区读写在 `web/src/lib/account-storage.ts`。

同一 `app_state` 下还有这些模块的基础键，媒体引用清理会一并扫描：

- 影视项目 `infinite-canvas:film_store`、影视角色/场景库 `infinite-canvas:film_cast_store`
- 漫画项目 `infinite-canvas:comic_store`、漫画角色/场景库 `infinite-canvas:comic_cast_store`
- 营销资料 `infinite-canvas:marketing_store`

画布 JSON 不直接长期保存大体积 base64 图片或视频。图片节点、视频节点、助手图片和素材媒体只保存展示 URL、`storageKey` 和元信息，真实 Blob 通过 `storageKey` 读取。

登录且账号同步可用时，同一份画布 JSON 会同步到后端 `canvas_projects` 表：本地改动按短去抖写入，打开画布库时再按 `updatedAt` 与远端双向合并；未登录时只写本地。

## 画布项目结构

每个画布项目是一个 `CanvasProject`：

```ts
type CanvasProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  chatSessions: CanvasAssistantSession[];
  activeChatId: string | null;
  agentConfig: CanvasAgentConfig | null;
  autoTitlePending: boolean;
  pendingAgentRequest?: CanvasPendingAgentRequest;
  backgroundMode: "lines" | "dots" | "blank";
  showImageInfo: boolean;
  viewport: { x: number; y: number; k: number };
  sidePanel: CanvasSidePanelState;
  agentPanel: CanvasSidePanelState;
};
```

字段说明：

- `id`：画布项目 ID，当前前端生成。
- `title`：画布名称。
- `createdAt` / `updatedAt`：ISO 字符串。
- `nodes`：画布节点列表。
- `connections`：节点连线列表。
- `chatSessions`：右侧 Agent 会话。
- `activeChatId`：当前选中的助手会话 ID。
- `agentConfig`：本画布的 Agent 配置（模型、渠道、自动生成与确认开关等）。
- `autoTitlePending`：是否还保留首次自动总结项目标题的机会；手动改名、导入项目或首次非主剧本写操作后置为 false。
- `pendingAgentRequest`：从首页创作框带入画布、尚未执行的一次 Agent 请求。
- `backgroundMode`：画布背景模式。
- `showImageInfo`：是否显示节点图片信息。
- `viewport`：视口变换，`x/y` 是屏幕平移，`k` 是缩放比例。
- `sidePanel` / `agentPanel`：侧栏与助手面板的开合与宽度状态。

## 节点结构

每个节点是一个 `CanvasNodeData`：

```ts
type CanvasNodeData = {
  id: string;
  type: "image" | "panorama" | "text" | "config" | "video" | "audio" | "director" | "group" | "source" | "publish" | "comic";
  title: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  metadata?: CanvasNodeMetadata;
};
```

通用字段：

- `id`：节点 ID。
- `type`：节点类型，当前有图片、全景图、文本、生成配置、视频、音频、导演台、组、素材源、发布、漫画册十一类，枚举定义在 `CanvasNodeType`。
- `title`：节点标题。
- `position`：画布世界坐标，不是屏幕坐标。
- `width` / `height`：画布世界坐标下的节点尺寸。
- `metadata`：节点内容和业务状态。

`metadata` 当前常用字段（子集，完整定义以 `canvas/types.ts` 为准）：

```ts
type CanvasNodeMetadata = {
  content?: string;
  groupId?: string;
  prompt?: string;
  status?: "idle" | "success" | "loading" | "stopping" | "stopped" | "error";
  errorDetails?: string;
  fontSize?: number;
  generationMode?: "text" | "image" | "video" | "audio";
  model?: string;
  size?: string;
  count?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  freeResize?: boolean;
  isBatchRoot?: boolean;
  batchRootId?: string;
  batchChildIds?: string[];
  primaryImageId?: string;
  imageBatchExpanded?: boolean;
  inputOrder?: string[];
  storageKey?: string;
  mimeType?: string;
  bytes?: number;
  durationMs?: number;
  cameraControl?: CameraControlOptions;
  panoramaProjection?: "equirectangular";
  directorProject?: unknown;
  imageTaskId?: string;
  videoTaskId?: string;
  videoTaskVideoId?: string;
  audioTaskId?: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceText?: string;
  sourceTags?: string[];
  sourceImages?: { url: string; storageKey?: string; width?: number; height?: number }[];
  sourceExpanded?: boolean;
  sourceExpandedSignature?: string;
  sourceExpandedNodeSignatures?: Record<string, string>;
  sourceMaterialRole?: "text";
  comicBook?: CanvasComicBook;
  remixRole?: "plan" | "copy" | "image" | "reference" | "publish";
  remixRunId?: string;
  remixRun?: RemixRun;
  remixIndex?: number;
  remixSourceId?: string;
  marketingAssetId?: string;
  publishSourceId?: string;
  publishDraft?: CanvasPublishDraft;
  publishRecord?: CanvasPublishRecord;
};
```

不同节点的使用方式：

- 图片节点：`content` 是当前可展示的图片 URL，通常是 `blob:` URL；`storageKey` 指向本地图片 Blob；`naturalWidth/naturalHeight/bytes/mimeType` 保存原图信息。
- 全景图节点：沿用图片节点的字段，`panoramaProjection: "equirectangular"` 标记严格 2:1 全景图；未标记的按普通图片显示，可连接导演台作为环境背景。
- 视频节点：`content` 是当前可播放的视频 URL，通常是 `blob:` URL；`storageKey` 指向本地视频 Blob；`bytes/mimeType` 保存文件信息。
- 音频节点：`content` 是当前可播放的音频 URL，通常是 `blob:` URL；`storageKey` 指向本地音频 Blob；`bytes/mimeType/durationMs` 保存文件信息。
- 文本节点：`content` 保存文本内容；`fontSize` 保存字体大小；`prompt/status/errorDetails` 保存生成状态。
- 生成配置节点：`generationMode/model/size/count/inputOrder` 保存生成配置；`generationMode` 可选择文本、图片、视频或音频；上游输入通过 `connections` 计算。
- 导演台节点：`directorProject` 保存该节点独立的 3D 场景数据；机位截图列表只保存在当前浏览器，不随画布同步。
- 组节点：作为容器节点使用，成员节点通过 `metadata.groupId` 指向组节点 ID。
- 图片组节点：根节点用 `isBatchRoot/batchChildIds/primaryImageId/imageBatchExpanded` 记录批量生成结果；子图节点用 `batchRootId` 指回根节点。
- 素材源节点：`sourceId/sourceTitle/sourceText/sourceTags/sourceImages` 保存解析结果；`sourceExpanded` 与 `sourceExpandedSignature/sourceExpandedNodeSignatures` 记录展开状态与来源/派生节点签名，用于同步对账和过期判定。展开出的素材文案节点用 `sourceMaterialRole: "text"` 标记为只读参考。
- 发布节点：`publishDraft` 是当前草稿，`publishDraftSnapshot` 是签发时的草稿快照（用于判断二维码是否属于旧内容），`publishRecord/publishStatus/publishError` 保存签发结果与状态。复刻链路创建的发布节点把本次 runId 存进 `publishSourceId` 作为复用键，`remixSourceId` 指回原素材源节点。
- 漫画册节点：`comicBook` 保存页面引用、封面、格式、阅读方向、贴字、导出预设与项目关联，结构见下。
- 复刻运行：策划/文案/配图/参考/发布节点用 `remixRole` 区分角色，同一次复刻共享 `remixRunId`；`remixRun` 保存输入快照、绑定状态（`active` / `detached`）、策划与审批 key。配图节点用 `remixIndex/remixSourceId` 指回序号与对应原图，营销图片引用用 `marketingAssetId`。

漫画册的 `comicBook` 结构：

```ts
type CanvasComicBook = {
  pageNodeIds: string[];
  coverNodeId?: string;
  format: "page" | "strip";
  direction: "rtl" | "ltr";
  lettering?: Record<string, ComicLetterElement[]>;
  exportPreset?: ComicExportPreset;
  comicProjectId?: string;
  /** 画布页面节点 id → 工作台页面 id，用于页序与贴字回写。 */
  pageProjectIds?: Record<string, string>;
};
```

- `pageNodeIds`：按页序引用画布图片节点，不为每页额外建连线；`coverNodeId` 是封面页。
- `lettering`：键是页面图片节点 ID，值是该页气泡数组。气泡的 `x/y/width/fontSize` 都是相对页面宽高的 0–1 值（`fontSize` 相对页宽），另含 `kind`（speech/thought/caption/sfx）、`align`、`tail`、可选 `template`（oval/rounded/boxed/cloud/caption，未设置时按 kind 取默认）与 `tailX`（尾巴水平位置，相对气泡宽度 0–1）。
- `exportPreset`：`pageSize`（fit/a4/b5）、`dpi`（150/300）、`pageNumbers`、`titlePage` 与 `titlePageText`；页面尺寸只影响 PDF。
- `comicProjectId`：关联的本机漫画项目 ID。
- `pageProjectIds`：画布页面节点 → 工作台页面的映射。发送、更新、关联项目同步与复制漫画册时都会维护，回写贴字与同章节页序依赖它；缺少映射的旧漫画册需先发送/更新一次。

## 连线结构

每条连线是一个 `CanvasConnection`：

```ts
type CanvasConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
};
```

连线只保存节点 ID，不保存端口坐标。渲染时根据节点位置和尺寸计算路径。

删除节点时会同步删除以该节点为起点或终点的连线。删除图片组根节点时，会把对应子节点一起删除。

## 助手会话结构

助手会话保存在画布项目内：

```ts
type CanvasAssistantSession = {
  id: string;
  title: string;
  messages: CanvasAssistantMessage[];
  createdAt: string;
  updatedAt: string;
};
```

消息结构：

```ts
type CanvasAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  status?: "thinking" | "running" | "waiting" | "success" | "error";
  activity?: string;
  references?: CanvasAssistantReference[];
  images?: CanvasAssistantImage[];
};
```

图片引用和助手生成图片也遵循同一套图片存储规则：

- `dataUrl` 字段当前可能是 `blob:` URL，也可能是旧数据中的 `data:image/...`。
- `storageKey` 存在时，以 `storageKey` 为准读取图片 Blob。
- 发送到 AI 接口前，如果接口需要 base64，会通过 `imageToDataUrl` 临时把 Blob URL 转成 data URL。

## 图片写入流程

所有新增图片应通过 `uploadImage(input)` 写入：

1. 传入 `Blob` 或 data URL。
2. 内部转成 `Blob`。
3. 生成 `storageKey`，格式为 `image:<id>`。
4. 把 Blob 写入 `image_files`。
5. 创建 `blob:` URL，并缓存在内存 `objectUrls`。
6. 读取图片宽高，返回：

```ts
type UploadedImage = {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
};
```

图片节点会通过 `imageMetadata(image)` 写入：

```ts
{
  content: image.url,
  storageKey: image.storageKey,
  status: "success",
  naturalWidth: image.width,
  naturalHeight: image.height,
  bytes: image.bytes,
  mimeType: image.mimeType
}
```

因此，`content` 只适合当前浏览器会话展示，不能作为长期文件标识；长期标识是 `storageKey`。

## 图片读取和旧数据迁移

打开画布时会执行图片补水：

- 如果图片节点有 `storageKey`，通过 `resolveImageUrl(storageKey, fallback)` 读取 Blob 并生成新的 `blob:` URL。
- 如果图片节点没有 `storageKey`，但 `content` 是旧的 `data:image/...`，会调用 `uploadImage(content)` 迁移到 `image_files`，并补上 `storageKey`。
- 助手消息里的引用图和生成图也会执行同类逻辑。

我的素材读取时也会做迁移：

- 有 `storageKey`：恢复 `coverUrl` 和 `data.dataUrl` 的可展示 URL。
- 无 `storageKey` 且保存了 base64：写入 `image_files`，然后更新素材里的 `storageKey`。

## 图片移除和清理

图片不是在删除节点时立即按节点逐张删除，而是做引用清理：

1. 删除节点、清空画布、删除画布、删除素材、删除助手会话时，会触发 `cleanupImages`。
2. `cleanupImages` 通过 `services/storage-references.ts` 的 `collectStorageReferences` 收集仍被引用的存储键：画布项目、我的素材、Agent Skill、生图/视频生成历史（含数组里的裸 `video:`/`file:` 键）、影视项目、影视角色/场景库、其他账号分区，以及调用方额外传入的数据。
3. `cleanupUnusedImages` 遍历 `image_files` 中的全部图片。
4. 不在引用集合里的图片会被删除。
5. 删除时会同时 `URL.revokeObjectURL`，并从内存缓存 `objectUrls` 移除。

这套方式可以避免同一张图片被画布、素材、影视或助手同时引用时误删。注意当前收集范围不含漫画项目、漫画角色/场景库与营销资料：漫画参考图只被这些模块引用时仍可能被清理，营销资料另有删除素材时的引用检查。
