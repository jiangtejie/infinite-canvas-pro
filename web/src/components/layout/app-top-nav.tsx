"use client";

import { Menu } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/stores/use-config-store";

// 配置弹窗依赖模型、渠道、语音等一大串模块，首次打开时才加载，避免拖慢每一页的首屏。
const AppConfigModal = dynamic(() => import("@/components/layout/app-config-modal").then((module) => module.AppConfigModal), { ssr: false });

export function AppTopNav() {
    const pathname = usePathname();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const [configMounted, setConfigMounted] = useState(false);

    useEffect(() => {
        if (isConfigOpen) setConfigMounted(true);
    }, [isConfigOpen]);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    return (
        <>
            {!hideHeader && <AnnouncementBanner />}
            {!hideHeader ? (
                <header className="sticky top-0 z-30 h-[60px] shrink-0 border-b border-border/80 bg-background/72 backdrop-blur-2xl">
                    <div className="mx-auto flex h-full max-w-[1240px] items-stretch justify-between gap-6 px-5 sm:px-8">
                        <div className="flex min-w-0 items-center">
                            <Link href="/" className="group flex h-full shrink-0 items-center gap-2.5" aria-label="无限画布首页">
                                <span className="grid size-7 shrink-0 place-items-center rounded-[3px] bg-acid shadow-[0_0_20px_-8px_var(--acid)] transition-transform duration-300 group-hover:-rotate-6">
                                    <span
                                        className="size-4 bg-[#0b0b09]"
                                        style={{
                                            mask: "url(/logo.svg) center / contain no-repeat",
                                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                        }}
                                    />
                                </span>
                                <span className="text-[15px] font-semibold tracking-tight text-foreground">无限画布</span>
                            </Link>

                            <span aria-hidden className="mx-5 hidden h-5 w-px bg-border md:block" />

                            <button
                                type="button"
                                className="ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label="打开导航菜单"
                                title="导航菜单"
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar hidden h-full min-w-0 items-center gap-1 overflow-x-auto md:flex" aria-label="主站导航">
                                {navigationTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            href={`/${tool.slug}`}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "relative flex h-full shrink-0 items-center gap-2 px-3 text-[13px] leading-6 transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t-full after:transition-colors",
                                                active
                                                    ? "font-medium text-foreground after:bg-acid"
                                                    : "text-muted-foreground after:bg-transparent hover:text-foreground hover:after:bg-border",
                                            )}
                                        >
                                            <Icon className={cn("size-4 transition-colors", active ? "text-acid" : "")} />
                                            <span className="truncate">{tool.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-1 justify-self-end whitespace-nowrap">
                            <UserStatusActions />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            {configMounted ? <AppConfigModal /> : null}
        </>
    );
}
