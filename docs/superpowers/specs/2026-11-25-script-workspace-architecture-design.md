# 剧本创作工作台架构设计

日期：2026-11-25

## 1. 背景与目标

当前剧本模块已具备独立写作入口、账号分区本地保存、版本快照和影视分镜交接，但存在四个结构性问题：

1. `ScriptProject` 只有扁平场次，`tv` 格式无法保留剧集结构。
2. 锁定稿更新后，影视项目没有来源更新提示和重新发布闭环。
3. 同步以整个 `ScriptProject` 为 LWW 单元，多设备编辑不同场次也会互相覆盖。
4. 所有项目和版本保存在单个账号级 JSON 字段，列表加载、写入体积和版本增长相互放大。

本设计保留独立剧本工作台作为写作源，采用“完整领域模型、精简物理存储”：

- 项目、剧集、场次、版本、发布关系在领域层清晰建模。
- 当前文档按项目存储，历史版本独立存储。
- 同步按场次合并，冲突显式选择，不引入 CRDT 或实时协同引擎。
- 影视发布使用不可变锁定版本，刷新只处理来源可控节点。

## 2. 非目标

- 不新增页面、导航或独立影视工作台。
- 不实现实时多人光标、自动文本合并或操作日志。
- 不为每个场次、人物单独建表。
- 不做旧数据迁移、旧字段兼容或旧表清理。
- 不自动删除命名版本、锁定版本和已发布来源版本。
- 不重写漫画模块、画布引擎或影视生成任务链。

## 3. 当前结构

- 列表：`web/src/app/(user)/script/page.tsx`
- 工作区：`web/src/app/(user)/script/[id]/page.tsx`
- 领域类型：`web/src/app/(user)/script/types.ts`
- 状态：`web/src/app/(user)/script/stores/use-script-store.ts`
- 同步：`web/src/services/creative-sync.ts`
- 后端：`model/user_config.go`、`service/user_data.go`、`repository/user_config.go`
- 影视交接：`web/src/app/(user)/script/utils/script-handoff.ts`
- 影视图构建：`web/src/app/(user)/canvas/[id]/lib/film-script-parse.ts`

当前主链路：

```text
剧本页面
  -> useScriptStore 持有全部项目和版本
  -> 账号级 script_project_data JSON
  -> 页面直接编排 CanvasStore
  -> 覆盖式生成 FilmScene / FilmShot 节点
```

## 4. 目标结构

```text
剧本列表（摘要）
  -> 按需加载 ScriptProjectDocument
  -> 本地项目缓存 + 项目级待同步变更
  -> script_projects / script_versions

锁定版本
  -> ScriptPublication
  -> FilmScript 来源快照
  -> 带 scriptSourceKey 的场次 / 镜头节点
  -> 预览差异后刷新，保留人工节点和媒体
```

职责边界：

- 剧本模块拥有故事、人物、剧集、场次、锁定版本和发布关系。
- 影视画布拥有镜头调整、资产绑定、媒体和生成任务。
- 发布关系只记录来源版本和目标影视项目，不反向持有剧本正文。
- 漫画与剧本保持无直接业务依赖。

## 5. 领域契约

### 5.1 当前项目文档

```ts
type ScriptProjectDocument = {
    schemaVersion: 2;
    id: string;
    title: string;
    format: "film" | "tv" | "short";
    genre: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    episodes: ScriptEpisode[];
    lockedVersionId?: string;
    lockedVersionHash?: string;
    publications: ScriptPublication[];
    createdAt: string;
    updatedAt: string;
};

type ScriptEpisode = {
    id: string;
    no: number;
    title: string;
    scenes: ScriptScene[];
    lockedVersionId?: string;
    lockedVersionHash?: string;
};

type ScriptScene = {
    id: string;
    no: number;
    interiorExterior: "内景" | "外景" | "内外景" | "";
    location: string;
    timeOfDay: string;
    characters: string[];
    goal: string;
    conflict: string;
    turn: string;
    outcome: string;
    summary: string;
    content: string;
    notes: string;
    revision: number;
    updatedAt: string;
};
```

规则：

- 电影和短剧默认创建一集，剧集格式按实际集数创建。
- `status` 和 `lockedDraftId` 删除，锁定状态由版本引用推导。
- 场次编号在所属剧集内连续。
- 项目级字段只保留一份；暂不引入剧集级故事圣经，避免重复真源。

