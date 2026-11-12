"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { errorMessage } from "@/lib/utils";
import { fetchUserConfig } from "@/services/api/user-config";
import { replaceWorkflowChannels } from "@/services/workflow-channel-storage";
import { defaultUserStorageProvider, defaultUserWebDAVStorageProvider, saveUserStorageProvider, saveUserWebDAVStorageProvider } from "@/services/image-storage";
import { useChannelTranslationStore } from "@/stores/use-channel-translation-store";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

/** 账号配置同步失败：由 ClientRootInit 统一监听提示一次，避免每个页面各弹一次。 */
export const CONFIG_SYNC_FAILED_EVENT = "infinite-canvas:config-sync-failed";

/**
 * 登录会话引导：token / 账号变化后统一拉取账号配置，并同步模型配置、工作流、画布与素材。
 * 只由 ClientRootInit 调用一次，避免壳层多处重复请求。
 */
export function useSessionBootstrap() {
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const userId = useUserStore((state) => state.user?.id || "");
    const isReady = useUserStore((state) => state.isReady);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const wasLoggedOutRef = useRef(false);
    const isTokenDanceCallback = pathname === "/tokendance/callback";
    const isAdminRoute = pathname.startsWith("/admin");

    useEffect(() => {
        if (!isReady) return;
        if (!userId) {
            wasLoggedOutRef.current = true;
            return;
        }
        if (!token) return;
        const syncCanvasAfterLogin = wasLoggedOutRef.current;
        wasLoggedOutRef.current = false;
        const accountToken = token;
        const accountId = userId;
        const translationRevision = useChannelTranslationStore.getState().revisions[accountId] || 0;
        let canceled = false;
        const isStale = () => canceled || useUserStore.getState().token !== accountToken || useUserStore.getState().user?.id !== accountId;

        void fetchUserConfig(accountToken)
            .then(async (payload) => {
                if (isStale()) return;
                // 后台路由不做画布/素材同步，与原先 (user) 布局内的行为保持一致。
                if (!isAdminRoute) {
                    const syncEnabled = payload.syncCapabilities?.userData === true;
                    const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
                    if (isStale()) return;
                    const canvasStore = useCanvasStore.getState();
                    canvasStore.setSyncEnabled(syncEnabled);
                    if (syncCanvasAfterLogin && syncEnabled && canvasStore.hydrated) {
                        void canvasStore.syncWithRemote(accountToken, true);
                    }
                    const { useAssetStore } = await import("@/stores/use-asset-store");
                    void useAssetStore.getState().hydrateAccountAssets(accountToken, syncEnabled);
                }
                // TokenDance 回调页只同步画布与素材，模型配置交给回调页自行写入。
                if (isTokenDanceCallback) return;

                let workflowsReady = true;
                const syncS3 = payload.modelConfig?.syncStorageConfig === true;
                const syncWebDAV = payload.modelConfig?.syncWebDAVStorageConfig === true;
                if (payload.modelConfig) {
                    const { workflowChannels, channelTranslations, ...modelConfig } = payload.modelConfig;
                    await useChannelTranslationStore.getState().replace(accountId, channelTranslations || [], translationRevision);
                    if (isStale()) return;
                    if (workflowChannels !== undefined) {
                        try {
                            await replaceWorkflowChannels(accountId, workflowChannels);
                        } catch {
                            workflowsReady = false;
                        }
                    }
                    if (isStale()) return;
                    Object.entries(modelConfig).forEach(([key, value]) => updateConfig(key as keyof AiConfig, value as never));
                }
                updateConfig("workflowSyncTouched", workflowsReady);
                updateConfig("syncStorageConfig", syncS3);
                updateConfig("syncWebDAVStorageConfig", syncWebDAV);
                if (syncS3 && payload.storageProvider?.s3) {
                    saveUserStorageProvider({
                        ...defaultUserStorageProvider(),
                        ...payload.storageProvider.s3,
                        type: "s3",
                    });
                }
                if (syncWebDAV && payload.storageProvider?.webdav) {
                    saveUserWebDAVStorageProvider({
                        ...defaultUserWebDAVStorageProvider(),
                        ...payload.storageProvider.webdav,
                        type: "webdav",
                    });
                }
            })
            .catch((error) => {
                if (isStale()) return;
                window.dispatchEvent(new CustomEvent(CONFIG_SYNC_FAILED_EVENT, { detail: errorMessage(error, "") }));
            });
        return () => {
            canceled = true;
        };
    }, [isAdminRoute, isReady, isTokenDanceCallback, token, updateConfig, userId]);
}
