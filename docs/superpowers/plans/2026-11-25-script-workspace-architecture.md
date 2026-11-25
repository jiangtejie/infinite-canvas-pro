# 剧本创作工作台架构改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将剧本创作从“整项目 JSON + 扁平场次 + 覆盖式影视交接”改造为“剧集领域模型 + 项目级持久化 + 场次级同步 + 不可变锁定版本 + 安全影视刷新”。

**Architecture:** 剧本域拥有项目、剧集、场次、版本和发布关系；当前文档与版本分别存入两张后端表。前端使用账号分区 localforage 缓存和每项目 outbox，同步以 header/scene hash 做三方合并，冲突交给用户选择。影视域只接收锁定版本编译结果，通过稳定来源键刷新并保留人工节点、媒体、绑定和任务。

**Tech Stack:** Next.js App Router、React、TypeScript、Zustand、Ant Design 6、localforage、Bun Test、Go、Gin、GORM、SQLite/MySQL/PostgreSQL。

**Spec:** `docs/superpowers/specs/2026-11-25-script-workspace-architecture-design.md`

## Global Constraints

- 不保留旧数据迁移、旧字段兼容、旧接口兼容或旧表清理逻辑；直接删除 `status`、`lockedDraftId`、`drafts`、`ScriptProjectData` 和整域同步入口。
- 不引入 CRDT、实时协作、操作日志、逐场次物理表或后台任务队列。
- 只新增 `script_projects`、`script_versions` 两张业务表。
- 不新增页面、导航或影视工作台；保留故事、人物、结构、分场、剧本五个标签。
- UI 文案保持中文；Ant Design 使用 6.x API；画布 UI 复用现有主题与组件风格。
- 剧本列表只加载摘要；正文和版本按项目、按需加载。
- 所有后端读写按 `user_id` 隔离；变更冲突使用 HTTP 200 + `{ code: 0, data: { document, revision, conflicts }, msg }`。
- 当前文档请求上限 8 MB，版本请求上限 16 MB。
- 不自动删除命名版本、当前锁定版本和已发布来源版本；每个项目最多保留 3 份恢复前安全稿。
- 发布只使用锁定版本；同一 `publication.id` 必须复用同一影视项目。
- 刷新只处理带 `scriptSourceKey` 的来源节点；人工节点、人工连线、媒体、资产绑定和任务不得删除。
- 工作区已有大量无关改动，实施时不得回滚、覆盖、暂存或清理无关文件。
- 用户尚未授权 Git 提交或推送；所有任务均不执行 `git add`、`git commit` 或 `git push`。
- 每批完成后更新 `docs/progress/todo.md` 与 `docs/progress/pending-test.md`；正式功能说明仅在用户验收后更新。

---

## 文件结构

| 领域 | 新建 | 主要修改 |
| --- | --- | --- |
| 剧本领域 | `web/src/app/(user)/script/utils/script-document.ts`、`script-version.ts`、`script-publication.ts`、`script-merge.ts`、`script-outbox.ts`、`script-film-plan.ts` | `script/types.ts`、`utils/script-project.ts`、`utils/script-import.ts` |
| 剧本状态 | `web/src/services/api/script.ts`、`web/src/services/script-sync.ts`、`web/src/services/script-film-publication.ts`、`web/src/app/(user)/script/[id]/use-script-document.ts` | `stores/use-script-store.ts`、`services/creative-sync.ts`、`services/api/user-config.ts` |
| 剧本 UI | `components/script-episode-switcher.tsx`、`script-conflict-modal.tsx`、`script-workspace-header.tsx` | 列表页、工作区页、故事/结构/分场/剧本/版本组件 |
| 后端领域 | `model/script_project.go`、`model/script_project_merge.go`、`repository/script_project.go`、`repository/script_version.go`、`service/script_project.go`、`handler/script_project.go` | `repository/db.go`、`router/router.go`、旧 user-config 剧本链路 |
| 影视领域 | `web/src/app/(user)/canvas/[id]/lib/film-script-refresh.ts` | canvas 类型、影视检查器、一致性检查、canvas store 创建入口、撤销逻辑 |
| 测试文档 | `web/src/test/script-fixtures.ts`、`web/src/test/script-memory-driver.ts`、对应 `*.test.ts`、`*_test.go`、`router/router_test.go` | backend database/API 文档、todo、pending-test、CHANGELOG |

## 测试夹具约定

每个未在代码块中展示 import 的 `*.test.ts`，均在文件首部加入 `import assert from "node:assert/strict";`、`import test from "node:test";` 及该测试实际消费的模块。本计划只新增纯函数、Store 动作和存储契约测试，不依赖 DOM；需要 localforage 的测试在导入被测模块前调用 `installScriptMemoryDriver()`。Go 测试按实际使用补齐 `context`、`encoding/json`、`sync`、`testing`、GORM 与配置包 import。

前端测试夹具放在 `web/src/test/script-fixtures.ts`，由剧本与影视刷新测试共同导入：

```ts
import type { FilmScriptSource, CanvasConnection, CanvasNodeData } from "@/app/(user)/canvas/types";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import type { ScriptContentSnapshot, ScriptProjectDocument } from "@/app/(user)/script/types";

export function fixtureDocument(id = "p1"): ScriptProjectDocument {
    return {
        schemaVersion: 2, id, title: "测试剧本", format: "tv", genre: "", logline: "", theme: "", synopsis: "", actOne: "", actTwo: "", actThree: "", characters: [],
        episodes: [{ id: "ep-1", no: 1, title: "第一集", scenes: [
            { id: "scene-1", no: 1, interiorExterior: "内景", location: "房间", timeOfDay: "日", characters: [], goal: "", conflict: "", turn: "", outcome: "", summary: "", content: "第一段", notes: "", revision: 1, updatedAt: "2026-11-25T00:00:00.000Z" },
            { id: "scene-2", no: 2, interiorExterior: "外景", location: "街道", timeOfDay: "夜", characters: [], goal: "", conflict: "", turn: "", outcome: "", summary: "", content: "第二段", notes: "", revision: 1, updatedAt: "2026-11-25T00:00:00.000Z" },
        ] }],
        publications: [], createdAt: "2026-11-25T00:00:00.000Z", updatedAt: "2026-11-25T00:00:00.000Z",
    };
}

export function fixtureSnapshot(): ScriptContentSnapshot {
    const document = fixtureDocument();
    return { title: document.title, format: document.format, genre: document.genre, logline: document.logline, theme: document.theme, synopsis: document.synopsis, actOne: document.actOne, actTwo: document.actTwo, actThree: document.actThree, characters: [], episodes: structuredClone(document.episodes) };
}

export function updatedSnapshotWithoutSceneOne(): ScriptContentSnapshot {
    const snapshot = fixtureSnapshot();
    snapshot.episodes[0].scenes = snapshot.episodes[0].scenes.filter((scene) => scene.id !== "scene-1");
    return snapshot;
}

export const source: FilmScriptSource = { projectId: "p1", projectTitle: "测试剧本", publicationId: "pub-1", versionIds: ["v1"], hash: "hash-1", publishedAt: "2026-11-25T00:00:00.000Z" };

export function fixturePublishedGraph(): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } {
    return {
        nodes: [
            { id: "scene-1", type: CanvasNodeType.FilmScene, title: "房间", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { filmScene: { episodeId: "ep-1", episodeTitle: "第一集", name: "房间", location: "房间", time: "日", mood: "", scriptSourceKey: "scene-1" } } },
            { id: "scene-1:0", type: CanvasNodeType.FilmShot, title: "镜头", position: { x: 0, y: 240 }, width: 300, height: 200, metadata: { filmShot: { shotNo: "1-1-1", shotType: "MS", cameraMovement: "固定", duration: 4, description: "第一段", dialogue: "", audio: "", prompt: "来源提示词", scriptSourceKey: "scene-1:0", scriptSourcePromptHash: "prompt-hash" } } },
        ],
        connections: [{ id: "script:pub-1:scene-1->scene-1:0", fromNodeId: "scene-1", toNodeId: "scene-1:0", kind: "composition" }],
    };
}
```

后端测试夹具放在 `service/script_project_test.go`，沿用现有 service 测试的 SQLite 初始化方式：

```go
var scriptDBTestLock sync.Mutex

func setupScriptServiceDB(t *testing.T) {
    t.Helper()
    scriptDBTestLock.Lock()
    t.Cleanup(scriptDBTestLock.Unlock)
    config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: ":memory:"}
    db, err := repository.DB()
    if err != nil { t.Fatal(err) }
    for _, table := range []any{&model.ScriptVersion{}, &model.ScriptProject{}, &model.UserConfig{}} {
        if err := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(table).Error; err != nil { t.Fatal(err) }
    }
}

func scriptContext(id string) context.Context {
    return WithUser(context.Background(), model.AuthUser{ID: id})
}

func validScriptDocument() model.ScriptProjectDocument {
    return model.ScriptProjectDocument{
        SchemaVersion: 2, ID: "project-1", Title: "测试剧本", Format: "tv", Publications: []model.ScriptPublication{},
        Episodes: []model.ScriptEpisode{{ ID: "ep-1", No: 1, Title: "第一集", Scenes: []model.ScriptScene{
            { ID: "scene-1", No: 1, Content: "第一场", Revision: 1, UpdatedAt: "2026-11-25T00:00:00.000Z" },
            { ID: "scene-2", No: 2, Content: "第二场", Revision: 1, UpdatedAt: "2026-11-25T00:00:00.000Z" },
        } }},
        CreatedAt: "2026-11-25T00:00:00.000Z", UpdatedAt: "2026-11-25T00:00:00.000Z",
    }
}

func cloneScriptDocument(input model.ScriptProjectDocument) model.ScriptProjectDocument {
    data, _ := json.Marshal(input)
    var output model.ScriptProjectDocument
    _ = json.Unmarshal(data, &output)
    return output
}

func scriptChangeRequest(base, local model.ScriptProjectDocument, revision int64) model.ScriptChangeRequest {
    baseline := model.NewScriptSyncBaseline(base, revision)
    return model.ScriptChangeRequest{ BaseRevision: revision, BaseHeaderHash: baseline.HeaderHash, BaseScenes: baseline.Scenes, Document: local }
}

func validScriptVersion(document model.ScriptProjectDocument, kind string) model.ScriptVersionPayload {
    data := model.ScriptContentSnapshot{ Title: document.Title, Format: document.Format, Episodes: cloneScriptDocument(document).Episodes }
    return model.ScriptVersionPayload{ ID: "version-1", ProjectID: document.ID, Scope: "project", Label: "测试版本", Kind: kind, Hash: model.ScriptVersionContentHash(data), Data: data, CreatedAt: "2026-11-25T00:00:00.000Z" }
}
```