### 5.2 项目摘要

列表只读取摘要，不加载当前正文和版本：

```ts
type ScriptProjectSummary = {
    id: string;
    title: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    episodeCount: number;
    sceneCount: number;
    characterCount: number;
    wordCount: number;
    lockedEpisodeCount: number;
    hasPublication: boolean;
    publicationStale: boolean;
    revision: number;
    createdAt: string;
    updatedAt: string;
};
```

### 5.3 版本

```ts
type ScriptContentSnapshot = {
    title: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    episodes: ScriptEpisode[];
};

type ScriptVersion = {
    id: string;
    projectId: string;
    scope: "project" | "episode";
    episodeId?: string;
    label: string;
    kind: "manual" | "locked" | "safety";
    hash: string;
    data: ScriptContentSnapshot;
    createdAt: string;
};
```

type ScriptVersionSummary = Omit<ScriptVersion, "data">;

type ScriptVersionCreateRequest = {
    version: ScriptVersion;
    activateLock: boolean;
    baseRevision: number;
};

type ScriptVersionRestoreRequest = {
    baseRevision: number;
};

规则：

- 版本内容不可变。
- 内容 hash 使用确定性完整内容文本的 `scriptTextHash`：依次包含项目字段、人物全部字段、每集 ID/编号/标题、每场 ID/编号与全部创作字段；标量值用 `JSON.stringify` 单行输出，`revision/updatedAt` 和锁定引用不进入正文。TS 与 Go 必须逐字一致，Go 按 UTF-16 code unit 复刻，不能直接对 UTF-8 字节哈希；`A😀\n` 的 hash 为 `20558029`。
- `lockedVersionId` 与 `lockedVersionHash` 成对写入、清除和恢复；锁定、解锁和版本恢复的事务必须同时维护两者。
- 工作稿修改不改变 `lockedVersionHash`，也不影响“影视是否需要刷新”。
- 项目锁定版本包含全部剧集；本集锁定版本只包含对应剧集。快照中的剧集锁定引用先清除，版本只保存创作内容。
- 删除当前项目或剧集的锁定版本时直接拒绝。
- 已发布关系引用的版本不可删除。
- “恢复前安全稿”每个项目最多保留 3 份，其他版本不自动删除。
- 恢复项目版本替换全部创作内容；恢复本集版本只替换对应剧集。项目恢复按 ID 保留仍存在剧集的当前锁定对；本集恢复保留其他剧集锁定。
- 恢复非当前锁定版本时清除对应锁定引用；恢复当前锁定版本时保留原锁定引用。恢复操作不会自动激活快照中的其他版本。

### 5.4 发布关系

```ts
type ScriptPublication = {
    id: string;
    filmProjectId?: string;
    episodeIds: string[];
    sourceVersionIds: string[];
    sourceHash: string;
    status: "publishing" | "published" | "failed";
    publishedAt?: string;
    lastError?: string;
};
```

规则：

- 只有锁定版本可以发布。
- 同一 `publication.id` 重复执行时复用同一影视项目，并按原 `sourceVersionIds/sourceHash` 恢复同一份快照，不改用期间更新的锁定版本。
- `publicationStale` 在写入项目摘要时由当前所选剧集的锁定哈希与 `sourceHash` 比较得出；摘要字段只是派生缓存，不是独立真源。
- `sourceHash` 使用 canonical JSON + UTF-8 FNV-1a；canonical JSON 的 key 按 UTF-16 code unit 排序，Go 关闭 HTML 转义并还原 U+2028/U+2029。项目锁定直接使用项目锁定哈希，多集锁定按剧集 ID 排序后组合哈希。
- `publishing` 和 `failed` 只用于恢复中断的发布，不引入后台任务队列。

## 6. 后端存储

只新增两张表。

### 6.1 `script_projects`

| 字段 | 说明 |
| --- | --- |
| `id` | 项目 ID |
| `user_id` | 账号 ID，与 `id` 组成复合主键 |
| `title` | 列表标题 |
| `format` | 电影 / 剧集 / 短剧 |
| `genre` | 题材 |
| `logline` | 一句话梗概 |
| `episode_count` | 摘要 |
| `scene_count` | 摘要 |
| `character_count` | 摘要 |
| `word_count` | 摘要 |
| `locked_episode_count` | 摘要 |
| `has_publication` | 摘要 |
| `publication_stale` | 摘要 |
| `revision` | 项目 revision |
| `data` | 当前 `ScriptProjectDocument` JSON |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |
| `deleted_at` | 删除墓碑 |

