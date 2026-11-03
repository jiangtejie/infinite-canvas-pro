"use client";

import { ChevronDown, Menu } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { navigationSections, navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/stores/use-config-store";

// 配置弹窗依赖模型、渠道、语音等一大串模块，首次打开时才加载，避免拖慢每一页的首屏。
const AppConfigModal = dynamic(() => import("@/components/layout/app-config-modal").then((module) => module.AppConfigModal), { ssr: false });

const navItemClass = "relative flex h-full shrink-0 items-center gap-2 px-3 text-[13px] leading-6 transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t-full after:transition-colors";

export function AppTopNav() {
    const pathname = usePathname();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [sectionOpen, setSectionOpen] = useState(false);
    const sectionRef = useRef<HTMLDivElement>(null);
    const sectionTriggerRef = useRef<HTMLButtonElement>(null);
    const closeTimerRef = useRef<number | null>(null);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const [configMounted, setConfigMounted] = useState(false);

    useEffect(() => {
        if (isConfigOpen) setConfigMounted(true);
    }, [isConfigOpen]);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    useEffect(() => {
        setSectionOpen(false);
    }, [pathname]);

    // 下拉展开时点击外部或按 Esc 收起，Esc 回到触发按钮。
    useEffect(() => {
        if (!sectionOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!sectionRef.current?.contains(event.target as Node)) setSectionOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setSectionOpen(false);
            sectionTriggerRef.current?.focus();
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [sectionOpen]);

    const openSection = (focusFirst = false) => {
        if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
        setSectionOpen(true);
        if (focusFirst) window.requestAnimationFrame(() => sectionRef.current?.querySelector<HTMLElement>("a")?.focus());
    };

    const scheduleCloseSection = () => {
        if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = window.setTimeout(() => setSectionOpen(false), 140);
    };

    return (
        <>
            {!hideHeader && <AnnouncementBanner />}
            {!hideHeader ? (
                <header className="sticky top-0 z-30 h-[60px] shrink-0 border-b border-border/80 bg-background/72 backdrop-blur-2xl">
                    <div className="mx-auto flex h-full max-w-[1240px] items-stretch justify-between gap-6 px-5 sm:px-8">
                        <div className="flex min-w-0 items-center">
                            <Link href="/" className="group flex h-full shrink-0 items-center gap-2.5" aria-label="矩灵AI首页">
                                <span className="grid size-7 shrink-0 place-items-center rounded-[3px] bg-acid shadow-[0_0_20px_-8px_var(--acid)] transition-transform duration-300 group-hover:-rotate-6">
                                    <span
                                        className="size-4 bg-[#0b0b09]"
                                        style={{
                                            mask: "url(/logo.svg) center / contain no-repeat",
                                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                        }}
                                    />
                                </span>
                                <span className="text-[15px] font-semibold tracking-tight text-foreground">矩灵AI</span>
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

                            <nav className="hidden h-full min-w-0 items-center gap-1 md:flex" aria-label="主站导航">
                                {navigationSections.map((section) => {
                                    if ("children" in section) {
                                        const Icon = section.icon;
                                        const sectionActive = section.children.some((child) => child.slug === activeToolSlug);
                                        return (
                                            <div
                                                key={section.label}
                                                ref={sectionRef}
                                                className="relative h-full shrink-0"
                                                onPointerEnter={(event) => {
                                                    if (event.pointerType === "mouse") openSection();
                                                }}
                                                onPointerLeave={(event) => {
                                                    if (event.pointerType === "mouse") scheduleCloseSection();
                                                }}
                                                onBlur={(event) => {
                                                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSectionOpen(false);
                                                }}
                                            >
                                                <button
                                                    ref={sectionTriggerRef}
                                                    type="button"
                                                    aria-expanded={sectionOpen}
                                                    onClick={(event) => {
                                                        if (sectionOpen) setSectionOpen(false);
                                                        else openSection(event.detail === 0);
                                                    }}
                                                    className={cn(
                                                        navItemClass,
                                                        sectionActive || sectionOpen
                                                            ? "font-medium text-acid! after:bg-acid"
                                                            : "text-acid! after:bg-transparent hover:after:bg-acid/40",
                                                    )}
                                                >
                                                    <Icon className="size-4" />
                                                    <span className="truncate">{section.label}</span>
                                                    <ChevronDown className={cn("size-3 shrink-0 transition-transform duration-200", sectionOpen && "rotate-180")} />
                                                </button>
                                                {sectionOpen ? (
                                                    <div className="absolute left-0 top-full z-40 w-56 rounded-xl border border-border/80 bg-background/95 p-1.5 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
                                                        {section.children.map((child) => {
                                                            const ChildIcon = child.icon;
                                                            const active = child.slug === activeToolSlug;
                                                            return (
                                                                <Link
                                                                    key={child.slug}
                                                                    href={`/${child.slug}`}
                                                                    aria-current={active ? "page" : undefined}
                                                                    onClick={() => setSectionOpen(false)}
                                                                    className={cn(
                                                                        "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] transition-colors",
                                                                        active
                                                                            ? "bg-acid/[0.08]! font-medium text-acid!"
                                                                            : "text-acid! hover:bg-acid/[0.08]!",
                                                                    )}
                                                                >
                                                                    <ChildIcon className="size-4 shrink-0" />
                                                                    <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                                                    {active ? <span aria-hidden className="size-1.5 shrink-0 bg-acid" /> : null}
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    }

                                    const Icon = section.icon;
                                    const active = section.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={section.slug}
                                            href={`/${section.slug}`}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                navItemClass,
                                                active
                                                    ? "font-medium text-acid! after:bg-acid"
                                                    : "text-acid! after:bg-transparent hover:after:bg-acid/40",
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            <span className="truncate">{section.label}</span>
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
