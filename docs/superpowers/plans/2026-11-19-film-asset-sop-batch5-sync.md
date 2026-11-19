# 影视资产 SOP 批次 5：账号级云同步实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目当前不使用子代理，按任务顺序在本会话内执行。

**Goal:** 让影视项目列表与五类资产库在登录且账号同步可用时跨设备同步，未登录或断网时完全回落本地。

**Architecture:** 复用「我的素材」模式：后端在 `user_configs` 增加两个独立 JSON 域，前端新增两个 GET/POST 端点封装；前端同步模块按 id + `updatedAt` 合并后整域覆盖推送，写入防抖、失败退避重试、窗口聚焦时拉取，登出停止。

**Tech Stack:** Go + Gin + GORM、Next.js App Router、React、Zustand、localforage、Bun test。

**Spec:** `docs/superpowers/specs/2026-11-19-film-asset-sop-design.md`（第八节：批次 5）

## Global Constraints

- 复用 `syncCapabilities.userData` 作为同步开关，不新增权限位。
- 两个独立数据域：`film_project_data`（影视项目列表）、`film_library_data`（五类资产库）；互不覆盖。
- 冲突策略沿用「我的素材」：按 id 合并，同 id 取 `updatedAt` 更新的一方，合并后整域 POST。
- 登录接管沿用 `readAccountStorage`：本地独有 id 保留并补传，游客数据登录后不丢。
- 媒体只传 `storageKey` 引用，影视数据不存在 base64 字段。
- 未登录、同步开关关闭、后台路由：不发起任何同步请求，只写本地。
- 写入同步防抖 800ms；失败退避 5s / 15s / 45s，三次失败在保存指示器显示错误；窗口聚焦或标签页恢复可见时拉取远端，30s 节流。
- 不写旧字段兼容或迁移代码；`docs/progress/todo.md`、`docs/progress/pending-test.md`、`CHANGELOG.md` 随批次更新。

---

### Task 1: 后端两个同步数据域

**Files:**
- Modify: `model/user_config.go`
- Modify: `repository/user_config.go`
- Modify: `service/user_data.go`
- Modify: `handler/user_data.go`
- Modify: `router/router.go`
- Modify: `docs/backend/backend-database.md`

**Interfaces:**
- Produces: `GET/POST /api/v1/user-data/film-projects`、`GET/POST /api/v1/user-data/film-library`，均为 `{ data: json }` 请求/响应，默认返回空域。

- [ ] **Step 1: 模型加两个字段**

```go
FilmProjectData string `json:"filmProjectData" gorm:"size:134217728"`
FilmLibraryData string `json:"filmLibraryData" gorm:"size:134217728"`
```

- [ ] **Step 2: 仓储加两个类型化保存函数**

```go
func SaveUserFilmProjectData(userID, raw string) (model.UserConfig, error) {
	return updateUserConfigField(userID, map[string]any{"film_project_data": raw})
}

func SaveUserFilmLibraryData(userID, raw string) (model.UserConfig, error) {
	return updateUserConfigField(userID, map[string]any{"film_library_data": raw})
}
```

- [ ] **Step 3: service 读写与默认空域**

```go
func CurrentUserFilmProjectData(ctx context.Context) (json.RawMessage, error) {
	config, err := currentUserConfig(ctx)
	if err != nil { return nil, err }
	if strings.TrimSpace(config.FilmProjectData) == "" { return json.RawMessage(`{"projects":[]}`), nil }
	return json.RawMessage(config.FilmProjectData), nil
}

func SaveCurrentUserFilmProjectData(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	user, ok := UserFromContext(ctx)
	if !ok || user.ID == "" { return nil, errors.New("请先登录") }
	config, err := repository.SaveUserFilmProjectData(user.ID, string(raw))
	if err != nil { return nil, err }
	return json.RawMessage(config.FilmProjectData), nil
}
```

影视资产库同构：默认 `{"characters":[],"locations":[],"props":[],"costumes":[],"styles":[]}`。

- [ ] **Step 4: handler + 路由**

