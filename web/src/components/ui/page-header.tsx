import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 全站统一的页头：等宽小标 + 大标题 + 说明 + 右侧动作，底部一条朋克标尺。
 * 列表页、工作台、后台页共用同一套留白与字号，保证纵向节奏一致。
 */
export function PageHeader({ eyebrow, title, description, meta, actions, className }: {
    eyebrow?: string;
    title: ReactNode;
    description?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <header className={cn("pb-7", className)}>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    {eyebrow ? <p className="eyebrow inline-flex items-center gap-2"><span className="punk-signal" aria-hidden />{eyebrow}</p> : null}
                    <h1 className="page-title mt-4 text-foreground">{title}</h1>
                    {description ? <p className="page-lede mt-3">{description}</p> : null}
                    {meta ? <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div> : null}
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            <div aria-hidden className="punk-rule mt-6" />
        </header>
    );
}
