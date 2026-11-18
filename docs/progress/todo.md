---
title: TODO
description: 当前项目后续值得处理的事项
---

# TODO

本文档只记录尚未完成的事项。已落地功能说明见 [features.md](../overview/features.md)，已实现但待人工验证的变更见 [pending-test.md](pending-test.md)。

## 需要真实环境验收

- 【漫画】真实文本/图片模型下的 AI 企划、拆页格与页格出图质量，角色/场景参考一致性，真实 `storageKey` 图片的导出与导入后刷新持久化，页格拖拽/缩放手感。
- 【影视】真实图片/视频模型下的跨镜角色身份与造型状态保持、多角色参考预算的实际画面、批量跨镜一致性与真实模型一致性审阅质量；浏览器真机交互（造型状态编辑、绑定建议确认/忽略、版本状态点与生成信息展开、首尾帧选择）与任务刷新恢复的上下文回写。
- 【营销】真实资料包 + 可读图文本模型 + 真实生图渠道的完整策划与配图生成；营销图片上传账号云存储后换设备读取；登录时游客资料（含图片）接管的真实链路。
- 【素材源/发布】真实抖音链接回归、能读图的文本模型下的整组策划质量、真机交互验收；抖音 H5 扫码真实发布验证。
- 【登录】真实双账号 + 真实后端端到端回归：游客创作 → 登录接管 → 云同步补传；退出后另一账号登录不再看到前一个账号的画布/素材/生成记录。
- 【画布】真机确认触屏手柄位置与手感；移动端横竖屏切换后的面板宽度、安全区适配与手势冲突。
- 【无障碍】真机/读屏验证节点键盘可达性。
- 【部署】Docker 静态资源与生产部署实测，补部署文档验证记录；视频与工作流页在正式构建产物下复测首屏耗时，确认懒加载骨架与错误恢复生效。
- 【支付】后台支付配置存在硬编码默认值，生产部署需覆盖。

## 功能待补

- 【影视】条件/变量导入导出与高级表达式、导演风格后台 CRUD、预演导出与字幕/音频轨、剪辑导出（需后端或 ffmpeg 合成）、账号云同步；角色表情/比例/动作设定视图尚未接入 UI。
- 【渠道】TeamoRouter 视频已适配本地直连与后端代理（OpenAI-Videos），云端渠道识别、视频模型优先、目录合并与 MiniMax 分辨率/画幅/时长参数已修复；**待管理员登录后替换云端渠道旧视频型号为目录 ID 并更新默认视频模型**；尾帧/多参考扩展字段、其余模型按 `model_spec` 精确约束待后续补齐。
- 【漫画】项目与角色/场景共享库账号云同步。批量审稿与编辑角色门禁在本地单用户架构下价值低，暂缓。
- 【营销】资料分享/协作、批量导入导出、版本历史、城市风格模板与分行业营销方法论预置（可继续在 Skill 层扩展）。
- 【素材源】第三方解析源/provider 抽象、解析结果缓存去重、画布 Agent **创建**素材源节点的工具（当前只能用户先建节点再解析）。后续新增任何复刻入口都必须走组级策划产出整组设定，不能直接写单图提示词。
- 【工作流】缺 `workflowId` 的跨设备任务无法重试；系列草稿仍需重新打开运行弹窗才恢复。
- 【Agent】媒体任务实时进度与失败重试入口、每轮 token 与渠道信息落盘观测；需先做浏览器回归。`sendMessage` 只剩会话创建与消息准备，继续下沉收益有限，待回归后决定。
- 【音频】没有独立音频工作台页面，配音入口在画布音频节点、影视镜头声音字段和 Agent 工具中。
- 【一级导航】AI 写作（文案等）页面成型后再考虑加一级，先不挂空菜单。
- 【配置】首次引导仍需用户自行填写 Base URL 与 Key；是否默认开放远程渠道或提供演示额度需产品决策。

## 缺陷与风险

