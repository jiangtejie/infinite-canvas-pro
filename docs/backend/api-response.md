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

## AI 生图连接中断重试

- `/api/v1/images/generations` 和 `/api/v1/images/edits` 在上游返回 `EOF` / `unexpected EOF` / connection reset / broken pipe / GOAWAY / forcibly closed 等连接中断、且没有拿到响应时，或返回 500/502/503/504 时，服务端会自动用同一请求体重试一次；只对图片接口重试，聊天/视频等非幂等接口不重试。
- 重试仍失败时返回“上游连接中断（可能是网关或本地代理超时），请稍后重试；若持续出现请检查代理和渠道超时设置”，不再直接暴露原始 `unexpected EOF`。
- 服务端日志会打印 `AI proxy retry: endpoint=... attempt=2/2 previous=...`，可据此判断是否触发了重试。

## Midjourney 异步文生图

- 渠道协议为 `midjourney` 时，图片生成会提交到 `POST /mj/submit/imagine`，请求体为 `{ botType: "MID_JOURNEY", prompt }`；Base URL 使用 `https://api.teamorouter.ai`，程序会兼容误填的 `/v1`。
- 后端轮询 `GET /mj/task/{task_id}/fetch`，每 10 秒一次，最多 9 分钟；成功取 `imageUrl`，失败取 `failReason`。结果统一转换成现有图片接口响应（`data[].url`）。
- 仅支持文生图：参考图、图片编辑和 multipart 请求会在提交前返回明确错误，不支持 `--hd/--q/--repeat/--r/--fast/--turbo/--relax/--niji`；支持 `--ar`。
- 只支持 1K Imagine 四宫格，不支持 upscale/variation/reroll、2K/4K、Niji、callback。提交不是幂等操作，Midjourney 渠道不参与生图自动重试；网络异常时必须保留 task ID 继续查询，不能重复 POST。
- 渠道模型测试只请求 `/v1/models` 验证连通性，不提交付费 Imagine 任务；模型列表固定返回 `midjourney`。

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

## 抖音发布（H5 扫码）

- `GET /api/v1/publish/channels` 需要登录，返回发布渠道可用性：`{ channels: [{ id: "douyin-h5", label, available, reason, mock }], publicBaseUrl, configured, mock }`。`reason` 可能为 `NEED_CREDENTIALS` / `NEED_PUBLIC_BASE_URL` / `NEED_HTTPS`。
- `POST /api/v1/publish/media` 需要登录，multipart 字段名 `file`，单张图片上限 20MB；当前仅支持 JPG / PNG（抖音 H5 图集格式），服务端按内容 hash 转存到本地发布目录，返回 `{ id, url, width?, height?, bytes, mimeType }`。每用户限频 60 次 / 10 分钟。`url` 使用后台配置的 `publicBaseUrl` 拼成公网 HTTPS 地址，路径为 `/api/publish/media/:name`。
- `GET /api/publish/media/:name` 为公开图片访问入口，无鉴权，供抖音服务器回源抓取；只允许访问发布目录中的图片文件。
- `POST /api/v1/publish/preflight` 需要登录，请求为 `{ title, body, tags, images: [{ url, width, height, bytes }] }`，返回 `{ package, preflight: { passed, errors, warnings, issues } }`；`issues[].message` 为可直接展示的中文，错误包括标题超 20 字、正文超 1000 字、话题超 5 个、图片数为空/超 35 张、图片不是发布域名下的 HTTPS、短边小于 360px、比例超出 1:2.2～2.2:1、超过 20MB。
- `POST /api/v1/publish/records` 需要登录，请求在预检字段基础上增加 `source`、`sourceId`、`nodeId`；服务端重新预检并签发抖音 H5 分享 schema，返回 `{ record }`。每用户限频 20 次 / 10 分钟。图文只能进入抖音编辑页，用户确认发布；`share_to_publish=1` 仅用于单视频。
- `GET /api/v1/publish/records` 返回当前用户最近 20 条发布记录；`GET /api/v1/publish/records/:id` 和 `POST /api/v1/publish/records/:id/confirm`（body `{ publishedUrl? }`）按 JWT 当前用户过滤，未找到返回“发布记录不存在”。
- 发布记录状态为 `issued`（已签发，二维码有效 2 小时）或 `confirmed`（用户已确认发布）。响应包含 `qrText`、`expiresAt`、`expired`、`mock`、`imageCount`、`package` 和 `preflight`。
- `POST /api/admin/publish/douyin/test` 为管理员配置自测接口，body 可临时传 `{ clientKey, clientSecret, mock }`；服务端真实调用 `client_token` 和 `open/getticket`，只返回 `{ ok, mock, ticketExpiresIn, tokenExpiresIn }`，不返回 token/ticket。
- MOCK 模式可生成格式相同、签名规则相同的假分享链接，不请求抖音开放平台；关闭 MOCK 前必须配置已备案的 HTTPS `publicBaseUrl`，并确认 `h5.share` / `open.get.ticket`（及平台要求的其他分享权限）已开通。
