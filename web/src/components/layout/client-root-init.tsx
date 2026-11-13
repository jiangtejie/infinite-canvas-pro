"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import { CONFIG_SYNC_FAILED_EVENT, useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { AUTH_TOKEN_KEY, type AuthUser } from "@/services/api/auth";
import { SESSION_EXPIRED_EVENT } from "@/services/api/request";
import { STORAGE_SYNC_FAILED_EVENT } from "@/services/image-storage";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const channelMode = useConfigStore((state) => state.config.channelMode);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isLoginPage = pathname === "/login";
    const isTokenDanceCallback = pathname === "/tokendance/callback";
    const adminRemoteTokenRef = useRef("");
    const accountOwnerRef = useRef<string | null>(null);

    useSessionBootstrap();

    useEffect(() => {
        const onSyncFailed = (event: Event) => {
            const detail = (event as CustomEvent<string>).detail;
            message.warning({ key: STORAGE_SYNC_FAILED_EVENT, content: `云端同步失败，已保留原始素材${detail ? `：${detail}` : ""}` });
        };
        window.addEventListener(STORAGE_SYNC_FAILED_EVENT, onSyncFailed);
        return () => window.removeEventListener(STORAGE_SYNC_FAILED_EVENT, onSyncFailed);
    }, [message]);

    useEffect(() => {
        const onConfigSyncFailed = (event: Event) => {
            const detail = (event as CustomEvent<string>).detail;
            message.warning({ key: CONFIG_SYNC_FAILED_EVENT, content: `账号配置同步失败，已沿用本地配置${detail ? `：${detail}` : ""}` });
        };
        window.addEventListener(CONFIG_SYNC_FAILED_EVENT, onConfigSyncFailed);
        return () => window.removeEventListener(CONFIG_SYNC_FAILED_EVENT, onConfigSyncFailed);
    }, [message]);

    // 会话失效统一在这里收口：清登录态后受保护页由各自布局守卫跳登录，非受保护页退回游客模式。
    useEffect(() => {
        const onSessionExpired = () => {
            if (!useUserStore.getState().token) return;
            useUserStore.getState().clearSession();
            message.warning({ key: SESSION_EXPIRED_EVENT, content: "登录已过期，请重新登录" });
        };
        window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    }, [message]);

    // 跨标签页同步登录态：zustand persist 不跟随 storage 事件。
    // 不用 persist.rehydrate()：它的 onRehydrateStorage 会把 isReady 置 false，而校验只在挂载时跑一次，受保护页会卡在校验中。
    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== AUTH_TOKEN_KEY) return;
            const persisted = event.newValue ? (JSON.parse(event.newValue) as { state?: { token?: string; user?: AuthUser | null } }).state : undefined;
            useUserStore.setState({ token: persisted?.token || "", user: persisted?.user || null, isReady: true, lastError: "" });
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    // 公开配置可能在管理员保存、用户登录或页面长时间停留后变化；登录态和重新聚焦时刷新，
    // 避免普通用户一直沿用旧的 allowUserRemoteChannel / allowCustomChannel。
    useEffect(() => {
        if (!token) return;
        void loadPublicSettings();
    }, [loadPublicSettings, token]);

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === "visible") void loadPublicSettings();
        };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [loadPublicSettings]);

    useEffect(() => {
        if (!isLoginPage) void hydrateUser();
    }, [hydrateUser, isLoginPage]);

	useEffect(() => {
		if (!token || adminRemoteTokenRef.current === token) return;
		if (isTokenDanceCallback) {
			adminRemoteTokenRef.current = token;
			return;
		}
		if (user?.role !== "admin") return;
		adminRemoteTokenRef.current = token;
		if (channelMode !== "remote") updateConfig("channelMode", "remote");
	}, [channelMode, isTokenDanceCallback, token, updateConfig, user?.role]);

	// 账号切换（登录 / 退出 / 会话失效 / 跨标签页同步）统一整页重载：本地业务数据按账号分区，
	// 模块级 store 与 localforage 实例都要按新分区重新初始化，只重置内存状态会留下上一个账号的缓存。
	// 首次 hydration 完成前不建立基线，否则「未登录 → 已登录」会被误判成账号切换，每次重载都再触发一次。
	useLayoutEffect(() => {
		if (!isReady) return;
		const owner = user?.id || "guest";
		const previous = accountOwnerRef.current;
		if (previous === null) {
			accountOwnerRef.current = owner;
			return;
		}
		if (owner === previous) {
			updateConfig("workflowSyncTouched", false);
			return;
		}
		accountOwnerRef.current = owner;
		// 登录页自己整页跳到 redirect，这里不抢它的导航。
		if (pathname === "/login") return;
		window.location.reload();
	}, [isReady, pathname, updateConfig, user?.id]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        if (!publicSettings) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        if (!publicSettings.modelChannel.allowCustomChannel) {
            openConfigDialog(false);
            message.error("后台未允许用户自定义渠道，请联系管理员进行配置");
            return;
        }
        updateConfig("channelMode", "local");
        if (baseUrl) updateConfig("baseUrl", baseUrl);
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
    }, [message, openConfigDialog, publicSettings, updateConfig]);

    return <>{children}</>;
}
