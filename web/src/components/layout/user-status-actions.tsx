"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Avatar, Tooltip } from "antd";
import { ChevronDown, Keyboard, LogOut, Settings2, Shield, TriangleAlert, UserRound, Wallet } from "lucide-react";
import Link from "next/link";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { CreditSymbol } from "@/constant/credits";
import { useLogout } from "@/hooks/use-logout";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    accountOpen?: boolean;
    onAccountOpenChange?: (open: boolean) => void;
    accountRef?: RefObject<HTMLDivElement | null>;
};

const MENU_ROW = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--canvas-topbar-hover,var(--accent))] focus-visible:bg-[var(--canvas-topbar-hover,var(--accent))] focus-visible:outline-none";

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, accountOpen, onAccountOpenChange, accountRef }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const lastError = useUserStore((state) => state.lastError);
    const logout = useLogout();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const userName = user?.displayName || user?.username || "";
    const credits = user?.credits ?? 0;
    const avatarUrl = user?.avatarUrl?.trim();
    const avatarText = (userName.trim()[0] || "U").toUpperCase();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const menuOpen = accountOpen ?? uncontrolledOpen;
    const setMenuOpen = onAccountOpenChange ?? setUncontrolledOpen;
    const containerRef = useRef<HTMLDivElement>(null);
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const avatarStyle: CSSProperties | undefined = variant === "canvas" ? { borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text, background: "transparent" } : undefined;
    const panelStyle: CSSProperties = variant === "canvas"
        ? { background: canvasTheme.toolbar.panel, borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text }
        : { background: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)" };
    const setContainerRef = (node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (accountRef) accountRef.current = node;
    };

    useEffect(() => {
        if (!menuOpen) return;
        const closeOnPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && containerRef.current?.contains(target)) return;
            setMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setMenuOpen(false);
            containerRef.current?.querySelector("button")?.focus({ preventScroll: true });
        };
        document.addEventListener("pointerdown", closeOnPointerDown, true);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnPointerDown, true);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [menuOpen, setMenuOpen]);

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {showConfig ? (
                <button type="button" className={variant === "canvas" ? `${naturalIconClass} max-sm:hidden` : naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            {variant === "canvas" && user ? (
                <Tooltip title="当前算力点余额" placement="bottom">
                    <div className="hidden h-8 shrink-0 items-center gap-1.5 px-1.5 text-xs font-medium tabular-nums opacity-75 transition hover:opacity-100 sm:flex" style={{ color: canvasTheme.node.text }}>
                        <CreditSymbol className="text-sm leading-none" />
                        <span>{credits.toLocaleString()}</span>
                    </div>
                </Tooltip>
            ) : null}
            {!user && onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {!user && variant === "default" ? (
                <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground lg:inline-flex" title="游客模式：数据保存在本机浏览器，本地渠道不消耗算力点；登录后可云同步并使用云端渠道">
                    <UserRound className="size-3" />
                    游客 · 本地保存
                </span>
            ) : null}
            {!user ? (
                <Link href="/login" className="px-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline" style={iconStyle}>
                    登录
                </Link>
            ) : null}
            {user && lastError ? (
                <Tooltip title={`登录状态校验失败，已沿用本机登录态：${lastError}`} placement="bottom">
                    <span className="grid size-7 shrink-0 place-items-center" style={{ color: "#f59e0b" }} role="img" aria-label="登录状态校验失败">
                        <TriangleAlert className="size-4" />
                    </span>
                </Tooltip>
            ) : null}
            {user ? (
                <div ref={setContainerRef} className="relative">
                    <button
                        type="button"
                        className="admin-user-trigger group flex h-8 shrink-0 items-center gap-1 rounded-full border border-transparent bg-transparent pl-1 pr-1.5 transition hover:border-border hover:bg-[var(--canvas-topbar-hover,var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        style={variant === "canvas" ? { borderColor: canvasTheme.toolbar.border } : undefined}
                        aria-label={`账户菜单：${userName}`}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen(!menuOpen)}
                    >
                        <Avatar
                            size={24}
                            src={avatarUrl ? <img decoding="async" src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined}
                            className="!flex !items-center !justify-center border border-border bg-muted text-[11px] font-semibold text-foreground"
                            style={avatarStyle}
                        >
                            {avatarText}
                        </Avatar>
                        <ChevronDown className={`size-3 shrink-0 opacity-40 transition group-hover:opacity-70 ${menuOpen ? "rotate-180" : ""}`} style={iconStyle} aria-hidden />
                    </button>
                    {menuOpen ? (
                        <div
                            role="menu"
                            aria-label="账户菜单"
                            className="glass-panel admin-user-menu absolute right-0 top-[calc(100%+8px)] z-[80] w-56 rounded-2xl border p-1"
                            style={{ ...panelStyle, backdropFilter: "blur(14px)" }}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-center gap-2.5 px-2 py-2">
                                <Avatar size={32} src={avatarUrl ? <img decoding="async" src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined} className="!flex !items-center !justify-center border border-border bg-muted text-xs font-semibold text-foreground" style={avatarStyle}>
                                    {avatarText}
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-medium leading-5">{userName}</div>
                                    <div className="mt-1 flex items-center gap-1.5">
                                        <span className="truncate text-[11px] leading-4 opacity-55">{user.displayName ? `@${user.username}` : user.role === "admin" ? "管理员" : "普通用户"}</span>
                                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--canvas-topbar-hover,var(--accent))] px-1.5 py-0.5 text-[10px] font-medium tabular-nums opacity-80" title="算力点余额">
                                            <CreditSymbol className="text-[11px] leading-none" />
                                            {credits.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="my-1 h-px" style={{ background: "var(--border)" }} />
                            {user.role === "admin" ? (
                                <Link href="/admin" role="menuitem" className={MENU_ROW} onClick={() => setMenuOpen(false)}>
                                    <Shield className="size-4 shrink-0 opacity-70" />
                                    管理后台
                                </Link>
                            ) : null}
                            <Link href="/account?tab=recharge" role="menuitem" className={MENU_ROW} onClick={() => setMenuOpen(false)}>
                                <Wallet className="size-4 shrink-0 opacity-70" />
                                充值 / 积分
                            </Link>
                            <Link href="/account" role="menuitem" className={MENU_ROW} onClick={() => setMenuOpen(false)}>
                                <UserRound className="size-4 shrink-0 opacity-70" />
                                用户中心
                            </Link>
                            {onOpenShortcuts ? (
                                <button type="button" role="menuitem" className={MENU_ROW} onClick={() => { setMenuOpen(false); onOpenShortcuts(); }}>
                                    <Keyboard className="size-4 shrink-0 opacity-70" />
                                    快捷键
                                </button>
                            ) : null}
                            <div className="my-1 h-px" style={{ background: "var(--border)" }} />
                            <button type="button" role="menuitem" className={`${MENU_ROW} admin-user-menu-danger text-red-500 hover:bg-red-500/10`} onClick={() => { setMenuOpen(false); void logout(); }}>
                                <LogOut className="size-4 shrink-0" />
                                退出登录
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
