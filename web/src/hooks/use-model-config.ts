"use client";

import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";

export type ModelCapability = "text" | "image" | "video";

/** 统一解析文本 / 图片 / 视频模型配置；未就绪时打开配置弹窗并返回 null。 */
export function useModelConfig() {
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);

    return (capability: ModelCapability) => {
        const model = resolveModelForCapability(
            effectiveConfig,
            capability === "text" ? effectiveConfig.textModel : capability === "image" ? effectiveConfig.imageModel : effectiveConfig.videoModel,
            capability,
        );
        const config = { ...effectiveConfig, model } as AiConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        return config;
    };
}
