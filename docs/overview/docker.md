---
title: Docker 部署
description: 使用 Docker Compose 部署矩灵画布
---

# Docker 部署

如果你希望在自己的机器或服务器上运行项目，可以直接使用 Docker Compose。

## 使用发布镜像

```bash
git clone git@github.com:jiangtejie/infinite-canvas-pro.git
cd infinite-canvas-pro
cp .env.example .env
# 先在 .env 里设置 ADMIN_PASSWORD，留空则不会创建管理员
docker compose up -d
```

启动后访问：

```text
http://localhost:3000
```

默认管理员账号：

```text
用户名：.env 中的 ADMIN_USERNAME（默认 admin）
密码：.env 中的 ADMIN_PASSWORD
```

`ADMIN_PASSWORD` 留空时不会创建管理员账号，页面仍可游客使用，但无法进入管理后台。

## 本地构建镜像

如果需要基于当前源码构建镜像：

```bash
cp .env.example .env
docker compose -f docker-compose.local.yml up -d --build
```

## 数据目录

`docker-compose.yml` 会把本地 `./data` 挂载到容器内 `/app/data`，用于保存 SQLite 数据库、提示词数据和上传素材。

Docker 部署时建议把 `.env` 中的 SQLite 路径设置为：

```text
DATABASE_DSN=/app/data/infinite-canvas.db
```
