import { isAutoDLConfig } from "@/lib/autodl";
import { isMiniMaxH3Config } from "@/lib/minimax-video";
import { boolConfig, seedanceVideoReferenceError, seedanceVideoReferenceHint } from "@/lib/seedance-video";
import { videoReferenceLimits } from "@/lib/video-reference-limits";
import { isAgnesVideoV25Model } from "@/lib/video-model-capabilities";
import { isAPIMartKlingV26Config, isAPIMartKlingV3Config, isKIEKlingV3Config, kieKlingOmniVariant } from "@/services/api/protocols/kling-models";
import type { AiConfig, VideoElementItem } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/media";

import { validateKlingElementList } from "./history";

export type VideoRequestIssue = { tone: "error" | "config"; message: string };

/** 视频提交前的业务规则校验；页面只负责按 tone 弹提示或打开配置。 */
export function validateVideoRequest({ config, model, prompt, references, videoReferences, elementList, configReady }: {
    config: AiConfig;
    model: string;
    prompt: string;
    references: ReferenceImage[];
    videoReferences: ReferenceVideo[];
    elementList: VideoElementItem[] | undefined;
    configReady: boolean;
}): VideoRequestIssue | null {
    const autodl = isAutoDLConfig(config, model);
    if (!prompt.trim() && !autodl) return { tone: "error", message: "请输入视频提示词" };
    if (!configReady) return { tone: "config", message: "请先完成配置" };
    const klingV26 = isAPIMartKlingV26Config(config, model);
    const klingV3 = isAPIMartKlingV3Config(config, model) || isKIEKlingV3Config(config, model);
    const kling = klingV26 || klingV3;
    const omni = kieKlingOmniVariant(config, model);
    if (kling && omni !== "reference-to-video" && references.length > (omni === "transformation" ? 4 : 2)) {
        return { tone: "error", message: `Kling 参考图最多 ${omni === "transformation" ? 4 : 2} 张` };
    }
    if (omni === "image-to-video" && !references.length) return { tone: "error", message: "请添加首帧图片" };
    if (omni === "reference-to-video" && !references.length && !videoReferences.length && !elementList?.some((item) => item.references?.length)) {
        return { tone: "error", message: "请添加参考图、参考视频或角色元素" };
    }
    if (omni === "transformation" && !videoReferences.length) return { tone: "error", message: "请添加需要变换的参考视频" };
    if (klingV26 && boolConfig(config.videoGenerateAudio, false)) {
        if (config.videoMode !== "pro") return { tone: "error", message: "Kling v2.6 音频生成需要 pro 模式" };
        if (references.length > 1) return { tone: "error", message: "Kling v2.6 开启音频时最多 1 张参考图" };
    }
    if (klingV3 && omni !== "transformation") {
        const elementError = validateKlingElementList(elementList);
        if (elementError) return { tone: "error", message: elementError };
    }
    if (!kling && !autodl && !isMiniMaxH3Config(config, model) && !isAgnesVideoV25Model(model)) {
        const error = seedanceVideoReferenceError(videoReferences, videoReferenceLimits(config, model));
        if (error) return { tone: "error", message: `${error}。${seedanceVideoReferenceHint}` };
    }
    return null;
}