`router/router_test.go` 的 `assertRoute` 只比较 `route.Method` 与 `route.Path`，不依赖 Gin 内部路由树：

```go
func assertRoute(t *testing.T, routes gin.RoutesInfo, method, path string) {
    t.Helper()
    for _, route := range routes {
        if route.Method == method && route.Path == path { return }
    }
    t.Fatalf("route %s %s not registered", method, path)
}
```

---

### Task 1: 建立剧集感知的领域模型与文档工具

**Files:**
- Modify: `web/src/app/(user)/script/types.ts:1-63`
- Modify: `web/src/app/(user)/script/utils/script-project.ts:12-202`
- Create: `web/src/app/(user)/script/utils/script-document.ts`
- Test: `web/src/app/(user)/script/utils/script-document.test.ts`
- Test: `web/src/app/(user)/script/utils/script-project.test.ts`

**Interfaces:**
- Consumes: 现有 `ScriptCharacter`、`ScriptScene` 字段。
- Produces:
  - `ScriptProjectDocument`、`ScriptEpisode`、`ScriptProjectSummary`、`ScriptContentSnapshot`、`ScriptVersion`、`ScriptPublication`、`ScriptConflict`、`ScriptSnapshotDiff`。
  - `createScriptProject(input): ScriptProjectDocument`
  - `createScriptEpisode(no: number, title?: string): ScriptEpisode`
  - `createScriptScene(no: number): ScriptScene`
  - `summarizeScriptProject(document): ScriptProjectSummary`
  - `snapshotScriptContent(document): ScriptContentSnapshot`
  - `scriptDataHash(value: unknown): string`
  - `exportScriptText(document: ScriptContentSnapshot): string`

- [ ] **Step 1: 写领域测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createScriptEpisode, createScriptProject, createScriptScene } from "./script-project";
import { scriptDataHash, summarizeScriptProject } from "./script-document";

test("tv documents keep episodes and compute summary from all scenes", () => {
    const project = createScriptProject({ title: "三集剧", format: "tv" });
    const episodes = [1, 2, 3].map((no) => {
        const episode = createScriptEpisode(no, `第 ${no} 集`);
        episode.scenes = [createScriptScene(1), createScriptScene(2)];
        episode.scenes[1].content = "第二场正文";
        return episode;
    });
    const document = { ...project, episodes };
    const summary = summarizeScriptProject(document);
    assert.equal(summary.episodeCount, 3);
    assert.equal(summary.sceneCount, 6);
    assert.equal(summary.wordCount, 5);
    assert.equal("scenes" in document, false);
});

