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
- 生图 / 视频页主链路已抽到页面私有 hooks：生图页 1497 → 1226 行，视频页 1686 → 1469 行；轮询、历史同步、批量提交、单条生成与停止均已收口。剩余 retry / mask edit 仅为薄编排，后续如继续拆分需保持真实「提交 → 轮询 → 完成 / 停止 / 重试」回归。

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
- [ ] 移动端真机：横竖屏、安全区、画布手势与工作台内部滚动冲突；390×844 / 844×390 模拟已无横向溢出。

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

- `image/page.tsx` 现约 1158 行非空 / 1226 总（结果卡、生成控件与结果面板已抽出），`video/page.tsx` 现约 1395 行非空 / 1469 总（结果卡、生成控件、参考条与结果面板已抽出）、`creative-workflow-workspace.tsx` 2065 行。
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

- 暂无；新的长尾问题先进入上方 P0 / P1 排期，再按验收结果关闭。