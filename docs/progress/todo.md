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
