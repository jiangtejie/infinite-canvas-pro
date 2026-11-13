---
title: TODO
description: 当前项目后续值得处理的事项
---

# TODO

- 后台与工作台仍在使用 antd 的 Select / AutoComplete / Tooltip 弹层：它们和已修的 Dropdown 共用 rc-trigger 定位，在「减少动态效果」或动画被压缩的环境中可能同样停在隐藏坐标。逐页确认后，若确实失效，再把这些交互改成自绘，或给 ConfigProvider 注入定位兜底。
- 顶栏一级菜单后续按板块扩展：AI 写作（文案、脚本）等页面成型后再加一级，先不挂空菜单。
- AI 影视板块 Phase 1、Phase 2、导演台画布/分组视图、跨项目角色/场景库与批量生成图/视频已落地（项目列表 / 剧本解析 / 分镜编辑 / 分镜图与视频生成 / 角色库与场景库 / 角色视图设定 / 画布视图 / 分组视图 / 跨项目库 / 批量出图出视频）；已补导演风格语法与故事板预演（8 个内置风格、风格规则检查、预演时间线、时长/覆盖/连续性/风格问题定位）；剩余：条件/变量导入导出与高级表达式、风格后台 CRUD、预演导出与字幕/音频轨、剪辑导出（需后端或 ffmpeg 合成）、账号云同步。
- 【算力点】剩余技术债：缺少 AI 代理扣点/退款的 handler 集成测试（本地代理环境会影响 upstream mock）；前端估算依赖已加载的 public 模型单价，后台改价后需刷新；用户停止任务按“不退还已开始执行任务”的策略处理（如需退款要按未开始执行条件实现幂等退款）。方案见 [ai-film-plan.md](ai-film-plan.md)。
- 【画布】画布库缩略图已从本地存储重建；保存状态已纳入云端同步失败；手势/生成/Agent/文件导入拆到独立 hooks，渲染结构已按 stage/overlays/dialogs/assistant 分层（workspace 154 行，页面约 1900 行）；触屏已支持拖节点/四角缩放/连线并加大 coarse pointer 手柄（触屏框选暂不支持）。剩余：真机确认手柄位置与手感，页面 model 类型仍可继续收敛。
- 【生图】本地直连与后端持久化任务均支持停止；本地直连会中断请求/SSE、保留已停止结果并可重新生成。
- 【影视】角色/场景设定图与角色卡已接停止/恢复（角色卡纯本地 Canvas 拼合阶段只能结束后丢弃）；批量图/视频已改为立即中断当前任务并终止队列；本地直连视频停止只中断前端轮询，服务端可能继续执行。
- 【工作流】同会话异步任务已能自动完成；独立页与嵌入抽屉均可停止；双轮询已收敛；刷新恢复任务按父任务聚合，系列草稿按用户/游客与工作流持久化并支持清空。剩余：缺 workflowId 的跨设备任务无法重试；聚合依赖 client_workflow_image_task_<父id>_<序号> 约定；系列草稿仍需重新打开运行弹窗才恢复。
- 【结构重构】已完成：画布三阶段与渲染结构拆分、生图/视频工作台壳、影视/剧本分层、全局样式分层、素材详情抽屉共享、素材库入口、历史与请求工具收敛、图片/视频服务目录化、后台设置及主要后台页面组件化、工作流停止/聚合/草稿持久化、账户充值入口、视频/生图停止修复。剩余：一级导航信息架构、后台首页与少数页面继续组件化、生图历史媒体差异收敛。
- 【配置】全局配置弹窗为分区导航（非 tab），首次引导仍需用户自行填写 Base URL 与 Key；如需进一步降低门槛，需产品决策是否默认开放远程渠道或提供演示额度。
- 【视觉】筛选项共享组件 FilterTagGroup 可考虑增加 density/variant（当前用 .prompt-filter-tag 全局覆盖）；画布选中环仍为硬编码蓝色，后续统一为主题 token。
- 【无障碍】画布节点已可通过 Tab 聚焦并用 Enter/Space 选中，连接点已有键盘模式；仍需真机/读屏验证，节点目前采用自然 Tab 序列而非单锚点 roving。
- 【画布】素材源节点（抖音图文）M1 已落地：解析/展开素材/重置，后台解析开关、取消解析、失败保留旧结果、旧素材清理、图片转存重试、个人存储转存和解析日志/单测已补。复刻已整体搬进创作 Agent（`expand_source` / `plan_source_remix` / `generate_remix_images`，组级策划由代码门禁保证必经，见待测试），素材源面板不再承载复刻步骤。剩余：第三方解析源/provider 抽象、解析结果缓存去重、画布 Agent **创建**素材源节点的工具（当前只能用户在画布上建节点再解析）、真实抖音链接回归和真机交互验收；发布节点与抖音 H5 扫码已实现，待真实扫码发布验证（见待测试）。后续新增任何复刻入口都必须走组级策划产出整组设定，不能直接写单图提示词。
- 【登录】本地数据已按账号分区（见待测试），跨账号串号与登录 UI 收尾两项已完成。剩余：真实双账号 + 真实后端的端到端回归，尤其是游客创作→登录接管→云同步补传，以及退出后另一账号登录不再看到前一个账号的画布/素材/生成记录。
- 【存储】blob 清理的引用收集不完整（既有缺陷，非本轮引入）：`cleanupUnusedImages` / `cleanupUnusedMedia` 只收集画布项目、我的素材、Skill、生成历史，**不收集影视项目、角色/场景库、剧本**里引用的 storageKey。只被影视/剧本引用的本地图片有可能被判为无引用而物理删除。账号分区这轮已把「其他账号分区的画布与素材」补进收集范围，影视/剧本三类仍需一并补上（当前账号与其他账号分区都要算）。
- 【存储】`web/src/services/storage-migration.ts` 全仓无调用方，且写的是分区前的全局 store 名，已彻底过期，可删。