test("canonical data hash normalizes key order and Unicode", () => {
    assert.equal(scriptDataHash({ z: "<>&\u2028😀", a: "中文" }), "223ee7fb");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/script/utils/script-document.test.ts"`
Expected: FAIL，模块或函数不存在。

- [ ] **Step 3: 替换类型并实现文档工具**

```ts
export type ScriptProjectDocument = {
    schemaVersion: 2;
    id: string;
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
    lockedVersionId?: string;
    lockedVersionHash?: string;
    publications: ScriptPublication[];
    createdAt: string;
    updatedAt: string;
};
```

实现时同时：
- `createScriptScene` 初始化 `revision: 1` 与 `updatedAt`。
- `createScriptProject` 对 `film/short/tv` 均创建一集；`tv` 的首集是空壳，用户继续添加实际剧集。
- `collectScriptCharacterNames`、`scriptWordCount`、`scriptPageCount` 改为遍历 `episodes.flatMap(episode => episode.scenes)`。
- `scriptDataHash` 对递归排序 key 的 canonical JSON 的 UTF-8 字节做 FNV-1a 32 位哈希；前端用 `TextEncoder`，Go 用 `hash/fnv`。对象 key 按 UTF-16 code unit 排序，字符串先 `toWellFormed()`，数组和 schema 固定的整数保持 JSON 原义；Go JSON 关闭 HTML 转义并还原 U+2028/U+2029，加入中文、emoji、`<>&` 的跨端固定向量测试。
- `exportScriptText` 是确定性的完整内容文本，TS/Go 必须逐字一致：依次输出 `标题/格式/题材/Logline/主题/梗概/第一幕/第二幕/第三幕`；每个人物按固定字段顺序输出 `id/name/role/want/need/flaw/arc/description`；每集输出 `episode.id/no/title`；每场按固定顺序输出 `id/no/interiorExterior/location/timeOfDay/characters/goal/conflict/turn/outcome/summary/content/notes`。字段统一输出为 `名称：${JSON.stringify(值)}`，数组和对象也按字段顺序序列化，保证换行、反斜线和空值无歧义；`revision/updatedAt` 和锁定引用不进入正文。`scriptTextHash(exportScriptText(snapshot))` 因此覆盖快照全部创作字段且不随锁状态变化。
- 删除 `ScriptDraft`、`ScriptProject.status`、`lockedDraftId`、`filmProjectId`、`scenes`、`drafts`。
- `summarizeScriptProject` 的 `lockedEpisodeCount` 在存在项目锁定时等于全部剧集数，否则只统计拥有完整锁定对的剧集；`publicationStale` 检查任一未失败 publication 的来源哈希是否已变化。

- [ ] **Step 4: 运行领域测试**

Run: `cd web && bun test "src/app/(user)/script/utils/script-document.test.ts" "src/app/(user)/script/utils/script-project.test.ts"`
Expected: PASS。

---

### Task 2: 实现不可变版本、锁定不变量与发布新鲜度

**Files:**
- Create: `web/src/app/(user)/script/utils/script-version.ts`
- Create: `web/src/app/(user)/script/utils/script-publication.ts`
- Test: `web/src/app/(user)/script/utils/script-version.test.ts`
- Test: `web/src/app/(user)/script/utils/script-publication.test.ts`

**Interfaces:**
- Consumes: Task 1 的文档、快照、版本和发布类型，以及 `@/lib/film/film-script-import` 的 `scriptTextHash`。
- Produces:
  - `createScriptVersion(document, input): ScriptVersion`
  - `activateScriptVersion(document, version): ScriptProjectDocument`
  - `restoreScriptVersion(document, version): { document: ScriptProjectDocument; safety: ScriptVersion }`
  - `canDeleteScriptVersion(document, version): { allowed: boolean; reason?: string }`
  - `diffScriptSnapshots(current: ScriptContentSnapshot, previous: ScriptContentSnapshot): ScriptSnapshotDiff`
  - `publicationSourceHash(document, episodeIds): string | null`
  - `isPublicationStale(document, episodeIds, sourceHash): boolean`
  - `resolvePublicationVersions(document, versions, episodeIds): ScriptVersion[]`

- [ ] **Step 1: 写锁定与恢复测试**

```ts
import { scriptTextHash } from "@/lib/film/film-script-import";

test("episode lock writes id/hash pair and stale follows lock hash", () => {
    const document = createScriptProject({ title: "测试", format: "tv" });
    const version = createScriptVersion(document, { scope: "episode", episodeId: document.episodes[0].id, label: "本集锁定", kind: "locked" });
    const locked = activateScriptVersion(document, version);
    assert.equal(locked.episodes[0].lockedVersionId, version.id);
    assert.equal(locked.episodes[0].lockedVersionHash, version.hash);
    assert.equal(isPublicationStale(locked, [document.episodes[0].id], version.hash), false);

    const next = createScriptVersion(locked, { scope: "episode", episodeId: document.episodes[0].id, label: "新锁定", kind: "locked" });
    const relocked = activateScriptVersion(locked, next);
    assert.equal(isPublicationStale(relocked, [document.episodes[0].id], version.hash), true);
});

test("content hash preserves UTF-16 code unit semantics", () => {
    assert.equal(scriptTextHash("A😀\n"), "20558029");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/script/utils/script-version.test.ts" "src/app/(user)/script/utils/script-publication.test.ts"`
Expected: FAIL，函数不存在。

- [ ] **Step 3: 实现版本与发布规则**

```ts
export function createScriptVersion(
    document: ScriptProjectDocument,
    input: { scope: "project" | "episode"; episodeId?: string; label: string; kind: "manual" | "locked" | "safety" },
): ScriptVersion {
    if (input.scope === "episode" && !document.episodes.some((episode) => episode.id === input.episodeId)) {
        throw new Error("剧集不存在");
    }
    const data = snapshotScriptContent(document);
    if (input.scope === "episode") {
        data.episodes = data.episodes.filter((episode) => episode.id === input.episodeId);
    }
    return {
        id: nanoid(),
        projectId: document.id,
        scope: input.scope,
        episodeId: input.episodeId,
        label: input.label.trim() || "未命名版本",
        kind: input.kind,
        hash: scriptTextHash(exportScriptText(data)),
        data,
        createdAt: new Date().toISOString(),
    };
}
```

```ts
export type ScriptSnapshotDiff = {
    scenes: Array<{
        id: string;
        no: number;
        heading: string;
        status: "added" | "removed" | "changed" | "same";
        changedFields: string[];
        wordDelta: number;
    }>;
    added: number;
    removed: number;
    changed: number;
    same: number;
    wordDelta: number;
    characterChanges: string[];
};
```

- `snapshotScriptContent` 深拷贝创作字段并清除剧集内的锁定引用；历史版本不保存“当时自动成为当前锁定”的派生状态。
- `activateScriptVersion` 只接受 `kind === "locked"`；项目版本写项目锁定对，本集版本写对应剧集锁定对。
- `restoreScriptVersion` 深拷贝快照；项目版本替换全部创作字段，本集版本只替换对应剧集；恢复项 `revision + 1` 并更新 `updatedAt`。项目恢复时按 ID 保留仍存在的剧集当前锁定对；本集恢复时其他剧集锁定不变，本集仅在恢复的就是当前锁定版本时保留锁定对。
- 恢复非当前锁定版本时清除对应锁定对；恢复当前锁定版本时保留锁定对；恢复不会激活快照中的任何旧版本。
- `canDeleteScriptVersion` 拒绝删除当前项目/剧集锁定版本和任一 `publication.sourceVersionIds` 引用的版本。
- `diffScriptSnapshots` 返回新的 `ScriptSnapshotDiff`，字段沿用旧版本比较弹窗需要的 `scenes/added/removed/changed/same/wordDelta/characterChanges`，但输入改为两个 `ScriptContentSnapshot`。
- `isPublicationStale` 使用所选剧集当前 `lockedVersionHash` 组合出的来源哈希与 `sourceHash` 比较；项目锁定版本直接使用项目锁定哈希。组合哈希固定为 `scriptDataHash(selected.map(item => `${item.episodeId}:${item.hash}`).join("\n"))`，所选剧集按 ID 排序；缺少任一锁定或版本时视为不可发布，不参与发布。
- `resolvePublicationVersions` 从 `versions` 查找引用并校验 scope、归属、kind/hash；项目锁可直接覆盖全部所选剧集，但快照必须实际包含每个所选剧集，否则要求重新锁定。没有项目锁定时，每个所选剧集必须命中本集锁定版本。返回值按 `episodeIds` 顺序排列。

- [ ] **Step 4: 运行测试**

Run: `cd web && bun test "src/app/(user)/script/utils/script-version.test.ts" "src/app/(user)/script/utils/script-publication.test.ts"`
Expected: PASS。

---

### Task 3: 实现 header/scene 三方合并与每项目 outbox

**Files:**
- Create: `web/src/app/(user)/script/utils/script-merge.ts`
- Create: `web/src/app/(user)/script/utils/script-outbox.ts`
- Create: `web/src/test/script-memory-driver.ts`
- Test: `web/src/app/(user)/script/utils/script-merge.test.ts`
- Test: `web/src/app/(user)/script/utils/script-outbox.test.ts`

**Interfaces:**
- Consumes: Task 1–2 的类型。
- Produces:
  - `ScriptHeader`、`ScriptSyncBaseline`、`ScriptMergeResult`、`ScriptOutbox`、`ScriptConflictResolution`
  - `createSyncBaseline(document, revision): ScriptSyncBaseline`
  - `mergeScriptDocuments(base, local, remote, resolutions?: ScriptConflictResolution[]): ScriptMergeResult`
  - `scriptOutboxKey(accountId, projectId): string`
  - `readScriptOutbox(accountId, projectId): Promise<ScriptOutbox | null>`
  - `writeScriptOutbox(accountId, projectId, outbox): Promise<void>`
  - `clearScriptOutbox(accountId, projectId): Promise<void>`

- [ ] **Step 1: 写场次合并测试**

```ts
import { fixtureDocument } from "@/test/script-fixtures";

test("different scene edits merge and same scene edit becomes a conflict", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes[0].content = "本地改第一场";
    remote.episodes[0].scenes[1].content = "远端改第二场";
    let result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.document.episodes[0].scenes[0].content, "本地改第一场");
    assert.equal(result.document.episodes[0].scenes[1].content, "远端改第二场");

    remote.episodes[0].scenes[0].content = "远端也改第一场";
    result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts.map((item) => [item.scope, item.id]), [["scene", base.episodes[0].scenes[0].id]]);
    assert.equal(result.document.episodes[0].scenes[0].content, "远端也改第一场");

    result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote, [{ scope: "scene", id: "scene-1", choice: "local" }]);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.document.episodes[0].scenes[0].content, "本地改第一场");
});

test("identical scene content with different revisions is not a conflict", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes[0].content = "相同修改";
    local.episodes[0].scenes[0].revision = 2;
    remote.episodes[0].scenes[0].content = "相同修改";
    remote.episodes[0].scenes[0].revision = 3;
    const result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.document.episodes[0].scenes[0].revision, 3);
});

test("delete versus edit returns null and explicit local choice restores the scene", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes[0].content = "本地修改";
    remote.episodes[0].scenes = remote.episodes[0].scenes.filter((scene) => scene.id !== "scene-1");
    remote.episodes[0].scenes[0].no = 1;
    const baseline = createSyncBaseline(base, 1);
    const result = mergeScriptDocuments(baseline, local, remote);
    assert.equal(result.conflicts[0].remote, null);
    assert.equal(result.document.episodes[0].scenes.some((scene) => scene.id === "scene-1"), false);

    const resolved = mergeScriptDocuments(baseline, local, remote, [{ scope: "scene", id: "scene-1", choice: "local" }]);
    assert.equal(resolved.document.episodes[0].scenes.find((scene) => scene.id === "scene-1")?.content, "本地修改");
});
```

`script-outbox.test.ts` 在导入 outbox 模块前安装有状态内存驱动，验证真实的 localforage 读写与清除，不使用 `fake-indexeddb` 或 DOM 环境：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { fixtureDocument } from "@/test/script-fixtures";
import { installScriptMemoryDriver } from "@/test/script-memory-driver";
import { createSyncBaseline } from "./script-merge";
import type { ScriptOutbox } from "./script-merge";

const clearStorage = await installScriptMemoryDriver();
const { readScriptOutbox, writeScriptOutbox, clearScriptOutbox } = await import("./script-outbox");

test("outbox round-trips the latest document and baseline", async () => {
    await clearStorage();
    const document = fixtureDocument("p1");
    const outbox: ScriptOutbox = { document, base: createSyncBaseline(document, 3) };
    await writeScriptOutbox("account-1", "p1", outbox);
    assert.deepEqual(await readScriptOutbox("account-1", "p1"), outbox);
    assert.equal(await readScriptOutbox("account-2", "p1"), null);
    await clearScriptOutbox("account-1", "p1");
    assert.equal(await readScriptOutbox("account-1", "p1"), null);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/script/utils/script-merge.test.ts" "src/app/(user)/script/utils/script-outbox.test.ts"`
Expected: FAIL。

- [ ] **Step 3: 实现合并与 outbox**

```ts
export type ScriptSyncBaseline = {
    revision: number;
    headerHash: string;
    scenes: Record<string, { revision: number; hash: string; episodeId: string }>;
};

export type ScriptMergeResult = {
    document: ScriptProjectDocument;
    conflicts: ScriptConflict[];
};

export type ScriptConflictResolution = {
    scope: "header" | "scene";
    id?: string;
    choice: "local" | "remote";
};

export type ScriptOutbox = {
    document: ScriptProjectDocument;
    base: ScriptSyncBaseline;
    conflicts?: ScriptConflict[];
    resolutions?: ScriptConflictResolution[];
};
```

测试驱动与生产存储无关，只把 `test-preload.ts` 的无状态驱动替换为本测试文件内的有状态驱动；测试之间调用返回的 `clearStorage`，不修改全局预加载：

```ts
import localforage from "localforage";

export async function installScriptMemoryDriver() {
    const driverName = "script-test-memory";
    const values = new Map<string, unknown>();
    await localforage.defineDriver({
        _driver: driverName,
        _initStorage: () => Promise.resolve(),
        _support: () => Promise.resolve(true),
        clear: async () => values.clear(),
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: unknown) => { values.set(key, value); return value; },
        removeItem: async (key: string) => { values.delete(key); },
        key: async (index: number) => Array.from(values.keys())[index] ?? null,
        keys: async () => Array.from(values.keys()),
        length: async () => values.size,
        iterate: async (callback: (value: unknown, key: string, index: number) => unknown) => {
            for (const [index, [key, value]] of Array.from(values.entries()).entries()) callback(value, key, index);
        },
    } as unknown as Parameters<typeof localforage.defineDriver>[0]);
    await localforage.setDriver(driverName);
    return async () => { values.clear(); };
}
```

`ScriptHeader` 是 header 的固定结构类型；`ScriptConflict.local/remote` 为 `ScriptHeader | ScriptScene | null`，`null` 明确表示删除，不允许用缺字段对象表示墓碑。

实现规则：
- header 包含项目字段、人物、剧集外壳、场次 ID 顺序和发布关系；场景正文不进入 header。固定结构为 `{ title, format, genre, logline, theme, synopsis, actOne, actTwo, actThree, characters, lockedVersionId, lockedVersionHash, episodes: [{ id, no, title, sceneIds, lockedVersionId, lockedVersionHash }], publications }`。
- header hash 使用 Task 1 的 `scriptDataHash(header)`；scene hash 使用 `scriptDataHash` 计算场次 ID、`no` 与全部正文字段，不包含 `revision/updatedAt`；场次顺序由 header 单独处理。
- 对 header 和每个场次执行同一决策表：基线不存在时，仅一侧新增取新增、两侧相同取一份、两侧不同产生冲突；基线存在时，一侧未变化取另一侧、两侧相同取该值、两侧不同且不等于基线产生冲突。header 以 hash 判等；场次以内容 hash 判等，`revision` 只用于同一内容下取较大值，不因两端 revision 不同而制造假冲突。
- header 两边都变化产生 `scope: "header"` 冲突并暂存本地 header；场次冲突默认暂存远端场次，同时返回本地值。`resolutions` 只对本次重新计算出的冲突生效；header 的 `id` 省略，scene 使用场次 ID。选择 `local/remote` 时 `null` 就是删除；已消失或新增的冲突不被旧 resolution 静默解决。
- 远端删除且本地场次仍等于基线时接受删除；本地删除且远端未变化时接受删除；一端删除、另一端修改时按上述冲突表返回 `null` 与修改值。
- 冲突不阻塞其他非冲突场次；合并结果按选定 header 的 `sceneIds` 组装场次。未被任何选中 header 引用的已合并场次，依次按 base/local/remote 中的原所属剧集重新挂回；仍无归属则挂到第一集末尾，绝不丢弃或制造无主场次。
- 合并文档保留远端 `id/createdAt`；接受变更时由服务端更新 `updatedAt`，无变更时保留远端 `updatedAt`。
- outbox 保存 `{ document, base, conflicts?, resolutions? }`，`conflicts/resolutions` 仅保存当前尚未确认的选择，不保存操作历史。收到冲突响应时，outbox 保留原始基线；`document` 继续保存本地待同步侧，header 和冲突场次绝不被远端默认值覆盖，只把无冲突的远端变更合并进来。用户选择后把 resolution 附到下一次请求，待服务端确认再清除 outbox。
- outbox key 为 `infinite-canvas:script:v2:outbox:<accountId>:<projectId>`，直接使用 localforage，不再 persist 整个项目数组。

- [ ] **Step 4: 运行测试**

Run: `cd web && bun test "src/app/(user)/script/utils/script-merge.test.ts" "src/app/(user)/script/utils/script-outbox.test.ts"`
Expected: PASS。

---

### Task 4: 新增两张后端表与项目摘要/当前文档 CRUD

**Files:**
- Create: `model/script_project.go`
- Create: `repository/script_project.go`
- Modify: `service/user_data.go`（删除旧剧本函数）
- Create: `service/script_project.go`
- Modify: `repository/db.go:92-124`
- Test: `model/script_project_test.go`
- Test: `service/script_project_test.go`

**Interfaces:**
- Consumes: `WithUser`、`UserFromContext`、`repository.DB()`、GORM 事务。
- Produces:
  - `model.ScriptProject`、`model.ScriptProjectDocument`、`model.ScriptProjectSummary`、`model.ScriptProjectView`
  - `model.SummarizeScriptProjectDocument(document) model.ScriptProjectSummary`
  - `model.ScriptDataHash(value any) string`
  - `repository.ListScriptProjects(userID string) ([]model.ScriptProjectSummary, error)`
  - `repository.GetScriptProject(userID, id string) (model.ScriptProject, error)`
  - `repository.CreateScriptProject(item model.ScriptProject) error`
  - `repository.WithScriptProjectTx(userID, id string, fn func(tx *gorm.DB, item model.ScriptProject) error) error`
  - `repository.UpdateScriptProject(item model.ScriptProject, expectedRevision int64) error`
  - `repository.DeleteScriptProject(userID, id string, revision int64) error`
  - `service.ListScriptProjects(ctx) ([]model.ScriptProjectSummary, error)`
  - `service.CurrentScriptProject(ctx, id) (model.ScriptProjectView, error)`
  - `service.SaveScriptProject(ctx, document) (model.ScriptProjectView, error)`
  - `service.DeleteScriptProject(ctx, id, revision) error`

- [ ] **Step 1: 写归属与摘要测试**

```go
func TestScriptProjectOwnerIsolationAndSummary(t *testing.T) {
    setupScriptServiceDB(t)
    document := validScriptDocument()
    created, err := SaveScriptProject(scriptContext("owner-a"), document)
    if err != nil || created.Revision != 1 {
        t.Fatalf("create: %#v err=%v", created, err)
    }
    if _, err := CurrentScriptProject(scriptContext("owner-b"), document.ID); err == nil {
        t.Fatal("other owner read project")
    }
    items, err := ListScriptProjects(scriptContext("owner-a"))
    if err != nil || len(items) != 1 || items[0].SceneCount != 2 {
        t.Fatalf("summary=%#v err=%v", items, err)
    }
    retried, err := SaveScriptProject(scriptContext("owner-a"), document)
    if err != nil || retried.Revision != created.Revision {
        t.Fatalf("idempotent create=%#v err=%v", retried, err)
    }
}

func TestScriptDataHashMatchesCanonicalJSONVector(t *testing.T) {
    value := map[string]string{"z": "<>&\u2028😀", "a": "中文"}
    if got := model.ScriptDataHash(value); got != "223ee7fb" {
        t.Fatalf("hash=%s", got)
    }
}
```

`setupScriptServiceDB` 沿用 `service/marketing_test.go:15-31` 的互斥锁、`:memory:` SQLite 和清理表方式，清理列表加入两张剧本表。

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./service -run TestScriptProjectOwnerIsolationAndSummary -count=1`
Expected: FAIL，类型或函数不存在。

- [ ] **Step 3: 实现模型、仓储和服务**

```go
type ScriptProject struct {
    UserID             string `json:"userId" gorm:"primaryKey;size:191"`
    ID                 string `json:"id" gorm:"primaryKey;size:48"`
    Title              string `json:"title"`
    Format             string `json:"format"`
    Genre              string `json:"genre"`
    Logline            string `json:"logline"`
    EpisodeCount       int    `json:"episodeCount"`
    SceneCount         int    `json:"sceneCount"`
    CharacterCount     int    `json:"characterCount"`
    WordCount          int    `json:"wordCount"`
    LockedEpisodeCount int    `json:"lockedEpisodeCount"`
    HasPublication     bool   `json:"hasPublication"`
    PublicationStale   bool   `json:"publicationStale"`
    Revision           int64  `json:"revision"`
    Data               string `json:"data"`
    CreatedAt          string `json:"createdAt"`
    UpdatedAt          string `json:"updatedAt"`
    DeletedAt          string `json:"deletedAt" gorm:"not null;default:''"`
}

type ScriptVersion struct {
    UserID    string `json:"userId" gorm:"primaryKey;size:191"`
    ProjectID string `json:"projectId" gorm:"primaryKey;size:48"`
    ID        string `json:"id" gorm:"primaryKey;size:48"`
    Scope     string `json:"scope"`
    EpisodeID string `json:"episodeId"`
    Label     string `json:"label"`
    Kind      string `json:"kind"`
    Hash      string `json:"hash"`
    Data      string `json:"data"`
    CreatedAt string `json:"createdAt"`
    DeletedAt string `json:"deletedAt" gorm:"not null;default:''"`
}

type ScriptProjectView struct {
    Document ScriptProjectDocument `json:"document"`
    Revision int64                 `json:"revision"`
}
```

后端的 `ScriptProjectDocument`、`ScriptEpisode`、`ScriptScene`、`ScriptCharacter`、`ScriptPublication` 和 `ScriptProjectSummary` 字段与 Spec 5.1–5.4 的 TS 契约一一对应，JSON tag 使用 camelCase；`ScriptProjectView` 是 `{ document, revision }` 的 Go 包装类型。

- 在 `AutoMigrate` 注册 `ScriptProject`、`ScriptVersion`。
- `Data` 保存完整 `ScriptProjectDocument` JSON；列表查询只 Select 摘要列，不读取 `data`。
- model 包实现与 Task 1 `scriptDataHash` 对等的 `ScriptDataHash`，供创建幂等、header/scene hash 和版本安全稿 ID 共用；canonical JSON 的 key 按 UTF-16 code unit 排序。
- 所有查询条件包含 `user_id` 与 `deleted_at = ''`。
- `WithScriptProjectTx` 只负责开启事务、按账号读取并锁定项目行、执行 repository 回调；MySQL/PostgreSQL 使用行锁，SQLite 使用写事务。业务校验、合并、版本和安全稿规则留在 service。
- 新建项目 `revision = 1`，摘要从文档实时计算后与 `data` 同事务写入。
- `SummarizeScriptProjectDocument` 同时计算 `publicationStale`：项目锁定存在时比较项目锁定哈希，否则按 publication 的 `episodeIds` 比较剧集锁定哈希组合；组合算法与 Task 2 一致，摘要字段只是派生缓存。
- `SaveScriptProject` 是幂等创建：同一 `(user_id, id)` 重试且当前文档与传入文档内容 hash 相同时返回已有项目，不增加 revision；内容不同返回冲突，不覆盖。项目正文按 8 MB 解码上限校验。
- 删除使用字符串时间墓碑，不物理删除；项目与其版本在同一事务写入墓碑。重复删除已墓碑项目直接成功；GET 对墓碑返回 `gorm.ErrRecordNotFound` 供前端清除本地缓存。
- 服务层校验文档 ID、`schemaVersion === 2`、至少一集、集内场次编号连续、人物/场次 ID 全局唯一；项目/剧集锁定 ID 与 hash 必须成对出现或同时为空，创建时 publications 为空。

- [ ] **Step 4: 运行测试**

Run: `go test ./model ./service -run 'TestScriptProject|TestScriptDocument' -count=1`
Expected: PASS。

---

### Task 5: 实现服务端场次级变更合并

**Files:**
- Create: `model/script_project_merge.go`
- Modify: `model/script_project.go`
- Modify: `repository/script_project.go`
- Modify: `service/script_project.go`
- Test: `model/script_project_merge_test.go`
- Test: `service/script_project_merge_test.go`

**Interfaces:**
- Consumes: Task 3 的对等契约与 Task 4 的项目读写。
- Produces:
  - `model.ScriptChangeRequest`、`model.ScriptChangeResponse`、`model.ScriptConflict`、`model.ScriptConflictResolution`
  - `model.NewScriptSyncBaseline(document, revision) model.ScriptSyncBaseline`
  - `model.MergeScriptProjectDocument(remote, local model.ScriptProjectDocument, base model.ScriptChangeRequest, resolutions []model.ScriptConflictResolution) (model.ScriptProjectDocument, []model.ScriptConflict, bool)`
  - `repository.UpdateScriptProject(item model.ScriptProject, expectedRevision int64) error`
  - `service.ApplyScriptChanges(ctx, request) (model.ScriptChangeResponse, error)`

- [ ] **Step 1: 写纯合并测试**

```go
func TestMergeScriptProjectDocumentMergesIndependentScenes(t *testing.T) {
    base := validScriptDocument()
    local := cloneScriptDocument(base)
    remote := cloneScriptDocument(base)
    local.Episodes[0].Scenes[0].Content = "本地第一场"
    remote.Episodes[0].Scenes[1].Content = "远端第二场"
    request := scriptChangeRequest(base, local, 1)
    merged, conflicts, changed := MergeScriptProjectDocument(remote, local, request, nil)
    if !changed || len(conflicts) != 0 {
        t.Fatalf("changed=%v conflicts=%#v", changed, conflicts)
    }
    if merged.Episodes[0].Scenes[0].Content != "本地第一场" || merged.Episodes[0].Scenes[1].Content != "远端第二场" {
        t.Fatalf("merged=%#v", merged)
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./model ./service -run 'TestMergeScriptProjectDocument|TestApplyScriptChanges' -count=1`
Expected: FAIL。

- [ ] **Step 3: 实现合并与事务写入**

```go
type ScriptConflictResolution struct {
    Scope  string `json:"scope"`
    ID     string `json:"id,omitempty"`
    Choice string `json:"choice"`
}

type ScriptChangeRequest struct {
    BaseRevision   int64                         `json:"baseRevision"`
    BaseHeaderHash string                        `json:"baseHeaderHash"`
    BaseScenes     map[string]ScriptSceneBaseline `json:"baseScenes"`
    Document       ScriptProjectDocument         `json:"document"`
    Resolutions    []ScriptConflictResolution    `json:"resolutions,omitempty"`
}
```

`ScriptSceneBaseline` 是 `{ revision, hash, episodeId }`；`episodeId` 记录基线原所属剧集，用于在 header 冲突后重新挂回无引用场次。`ScriptConflict.Local/Remote` 使用可空 `any`，删除明确编码为 JSON `null`。

- 在 model 包实现与 Task 3 相同的 header/scene 决策表，复用 Task 4 的 `ScriptDataHash`，避免 repository 反向依赖 service。场次内容 hash 相同即判等，revision 取较大值，不产生假冲突。
- `ApplyScriptChanges` 在 `WithScriptProjectTx` 内读取当前 `data`，调用纯合并函数并更新摘要；repository 不承载合并业务。`BaseRevision` 不得大于远端当前 revision；小于当前 revision 时仍按原始 header/scene hash 合并，允许已确认的 resolution 随原基线继续提交。
- `UpdateScriptProject` 使用 `WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at = ''` 更新，并检查 `RowsAffected == 1`。
- 仅当合并结果与远端当前文档不同才 `revision + 1`；只有冲突但没有接受变更时不增加 revision。`resolutions` 选中的内容属于已接受变更。
- 更新摘要列与 `data`，返回完整 `document/revision/conflicts`。
- header 冲突默认保留本地 header；scene 冲突默认保留远端场次，同时返回本地内容；resolution 只作用于本次实际冲突。

- [ ] **Step 4: 运行合并测试**

Run: `go test ./model ./service -run 'TestMergeScriptProjectDocument|TestApplyScriptChanges' -count=1`
Expected: PASS。

---

### Task 6: 实现版本创建、锁定、恢复与删除事务

**Files:**
- Modify: `model/script_project.go`
- Create: `repository/script_version.go`
- Modify: `repository/script_project.go`
- Modify: `service/script_project.go`
- Test: `service/script_version_test.go`
- Test: `model/script_project_test.go`

**Interfaces:**
- Consumes: Task 2 的业务规则与 Task 4 的项目行锁。
- Produces:
  - `model.ScriptVersion`、`model.ScriptVersionSummary`、`model.ScriptVersionPayload`、`model.ScriptVersionCreateRequest`、`model.ScriptVersionRestoreRequest`
  - `repository.ListScriptVersions(tx *gorm.DB, userID, projectID) ([]model.ScriptVersionSummary, error)`
  - `repository.GetScriptVersion(tx *gorm.DB, userID, projectID, versionID) (model.ScriptVersion, error)`
  - `repository.CreateScriptVersion(tx *gorm.DB, item model.ScriptVersion) error`
  - `repository.ListScriptSafetyVersions(tx *gorm.DB, userID, projectID) ([]model.ScriptVersionSummary, error)`
  - `repository.TombstoneScriptVersion(tx *gorm.DB, userID, projectID, versionID string) error`
  - `service.CreateScriptVersion(ctx, request) (model.ScriptProjectView, error)`
  - `service.RestoreScriptVersion(ctx, projectID, versionID string, request model.ScriptVersionRestoreRequest) (model.ScriptProjectView, error)`
  - `service.DeleteScriptVersion(ctx, projectID, versionID string, baseRevision int64) error`

- [ ] **Step 1: 写版本事务测试**

```go
func TestScriptVersionLockAndDeleteInvariant(t *testing.T) {
    setupScriptServiceDB(t)
    ctx := scriptContext("owner-a")
    project, err := SaveScriptProject(ctx, validScriptDocument())
    if err != nil { t.Fatal(err) }
    version := validScriptVersion(project.Document, "locked")
    created, err := CreateScriptVersion(ctx, model.ScriptVersionCreateRequest{Version: version, ActivateLock: true, BaseRevision: project.Revision})
    if err != nil { t.Fatal(err) }
    if created.Document.LockedVersionID != version.ID || created.Document.LockedVersionHash != version.Hash {
        t.Fatalf("lock pair=%#v", created.Document)
    }
    if err := DeleteScriptVersion(ctx, project.Document.ID, version.ID, created.Revision); err == nil {
        t.Fatal("current locked version was deleted")
    }
}

func TestScriptVersionContentHashMatchesUTF16TextHash(t *testing.T) {
    if got := model.ScriptTextHash("A😀\n"); got != "20558029" {
        t.Fatalf("hash=%s", got)
    }
}
```

`model.ScriptVersionCreateRequest` 为 `{ Version ScriptVersionPayload; ActivateLock bool; BaseRevision int64 }`；`model.ScriptVersionRestoreRequest` 为 `{ BaseRevision int64 }`。

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./service -run TestScriptVersion -count=1`
Expected: FAIL。

- [ ] **Step 3: 实现版本事务**

- `ScriptVersion.Data` 保存不可变快照 JSON；版本表按 `(user_id, project_id, deleted_at, created_at)` 建索引。
- service 在 `WithScriptProjectTx` 内执行版本业务，repository 只接收事务并读写版本行。
- 创建版本时校验 `projectId/userId/scope/episodeId/kind/label/data`；公开请求只允许 `manual/locked`，`safety` 仅由恢复流程内部创建。用 Spec 5.3 的确定性正文算法重算 hash，客户端 hash 不一致直接拒绝；同 ID 同内容重试返回已有结果，同 ID 不同内容报冲突。
- Go 的 `ScriptTextHash` 必须复刻前端 `scriptTextHash`：去 BOM、CRLF/CR 归一为 LF，再按 `unicode/utf16.Encode` 的 UTF-16 code unit 逐单元 XOR 与 FNV 素数乘法，不能直接对 UTF-8 字节哈希。`A😀\n` 固定得到 `20558029`。
- `ActivateLock` 必须同时满足 `BaseRevision == 当前项目 revision`，同事务写版本、锁定对并更新项目摘要；版本快照中的剧集锁定引用先清除。
- 恢复前在同一事务创建当前内容安全稿，ID 固定为 `safety-` + `ScriptDataHash(versionID + ":" + strconv.FormatInt(baseRevision, 10))`，使响应丢失后的同基线重试可识别已有安全稿；安全稿只保留最近 3 份，将更旧安全稿写入墓碑，不删除其他版本。
- 项目版本恢复全部创作字段；本集版本只恢复对应剧集；恢复项 `revision + 1`。项目恢复按 ID 保留仍存在剧集的当前锁定对；本集恢复保留其他剧集锁定，本集仅在恢复当前锁定版本时保留锁定对。
- 恢复非当前锁定版本清除对应锁定对；恢复当前锁定版本保留锁定对；恢复不会激活快照中的任何旧版本。
- 删除前检查当前项目/剧集锁定引用和全部 `publication.sourceVersionIds`；命中则返回可读错误。删除和项目 revision CAS 在同一事务完成，重复删除已墓碑版本直接成功。
- 版本列表不返回 `data`，单版本详情才返回快照。

- [ ] **Step 4: 运行版本测试**

Run: `go test ./service -run TestScriptVersion -count=1`
Expected: PASS。

---

### Task 7: 接入新 API 路由与前端客户端

**Files:**
- Create: `handler/script_project.go`
- Modify: `router/router.go`
- Create: `web/src/services/api/script.ts`
- Test: `handler/script_project_test.go`
- Test: `router/router_test.go`

**Interfaces:**
- Consumes: Task 4–6 的 service 函数。
- Produces:
  - `listScriptProjects(token): Promise<{ items: ScriptProjectSummary[] }>`
  - `createScriptProject(token, document): Promise<ScriptProjectView>`
  - `getScriptProject(token, id): Promise<ScriptProjectView>`
  - `changeScriptProject(token, id, request): Promise<ScriptChangeResponse>`
  - `deleteScriptProject(token, id, revision): Promise<void>`
  - `listScriptVersions(token, projectId): Promise<{ items: ScriptVersionSummary[] }>`
  - `getScriptVersion(token, projectId, versionId): Promise<ScriptVersion>`
  - `createScriptVersion(token, projectId, request): Promise<ScriptProjectView>`
  - `restoreScriptVersion(token, projectId, versionId, request): Promise<ScriptProjectView>`
  - `deleteScriptVersion(token, projectId, versionId, baseRevision): Promise<void>`

```ts
type ScriptProjectView = { document: ScriptProjectDocument; revision: number };
type ScriptChangeResponse = { document: ScriptProjectDocument; revision: number; conflicts: ScriptConflict[] };
type ScriptVersionSummary = Omit<ScriptVersion, "data">;
type ScriptVersionCreateRequest = { version: ScriptVersion; activateLock: boolean; baseRevision: number };
type ScriptVersionRestoreRequest = { baseRevision: number };
```

- [ ] **Step 1: 写路由与响应契约测试**

```go
func TestScriptProjectRoutesAreRegistered(t *testing.T) {
    routes := New().Routes()
    assertRoute(t, routes, http.MethodPost, "/api/v1/script/projects")
    assertRoute(t, routes, http.MethodPost, "/api/v1/script/projects/:id/changes")
    assertRoute(t, routes, http.MethodPost, "/api/v1/script/projects/:id/versions/:versionId/restore")
}

func TestScriptProjectHTTPRequiresLogin(t *testing.T) {
    request := httptest.NewRequest(http.MethodPost, "/api/v1/script/projects", strings.NewReader(`{}`))
    writer := httptest.NewRecorder()
    CreateScriptProject(writer, request)
    if !strings.Contains(writer.Body.String(), `"code":1`) {
        t.Fatalf("anonymous create accepted: %s", writer.Body)
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./router ./handler -run 'TestScriptProjectRoutes|TestScriptProjectHTTP' -count=1`
Expected: FAIL。

- [ ] **Step 3: 实现 handler、路由和前端 API**

- 在 `v1` 鉴权组注册设计文档 10 个路由。
- handler 只解码、调用 service、返回 `OK/FailError`；写入使用 `http.MaxBytesReader`，项目正文 8 MB，版本正文 16 MB。
- handler 校验路径 `id/versionId` 与请求体中的 `document.id/version.projectId` 一致，版本请求的 `projectId` 也必须与路径一致；不一致返回参数错误，不进入事务。
- `GET /script/projects` 返回 `{ items }`；`GET /script/projects/:id` 返回 `{ document, revision }`。
- `POST /changes` 始终对业务冲突返回 HTTP 200 + `code: 0`。
- 新路由与新 API 客户端先并联验证；旧链路删除统一放到 Task 8 的前端切换批次，避免中间状态断开现有页面。

- [ ] **Step 4: 运行后端契约测试**

Run: `go test ./router ./handler -run 'TestScriptProjectRoutes|TestScriptProjectHTTP' -count=1`
Expected: PASS。

---

### Task 8: 重写剧本 Store、账号本地缓存与项目级同步

**Files:**
- Modify: `web/src/app/(user)/script/stores/use-script-store.ts`
- Create: `web/src/services/script-sync.ts`
- Modify: `web/src/services/creative-sync.ts`
- Modify: `web/src/services/api/user-config.ts`
- Modify: `handler/user_data.go`
- Modify: `service/user_data.go`
- Modify: `repository/user_config.go`
- Modify: `model/user_config.go`
- Modify: `router/router.go`
- Create: `web/src/app/(user)/script/[id]/use-script-document.ts`
- Test: `web/src/app/(user)/script/stores/use-script-store.test.ts`
- Test: `web/src/services/script-sync.test.ts`

**Interfaces:**
- Consumes: Task 3 outbox、Task 7 API、`useUserStore`、`accountStorageKey`、localforage。
- Produces:
  - `ScriptProjectLoadState = "idle" | "local" | "loading" | "ready" | "error" | "missing"`
  - `ScriptSyncState = "local" | "syncing" | "synced" | "conflict" | "error"`
  - `configureScriptAccount(accountId: string): Promise<void>`
  - `hydrateScriptIndex(accountId): Promise<void>`
  - `loadScriptProject(id): Promise<void>`
  - `loadScriptVersions(projectId): Promise<void>`
  - `syncScriptProject(id): Promise<void>`
  - `resolveScriptConflict(projectId: string, scope: "header" | "scene", entityId: string | undefined, choice: "local" | "remote"): Promise<void>`
  - Store actions: `createProject`、`importProject`、`updateDocument`、`updateScene`、`addEpisode`、`addScene`、`removeScene`、`moveScene`、`lockVersion`、`saveVersion`、`restoreVersion`、`deleteVersion`、`deleteProjects`、`persistScriptProject`
  - `updateDocument(id, updater): Promise<void>` 与 `persistScriptProject(id): Promise<void>` 在同步返回 Promise 前先完成内存 `set`，调用方可不等待渲染，但发布流程必须等待持久化完成。

- [ ] **Step 1: 写 Store 动作测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import localforage from "localforage";

import { fixtureDocument } from "@/test/script-fixtures";
import { installScriptMemoryDriver } from "@/test/script-memory-driver";

const clearStorage = await installScriptMemoryDriver();
const { configureScriptAccount, useScriptStore } = await import("./use-script-store");

test("updateScene increments only the edited scene revision", async () => {
    await clearStorage();
    await configureScriptAccount("account-1");
    useScriptStore.setState({ summaries: [], documents: { p1: fixtureDocument("p1") }, versions: {}, conflicts: {}, loadStates: {}, syncStates: {} });
    await useScriptStore.getState().updateScene("p1", "ep-1", "scene-2", { content: "新正文" });
    const document = useScriptStore.getState().documents.p1;
    assert.equal(document.episodes[0].scenes[0].revision, 1);
    assert.equal(document.episodes[0].scenes[1].revision, 2);
    assert.equal(useScriptStore.getState().syncStates.p1, "local");
});

test("project persistence writes the current document to the account key", async () => {
    await clearStorage();
    await configureScriptAccount("account-1");
    const document = fixtureDocument("p1");
    useScriptStore.setState({ summaries: [], documents: { p1: document }, versions: {}, conflicts: {}, loadStates: {}, syncStates: {} });
    await useScriptStore.getState().persistScriptProject("p1");
    assert.deepEqual(
        await localforage.getItem("infinite-canvas:script:v2:project:account-1:p1"),
        document,
    );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/script/stores/use-script-store.test.ts" "src/services/script-sync.test.ts"`
Expected: FAIL。

- [ ] **Step 3: 实现 Store 与同步服务**

Store 状态固定为：

```ts
type ScriptStoreState = {
    summaries: ScriptProjectSummary[];
    documents: Record<string, ScriptProjectDocument>;
    versions: Record<string, ScriptVersion[]>;
    conflicts: Record<string, ScriptConflict[]>;
    loadStates: Record<string, ScriptProjectLoadState>;
    syncStates: Record<string, ScriptSyncState>;
};
```

实现要求：
- 删除 `SCRIPT_STORE_KEY` 与 zustand `persist` 整数组写法；Store 只保留内存摘要、文档缓存和状态。
- 本地键使用设计文档四个 key；`index` 保存摘要，`project` 保存文档，`version` 保存版本，`outbox` 保存最新文档、基线和未解决冲突。
- 本地没有额外版本索引 key：`loadScriptVersions` 用 `localforage.keys()` 筛选 `infinite-canvas:script:v2:version:<accountId>:<projectId>:` 前缀，逐个读取并过滤墓碑项目；账号模式仍以服务端版本列表为准。
- `updateDocument` 接收 updater，在同一 `set` 内更新文档与摘要；场次动作只有内容实际变化时才增加 revision。所有写入等待 localforage Promise 完成后才视为本地持久化成功。
- 新建/导入先写本地并入 outbox；首次同步没有远端 revision 时走 `POST /script/projects`，成功后用返回 revision 建立基线；重复创建使用同一项目 ID，由服务端幂等返回已有项目。
- 登录后读取游客 `index/project/outbox`，按项目 ID 合并到账号分区；同 ID 且 revision/hash 不同进入冲突选择，不覆盖游客内容。
- `loadScriptProject` 先读本地，有缓存立即置 `local` 并返回页面；账号模式再拉远端合并。无缓存等待远端；网络错误置 `error`；远端墓碑/404 清本地并置 `missing`；游客不等待远端。
- `syncScriptProject` 从 outbox 发 `/changes`；无冲突时写回文档、建立新基线并清 outbox；有冲突时页面展示合并预览，但 outbox 的 `document` 保留本地待同步侧，只合并无冲突远端变更，原 base 与本地冲突值不被覆盖，并置 `conflict`。
- `resolveScriptConflict` 将选中 resolution 累加到 outbox 当前请求并同步；服务端返回无冲突后才以新基线替换 outbox。网络失败保留原 base/document/conflicts，不自动合并同字段文本。
- 登录用户的版本创建、锁定、恢复和删除必须等待服务端事务成功后才更新文档和版本缓存；离线时允许编辑正文，但版本操作显示“联网后才能保存版本”，避免本地锁定引用先于服务端版本落库。游客版本操作完全在本地执行。
- 在线、聚焦、可见时触发节流同步；失败保留 outbox。
- 退出登录和会话失效继续整页 reload，不跨账号复用内存文档。
- 删除项目时同批清除本地摘要、文档、版本和 outbox key；网络删除失败保留本地墓碑等待重试。
- 完成 Store 切换后同批删除旧后端 `UserScriptProjectData` 模型字段、repository/service/handler 函数与两条 `/user-data/script-projects` 路由；删除前端旧 API 与 `creative-sync.ts` 的 `script-projects` domain。Task 8 与 Task 9 属于同一前端切换批次，Task 8 测试通过后必须继续完成 Task 9，再交付可运行页面。

- [ ] **Step 4: 运行 Store 与同步测试**

Run: `cd web && bun test "src/app/(user)/script/stores/use-script-store.test.ts" "src/services/script-sync.test.ts"`
Expected: PASS。

---

### Task 9: 将列表、工作区和五个标签改为剧集模型

**Files:**
- Modify: `web/src/app/(user)/script/page.tsx`
- Modify: `web/src/app/(user)/script/[id]/page.tsx`
- Modify: `web/src/app/(user)/script/utils/script-import.ts:18-32`
- Modify: `components/script-scenes-panel.tsx`
- Modify: `components/script-editor-panel.tsx`
- Modify: `components/script-story-panel.tsx`
- Modify: `components/script-structure-panel.tsx`
- Modify: `components/script-versions-modal.tsx`
- Create: `components/script-episode-switcher.tsx`
- Create: `components/script-conflict-modal.tsx`
- Create: `components/script-workspace-header.tsx`
- Test: `web/src/app/(user)/script/utils/script-import.test.ts`

**Interfaces:**
- Consumes: Task 8 Store 与 `useScriptDocument`。
- Produces:
  - `ScriptEpisodeSwitcher`、`ScriptConflictModal`、`ScriptWorkspaceHeader`
  - `scriptProjectFromDocument(document: FilmScriptDocument, title: string): ScriptProjectDocument`

- [ ] **Step 1: 写多集导入测试**

```ts
test("import keeps three episodes and renumbers scenes inside each episode", () => {
    const document = parseFilmScriptDocument(`第1集\n第1场 内景 天台 日\n正文一\n\n第2集\n第1场 外景 街道 夜\n正文二\n\n第3集\n第1场 内景 房间 晨\n正文三`);
    const project = scriptProjectFromDocument(document, "导入剧本");
    assert.equal(project.episodes.length, 3);
    assert.deepEqual(project.episodes.map((episode) => episode.scenes.length), [1, 1, 1]);
    assert.deepEqual(project.episodes.map((episode) => episode.scenes[0].no), [1, 1, 1]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/script/utils/script-import.test.ts"`
Expected: FAIL，当前实现把三集压成一组扁平场次。

- [ ] **Step 3: 实现页面与组件改造**

- 列表页只读 `summaries`，移除正文统计和 `project.scenes/status/drafts`。
- 工作区页通过 `useScriptDocument(id)` 处理 `local/loading/ready/error/missing`，不再用 `hydrated + projects.find` 判断不存在。
- 分场和剧本标签共用当前 `episodeId`；切换条显示集名、场次数、完成度、锁定标记。
- 分场动作在集内增删移动并重排 `no`，通过 Store 场次动作更新，不传整项目 patch。
- 故事与结构标签汇总全部剧集，列表项显示所属集名。
- 版本弹窗增加“全部 / 项目 / 本集”过滤；锁定和已发布来源版本显示保护标记且无删除入口。
- 顶部发布按钮显示“已锁定 X 集”；存在过期发布时显示小圆点。
- 同步冲突使用两列本地/远端预览和明确选择按钮。
- 导入保留 `document.episodes`，不再 `flatMap`；导出保留集标题。

- [ ] **Step 4: 运行导入与领域测试**

Run: `cd web && bun test "src/app/(user)/script"`
Expected: PASS。

---

### Task 10: 实现锁定版本到影视的稳定编译与幂等发布服务

**Files:**
- Create: `web/src/app/(user)/script/utils/script-film-plan.ts`
- Create: `web/src/services/script-film-publication.ts`
- Delete: `web/src/app/(user)/script/utils/script-handoff.ts`
- Replace: `web/src/app/(user)/script/utils/script-handoff.test.ts` → `script-film-plan.test.ts`
- Test: `web/src/services/script-film-publication.test.ts`
- Modify: `web/src/app/(user)/canvas/types.ts:151-199`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts:50-65,318-329`
- Modify: `web/src/app/(user)/script/[id]/page.tsx:71-119`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-review-input.ts:159-170`
- Modify: `web/src/app/(user)/film/utils/film-ai-consistency.ts:160-166`

**Interfaces:**
- Consumes: Task 2 锁定版本、Task 8 Store、Task 7 API、`useCanvasStore`。
- Produces:
  - `compileScriptFilmPlan(snapshot: ScriptContentSnapshot): FilmEpisode[]`
  - `buildInitialScriptFilmGraph(project: CanvasProject, plan: FilmEpisode[], source: FilmScriptSource): { nodes: CanvasNodeData[]; connections: CanvasConnection[] }`
  - `publishScriptToFilm(input: { projectId: string; episodeIds: string[]; publicationId?: string }): Promise<ScriptPublication>`
  - `findFilmProjectByPublication(publicationId: string): CanvasProject | undefined`
  - `CanvasFilmMeta.scriptPublicationId?: string`
  - `useCanvasStore.saveProjectNow(id: string): Promise<void>`
  - `useCanvasStore.createFilmProject(title?: string, options?: { id?: string; scriptPublicationId?: string }): string`

- [ ] **Step 1: 写稳定编译测试**

```ts
import { fixtureSnapshot } from "@/test/script-fixtures";

test("structured script compiles without reparsing and keeps source ids", () => {
    const snapshot = fixtureSnapshot();
    const plan = compileScriptFilmPlan(snapshot);
    assert.equal(plan[0].id, snapshot.episodes[0].id);
    assert.equal(plan[0].scenes[0].id, snapshot.episodes[0].scenes[0].id);
    assert.equal(plan[0].scenes[0].shots[0].id, `${snapshot.episodes[0].scenes[0].id}:0`);
    assert.ok(plan[0].scenes[0].shots[0].shotNo.includes("1"));
});
```

`web/src/services/script-film-publication.test.ts`：

```ts
import { buildFilmCanvasProject } from "@/app/(user)/canvas/utils/film-canvas-project";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { findFilmProjectByPublication } from "./script-film-publication";

test("publication retry finds the existing film project", () => {
    const project = buildFilmCanvasProject("测试影视", { id: "film-1", now: "2026-11-25T00:00:00.000Z", viewport: { x: 0, y: 0, k: 1 }, sidePanel: { open: true, width: 280 }, agentPanel: { open: false, width: 464 } });
    project.film!.scriptPublicationId = "pub-1";
    useCanvasStore.setState({ projects: [project] });
    assert.equal(findFilmProjectByPublication("pub-1")?.id, "film-1");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/script/utils/script-film-plan.test.ts" "src/services/script-film-publication.test.ts"`
Expected: FAIL。

- [ ] **Step 3: 实现编译器与发布服务**

- `compileScriptFilmPlan` 直接读取结构化剧集/场次，不再拼文本调用 `parseFilmScriptDocument`；发布服务只传入所选 `episodeIds` 对应的剧集。
- 项目锁定版本可作为全部所选剧集的来源；没有项目锁定时，每个所选剧集都必须有本集锁定版本，否则拒绝发布。
- 每个非空正文段落编译一个镜头；正文为空时使用 `summary/goal/conflict/turn/outcome` 合成一个镜头。
- `FilmEpisode.id = ScriptEpisode.id`，`FilmScene.id = ScriptScene.id`，`FilmShot.id = sceneId:shotIndex`。
- 多集 `shotNo` 使用 `集号-场号-镜号`。
- `FilmScriptNodeData` 增加 `source?: FilmScriptSource`，删除 `sourceScriptProjectId/sourceScriptHash`。
- `buildInitialScriptFilmGraph` 为来源场次/镜头写稳定 ID 与 `scriptSourceKey`，构建 composition/sequence 边，并把剧本节点 `text/source` 一次更新。来源边 ID 固定为 `script:<publicationId>:<fromNodeId>-><toNodeId>`，在 `canvasConnection` 返回值上覆盖 `id`；普通 `from->to` ID 视为人工边。
- `CanvasFilmMeta` 删除无消费者的 `scriptProjectId/scriptHash`，增加 `scriptPublicationId`。
- `createFilmProject` 增加可选 `{ id?: string; scriptPublicationId?: string }`，发布服务预先生成项目 ID 并立即写入发布标记，避免中断后重复创建。
- `saveProjectNow` 取消该项目的 400ms 防抖与待发送快照，把当前画布项目集合写入当前账号本地键；登录且账号同步开启时还直接等待 `saveCanvasProject` 成功，失败抛出。它只用于发布/刷新等必须确认目标已落盘的流程，普通画布编辑仍沿用现有防抖。
- 发布服务先调用 `resolvePublicationVersions(document, versions, episodeIds)` 取得当前锁定快照并计算 `sourceHash/sourceVersionIds`；未指定 `publicationId` 时，如果已有 publication 的 `episodeIds` 与本次完全相同则复用，不新建影视项目。已有 publication 的重试必须按它记录的 `sourceVersionIds/sourceHash` 读取原快照，不能改用期间更新的锁定版本；已 published 的直接返回，failed/publishing 才继续恢复。
- 发布服务先写 `status: "publishing"` 的 publication 并等待 `updateDocument` 持久化，再创建/复用影视项目；新项目先 `saveProjectNow` 保存模板和发布标记，回写 `filmProjectId` 并持久化，再应用图并再次 `saveProjectNow`，最后才写 `published/sourceHash/publishedAt`。登录同步开启时本地与云端画布保存均成功后才标记 published。
- 重试时先按 `scriptPublicationId` 找项目；找到则复用，不再次创建。失败时把同一 publication 置为 `failed/lastError` 并持久化；用户重试继续传原 `publicationId`。
- 新项目只移除 ID 为 `${project.id}-scene-1` 的初始化空模板场次及其空连线；刷新阶段不移除任何非来源节点。
- 影视一致性检查从 `source.hash` 读取，不再读取旧字段；`film-review-input.ts` 与 `film-ai-consistency.ts` 同批清理 `sourceScriptProjectId/sourceScriptHash/scriptProjectId/scriptHash` 消费。

- [ ] **Step 4: 运行编译与发布测试**

Run: `cd web && bun test "src/app/(user)/script/utils/script-film-plan.test.ts" "src/services/script-film-publication.test.ts"`
Expected: PASS。

---

### Task 11: 实现来源可控图刷新、撤销与影视检查器入口

**Files:**
- Create: `web/src/app/(user)/canvas/[id]/lib/film-script-refresh.ts`
- Modify: `web/src/app/(user)/canvas/types.ts:164-199`
- Modify: `web/src/app/(user)/canvas/[id]/lib/film-script-parse.ts:90-136`
- Modify: `web/src/app/(user)/canvas/components/canvas-film-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-editor.tsx`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-script-refresh.test.ts`
- Test: `web/src/app/(user)/canvas/[id]/lib/film-script-parse.test.ts`

**Interfaces:**
- Consumes: Task 10 的 `FilmEpisode[]` 与 `FilmScriptSource`。
- Produces:
  - `previewScriptFilmRefresh(nodes, connections, plan, source): ScriptFilmRefreshPlan`
  - `applyScriptFilmRefresh(nodes, connections, plan, source): FilmParseGraphResult`
  - `previewScriptPublicationRefresh(projectId: string, publicationId: string): Promise<ScriptFilmRefreshPreview>`
  - `applyScriptPublicationRefresh(projectId: string, publicationId: string, expectedHash: string): Promise<ScriptPublication>`
  - `ScriptFilmRefreshPlan = { added: string[]; updated: string[]; kept: string[]; removed: string[]; protected: string[] }`
  - `ScriptFilmRefreshPreview = { plan: ScriptFilmRefreshPlan; source: FilmScriptSource; publication: ScriptPublication }`

- [ ] **Step 1: 写刷新保护测试**

```ts
import { fixturePublishedGraph, fixtureSnapshot, source, updatedSnapshotWithoutSceneOne } from "@/test/script-fixtures";

test("refresh keeps node ids/media/bindings and protects deleted manual shots", () => {
    const current = fixturePublishedGraph();
    const edited = structuredClone(current);
    const shot = edited.nodes.find((node) => node.metadata?.filmShot?.scriptSourceKey === "scene-1:0")!;
    shot.metadata!.filmShot!.prompt = "人工提示词";
    shot.metadata!.filmShot!.imageUrl = "https://example.test/image.png";
    const plan = compileScriptFilmPlan(updatedSnapshotWithoutSceneOne());
    const preview = previewScriptFilmRefresh(edited.nodes, edited.connections, plan, source);
    assert.ok(preview.protected.includes(shot.id));

    const result = applyScriptFilmRefresh(edited.nodes, edited.connections, plan, source);
    const kept = result.nodes.find((node) => node.id === shot.id)!;
    assert.equal(kept.metadata?.filmShot?.prompt, "人工提示词");
    assert.equal(kept.metadata?.filmShot?.imageUrl, "https://example.test/image.png");
    assert.equal(kept.metadata?.filmShot?.scriptSourceKey, undefined);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/film-script-refresh.test.ts"`
Expected: FAIL。

- [ ] **Step 3: 实现安全刷新**

- `FilmSceneNodeData/FilmShotNodeData` 增加 `scriptSourceKey`；镜头增加 `scriptSourcePromptHash`，其值为 `scriptDataHash(初始 prompt)`。
- `FilmParseSnapshot.mode` 增加 `"refresh"`，并增加 `updatedNodes?: CanvasNodeData[]`、`detachedNodes?: CanvasNodeData[]`；两者保存刷新前节点，供撤销恢复结构字段和来源关联。
- 同 key 场次保留 ID/位置，更新 `episodeId/episodeTitle/name/location/time/mood` 等来源结构字段。
- 同 key 镜头保留 ID、位置、`prompt`、媒体、版本、上下文绑定和任务；只更新 `shotNo/shotType/cameraMovement/duration/description/dialogue/audio` 等来源派生字段。
- 新节点使用源 ID 追加到对应场次和 sequence 链；若 canvas 节点 ID 已属于非来源节点，保留原节点并用 `script:<publicationId>:<sourceId>` 作为新节点 ID，`scriptSourceKey` 仍使用稳定源 ID，绝不覆盖人工节点。
- 镜头保护条件包括任一媒体/首尾帧字段、`node.metadata.status !== "idle"`、`node.metadata.filmShot.pendingTask`、指向它的 `kind: "context"` 边、`node.metadata.filmShot.locationId/locationVariantId` 绑定，或当前 prompt 的 `scriptDataHash` 与 `scriptSourcePromptHash` 不同。命中任一条件即视为人工改写。
- 消失的来源镜头含上述保护时解除 `scriptSourceKey/scriptSourcePromptHash` 并保留；否则删除。
- 消失的来源场次含受保护子镜头或人工连线时解除来源关联并保留；否则删除。
- 非来源节点与人工连线始终保留；只重建 ID 以 `script:<当前 publicationId>:` 开头的来源 composition/sequence 边，其他 publication 前缀和普通边均视为人工边。
- 撤销 refresh 快照时移除新增节点/边，恢复 `updatedNodes/detachedNodes` 和 `removedConnections`，并移除本次新建来源边；继续只保留最近 3 次快照。

- [ ] **Step 4: 实现检查器入口**

- 有 `source` 的剧本节点显示来源项目、发布时间、hash 和“来源已更新”。
- 提供“打开来源剧本”和“预览并刷新”。
- 预览展示新增、更新、保留、删除、受保护数量，并保存预览返回的 `source.hash`；确认时传给 `applyScriptPublicationRefresh` 作为 `expectedHash`。
- `previewScriptPublicationRefresh` 从剧本 Store/API 解析当前锁定版本；`applyScriptPublicationRefresh` 重新解析来源，若当前哈希已不同于 `expectedHash` 则拒绝应用并要求重新预览。应用图后等待 `saveProjectNow` 落盘，再更新 publication 的 `sourceVersionIds/sourceHash/publishedAt` 与剧本节点 `source`，不创建新影视项目。
- 无 `source` 的传统影视剧本节点继续使用原导演分析，不改变其行为。

- [ ] **Step 5: 运行刷新与撤销测试**

Run: `cd web && bun test "src/app/(user)/canvas/[id]/lib/film-script-refresh.test.ts" "src/app/(user)/canvas/[id]/lib/film-script-parse.test.ts"`
Expected: PASS。

---

### Task 12: 全量契约验证、文档更新与浏览器验收

**Files:**
- Modify: `docs/backend/backend-database.md`
- Modify: `docs/backend/api-response.md`
- Modify: `docs/progress/todo.md`
- Modify: `docs/progress/pending-test.md`
- Modify: `CHANGELOG.md`
- Deferred: `docs/overview/features.md`（用户验收后再改）

**Interfaces:**
- Consumes: Task 1–11 的全部实现。
- Produces: 可交付的剧本工作台改造与明确的未实测清单。

- [ ] **Step 1: 运行后端测试**

```bash
go test ./model ./repository ./service ./handler ./router -count=1
go test ./... -count=1
```

Expected: PASS；不得跳过失败测试。

- [ ] **Step 2: 运行前端领域测试**

```bash
cd web
bun test "src/app/(user)/script"
bun test "src/app/(user)/canvas/[id]/lib/film-script-refresh.test.ts"
bun test "src/app/(user)/canvas/[id]/lib/film-script-parse.test.ts"
bun test "src/services/script-film-publication.test.ts"
```

Expected: PASS。

- [ ] **Step 3: 更新后端文档**

- `backend-database.md` 增加两张表的字段、复合主键、索引、墓碑和 8/16 MB 限制。
- `api-response.md` 补充 `/changes` 的 HTTP 200 冲突语义和 `conflicts` 结构。
- 删除旧 `user-data/script-projects` 接口说明，不保留兼容备注。

- [ ] **Step 4: 浏览器验收**

使用 `browserclaw` 技能和一次性测试数据完成：
1. 导入三集剧本，确认仍为三集，切集正常。
2. 锁定三集并发布，确认影视项目生成三集且项目只创建一次。
3. 更新其中一集锁定稿，确认影视侧显示过期；预览后刷新同一项目。
4. 人工修改一个镜头提示词并添加媒体/绑定，刷新后确认节点、媒体和绑定保留。
5. 刷新页面，确认剧本与影视图持久化。
6. 模拟断网后编辑，恢复网络确认 outbox 同步。
7. 删除当前锁定版本，确认前后端均拒绝。
8. 新浏览器上下文直接打开剧本深链，确认不闪“不存在”。
9. 预览刷新后再次修改锁定稿，不重新预览直接应用旧预览，确认因 `expectedHash` 不匹配被拒绝。
10. 两个浏览器上下文登录同一账号，分别修改不同场次，确认双方内容都保留；再改同一场次，确认出现本地/远端选择且其他场次仍正常合并。

真实 AI、真实跨设备、移动端和媒体生成无法在本机完整验证时，在 `pending-test.md` 明确写“未实测”，不得写成已验证；两个浏览器上下文的同步测试不等同于真实跨设备验收。

- [ ] **Step 5: 更新进度文档**

- `todo.md` 将已完成事项移除；仍有真实模型、跨设备、移动端验收的事项保留。
- `pending-test.md` 记录本版本实际可测试变更和未实测边界。
- `CHANGELOG.md` 的 `Unreleased` 只写版本级归纳。
- 用户确认端到端验收前不更新 `features.md`。

- [ ] **Step 6: 检查工作区**

Run: `git status --short`
Expected: 只出现本计划授权文件与用户原有改动；不得提交或推送。

---

## Spec Coverage Matrix

| Spec 章节 | 实施任务 |
| --- | --- |
| 5.1–5.2 领域模型与摘要 | Task 1、4、9 |
| 5.3 版本、锁定、UTF-16 内容哈希与恢复不变量 | Task 1–2、6、8–9 |
| 5.4 发布关系、多集来源哈希与新鲜度 | Task 2、4、10 |
| 6 两表、8/16 MB 限制与事务分层 | Task 4–8 |
| 7 API、场次合并、删除墓碑与显式 resolution | Task 3、5、7–9 |
| 8 Store、本地键、原基线 outbox 与深链 readiness | Task 3、8–9 |
| 9.1–9.3 稳定编译、原快照重试与可靠发布落盘 | Task 2、8、10 |
| 9.4–9.5 来源 ownership、人工保护、expectedHash 与检查器 | Task 10–11 |
| 10 三处轻量 UI | Task 9、11 |
| 11 错误、恢复、版本删除与发布中断 | Task 6、8、10–11 |
| 12 测试与验收 | Task 1–12 |
| 13 文档交付 | Task 12 |