### 6.2 `script_versions`

| 字段 | 说明 |
| --- | --- |
| `id` | 版本 ID |
| `project_id` | 项目 ID |
| `user_id` | 账号 ID |
| `scope` | `project` / `episode` |
| `episode_id` | 本集版本所属剧集 |
| `label` | 版本名 |
| `kind` | `manual` / `locked` / `safety` |
| `hash` | 内容 hash |
| `data` | 不可变 `ScriptContentSnapshot` JSON |
| `created_at` | 创建时间 |
| `deleted_at` | 删除墓碑 |

限制：

- 当前文档请求上限 8 MB，版本请求上限 16 MB。
- 所有读写必须校验 `user_id`。
- 版本创建、锁定激活和安全稿清理在同一事务内完成。
- 移除 `UserConfig.ScriptProjectData` 对应模型、接口和同步域；不增加迁移代码。

## 7. API

统一使用 `{ code, data, msg }` 响应结构。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/script/projects` | 项目摘要列表 |
| POST | `/api/v1/script/projects` | 新建或导入项目 |
| GET | `/api/v1/script/projects/:id` | 当前项目文档 |
| POST | `/api/v1/script/projects/:id/changes` | 合并项目变更 |
| DELETE | `/api/v1/script/projects/:id` | 删除项目 |
| GET | `/api/v1/script/projects/:id/versions` | 版本元数据列表 |
| GET | `/api/v1/script/projects/:id/versions/:versionId` | 单个版本内容 |
| POST | `/api/v1/script/projects/:id/versions` | 创建版本，可同时激活锁定 |
| POST | `/api/v1/script/projects/:id/versions/:versionId/restore` | 恢复版本并创建安全稿 |
| DELETE | `/api/v1/script/projects/:id/versions/:versionId` | 删除未锁定、未发布版本 |

### 7.1 变更请求

```ts
type ScriptConflictResolution = {
    scope: "header" | "scene";
    id?: string;
    choice: "local" | "remote";
};

type ScriptChangeRequest = {
    baseRevision: number;
    baseHeaderHash: string;
    baseScenes: Record<string, { revision: number; hash: string; episodeId: string }>;
    document: ScriptProjectDocument;
    resolutions?: ScriptConflictResolution[];
};
```

`header` 包含项目字段、人物、剧集外壳、场次 ID 顺序和发布关系；场次正文单独比较。header/scene 的 canonical JSON 在 TS/Go 均先规范化未配对 UTF-16 surrogate，再按 UTF-16 code unit 排序对象 key。

```ts
type ScriptHeader = {
    title: string;
    format: ScriptFormat;
    genre: string;
    logline: string;
    theme: string;
    synopsis: string;
    actOne: string;
    actTwo: string;
    actThree: string;
    characters: ScriptCharacter[];
    lockedVersionId?: string;
    lockedVersionHash?: string;
    episodes: Array<{
        id: string;
        no: number;
        title: string;
        sceneIds: string[];
        lockedVersionId?: string;
        lockedVersionHash?: string;
    }>;
    publications: ScriptPublication[];
};
```

### 7.2 合并规则

服务端在事务内读取当前项目：

1. `headerHash` 与本地基线相同：接受本地 header。
2. 本地 header 与基线相同：保留远端 header。
3. 两边都变化：返回 header 冲突；默认保留本地 header。
4. 场次按 ID 与内容 hash 同样处理；内容相同即判等并取较大 revision，不因两端 revision 不同产生假冲突。一侧未变化取另一侧，两侧不同且不等于基线产生冲突。
5. 新场次直接加入；一端删除且另一端未变化时接受删除，一端删除且另一端修改时返回冲突。冲突默认保留远端，`null` 表示删除。
6. `resolutions` 只对本次重新计算出的 header/scene 冲突生效，用户选择 `local/remote`；已消失或新增的冲突不被旧选择静默解决。`baseRevision` 不得大于远端当前 revision；小于当前 revision 时仍按原始 header/scene hash 合并，允许 resolution 随原基线继续提交。
7. 非冲突变更正常合并，冲突不阻塞其他场次；未被选中 header 引用的已合并场次按 base/local/remote 的原所属剧集重新挂回，仍无归属则放入第一集末尾。
8. 返回合并后的完整文档、新 revision 和未解决冲突列表。

```ts
type ScriptConflict = {
    scope: "header" | "scene";
    id?: string;
    local: ScriptHeader | ScriptScene | null;
    remote: ScriptHeader | ScriptScene | null;
};