本文档用来记录当前项目后续比较值得处理的事项。

- 【画布 Agent】执行层已完成：工具动作审计（actionId / 风险等级 / 耗时）、停止取消错误码、媒体请求 ID 幂等、工具风险注册表、注册表驱动的确认（删除节点/连线 + 自动生成媒体的提交确认，可通过 Agent 设置关闭）、批次结构快照与整批回滚（API 与 Codex 路径）、纯函数拆分（执行器 555 → 422 行，新增 70 条单测）。剩余：媒体任务实时进度/失败重试入口、每轮 token 与渠道信息落盘观测（批次节点定位已完成）；生成成本提示已在媒体确认卡落地；以上都需要先做浏览器回归。
- 【画布 Agent】上下文与记忆已完成：优先级裁剪（选中 / 已确认 / 参考 / 上下游 / 异常节点给明细，其余只给定位信息）、恢复会话按真实画布校正节点与悬空 pendingTaskIds、检查点收紧（6000 token、禁止复述原文）、助手消息批次统计脚注与一轮内批次累加。面板拆分三步完成（会话读写、单轮执行、请求配置与 Skill 校验），拆分前 1030 行、拆分后 965 行、加入确认开关与批次脚注后 981 行。验证：`bun run typecheck`、全仓 ESLint、`bun test`（59 文件 323 条）均通过。剩余：`sendMessage` 只剩会话创建与消息准备，继续下沉收益有限，待浏览器回归后决定。

