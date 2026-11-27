---
title: 快速开始
description: 用最少步骤把矩灵画布跑起来
---

# 快速开始

如果你只是想先把项目跑起来，优先使用 Docker。

## Docker 启动

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

## 本地构建镜像启动

如果你需要基于当前源码本地构建镜像：

```bash
cp .env.example .env
docker compose -f docker-compose.local.yml up -d --build
```

## 首次使用建议

- 先打开右上角配置弹窗，填入自己的 `Base URL`、`API Key` 和模型名。
- 如果使用后台渠道模式，再去管理后台补充系统模型与渠道配置。
- 如果需要提示词仓库内容，可进入 `/admin/prompts` 拉取或同步。

## 说明

- 未登录时画布项目和“我的素材”保存在浏览器本地；登录且账号同步可用时，会同步保存到账号/云端。
- 本地直连模式下，AI API Key 保存在浏览器本地，并由前端直接请求 OpenAI 兼容接口。