type ScriptChangeResponse = {
    document: ScriptProjectDocument;
    revision: number;
    conflicts: ScriptConflict[];
};
```

## 8. 前端状态与本地持久化

### 8.1 Store

`useScriptStore` 只保留：

- 项目摘要列表。
- 已加载项目缓存。
- 每个项目的加载状态：`idle / local / loading / ready / error / missing`。
- 每个项目的同步状态：`local / syncing / synced / conflict / error`。
- 冲突缓存。
- 领域动作：创建、导入、更新、锁定、保存版本、恢复、删除版本、发布。

页面不再直接拼接 `drafts`、`lockedDraftId` 或跨 store 发布流程。

### 8.2 本地键

按账号分区：

```text
infinite-canvas:script:v2:index:<accountId>
infinite-canvas:script:v2:project:<accountId>:<projectId>
infinite-canvas:script:v2:version:<accountId>:<projectId>:<versionId>
infinite-canvas:script:v2:outbox:<accountId>:<projectId>
```

- 当前项目、版本和 outbox 使用 localforage。
- outbox 只保存最新待同步文档、基线及当前未确认的 `conflicts/resolutions`，不保存操作日志。收到冲突时保留原基线，`document` 继续保存本地待同步侧，header 和冲突场次绝不被远端默认值覆盖，只合并无冲突远端变更；服务端确认选择后才清除 outbox。
- 版本缓存没有独立索引 key，按版本 key 前缀枚举本地版本；账号模式以服务端版本列表为准。
- 登录后游客项目按 ID 合并；同 ID 按 revision 和内容 hash 判断，冲突进入选择流程。
- 登录用户离线时可编辑正文；版本创建、锁定、恢复和删除必须等待服务端事务成功，离线不产生可能悬空的锁定引用。游客版本操作完全本地执行。
- 退出登录和会话失效继续沿用整页 reload，避免内存状态跨账号串用。

### 8.3 深链加载

1. 先读本地项目缓存，有则立即显示并开始同步。
2. 账号模式下继续拉取远端；远端较新则合并。
3. 本地无缓存时等待首次远端结果。
4. 账号模式只有远端确认不存在或返回墓碑时才显示“剧本不存在”，并清除对应本地缓存。
5. 网络失败显示可重试错误，不伪装成空数据；游客模式直接使用本地缓存，不等待远端。

## 9. 剧本与影视发布

### 9.1 唯一发布服务

新增 `web/src/services/script-film-publication.ts`，承担：

- 解析锁定版本。
- 编译影视计划。
- 创建或复用影视项目。
- 更新来源节点和来源可控图节点。
- 更新剧本发布关系。
- 中断恢复与幂等重试。

页面只调用服务并展示结果。

### 9.2 稳定编译

锁定版本本身已经是结构化剧集和场次，不再拼成文本后重新解析。

- `FilmEpisode.id` 使用 `ScriptEpisode.id`。
- `FilmScene.id` 使用 `ScriptScene.id`。
- `FilmShot.id` 使用 `sceneId:shotIndex` 稳定键。
- 多集镜号包含集号，避免跨集重号。

共享影视解析器继续用于外部文件导入，不承担结构化剧本的二次转换。

### 9.3 来源节点

```ts
type FilmScriptSource = {
    projectId: string;
    projectTitle: string;
    publicationId: string;
    versionIds: string[];
    hash: string;
    publishedAt: string;
};