- 【UI 打磨】P0 已完成（卡片悬停降噪、准星收敛、工作台去光场、表头/胶囊字距、账户卡圆角）。P1 已完成：筛选改文字下划线、素材卡去缩放遮罩与标签精简、工作台提示字号；影视面板减层经核查取消（同一时刻最多两个面板）。P1 第二批（浏览器实测）：自动填充串色、浅色主按钮颜色、筛选滚动条、环境光减弱已完成。P1 已完成：工作台参数区字号分级（12/11/10 三级）、后台表格行高与单元格留白。普通用户与管理员后台回归已完成。剩余可选项：结果/历史卡片元信息密度、影视面板内部分区留白（需具体截图指认）。
- 【后台改造】批次 0–3 与概览页（A+B）已完成并在真实后台登录态验收：壳层与视觉基线、四个列表页工具栏与详情抽屉、素材库画廊/Skill 网格/充值套餐商品卡、设置页双栏与保存条、`/admin` 运营概览（今日/7 天聚合与最近记录）。当前无后台必做项；可选后续：概览 AI 日志全量扫描的缓存/统计索引、概览与列表的行级深链、浅色主题逐项视觉。
- 画布移动端需要在真机验证横竖屏切换后的面板宽度、安全区适配和手势冲突。
- 视频与工作流页需要在正式构建产物下复测首屏耗时，确认懒加载骨架和错误恢复确实生效。
- 画布节点目前只能通过点击获得焦点，后续可评估是否需要节点的 Tab 键漫游（roving tabindex）。
- 生图 / 视频页主链路已抽到页面私有 hooks：生图页 1497 → 1226 行，视频页 1686 → 1469 行；轮询、历史同步、批量提交、单条生成与停止均已收口。剩余 retry / mask edit 仅为薄编排，后续如继续拆分需保持真实「提交 → 轮询 → 完成 / 停止 / 重试」回归。

## 前端 UI review 第二轮（已落地 + 剩余）

截至第四批，review 里可安全落地的项已基本清完：

- 第二批：P0 修复 + 视觉收敛（失败卡/历史卡/操作列/语义色/空态/状态芯片/全局消息偏移）。
- 第三批：生图卡片层合并 + `useResultsWindow`；后台筛选条/ProTable 壳/分页收敛、AI 日志改 `useQuery`；画布删旧布局迁移、`buildNodeConfig`/`publishDisplayStatus`/克隆/ID 收敛、悬浮工具条隐藏；影视 `FilmShotDetail` props 21→9、共享 Field/计时/截断、剧本删除确认与 AI 诊断改手动触发；画布危险色与 hover token 化；账户分页、素材库失败态、首页提示词骨架。
- 第四批：全仓错误文案统一 `errorMessage()`（约 150 处 `instanceof Error` 三元收敛）；后端 `AuthUser` 补 `email` 字段（账户邮箱读写打通）；后台 4 个 `use-admin-*` 抽 `useAdminList` + 401 改状态码判断；设置页保存流程三份收敛、legacy `systemPrompt` 前端链清理、默认值重复兜底收敛；画布 7 处菜单键盘/点外关闭统一 hook + z-index 命名常量 + 阴影/底部间距 token；影视删 `FilmShot.branch` 旧字段；`hydrateUser` 仅 401/403 清登录态、配置同步失败改全局提示、账户页签补 tabpanel/方向键。

剩余（低收益或有前置依赖）：

