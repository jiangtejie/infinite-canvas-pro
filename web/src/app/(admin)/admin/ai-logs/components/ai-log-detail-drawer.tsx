"use client";

import { Drawer, Tag, Typography } from "antd";
import type { ReactNode } from "react";

import type { AdminAICallLog } from "@/services/api/admin";

import { formatLogElapsed, formatLogTime } from "./ai-log-table-columns";

function Meta({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-[13px] text-foreground">{children}</dd>
        </div>
    );
}

function CodeBlock({ title, value }: { title: string; value: string }) {
    return (
        <section>
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <Typography.Text copyable={{ text: value || "" }} className="text-xs text-muted-foreground" />
            </div>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-foreground">{value || "-"}</pre>
        </section>
    );
}

export function AiLogDetailDrawer({ log, onClose }: { log: AdminAICallLog | null; onClose: () => void }) {
    const ok = log ? !log.failed && log.status >= 200 && log.status < 400 : false;
    return (
        <Drawer title="AI 调用详情" open={Boolean(log)} onClose={onClose} size="min(860px, 96vw)" destroyOnHidden>
            {log ? (
                <div className="flex flex-col gap-5">
                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        <Meta label="时间">{formatLogTime(log.createdAt)}</Meta>
                        <Meta label="用户">{log.userDisplayName || log.userId || "-"}</Meta>
                        <Meta label="接口">{[log.method, log.endpoint].filter(Boolean).join(" ") || "-"}</Meta>
                        <Meta label="模型">{log.model || "-"}</Meta>
                        <Meta label="渠道">{log.channelName || log.channelId || "-"}</Meta>
                        <Meta label="状态">
                            <Tag color={ok ? "success" : "error"}>{log.status || "失败"}</Tag>
                        </Meta>
                        <Meta label="耗时">{formatLogElapsed(log.durationMs)}</Meta>
                        <Meta label="扣点">{log.credits ?? 0}</Meta>
                    </dl>
                    <CodeBlock title="请求" value={log.requestBody} />
                    <CodeBlock title="响应 / 错误" value={log.responseBody || log.error} />
                </div>
            ) : null}
        </Drawer>
    );
}
