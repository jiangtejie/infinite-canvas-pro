"use client";

import { ProConfigProvider } from "@ant-design/pro-components";
import { Button, Drawer } from "antd";
import { Home, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { useLogout } from "@/hooks/use-logout";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

import { adminGroups, adminMenus, getAdminPageMeta } from "./components/admin-nav";

const SIDEBAR_STORAGE_KEY = "infinite-canvas:admin-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const logout = useLogout();
    const dark = useThemeStore((state) => state.theme === "dark");
    const { activeKey, group } = getAdminPageMeta(pathname);
    const [collapsed, setCollapsed] = useState(false);
    const [navOpen, setNavOpen] = useState(false);

    useEffect(() => {
        if (!isReady) return;
        if (!token) {
            router.replace("/login?redirect=/admin");
            return;
        }
        if (user?.role !== "admin") {
            router.replace("/");
        }
    }, [isReady, router, token, user?.role]);

    useEffect(() => {
        setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed");
    }, []);

    useEffect(() => setNavOpen(false), [pathname]);

    const toggleCollapsed = () => {
        setCollapsed((current) => {
            const next = !current;
            window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "collapsed" : "expanded");
            return next;
        });
    };

    const renderSidebar = (onNavigate?: () => void, forceExpanded = false, showClose = false) => {
        const isCollapsed = forceExpanded ? false : collapsed;
        return (
            <>
                <Link href="/admin" onClick={onNavigate} className={cn("flex h-14 shrink-0 items-center border-b border-[var(--admin-line)]", isCollapsed ? "justify-center px-0" : "gap-2.5 px-4")}>
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-acid">
                        <span className="size-4 bg-[#0b0b09]" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />
                    </span>
                    {isCollapsed ? null : (
                        <>
                            <span className="truncate text-[15px] font-semibold tracking-tight">矩灵画布</span>
                            <span className="chip chip-acid !h-[18px] !px-1.5 !text-[9px]">ADMIN</span>
                        </>
                    )}
                    {showClose ? (
                        <button
                            type="button"
                            onClick={onNavigate}
                            aria-label="关闭后台导航"
                            title="关闭后台导航"
                            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="size-4" />
                        </button>
                    ) : null}
                </Link>
                <nav className={cn("flex-1 overflow-y-auto py-2", isCollapsed ? "px-2" : "px-3")} aria-label="后台导航">
                    {adminGroups.map((groupName) => (
                        <div key={groupName} className={cn(isCollapsed ? "mt-2 first:mt-0" : "mt-4 first:mt-0")}>
                            {isCollapsed ? <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-[var(--admin-line)]" /> : <p className="admin-nav-group">{groupName}</p>}
                            <div className="space-y-0.5">
                                {adminMenus
                                    .filter((item) => item.group === groupName)
                                    .map((item) => {
                                        const Icon = item.icon;
                                        const active = item.key === activeKey;
                                        return (
                                            <Link
                                                key={item.key}
                                                href={item.key}
                                                onClick={onNavigate}
                                                aria-current={active ? "page" : undefined}
                                                data-active={active}
                                                title={isCollapsed ? item.label : undefined}
                                                className={cn("admin-nav-item", isCollapsed && "is-collapsed")}
                                            >
                                                <Icon className={cn("size-4 shrink-0", active ? "text-acid" : "opacity-70")} />
                                                {isCollapsed ? null : <span className="truncate">{item.label}</span>}
                                            </Link>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}
                </nav>
                <div className="admin-footer-actions shrink-0 space-y-1 border-t border-[var(--admin-line)] p-3">
                    <Button block className={cn("admin-action-btn", isCollapsed && "is-icon-only")} icon={<Home className="size-4" />} href="/canvas" target="_blank" rel="noreferrer" title="前往画布">
                        {isCollapsed ? null : "前往画布"}
                    </Button>
                    <Button block className={cn("admin-action-btn admin-action-btn-danger", isCollapsed && "is-icon-only")} icon={<LogOut className="size-4" />} onClick={() => void logout()} title="退出登录">
                        {isCollapsed ? null : "退出登录"}
                    </Button>
                </div>
            </>
        );
    };

    if (!isReady || !token || user?.role !== "admin") {
        return (
            <div className="grid h-screen place-items-center bg-transparent">
                <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground/60 uppercase">正在校验管理员权限</p>
            </div>
        );
    }

    return (
        <ProConfigProvider dark={dark}>
            <div className="admin-shell flex h-screen overflow-hidden bg-transparent text-foreground">
                <aside className={cn("admin-sidebar hidden shrink-0 flex-col overflow-hidden border-r border-[var(--admin-line)] transition-[width] duration-200 lg:flex", collapsed ? "w-16" : "w-60")}>
                    {renderSidebar()}
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="admin-header flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:px-5">
                        <div className="flex min-w-0 items-center gap-2">
                            <button
                                type="button"
                                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                                onClick={() => setNavOpen(true)}
                                aria-label="打开后台导航"
                                title="打开后台导航"
                            >
                                <Menu className="size-4.5" />
                            </button>
                            <button
                                type="button"
                                className="hidden size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid"
                                onClick={toggleCollapsed}
                                aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
                                title={collapsed ? "展开侧栏" : "收起侧栏"}
                            >
                                {collapsed ? <PanelLeftOpen className="size-4.5" /> : <PanelLeftClose className="size-4.5" />}
                            </button>
                            <span className="hidden text-[11px] text-muted-foreground/70 sm:block">后台</span>
                            <span aria-hidden className="hidden h-3.5 w-px bg-border sm:block" />
                            <span className="truncate text-[13px] font-medium text-foreground">{group}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <Link href="/" className="hidden text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:block">
                                返回前台
                            </Link>
                            <UserStatusActions showConfig={false} />
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</div>
                    </div>
                </div>

                <Drawer open={navOpen} onClose={() => setNavOpen(false)} placement="left" size={264} closable={false} rootClassName="admin-shell" styles={{ body: { padding: 0 } }} className="admin-nav-drawer">
                    <div className="flex h-full flex-col">{renderSidebar(() => setNavOpen(false), true, true)}</div>
                </Drawer>
            </div>
        </ProConfigProvider>
    );
}