handler 请求体 `{ "data": json.RawMessage }`，读取上限 `129<<20`；路由与素材端点并列：

```go
v1.GET("/user-data/film-projects", gin.WrapF(handler.UserFilmProjectData))
v1.POST("/user-data/film-projects", gin.WrapF(handler.SaveUserFilmProjectData))
v1.GET("/user-data/film-library", gin.WrapF(handler.UserFilmLibraryData))
v1.POST("/user-data/film-library", gin.WrapF(handler.SaveUserFilmLibraryData))
```

- [ ] **Step 5: 文档与后端校验**

`docs/backend/backend-database.md` 的 `user_configs` 表补 `film_project_data`、`film_library_data` 两行。

运行：`go build ./...`（期望通过）。

---

### Task 2: 前端接口与合并纯函数

**Files:**
- Modify: `web/src/services/api/user-config.ts`
- Create: `web/src/app/(user)/film/utils/film-account-merge.ts`
- Create: `web/src/app/(user)/film/utils/film-account-merge.test.ts`

**Interfaces:**
- Produces:
  - `fetchUserFilmProjects<T>(token): Promise<T>`、`syncUserFilmProjects<T>(token, data): Promise<T>`
  - `fetchUserFilmLibrary<T>(token): Promise<T>`、`syncUserFilmLibrary<T>(token, data): Promise<T>`
  - `mergeFilmProjects(remote, local): { projects: FilmProject[]; shouldPush: boolean }`
  - `mergeFilmLibrary(remote, local): { snapshot: FilmLibrarySnapshot; shouldPush: boolean }`

- [ ] **Step 1: 写失败测试（合并规则）**

覆盖：本地独有保留且 `shouldPush=true`；同 id 本地更新取本地且推送；远端更新取远端且不推送。

```ts
assert.deepEqual(mergeFilmProjects([remoteOld], [localNew]).projects.map((p) => p.title), ["本地新"]);
assert.equal(mergeFilmProjects([remoteOld], [localNew]).shouldPush, true);
assert.equal(mergeFilmProjects([remoteNew], [localOld]).shouldPush, false);
```

- [ ] **Step 2: 实现合并纯函数**

```ts
function mergeList<T extends { id: string; updatedAt: string }>(remote: T[], local: T[]) {
	let shouldPush = false;
	const map = new Map(remote.map((item) => [item.id, item]));
	for (const item of local) {
		const previous = map.get(item.id);
		if (!previous || Date.parse(item.updatedAt) > Date.parse(previous.updatedAt)) {
			shouldPush = true;
			map.set(item.id, item);
		}
	}
	return { list: [...map.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), shouldPush };
}
```

五域库分别合并；任一域 `shouldPush` 则为 true。

- [ ] **Step 3: API 封装**

```ts
export async function fetchUserFilmProjects<T>(token: string) { return apiGet<T>("/api/v1/user-data/film-projects", undefined, token); }
export async function syncUserFilmProjects<T>(token: string, data: T) { return apiPost<T>("/api/v1/user-data/film-projects", { data }, token); }
```

- [ ] **Step 4: 运行测试**

Run: `cd web && bun test src/app/\(user\)/film/utils/film-account-merge.test.ts`（期望通过）。

---

### Task 3: 同步模块与登录引导

**Files:**
- Create: `web/src/services/film-sync.ts`
- Modify: `web/src/hooks/use-session-bootstrap.ts`

**Interfaces:**
- Consumes: Task 2 的四个 API 与两个 merge 函数；`useFilmStore`、`useFilmCastStore`、`useSaveStatusStore`。
- Produces: `hydrateFilmAccountSync(token, enabled): Promise<void>`、`stopFilmAccountSync(): void`。

- [ ] **Step 1: 实现同步模块**

关键行为：

