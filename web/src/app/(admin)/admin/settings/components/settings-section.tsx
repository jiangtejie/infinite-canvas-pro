"use client";

import type { ReactNode } from "react";
import type { NamePath } from "antd/es/form/interface";
import { Form, Switch } from "antd";

import { cn } from "@/lib/utils";

/** 后台设置统一分区：标题、说明、右侧操作与统一卡片容器。 */
export function AdminSettingsSection({ title, description, extra, children, className }: { title: string; description?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn("rounded-xl border border-border/60 bg-card/35 p-4", className)}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
                </div>
                {extra ? <div className="shrink-0">{extra}</div> : null}
            </div>
            {children}
        </section>
    );
}

/** 卡片内的子区块：用于存储渠道等嵌套配置，避免 Card 套 Card。 */
export function AdminSettingsSubsection({ title, description, extra, children }: { title: string; description?: string; extra?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-lg border border-border/50 bg-background/35 p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-foreground">{title}</h3>
                    {description ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p> : null}
                </div>
                {extra ? <div className="shrink-0">{extra}</div> : null}
            </div>
            {children}
        </section>
    );
}

/** 统一的开关行：左侧标签与说明，右侧开关。 */
export function AdminSettingsSwitchRow({ name, label, description }: { name: NamePath; label: string; description?: string }) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-background/30 px-3 py-2.5">
            <div className="min-w-0">
                <div className="text-[13px] font-medium text-foreground">{label}</div>
                {description ? <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{description}</p> : null}
            </div>
            <Form.Item name={name} valuePropName="checked" noStyle>
                <Switch />
            </Form.Item>
        </div>
    );
}
