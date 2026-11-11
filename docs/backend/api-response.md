---
title: 接口响应约定
description: 业务接口统一响应结构与前端处理约定
---

# 接口响应约定

后端业务接口统一返回 JSON：

```json
{
  "code": 0,
  "data": {},
  "msg": "ok"
}
```

- `code`: 业务状态码，`0` 表示成功，非 `0` 表示失败。
- `data`: 业务数据。失败时通常为 `null`。
- `msg`: 响应消息。成功默认为 `ok`，失败时放错误原因。

前端请求逻辑以 `code` 判断业务是否成功。当前后端业务失败也会返回 HTTP 200，前端不要只依赖 HTTP 状态码判断结果。

接口连接失败、服务不可达、返回体不是约定 JSON 时，前端按网络或接口异常处理。

## AutoDL 渠道

- `POST /api/ai/autodl/workflows` 使用上述业务响应结构。请求为 `{ baseUrl, workflowId? }`，不传上游 API Key；不带工作流 ID 返回列表，带 ID 返回详情。元数据包含 `uuid`、`name`、`kind` 和详情的 `input_rules`，不返回上游内部节点映射。
- AutoDL 视频继续使用现有 `/api/v1/videos` 创建、查询及任务响应结构。
- 用户中心使用 `/api/v1/account/*`：资料更新、密码修改、充值套餐、Native 扫码订单、算力流水和开票申请均要求 JWT；支付回调 `/api/payment/notify` 为公开入口，仅接受 lx-pay HMAC 或微信 V3 验签后的成功通知。
- 微信支付配置保存在 `/api/admin/settings` 的 `private.payment`（网关地址、AppID、应用密钥、回调地址、APIv3 密钥、平台证书路径、超时、重试次数、订单有效期），保存后即时生效；`LX_PAY_*` 与 `RECHARGE_ORDER_MINUTES` 环境变量只作为未配置时的默认值。`lxPayAppSecret` 与 `lxPayApiV3Key` 读取时返回空字符串，提交时留空表示保持原值。
- 后台通过 `/api/admin/recharge-packages` 维护充值套餐：`GET` 返回全部套餐（含下架），`POST` 以 `{ id?, name, amountFen, credits, bonus, sort, enabled }` 新增或更新，`DELETE /:id` 删除。只有 `enabled=true` 的套餐会出现在用户端，改动即时生效；金额必须大于 0、到账算力必须大于 0、赠送算力不能为负，已创建的订单不受影响。
- Native 充值订单默认有效 15 分钟，可由 `RECHARGE_ORDER_MINUTES` 调整。订单金额和到账算力由服务端套餐决定；支付通知必须匹配订单号和精确分金额，重复通知按幂等处理。
- lx-pay 创建、查询和关闭由配置的支付网关适配；SDK 文档保证的外部契约是 `createOrder`、`queryOrder`、`closeOrder` 及其参数/返回值，具体 HTTP 路径以当前网关部署路由为准。
- `/api/v1/audio/speech` 是 AI 协议代理入口。AutoDL 成功时返回 `{ provider: "autodl", audio_url, mime_type }`；MiniMax 和 TokenDance MiniMax 成功时解码上游 hex，并返回所选格式的音频二进制；失败仍使用现有 `Fail` 业务结构。其他语音协议的响应保持原样。
- 现有 `/api/v1/canvas/audio-tasks` 消费 AutoDL 的上游音频 URL，返回既有任务结构，不新增结果下载或转存。

## 渠道自定传参转译

- 沿用 `/api/v1/images/generations`、`/api/v1/images/edits`、`/api/v1/audio/speech`、`/api/v1/videos` 及现有画布任务入口。命中自定义的账号请求携带 `{ model, n, _parameterTranslation: { kind, variables } }`；视频另携带面板 `seconds`，沿用现有按秒费用计算。`kind` 为 `image`、`video`、`audio`。
- `_parameterTranslation` 是系统内部负载。后端按账号或公共渠道读取保存的原文，转译后只向供应商发送配置里的方法、地址、请求头、查询参数和请求体。
- 图片 JSON 结果归一为 `{ data: [{ url }] }`；音频 URL 归一为 `{ provider: "parameter-translation", audio_url }`。配置直接返回文件时沿用二进制响应及 MIME。失败仍用现有 `Fail` 业务结构。
- 视频沿用现有任务响应，增加 `parameter_translation: true` 标记；私有查询快照和公共渠道脚本不随响应返回。创建、查询、完成和失败均进入现有任务管理，失败不重发默认请求。

## 内容源解析

- `POST /api/v1/content/sources/parse` 需要登录（`UserAuth`），请求为 `{ input, platform? }`，`platform` 目前只支持 `douyin`。
- 成功返回 `{ code: 0, data: { source, warnings }, msg: "ok" }`；`source` 包含 `platform/sourceId/kind/title/text/tags/author/stats/images/videoUrl/coverUrl/shareUrl`，`images` 每项包含 `url/storageKey/width/height/mimeType`。
- 解析失败返回业务失败结构，`msg` 为可直接展示的中文原因；未登录由中间件返回 HTTP 401。
- 服务端对象存储不可用时仍返回解析结果：图片保留原始 CDN 地址，`warnings` 提示链接可能过期；文字素材不受影响。
- 解析接口按用户限频（20 次 / 10 分钟），超限返回“解析太频繁了，请稍后再试”；全局同时最多 4 个解析，繁忙返回“解析繁忙，请稍后再试”。
- 管理员在后台“私有配置 → 内容解析”关闭后，接口返回“内容解析功能已关闭，请联系管理员”；`/api/settings` 的 `content.sourceParseEnabled` 同步为 false。