- 【配置】后台公开配置「系统提示词」的 image / video / text / workflow 四项前端未消费：生成链路读的是本地配置 `config.systemPrompts.*`（回退 `config.systemPrompt`），只有 `workflowAgent` 在后端 `service/workflow_agent.go` 生效。需先定产品意图（管理员统一推送 vs 用户本地自填），再决定是否把公共提示词接入 `resolveEffectiveConfig`；legacy 单字段已删除，不再覆盖用户本地提示词。
- 【后端测试】`go test ./handler/` 的 `TestModelProtocolChannelFlow` 与 `TestParameterTranslationChannelFlow` 共 22 个子测试失败，属既有测试基建缺陷：契约测试用 `blockProtocolNetwork` 把 `http.DefaultTransport` 换成函数型 RoundTripper，但 AI 代理客户端走 `service/settings.go:489` 的 `outboundHTTPTransport()`，其中 `http.DefaultTransport.(*http.Transport)` 断言失败后会新建真实 transport，mock 被绕过；真实 transport 的 `resolveOutboundProxy` 在环境变量为空时回落 Windows 注册表系统代理，请求真的发往 `upstream.invalid` 并 EOF（清空 `HTTP(S)_PROXY`、设 `NO_PROXY=*` 均无效；无系统代理的机器则变成 DNS 失败）。修法：`outboundHTTPTransport` 在 DefaultTransport 不是 `*http.Transport` 时直接复用该 RoundTripper，或给契约测试提供 client/transport 注入点；改动涉及生产出网路径，需回归真实渠道调用与代理行为。
- 【影视】`characterMasterImages` 的「无档案回退主图」不是纯旧数据兼容，而是「生成角色卡时自动先生成全身图」流程依赖（含 cardSignature 视觉标记），需配套重构后再删。
- 【画布】z-index 档位未合并（合并会改遮挡，需专门回归）；`canvas/page.tsx` 与侧栏的派生 state useEffect；素材选择器与侧栏已共用查询、筛选与插入载荷逻辑（`canvas/lib/canvas-asset-query.ts`），卡片 UI 仍是两套（侧栏画布主题加拖拽插入，弹窗语义 token 加点击插入），合并需先定产品语义。
- 【生图/视频】Kling 面板 TEXT 字典/Section/OptionGrid/参考图条与共享实现视觉/文案不同，统一需先定设计；生成失败/删除流程仍有三套，可抽页面私有 hook。
- 【通用】localforage 写失败静默降级 localStorage 的读写不对称仍保留（风险高，单独评估）；导演台工具栏收纳需产品确认。

## 当前排期

已完成基线：画布任务 hooks / 门面、图片 / 视频工作台组件拆分、ESLint 0 warning、真实图片 / 视频生成回归、移动端筛选与后台弹窗修复。

### P0 / 立即处理（1–2 人日）

- [x] 验证本地生产构建：`bun run build` 通过（33.5s 编译 + 23 个静态页）；GitHub Actions 仍无可见运行记录，待确认仓库 Actions 是否启用。
- [x] 长历史首屏窗口：image / video 历史卡默认 48 条，底部「加载更多」每次 +48。
- [x] 预览订阅与内存：预览生成与版本订阅下沉到每张可见图片的 `useImagePreviewUrl`，历史卡未渲染时不再生成预览或刷新。
- [x] Antd 弹层减少动态效果定位：根因是全局 `* { animation-duration: .01ms }` 让 rc-trigger 停在 `-1000vw / -1000vh`；已改为只关闭站点装饰动画，Select 实测回到 75 / 81 正常坐标。Tooltip / AutoComplete 共用同一机制。
- [x] 画布创建菜单无障碍：`role="menu"` / `role="menuitem"`、打开即聚焦首项、Esc 关闭。
- [x] 图片结果 / 历史 / 分类卡补 `width` / `height`，主图 alt 已有。
- [x] 列表 / 素材图 CLS 审计与 axe A/AA 11 条路由清零；自绘浮层键盘漫游已覆盖创建 / 缩放 / Agent / Skill / 筛选，剩余真机读屏验收。

验收：生产构建可启动，1000 条历史打开不卡顿，键盘可完成建节点 / 连线 / 删除。

### P1 / 下一迭代（3–5 人日）

- [x] 图片 / 视频轮询、历史同步、单条生成、批量提交、视频停止已抽页面私有 hooks；图片 / 视频真实生成与视频停止回归通过。
- [x] 图片 / 视频 Result / Pending 卡已收敛到 `MediaResultCard` / `PendingMediaCard`，Failed / History 继续复用 `components/workbench/task-result`。
- [x] 本机首屏实测：首页 LCP 1.1–1.7s、生图 0.5–1.3s、视频 0.4–0.8s、工作流 0.6–1.0s；CLS 全部 ≤0.008。
- [ ] 移动端真机：横竖屏、安全区、画布手势与工作台内部滚动冲突；390×844 / 844×390 模拟已无横向溢出，视频参数、参考视频 / 音频已折叠。