- 【后端测试】`go test ./handler/` 的 `TestModelProtocolChannelFlow` 与 `TestParameterTranslationChannelFlow` 共 22 个子测试失败，属测试基建缺陷：契约测试用 `blockProtocolNetwork` 把 `http.DefaultTransport` 换成函数型 RoundTripper，但 AI 代理客户端走 `service/outbound_proxy.go:34` 的 `outboundHTTPTransport()`，其中 `http.DefaultTransport.(*http.Transport)` 断言失败后新建真实 transport 并被 `sync.Once` 缓存，mock 被绕过；真实 transport 的 `resolveOutboundProxy` 在环境变量为空时回落 Windows 注册表系统代理，请求真的发往 `upstream.invalid` 并 EOF（清空 `HTTP(S)_PROXY`、设 `NO_PROXY=*` 均无效；无系统代理的机器则变成 DNS 失败）。修法：断言失败时直接复用该 RoundTripper，或给契约测试提供 client/transport 注入点；改动涉及生产出网路径，需回归真实渠道调用与代理行为。
- 【算力点】缺少 AI 代理扣点/退款的 handler 集成测试（本地代理环境会影响 upstream mock）；前端估算依赖已加载的 public 模型单价，后台改价后需刷新；用户停止任务按「不退还已开始执行任务」处理，如需退款要按未开始执行条件实现幂等退款。方案见 [ai-film-plan.md](ai-film-plan.md)。
- 【antd 弹层】Select / AutoComplete / Tooltip 与已修的 Dropdown 共用 rc-trigger 定位，在「减少动态效果」或动画被压缩的环境中可能同样停在隐藏坐标。逐页确认后，若确实失效再改成自绘，或给 ConfigProvider 注入定位兜底。
- 【localforage】写失败静默降级 localStorage 的读写不对称仍保留，风险高，需单独评估。
- 【视频停止】本地直连视频停止只中断前端轮询，服务端可能继续执行。
- 【视频工作台】任务收尾/提交只落单条日志却 `readStoredLogs()` 全量重读并逐条 normalize（`page.tsx` `finalizeGenerationLog` / `submitGenerationSnapshot`）。`resolveMediaUrl` 已补 URL 缓存（见 pending-test），但调用点仍应改为单条写入/更新，避免历史变长后每次收尾都全表扫描。
- 【视频工作台】提交无并发互斥：通用面板此前有意移除了 `running`，`canGenerate` 在工作流/AutoDL 场景恒真，「重试 + 生成」会并发跑两次 `submitGenerationSnapshot`，各自的 `readStoredLogs` + `setLogs` 互相覆盖。修前需先定提交中按钮的禁用语义（Kling 面板用 `loading`）。
- 【视频工作台】参考素材限额三份真源：`page.tsx` 的 `referenceImageLimit`/`referenceLimits`、`buildRequestSnapshot` 内联切片、`api/video/payload/request.ts` 的硬编码 10；提交校验 12 条 `message.error` 分支内联在组件里、无单测。建议抽 `validateVideoRequest()` 纯函数并让限额从同一处派生。
- 【视频工作台】没有创作草稿：生图有 `image/draft.ts` 自动保存与覆盖确认，视频刷新/切页会丢提示词、首尾帧、参考图/视频/音频、Kling 元素列表与多镜头分镜。
- 【视频工作台】删除当前预览记录时 `setResults([])` 会清空全部结果（含无关的进行中项）；`now` 每秒 setState 触发整页重渲染（两套面板与全部卡片无 memo）；`dedupeVideoLogs` 为 O(n²) 且每次日志变化都跑。
- 【后端】视频任务无卡死 TTL：`ListDueVideoTasks` 不按年龄过滤，上游永不完成的任务会永久 5s 轮询且已扣算力点不退（`DeleteFinishedVideoTasksBefore` 只清终态）；轮询 goroutine 单轮最多 200 视频 + 200 工作流并发且无上限。
- 【影视】`characterMasterImages` 的「无档案回退主图」不是旧数据兼容，而是「生成角色卡时自动先生成全身图」流程依赖（含 cardSignature 视觉标记），需配套重构后再删。

## 冗余收敛剩余项

A 组 1–4（素材源正文、发布草稿、任务 ID、Kling 判定）已收敛，见 pending-test；Kling 的视频侧判定（`video/history.ts` ↔ `protocols/kling-models.ts`，request payload 第三份）也已在「技术债清理」轮收敛为协议单一口径。以下未动：

