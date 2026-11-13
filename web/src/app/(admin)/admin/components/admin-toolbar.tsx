"use client";

import type { ReactNode } from "react";

/** 列表页贴内容工具栏：左侧搜索与筛选，右侧次要动作；不再单独占一张卡片。 */
export function AdminToolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}
