"use client";

import { ProConfigProvider } from "@ant-design/pro-components";
import { Button } from "antd";
import { Coins, FileText, Home, Image as ImageIcon, LogOut, ScrollText, Settings2, ShieldCheck, Users, Wallet, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

const adminMenus = [
    { key: "/admin/users", icon: Users, label: "用户管理", group: "运营", desc: "账号、角色与算力点余额" },
    { key: "/admin/credit-logs", icon: Coins, label: "算力点日志", group: "运营", desc: "充值与消耗的完整流水" },
    { key: "/admin/ai-logs", icon: ScrollText, label: "AI 日志", group: "运营", desc: "模型请求与生成结果追踪" },
    { key: "/admin/prompts", icon: FileText, label: "提示词管理", group: "内容", desc: "维护提示词库的分类与条目" },
    { key: "/admin/skills", icon: Wrench, label: "Skill 管理", group: "内容", desc: "Agent 可调用的技能与文件" },
    { key: "/admin/recharge-packages", icon: Wallet, label: "充值套餐", group: "商业化", desc: "套餐价格、算力点与赠送规则" },
    { key: "/admin/assets", icon: ImageIcon, label: "素材库", group: "内容", desc: "团队公共素材的维护与归档" },
    { key: "/admin/settings", icon: Settings2, label: "系统设置", group: "系统", desc: "模型渠道、提示词与站点配置" },
];

const adminGroups = Array.from(new Set(adminMenus.map((item) => item.group)));

const PAGE_META: Record<string, { title: string; desc: string }> = {
    "/admin/users": { title: "用户管理", desc: "管理账号、角色与算力点余额。" },
    "/admin/credit-logs": { title: "算力点日志", desc: "查看每一次充值、消耗与调整记录。" },
    "/admin/ai-logs": { title: "AI 日志", desc: "追踪模型调用、耗时与生成结果。" },
    "/admin/prompts": { title: "提示词管理", desc: "维护提示词库的分类、标签与条目。" },
    "/admin/skills": { title: "Skill 管理", desc: "配置 Agent 可调用的技能与文件。" },
    "/admin/recharge-packages": { title: "充值套餐", desc: "设置套餐价格、到账算力点与赠送规则。" },
    "/admin/assets": { title: "素材库管理", desc: "维护团队公共素材，供前台素材库读取。" },
    "/admin/settings": { title: "系统设置", desc: "配置模型渠道、系统提示词与站点能力。" },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const logout = useUserStore((state) => state.clearSession);
    const dark = useThemeStore((state) => state.theme === "dark");
    const activeKey = pathname === "/admin" ? "/admin/users" : adminMenus.find((item) => pathname === item.key || pathname.startsWith(`${item.key}/`))?.key ?? "";
    const meta = PAGE_META[activeKey] ?? { title: "管理后台", desc: "运维与内容管理。" };
    const activeGroup = adminMenus.find((item) => item.key === activeKey)?.group ?? "系统";

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
                <aside className="admin-sidebar hidden w-[252px] shrink-0 flex-col border-r border-border/70 bg-card/35 backdrop-blur-xl lg:flex">
                    <Link href="/admin" className="flex h-[64px] shrink-0 items-center gap-3 border-b border-border/70 px-5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-[4px] bg-acid">
                            <span className="size-4.5 bg-[#0b0b09]" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />
                        </span>
                        <span className="text-base font-semibold tracking-tight">矩灵画布</span>
                        <span className="chip chip-acid !h-[18px] !px-1.5 !text-[9px]">ADMIN</span>
                    </Link>
                    <nav className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-label="后台导航">
                        {adminGroups.map((group) => (
                            <div key={group} className="space-y-1.5">
                                <p className="admin-nav-group px-3 pb-2">{group}</p>
                                {adminMenus.filter((item) => item.group === group).map((item) => {
                                    const Icon = item.icon;
                                    const active = item.key === activeKey;
                                    return (
                                        <Link
                                            key={item.key}
                                            href={item.key}
                                            aria-current={active ? "page" : undefined}
                                            data-active={active}
                                            className={cn(
                                                "admin-nav-item group relative flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[14px] transition-colors",
                                                active ? "font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
                                            )}
                                        >
                                            <Icon className={cn("size-4.5 shrink-0", active ? "text-acid" : "opacity-70")} />
                                            <span className="truncate">{item.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>
                    <div className="admin-footer-actions shrink-0 space-y-2.5 border-t border-border/70 p-4">
                        <Button block className="admin-action-btn" icon={<Home className="size-4" />} href="/canvas" target="_blank" rel="noreferrer">
                            前往画布
                        </Button>
                        <Button block className="admin-action-btn admin-action-btn-danger" icon={<LogOut className="size-4" />} onClick={logout}>
                            退出登录
                        </Button>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="admin-header flex h-[64px] shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-background/60 px-6 backdrop-blur-xl sm:px-8">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="grid size-7 shrink-0 place-items-center rounded-[3px] border border-border bg-card text-foreground/70 lg:hidden">
                                <ShieldCheck className="size-3.5" />
                            </span>
                            <span className="hidden font-mono text-[10px] tracking-[0.18em] text-muted-foreground/60 uppercase sm:block">后台 / {activeGroup}</span>
                            <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
                            <h1 className="truncate text-[14px] font-medium text-foreground">{meta.title}</h1>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                            <Link href="/" className="hidden font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground sm:block">
                                返回前台
                            </Link>
                            <UserStatusActions showConfig={false} />
                        </div>
                    </header>

                    <nav aria-label="后台分区" className="hide-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/70 px-4 py-2 lg:hidden">
                        {adminMenus.map((item) => {
                            const Icon = item.icon;
                            const active = item.key === activeKey;
                            return (
                                <Link
                                    key={item.key}
                                    href={item.key}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "inline-flex shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-xs transition-colors",
                                        active ? "bg-acid/10 font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                    )}
                                >
                                    <Icon className={cn("size-3.5", active ? "text-acid" : "opacity-70")} />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <main className="min-h-0 flex-1 overflow-y-auto">
                        <div className="mx-auto w-full max-w-[1480px] px-6 pt-8 sm:px-8">
                            <header className="flex flex-wrap items-end justify-between gap-6">
                                <div className="min-w-0">
                                    <span className="eyebrow">{activeGroup}</span>
                                    <h2 className="admin-page-title mt-4 font-semibold leading-tight text-foreground">{meta.title}</h2>
                                    <p className="mt-3 max-w-xl text-[13px] leading-7 text-muted-foreground">{meta.desc}</p>
                                </div>
                                <span className="chip">{user?.displayName || user?.username}</span>
                            </header>
                            <div aria-hidden className="punk-rule mt-6" />
                        </div>
                        <div className="[&>main]:mx-auto [&>main]:w-full [&>main]:max-w-[1480px]">{children}</div>
                    </main>
                </div>
            </div>
        </ProConfigProvider>
    );
}