- 【A5 视频参数】归一化跨层双写且语义相反：`user/video/history.ts` 保留 `"-1"`，`api/video/payload/shared.ts` 把它算成 6；size 的 `"auto"` 一处返回 `"auto"` 一处返回 `null`。
- 【A6 日志脱敏】`api/image/client.ts` 的 `redactLogImages` 只挡 `data:image/`，`api/video/client.ts` 的 `redactLogMedia` 还挡 video/audio；同一份上报逻辑两份，脱敏口径不一致（涉及隐私，优先）。
- 【A7 publicHttpUrl】`api/image/payload.ts` 与 `api/video/payload/shared.ts` 逐字相同两份；`api/direct-ai.ts` 的 `publicReferenceURL` 是分歧变体（正则、不处理相对地址）。
- 【B8 上传/删除双写】`services/image-storage.ts` 与 `services/file-storage.ts` 整条服务端上传/删除链路逐行同构，分歧只在失败 return null 还是 throw；牵涉存储链路，需单独一轮加回归。
- 【B9 storageConfig 双缓存】两个存储文件各缓存同一个 GET、各导出 `clearStorageConfigCache`，调用方被迫同时清两个，漏清一个就是脏配置。
- 【B10 小双写】`readAxiosError` 三份（image/video/audio client）兜底已分歧；两个 TTS 音色选择器近整份复制；storageKey→URL 的 effect 四份。后台筛选条已统一为共享组件。
- 【C 组小重复】`connection()` 在 canvas-source-remix 与 canvas-source-plan 逐字相同；「有素材」判定三份（hook/卡片/面板）；作者/统计行 UI 卡片与面板重复拼装；`formatBytes` 至少三份且精度单位表不同；节点摘要两套字段抽取（`canvasAgentNodeSummary` 与 `summarizeNode`）。
- 【seedance sd2】别名在 lib 音频/参考图判定里有、摘要时长档位里没有，属 A 组同类分歧。

## 结构与工程

- 【画布】`canvas/[id]/canvas-client-page.tsx` 现 2051 行；任务/视口/选中/生成 hooks 与纯函数已迁出，剩余可选项是把主组件拆成容器 + 侧栏 + 工具栏，以及页面 model 类型继续收敛。z-index 档位未合并（合并会改遮挡，需专门回归）；`canvas/page.tsx` 与侧栏的派生 state useEffect 待收敛。
- 【素材选择器】与侧栏已共用查询、筛选与插入载荷逻辑（`canvas/lib/canvas-asset-query.ts`），卡片 UI 仍是两套（侧栏画布主题加拖拽插入，弹窗语义 token 加点击插入），合并需先定产品语义。
- 【生图/视频】`image/page.tsx` 1088 行、`video/page.tsx` 1099 行，主链路已抽页面私有 hooks；剩余 retry / mask edit 为薄编排，不再为拆而拆。Kling 面板 TEXT 字典/Section/OptionGrid/参考图条与共享实现视觉文案不同，统一需先定设计；视频页生成失败/删除流程仍与生图页不同构，抽页面私有 hook 前先定是否统一删除语义。
- 【工作流】`components/workflows/creative-workflow-workspace.tsx` 2702 行，是当前最大的单文件；继续拆分需保持真实「提交 → 轮询 → 完成 / 停止 / 重试」回归。
- 【样式】`app/globals.css` 1251 行；画布/后台/提示词/影视私有样式已抽到 `styles/`，剩余工作台私有样式继续移出，globals 只留 token、reset、共享原语和通用 antd 覆写。`PunkAura` 已从 WebGL 着色器改为纯 CSS 静态多层渐变，不再有持续渲染开销。
- 【React Compiler】规则逐条启用（purity / refs / set-state-in-effect），先做白名单再扩大。
- 【测试】前端 88 个文件、504 条（`bun test`）；后续补任务合并、连接校验的边界用例。
- 【后台】概览 AI 日志全量扫描的缓存/统计索引、概览与列表的行级深链、浅色主题逐项视觉；AI 日志页已接入共享列表抽象，其余页面按需继续组件化。
- 【视觉】FilterTagGroup 可考虑增加 density/variant（当前用 `.prompt-filter-tag` 全局覆盖）；画布选中环仍为硬编码蓝色，后续统一为主题 token；结果/历史卡片元信息密度与影视面板内部分区留白需具体截图指认。
- 【无障碍】节点目前采用自然 Tab 序列而非单锚点 roving，是否改 roving tabindex 待评估。
- 【导演台】工具栏收纳需产品确认。
- 【配置】后台公开配置「系统提示词」的 image / video / text / workflow 四项前端未消费：生成链路读本地 `config.systemPrompts.*`，只有 `workflowAgent` 在后端 `service/workflow_agent.go` 生效。需先定产品意图（管理员统一推送 vs 用户本地自填），再决定是否接入 `resolveEffectiveConfig`。