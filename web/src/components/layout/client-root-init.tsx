"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { STORAGE_SYNC_FAILED_EVENT } from "@/services/image-storage";
import { defaultConfig, useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const channelMode = useConfigStore((state) => state.config.channelMode);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isLoginPage = pathname === "/login" || pathname === "/admin/login";
    const isTokenDanceCallback = pathname === "/tokendance/callback";
    const adminRemoteTokenRef = useRef("");
    const accountSessionRef = useRef({ token, userId: user?.id || "" });

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

	useLayoutEffect(() => {
		const previous = accountSessionRef.current;
		const userId = user?.id || "";
		if ((previous.token && !token) || (previous.userId && userId && previous.userId !== userId)) {
			useConfigStore.setState({ config: defaultConfig });
		} else {
			updateConfig("workflowSyncTouched", false);
		}
		accountSessionRef.current = { token, userId };
	}, [token, updateConfig, user?.id]);

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
