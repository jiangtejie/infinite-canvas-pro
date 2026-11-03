---
title: TODO
description: 当前项目后续值得处理的事项
---

# TODO

- 后台与工作台仍在使用 antd 的 Select / AutoComplete / Tooltip 弹层：它们和已修的 Dropdown 共用 rc-trigger 定位，在「减少动态效果」或动画被压缩的环境中可能同样停在隐藏坐标。逐页确认后，若确实失效，再把这些交互改成自绘，或给 ConfigProvider 注入定位兜底。

本文档用来记录当前项目后续比较值得处理的事项。

- 画布移动端需要在真机验证横竖屏切换后的面板宽度、安全区适配和手势冲突。
- 视频与工作流页需要在正式构建产物下复测首屏耗时，确认懒加载骨架和错误恢复确实生效。
- 画布节点目前只能通过点击获得焦点，后续可评估是否需要节点的 Tab 键漫游（roving tabindex）。
- 生图与视频页仍各有约 1900 行，生成、轮询、任务恢复逻辑还在组件内，并与 `logsRef`、`effectiveConfigRef`、`pollContextRef` 等 ref 耦合；后续抽 `use-image-generation.ts` / `use-video-generation.ts` 时，先只改生图页、视频页留作对照，抽完必须跑真实「提交 → 轮询 → 完成 / 停止 / 重试」回归。

## 前端技术债（按收益排序）

### 1. 拆分画布主页面（最高优先）

- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` 现有 4479 行（非空，总 4770 行），核心组件 `InfiniteCanvasPage` 约 4770 行；任务轮询、节点生成、快捷键、视口手势、右键菜单都在这一个组件里。
- 按「纯函数 → 组件 → hooks」三步拆，每步单独提交、单独回归：
  1. 把文件末尾的纯函数（任务结果合并、节点构造、Agent 摘要、连接校验）迁到 `canvas/[id]/lib/`，按职责分成 `task-updates.ts`、`node-builders.ts`、`connections.ts`；这批函数不依赖 React，迁出后可直接补单元测试。**已完成**任务状态 / 时间 / 尺寸 / URL 一组（`canvas-task-helpers.ts` + 9 条单测），视频 / 音频 / 图片任务回填与 `fitCanvasMediaNode`（`canvas-task-updates.ts` + 12 条单测），`CanvasTopBar` + 画布菜单（`components/canvas-top-bar.tsx`）、`FullscreenPreview`（`components/fullscreen-preview.tsx`）、两个创建菜单（`components/canvas-create-menus.tsx`）、Agent 摘要（`canvas-agent-summary.ts`）、连接校验（`canvas-connections.ts`）、节点构造（`canvas-node-builders.ts`）、生成配置（`canvas-generation-config.ts`）与重试 / 批量 / 角度辅助（`canvas-graph.ts`）；纯函数与工作流异步任务迁移已收口；`useCanvasViewport` 已接管视口状态与坐标换算 / 缩放 / 适配，`useCanvasSelection` 已接管选中状态与选中操作，`useCanvasTasks` 已接管任务注册表 / 运行状态；提交、停止、轮询与 `useCanvasTaskSystem` 门面均已完成迁移。
  2. 抽出 `CanvasTopBar`（约 5323–5582 行）、`FullscreenPreview`（5131–5322）、`ConnectionCreateMenu` / `NodeCreateMenu`（228–320）。
  3. 再按职责抽 `useCanvasViewport` / `useCanvasSelection` / `useCanvasTasks`，最后视情况把主组件拆成 Canvas 容器 + 侧栏 + 工具栏。真实生成链路已回归（单图 / 停止 / 重试 / 批量 / 刷新恢复）；`useCanvasTaskRunner` 已接管提交与运行记录，`useCanvasTaskControl` 已接管停止逻辑；轮询已用真实异步视频（seedance-2.0-fast）验证，轮询编排已抽到 `useCanvasTaskPolling`，任务 hooks 已由 `useCanvasTaskSystem` 门面统一组合。
- 回归清单：新建画布 → 加图片/视频/文本节点 → 连线 → 生图/视频任务 → 刷新恢复 → 撤销/重做 → 批量折叠 → 导出。

### 2. 生图 / 视频页与工作流页

- `image/page.tsx` 现约 1414 行非空 / 1497 总（结果卡、生成控件与结果面板已抽出），`video/page.tsx` 现约 1609 行非空 / 1686 总（结果卡、生成控件、参考条与结果面板已抽出）、`creative-workflow-workspace.tsx` 2065 行。
- 先抽 `use-image-generation.ts`（提交、轮询、恢复、重试），视频页保留作对照；再把两页重复的结果卡（Result / Failed / Pending / History）收敛到 `components/workbench/`，用 props 描述差异而不是复制 JSX。
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

- image / video 把全部历史 logs 放进内存并全量订阅预览版本，数据量大时需要分页或虚拟列表。
- 可访问性：画布自绘菜单 / 浮层再做一次键盘与读屏回归；列表图片补齐尺寸属性，减少 CLS。
- 后台弹窗里的表单在 390px 仍是两列（`Col span={12}`），字段偏挤；已改 `xs={24} sm={12}`。提示词筛选组移动端已展开全部分类。