验收：生图页逻辑行数明显下降，图片 / 视频卡片不再复制 JSX，首屏与移动端无回归。

### P2 / 后续（1–2 周）

- [ ] 画布容器 / 侧栏 / 工具栏进一步拆分；工作台私有样式继续从 `globals.css` 分层。
- [ ] React Compiler 规则逐条启用（purity / refs / set-state-in-effect），先做白名单再扩大。
- [ ] Docker 静态资源与生产部署实测，补部署文档验证记录。
- [ ] 浅色主题 WebGL 光场调优与最终视觉回归。

验收：画布主页面不再承担全部交互，CSS 图保持可维护，生产部署可复现。

## 前端技术债（按收益排序）

### 1. 拆分画布主页面（最高优先）

- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` 现有 4479 行（非空，总 4770 行），核心组件 `InfiniteCanvasPage` 约 4770 行；任务轮询、节点生成、快捷键、视口手势、右键菜单都在这一个组件里。
- 按「纯函数 → 组件 → hooks」三步拆，每步单独提交、单独回归：
  1. 把文件末尾的纯函数（任务结果合并、节点构造、Agent 摘要、连接校验）迁到 `canvas/[id]/lib/`，按职责分成 `task-updates.ts`、`node-builders.ts`、`connections.ts`；这批函数不依赖 React，迁出后可直接补单元测试。**已完成**任务状态 / 时间 / 尺寸 / URL 一组（`canvas-task-helpers.ts` + 9 条单测），视频 / 音频 / 图片任务回填与 `fitCanvasMediaNode`（`canvas-task-updates.ts` + 12 条单测），`CanvasTopBar` + 画布菜单（`components/canvas-top-bar.tsx`）、`FullscreenPreview`（`components/fullscreen-preview.tsx`）、两个创建菜单（`components/canvas-create-menus.tsx`）、Agent 摘要（`canvas-agent-summary.ts`）、连接校验（`canvas-connections.ts`）、节点构造（`canvas-node-builders.ts`）、生成配置（`canvas-generation-config.ts`）与重试 / 批量 / 角度辅助（`canvas-graph.ts`）；纯函数与工作流异步任务迁移已收口；`useCanvasViewport` 已接管视口状态与坐标换算 / 缩放 / 适配，`useCanvasSelection` 已接管选中状态与选中操作，`useCanvasTasks` 已接管任务注册表 / 运行状态；提交、停止、轮询与 `useCanvasTaskSystem` 门面均已完成迁移。
  2. 抽出 `CanvasTopBar`（约 5323–5582 行）、`FullscreenPreview`（5131–5322）、`ConnectionCreateMenu` / `NodeCreateMenu`（228–320）。
  3. 再按职责抽 `useCanvasViewport` / `useCanvasSelection` / `useCanvasTasks`，最后视情况把主组件拆成 Canvas 容器 + 侧栏 + 工具栏。真实生成链路已回归（单图 / 停止 / 重试 / 批量 / 刷新恢复）；`useCanvasTaskRunner` 已接管提交与运行记录，`useCanvasTaskControl` 已接管停止逻辑；轮询已用真实异步视频（seedance-2.0-fast）验证，轮询编排已抽到 `useCanvasTaskPolling`，任务 hooks 已由 `useCanvasTaskSystem` 门面统一组合。
- 回归清单：新建画布 → 加图片/视频/文本节点 → 连线 → 生图/视频任务 → 刷新恢复 → 撤销/重做 → 批量折叠 → 导出。

### 2. 生图 / 视频页与工作流页

- `image/page.tsx` 现约 1160 行非空 / 1228 总（结果卡、生成控件与结果面板已抽出），`video/page.tsx` 现约 1407 行非空 / 1482 总（结果卡、生成控件、参考条与结果面板已抽出）、`creative-workflow-workspace.tsx` 约 2090 行；画布库已补搜索 / 分页。
- 已完成：图片 / 视频轮询、历史同步、单条生成、批量提交、视频停止均拆为页面私有 hooks；Result / Pending 卡收敛到共享基座。剩余 retry / mask edit 为薄编排，不再为拆而拆。
- 回归：提交 → 轮询 → 完成 / 停止 / 重试；切换侧边与底部布局；切换分类视图。

### 3. 全局样式分层

- `globals.css` 约 997 行（非空）；画布、后台、提示词私有样式已抽到 `styles/`，剩余工作台私有样式可继续按同样方式分层。
- 画布 / 后台 / 提示词部分已完成；后续把工作台私有样式继续移出，globals 只留 token、reset、共享原语和通用 antd 覆写。
- 首页 / 登录页、生图 / 视频工作台、工作流页、画布库头部已接入 `PunkAura` WebGL 光场；共享 `PageHeader` 统一呼吸信号。画布空状态、404 与首页卡片入场也已接入呼吸信号 / 错峰动画。

### 4. 工程护栏

- 已补 `bun run typecheck`、`bun run lint`、CI 的 `bun test` / 类型检查 / Lint；`noUnusedLocals` / `noUnusedParameters` 已写入 tsconfig；ESLint 9 flat config 已接入，保留 `rules-of-hooks`（error）与 `exhaustive-deps`（warn），Next 16 的 React Compiler 规则暂关闭；当前 0 warning，CI 可直接拦截新增依赖问题。
- 开发服务器已默认 Turbopack（`dev:webpack` 仅作回退）。如 3000 端口被旧进程占用或内存异常升高，先用 `Get-NetTCPConnection -LocalPort 3000` 找到占用进程再重启，避免残留进程叠加。
- 前端测试现有 16 个文件、93 条，集中在 history / protocol 与画布纯函数；后续补任务合并、连接校验的边界用例。

### 5. 其它待收敛

冗余审计剩余项。A 组 1–4（素材源正文、发布草稿、任务 ID、Kling 判定）已收敛，见 pending-test；以下未动：

- 【A5 视频参数】归一化跨层双写且语义相反：`user/video/history.ts` 保留 `"-1"`，`api/video/payload/shared.ts` 把它算成 6；size 的 `"auto"` 一处返回 `"auto"` 一处返回 `null`。
- 【A6 日志脱敏】`api/image/client.ts` 的 `redactLogImages` 只挡 `data:image/`，`api/video/client.ts` 的 `redactLogMedia` 还挡 video/audio；同一份上报逻辑两份，脱敏口径不一致（涉及隐私，优先）。
- 【A7 publicHttpUrl】`api/image/payload.ts` 与 `api/video/payload/shared.ts` 逐字相同两份；`api/direct-ai.ts` 的 `publicReferenceURL` 是分歧变体（正则、不处理相对地址）。
- 【B8 上传/删除双写】`services/image-storage.ts` 与 `services/file-storage.ts` 整条服务端上传/删除链路逐行同构，分歧只在失败 return null 还是 throw；牵涉存储链路，需单独一轮加回归。
- 【B9 storageConfig 双缓存】两个存储文件各缓存同一个 GET、各导出 `clearStorageConfigCache`，调用方被迫同时清两个，漏清一个就是脏配置。
- 【B10 小双写】`readAxiosError` 三份（image/video/audio client）兜底已分歧；两个 TTS 音色选择器近整份复制；storageKey→URL 的 effect 四份；六个后台筛选条重复同一套搜索+重置。
- 【C 组小重复】`connection()` 在 canvas-source-remix 与 canvas-source-plan 逐字相同；「有素材」判定三份（hook/卡片/面板）；作者/统计行 UI 卡片与面板重复拼装；`formatBytes` 至少三份且精度单位表不同；节点摘要两套字段抽取（`canvasAgentNodeSummary` 与 `summarizeNode`）。
- 【已知未动】seedance `sd2` 别名在 lib 音频/参考图判定里有、摘要时长档位里没有，属 A 组同类分歧但本轮未要求，留待下一轮。