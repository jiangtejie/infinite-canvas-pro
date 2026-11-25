---
title: 本地开发
description: 前后端分开启动时的本地开发方式
---

# 本地开发

如果你需要改代码，建议前后端分开启动

## 1. 准备环境变量

```bash
cp .env.example .env
```

默认配置下：

- 后端端口是 `8080`
- 前端端口是 `3000`
- SQLite 数据库是 `data/infinite-canvas.db`

## 2. 启动后端

在仓库根目录执行：

```bash
go run .
```

Windows 下如果没有显式配置渠道代理，后端会读取系统代理。Qoder、VS Code 等桌面应用可能向终端注入已经失效的 `HTTP_PROXY` / `HTTPS_PROXY`，导致环境代理覆盖正常系统代理。需要改用系统代理时，Git Bash 使用：

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy go run .
```

PowerShell 使用：

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:http_proxy,Env:https_proxy -ErrorAction SilentlyContinue
go run .
```

启动日志的 `outbound proxy` 会显示实际来源与地址；如果出现 `Windows system proxy ignored`，说明环境变量仍在覆盖系统代理。Docker 或服务器需要显式代理时，不要清除对应环境变量。

后端会读取根目录 `.env`，并监听：

```text
http://127.0.0.1:8080
```

## 3. 启动前端

在 `web` 目录执行：

```bash
bun run dev
```

前端默认访问：

```text
http://localhost:3000
```

开发代理默认转发到 `http://127.0.0.1:8080`。如果你的后端端口不同，启动前设置 `API_BASE_URL`

## 常见场景

- 改画布、页面和交互：主要看 `web/`
- 改接口、业务逻辑和数据库：主要看仓库根目录下的 Go 代码
- 改文档站内容：主要看 `docs/`
