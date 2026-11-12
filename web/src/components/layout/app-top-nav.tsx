"use client";

import { ChevronDown, Menu } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { navigationSections, type NavigationToolSlug } from "@/constant/navigation-tools";
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
    const [openSectionKey, setOpenSectionKey] = useState<string | null>(null);
    const navRef = useRef<HTMLElement>(null);
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
    const activeToolSlug = navigationSections
        .flatMap((section) => ("children" in section ? section.children : [section]))
        .some((tool) => tool.slug === slug)
        ? (slug as NavigationToolSlug)
        : undefined;

    const cancelCloseTimer = useCallback(() => {
        if (closeTimerRef.current === null) return;
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }, []);

    const closeSection = useCallback(() => {
        cancelCloseTimer();
        setOpenSectionKey(null);
    }, [cancelCloseTimer]);

    const openSection = useCallback((key: string, focusFirst = false) => {
        cancelCloseTimer();
        setOpenSectionKey(key);
        if (focusFirst) window.requestAnimationFrame(() => sectionRef.current?.querySelector<HTMLElement>("a")?.focus());
    }, [cancelCloseTimer]);

    // 选中子项后面板卸载，浏览器会补发一次 pointerleave；延时关闭必须只作用于触发它的板块，
    // 否则这个迟到的关闭会把随后打开的另一个板块一起关掉，表现为菜单切不过去。
    const scheduleCloseSection = useCallback((key: string) => {
        cancelCloseTimer();
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null;
            setOpenSectionKey((current) => (current === key ? null : current));
        }, 140);
    }, [cancelCloseTimer]);

    const moveSectionFocus = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const links = Array.from(sectionRef.current?.querySelectorAll<HTMLElement>("a") || []);
        if (!links.length) return;
        event.preventDefault();
        const current = links.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = event.key === "Home" ? 0
            : event.key === "End" ? links.length - 1
            : current === -1 ? (step === 1 ? 0 : links.length - 1)
            : (current + step + links.length) % links.length;
        links[next].focus();
    }, []);

    useEffect(() => {
        closeSection();
    }, [pathname, closeSection]);

    useEffect(() => cancelCloseTimer, [cancelCloseTimer]);

    // 抽屉只在 md 以下可用，而 antd 的遮罩和 body 滚动锁挂在 open 上，不受面板样式影响；
    // 跨到桌面宽度必须主动关闭，否则整页会被一层看不见点的遮罩盖住且无法滚动。
    useEffect(() => {
        const media = window.matchMedia("(min-width: 48rem)");
        const closeOnDesktop = () => {
            if (media.matches) setMobileNavOpen(false);
        };
        closeOnDesktop();
        media.addEventListener("change", closeOnDesktop);
        return () => media.removeEventListener("change", closeOnDesktop);
    }, []);

    // 下拉展开时点击导航外部或按 Esc 收起，Esc 回到触发按钮。
    // 外部判定挂在常驻的 nav 上：点击另一个板块的触发按钮属于导航内部，交给它自己的 onClick 切换，
    // 不依赖 pointerdown 先关闭再 click 打开的事件顺序。
    useEffect(() => {
        if (!openSectionKey) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!navRef.current?.contains(event.target as Node)) closeSection();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            closeSection();
            sectionTriggerRef.current?.focus();
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [openSectionKey, closeSection]);

    return (
        <>
            {!hideHeader && <AnnouncementBanner />}
            {!hideHeader ? (
                <header className="sticky top-0 z-30 h-[60px] shrink-0 border-b border-border/80 bg-background/72 backdrop-blur-2xl">
                    <div className="mx-auto flex h-full max-w-[1240px] items-stretch justify-between gap-6 px-5 sm:px-8">
                        <div className="flex min-w-0 items-center">
                            <Link href="/" className="group flex h-full shrink-0 items-center gap-2.5" aria-label="矩灵画布首页">
                                <span className="grid size-7 shrink-0 place-items-center rounded-[3px] bg-acid shadow-[0_0_20px_-8px_var(--acid)] transition-transform duration-300 group-hover:-rotate-6">
                                    <span
                                        className="size-4 bg-[#0b0b09]"
                                        style={{
                                            mask: "url(/logo.svg) center / contain no-repeat",
                                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                        }}
                                    />
                                </span>
                                <span className="text-[15px] font-semibold tracking-tight text-foreground">矩灵画布</span>
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

                            <nav ref={navRef} className="hidden h-full min-w-0 items-center gap-3 md:flex" aria-label="主站导航">
                                {navigationSections.map((section, index) => {
                                    if ("children" in section) {
                                        const Icon = section.icon;
                                        const sectionActive = section.children.some((child) => child.slug === activeToolSlug);
                                        const isOpen = openSectionKey === section.label;
                                        const panelId = `nav-section-panel-${index}`;
                                        return (
                                            <div
                                                key={section.label}
                                                ref={isOpen ? sectionRef : undefined}
                                                className="relative h-full shrink-0"
                                                onPointerEnter={(event) => {
                                                    if (event.pointerType === "mouse") openSection(section.label);
                                                }}
                                                onPointerLeave={(event) => {
                                                    if (event.pointerType === "mouse") scheduleCloseSection(section.label);
                                                }}
                                                onBlur={(event) => {
                                                    if (isOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) closeSection();
                                                }}
                                                onKeyDown={(event) => {
                                                    if (!isOpen) {
                                                        if (event.key !== "ArrowDown") return;
                                                        event.preventDefault();
                                                        openSection(section.label, true);
                                                        return;
                                                    }
                                                    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") moveSectionFocus(event);
                                                }}
                                            >
                                                <button
                                                    ref={isOpen ? sectionTriggerRef : undefined}
                                                    type="button"
                                                    aria-haspopup="true"
                                                    aria-expanded={isOpen}
                                                    aria-controls={isOpen ? panelId : undefined}
                                                    onClick={(event) => {
                                                        if (isOpen) closeSection();
                                                        else openSection(section.label, event.detail === 0);
                                                    }}
                                                    className={cn(
                                                        navItemClass,
                                                        sectionActive || isOpen
                                                            ? "font-medium text-acid-ink! after:bg-acid"
                                                            : "text-acid-ink! after:bg-transparent hover:after:bg-acid/40",
                                                    )}
                                                >
                                                    <Icon className="size-4" />
                                                    <span className="truncate">{section.label}</span>
                                                    <ChevronDown className={cn("size-3 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
                                                </button>
                                                {isOpen ? (
                                                    <div id={panelId} className="absolute left-0 top-full z-40 w-56 rounded-xl border border-border/80 bg-background/95 p-1.5 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
                                                        {section.children.map((child) => {
                                                            const ChildIcon = child.icon;
                                                            const active = child.slug === activeToolSlug;
                                                            return (
                                                                <Link
                                                                    key={child.slug}
                                                                    href={`/${child.slug}`}
                                                                    aria-current={active ? "page" : undefined}
                                                                    onClick={closeSection}
                                                                    className={cn(
                                                                        "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] transition-colors",
                                                                        active
                                                                            ? "bg-acid/[0.08]! font-medium text-acid-ink!"
                                                                            : "text-acid-ink! hover:bg-acid/[0.08]!",
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
                                            onClick={closeSection}
                                            className={cn(
                                                navItemClass,
                                                active
                                                    ? "font-medium text-acid-ink! after:bg-acid"
                                                    : "text-acid-ink! after:bg-transparent hover:after:bg-acid/40",
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