```ts
const DEBOUNCE = 800;
const RETRY_DELAYS = [5000, 15000, 45000];
let token = "";
let enabled = false;
let hydrating = false;
let lastPullAt = 0;

export async function hydrateFilmAccountSync(nextToken: string, syncEnabled: boolean) {
	if (!syncEnabled) { stopFilmAccountSync(); return; }
	token = nextToken;
	enabled = true;
	await Promise.all([waitForHydration(useFilmStore), waitForHydration(useFilmCastStore)]);
	hydrating = true;
	try {
		const [remoteProjects, remoteLibrary] = await Promise.all([fetchUserFilmProjects<FilmProjectSnapshot>(token), fetchUserFilmLibrary<FilmLibrarySnapshot>(token)]);
		const projectMerge = mergeFilmProjects(remoteProjects?.projects || [], useFilmStore.getState().projects);
		const libraryMerge = mergeFilmLibrary(remoteLibrary || EMPTY_LIBRARY, snapshotOf(useFilmCastStore.getState()));
		useFilmStore.setState({ projects: projectMerge.projects });
		useFilmCastStore.setState(libraryMerge.snapshot);
		if (projectMerge.shouldPush) void pushProjects();
		if (libraryMerge.shouldPush) void pushLibrary();
	} finally { hydrating = false; }
	registerListeners();
}
```

- 订阅两个 store：列表引用变化且非 `hydrating` 时 `scheduleProjects()` / `scheduleLibrary()`。
- 防抖推送；推送成功重置重试，失败按 `RETRY_DELAYS` 重试，三次失败 `useSaveStatusStore.getState().setStatus("error")`，后续成功 `setStatus("saved")`。
- `window.focus` 与 `visibilitychange(visible)` 时，若距上次拉取超过 30s，拉取并合并；合并设置状态时置 `applyingRemote` 跳过推送订阅。
- `stopFilmAccountSync()` 清空 token/enabled 与全部定时器。

- [ ] **Step 2: 登录引导接入**

`use-session-bootstrap.ts`：

```ts
const { hydrateFilmAccountSync, stopFilmAccountSync } = await import("@/services/film-sync");
void hydrateFilmAccountSync(accountToken, syncEnabled);
```

`!userId` 分支与后台路由调用 `stopFilmAccountSync()`；TokenDance 回调仍执行同步引导。

- [ ] **Step 3: 校验**

Run: `cd web && bun run typecheck && bun run lint`（期望通过）。

---

### Task 4: 资源清理与多账号隔离确认

**Files:**
- Modify: `web/src/services/storage-references.ts`（仅确认五域库与项目已纳入；前批次已完成）

**Interfaces:** 无新增接口。

- [ ] **Step 1: 确认媒体引用**

项目与五域库已由 `collectStorageReferenceKeys` 深度遍历收集；云同步不额外上传媒体，跨设备通过 `storageKey` 解析。

- [ ] **Step 2: 多账号隔离**

登录切换沿用整页重载与 `accountStorageKey` 分区；同步模块按 token 变化重新引导，登出停止推送。

---

### Task 5: 回归、浏览器与文档

**Files:**
- Modify: `docs/progress/pending-test.md`
- Modify: `docs/progress/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 全量回归**

Run: `cd web && bun test && bun run typecheck && bun run lint`（期望全绿）。
Run: `go build ./...`（期望通过）。

- [ ] **Step 2: 浏览器/接口冒烟**

登录状态创建临时影视项目与资产，确认两个端点收到 POST；刷新后数据仍在；删除临时数据并确认远端恢复为空。

- [ ] **Step 3: 文档**

- `pending-test.md`：记录两个数据域、登录接管、防抖/重试/聚焦拉取、退出停止与验证结果。
- `todo.md`：移除 SOP 批次 5，保留真实双账号与跨设备验收。
- `CHANGELOG.md`：`Unreleased` 增加云同步条目。

## Self-Review

- 规范覆盖：两个独立数据域、`updatedAt` 合并整域覆盖、登录接管、storageKey、同步时机与失败重试均有对应任务。
- 未做：自动双向实时协作、项目/库条目级增量接口、媒体二进制云端同步（沿用存储键引用）。
- 待用户确认的边界：跨设备媒体读取依赖账号云存储配置；未配置时图片在另一设备可能显示缺失，但资产设定 JSON 仍同步。
