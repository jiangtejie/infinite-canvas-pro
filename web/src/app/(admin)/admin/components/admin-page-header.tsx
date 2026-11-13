"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { getAdminPageMeta } from "./admin-nav";

/** 后台统一页头：页面标题、说明与右侧操作都由各页自己渲染，布局层不再重复标题。 */
export function AdminPageHeader({ actions }: { actions?: ReactNode }) {
    const { meta } = getAdminPageMeta(usePathname());

    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <h1 className="admin-page-title">{meta.title}</h1>
                <p className="admin-page-desc">{meta.desc}</p>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
    );
}