type FilmScriptNodeData = {
    text: string;
    source?: FilmScriptSource;
    parseSnapshots: FilmParseSnapshot[];
    structurePlan?: FilmStructurePlan;
};
```

删除无消费者的 `CanvasFilmMeta.scriptProjectId` 和 `scriptHash`。影视一致性检查改用 `source.hash`。
`CanvasFilmMeta.scriptPublicationId` 在影视项目创建时写入，用于发布中断后按 `publication.id` 找回同一项目；它不保存剧本正文。

### 9.4 安全刷新

新增来源键：

- `FilmSceneNodeData.scriptSourceKey`
- `FilmShotNodeData.scriptSourceKey`
- `FilmShotNodeData.scriptSourcePromptHash`，用于识别来源生成后被人工改写的提示词。

刷新流程：

1. 按 `scriptSourceKey` 匹配旧节点与新计划。
2. 同键场次保留节点 ID，更新结构字段。
3. 同键镜头保留节点 ID、媒体、提示词、资产绑定和任务状态，只更新来源派生字段。
4. 新来源节点追加到对应场次和序列。
5. 已删除来源节点若含媒体、绑定、自定义提示词或任务，则解除来源关联并保留；否则删除。
6. 非来源节点和人工连线始终保留；来源边使用 `script:<publicationId>:<from>-><to>` ID，只有当前 publication 前缀的边可由刷新重建。
7. 刷新前返回预览：新增、更新、保留、删除、受保护节点，以及本次来源 hash。
8. 确认应用时重新读取锁定来源；当前 hash 与预览不一致则拒绝应用，要求重新预览。
9. 刷新后保存撤销快照，继续只保留最近 3 次；快照同时记录更新前节点和解除来源关联的节点，撤销时恢复这两类状态。

### 9.5 影视侧入口

剧本检查器增加：

- 来源项目名、发布时间和 hash。
- “来源已更新”状态。
- “打开来源剧本”。
- “预览并刷新”。

没有来源关系的传统影视剧本节点保持原有导演分析能力。

## 10. UI 收敛

保留现有五个标签：故事、人物、结构、分场、剧本。

只增加三处轻量交互：

1. **剧集切换条**：集名、场次数、完成度、锁定标记；分场和剧本页共用。
2. **发布状态**：顶部按钮显示“已锁定 X 集”，来源过期时显示小圆点。
3. **冲突选择**：本地 / 远端两列预览，用户选择一侧后随原基线提交 resolution；服务端确认后再建立新基线。

版本弹窗按“全部 / 项目 / 本集”过滤；锁定和已发布版本显示保护标记，不提供删除入口。

## 11. 错误处理与恢复

- 本地写入失败：保留内存变更并显示保存错误，可重试。
- 远端网络失败：保留 outbox，恢复在线后继续同步。
- 场次冲突：合并其他场次，冲突项等待用户选择。
- header 冲突：保留本地文档，展示远端 header 供选择。
- 中断恢复根据 `publication.id` 查找已有影视项目并继续，不重复创建。
- 发布按“publishing 剧本关系落盘 → 影视项目与发布标记落盘 → 图更新落盘 → published 状态落盘”推进；登录同步开启时本地和云端画布均保存成功后才标记 published。
- 发布失败：记录 `lastError`，用户可以携带原 `publicationId` 重试；不静默降级为普通影视项目。
- 版本删除冲突：前后端都执行锁定和发布引用校验。

## 12. 测试与验收

### 12.1 前端纯函数测试

- 多集导入、导出和稳定影视编译。
- 项目锁定、本集锁定、恢复和删除不变量。
- 场次级合并、删除墓碑和冲突生成。
- 发布新鲜度计算。
- 刷新预览与人工节点保护。

### 12.2 后端测试

- 项目归属隔离。
- 不同场次并发变更合并。
- 同场冲突和 header 冲突返回。
- 版本不可变、锁定激活和恢复事务。
- 已发布版本禁止删除。
- 摘要统计与当前文档一致。

### 12.3 必须验收的端到端路径

1. 三集剧本导入后仍为三集，转影视后生成三集。
2. 更新锁定稿后影视侧显示过期，预览并刷新同一项目。
3. 两台设备修改不同场次不互相覆盖；同场冲突可见。
4. 新设备直接打开剧本深链不闪空态。
5. 刷新分镜不删除人工镜头、媒体和绑定。
6. 删除当前锁定版本被阻止。
7. 列表接口不返回历史版本内容。

真实 AI、跨设备、移动端和媒体生成验收结果写入 `docs/progress/pending-test.md`，未实测项明确标注。

## 13. 文档与交付

实现时同步更新：

- `docs/backend/backend-database.md`
- `docs/backend/api-response.md`（仅补充剧本变更冲突语义）
- `docs/progress/todo.md`
- `docs/progress/pending-test.md`
- `CHANGELOG.md`

`docs/overview/features.md` 在用户确认端到端验收后再更新为正式功能说明。
