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

- 【影视】条件/变量导入导出与高级表达式、导演风格后台 CRUD、预演导出与字幕/音频轨、剪辑导出（需后端或 ffmpeg 合成）；角色表情已接入表情集槽位，比例/动作设定视图尚未接入 UI。
- 【影视资产】跨设备云同步（需配置账号云存储）：A 设备写入 B 设备读取、媒体 `storageKey` 在另一设备的可读性；单浏览器双账号隔离、游客 → 登录接管、退避重试与后台路由返回恢复已验证。方案见 [2026-11-19-film-asset-sop-design.md](../superpowers/specs/2026-11-19-film-asset-sop-design.md)。
- 【渠道】TeamoRouter 视频已适配本地直连与后端代理（OpenAI-Videos），云端渠道识别、视频模型优先、目录合并与 MiniMax 分辨率/画幅/时长参数已修复；**待管理员登录后替换云端渠道旧视频型号为目录 ID 并更新默认视频模型**；尾帧/多参考扩展字段、其余模型按 `model_spec` 精确约束待后续补齐。
- 【漫画】批量审稿与编辑角色门禁在单用户架构下价值低，暂缓。
- 【营销】资料分享/协作、批量导入导出、版本历史、城市风格模板与分行业营销方法论预置（可继续在 Skill 层扩展）。
- 【素材源】第三方解析源/provider 抽象、解析结果缓存去重、画布 Agent **创建**素材源节点的工具（当前只能用户先建节点再解析）。后续新增任何复刻入口都必须走组级策划产出整组设定，不能直接写单图提示词。
- 【Agent】媒体任务实时进度与失败重试入口、每轮 token 与渠道信息落盘观测；需先做浏览器回归。`sendMessage` 只剩会话创建与消息准备，继续下沉收益有限，待回归后决定。
- 【音频】没有独立音频工作台页面，配音入口在画布音频节点、影视镜头声音字段和 Agent 工具中。
- 【一级导航】AI 写作（文案等）页面成型后再考虑加一级，先不挂空菜单。
- 【配置】首次引导仍需用户自行填写 Base URL 与 Key；是否默认开放远程渠道或提供演示额度需产品决策。

## 缺陷与风险

- 【后端测试】`go test ./handler/` 的 `TestModelProtocolChannelFlow` 与 `TestParameterTranslationChannelFlow` 共 22 个子测试失败，属测试基建缺陷：契约测试用 `blockProtocolNetwork` 把 `http.DefaultTransport` 换成函数型 RoundTripper，但 AI 代理客户端走 `service/outbound_proxy.go:34` 的 `outboundHTTPTransport()`，其中 `http.DefaultTransport.(*http.Transport)` 断言失败后新建真实 transport 并被 `sync.Once` 缓存，mock 被绕过；真实 transport 的 `resolveOutboundProxy` 在环境变量为空时回落 Windows 注册表系统代理，请求真的发往 `upstream.invalid` 并 EOF（清空 `HTTP(S)_PROXY`、设 `NO_PROXY=*` 均无效；无系统代理的机器则变成 DNS 失败）。修法：断言失败时直接复用该 RoundTripper，或给契约测试提供 client/transport 注入点；改动涉及生产出网路径，需回归真实渠道调用与代理行为。
- 【算力点】缺少 AI 代理扣点/退款的 handler 集成测试（本地代理环境会影响 upstream mock）；前端估算依赖已加载的 public 模型单价，后台改价后需刷新；用户停止任务按「不退还已开始执行任务」处理，如需退款要按未开始执行条件实现幂等退款。方案见 [ai-film-plan.md](ai-film-plan.md)。
- 【antd 弹层】Select / AutoComplete / Tooltip 与已修的 Dropdown 共用 rc-trigger 定位，在「减少动态效果」或动画被压缩的环境中可能同样停在隐藏坐标。逐页确认后，若确实失效再改成自绘，或给 ConfigProvider 注入定位兜底。

## 结构与工程

- 【画布】`canvas/[id]/canvas-client-page.tsx` 约 1956 行；任务/视口/选中/生成/音频裁剪 hooks、媒体恢复与 Overlay 类型已迁出，剩余可选项是把主组件拆成容器 + 侧栏 + 工具栏。z-index 档位未合并（合并会改遮挡，需专门回归）。画布库派生分页已收敛；侧栏剩余 effect 为动画与选中滚动，属真实副作用。
- 【素材选择器】查询、筛选与插入载荷已收敛到共享层（`hooks/use-asset-browser.ts`、`lib/asset-picker.ts`），弹窗卡片与侧栏卡片 UI 仍是两套（侧栏画布主题加拖拽插入，弹窗语义 token 加点击插入），合并需先定产品语义。
- 【生图/视频】`image/page.tsx` 1088 行、`video/page.tsx` 1099 行，主链路已抽页面私有 hooks；剩余 retry / mask edit 为薄编排，不再为拆而拆。Kling 面板 TEXT 字典/Section/OptionGrid/参考图条与共享实现视觉文案不同，统一需先定设计；视频页生成失败/删除流程仍与生图页不同构，抽页面私有 hook 前先定是否统一删除语义。
- 【工作流】模型类型与纯逻辑已抽离，`creative-workflow-workspace.tsx` 约 1992 行；仍保留任务提交、轮询、恢复与 UI 编排，继续拆分需保持真实「提交 → 轮询 → 完成 / 停止 / 重试」回归。
- 【样式】`app/globals.css` 约 1251 行；画布/后台/影视私有样式已抽到 `styles/`，共享筛选样式也已独立为 `filter-tags.css`，提示词页私有样式文件已清空删除。剩余工作台私有样式继续移出，globals 只留 token、reset、共享原语和通用 antd 覆写。`PunkAura` 已从 WebGL 着色器改为纯 CSS 静态多层渐变，不再有持续渲染开销。
- 【React Compiler】已启用 9 条规则（含 immutability）；剩余 purity（约 21 处）、refs（约 32 处）、set-state-in-effect（约 99 处）需分批清理后启用。
- 【后台】概览 AI / 算力日志已加按 ID 深链（AI 日志另有文件指纹缓存与 Top-N）；统计索引、浅色主题逐项视觉仍待做。AI 日志页已接入共享列表抽象，其余页面按需继续组件化。
- 【视觉】FilterTagGroup 可考虑增加 density/variant；结果/历史卡片元信息密度与影视面板内部分区留白需具体截图指认。
- 【无障碍】节点目前采用自然 Tab 序列而非单锚点 roving，是否改 roving tabindex 待评估。
- 【导演台】工具栏收纳需产品确认。
- 【配置】后台公开配置「系统提示词」的 image / video / text / workflow 四项前端未消费：生成链路读本地 `config.systemPrompts.*`，只有 `workflowAgent` 在后端 `service/workflow_agent.go` 生效。需先定产品意图（管理员统一推送 vs 用户本地自填），再决定是否接入 `resolveEffectiveConfig`。