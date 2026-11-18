import { ARK_SEEDANCE_REFERENCE_LIMITS, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { modelKey, supportsVideoFrameReferences } from "@/lib/video-model-capabilities";
import { isAPIMartKlingV26Config, isAPIMartKlingV3Config, isKIEKlingV3Config, kieKlingOmniVariant, videoChannelProtocol } from "@/services/api/protocols/kling-models";
import type { AiConfig } from "@/stores/use-config-store";

export type VideoReferenceLimits = typeof SEEDANCE_REFERENCE_LIMITS;

export type VideoKlingWorkbench = { provider: "apimart" | "kie"; variant: "v26" | "v3" };

/** `workflow` 是页面模式开关；请求层（画布 / 影视）不传，避免全局残留的 videoWorkflowRef 影响请求。 */
type VideoCapacityOptions = { workflow?: boolean };

/** Kling 工作台判定唯一口径：型号归一化精确匹配 + 渠道 protocol。 */
export function videoKlingWorkbench(config: AiConfig, model: string, options?: VideoCapacityOptions): VideoKlingWorkbench | null {
    if (options?.workflow) return null;
    if (isAPIMartKlingV26Config(config, model)) return { provider: "apimart", variant: "v26" };
    if (isAPIMartKlingV3Config(config, model)) return { provider: "apimart", variant: "v3" };
    if (isKIEKlingV3Config(config, model)) return { provider: "kie", variant: "v3" };
    return null;
}

export function videoReferenceLimits(config: AiConfig, model: string, options?: VideoCapacityOptions): VideoReferenceLimits {
    if (options?.workflow) return SEEDANCE_REFERENCE_LIMITS;
    const arkSeedance25 = videoChannelProtocol(config, model) === "ark" && (modelKey(model).includes("seedance-2-5") || modelKey(model).includes("seedance2-5"));
    return arkSeedance25 ? ARK_SEEDANCE_REFERENCE_LIMITS : SEEDANCE_REFERENCE_LIMITS;
}

/** 参考素材数量：UI 挂载、提交切片与请求层共用同一份推导。 */
export function videoReferenceCapacity(config: AiConfig, model: string, options?: VideoCapacityOptions) {
    const limits = videoReferenceLimits(config, model, options);
    const klingWorkbench = videoKlingWorkbench(config, model, options);
    const omni = klingWorkbench ? kieKlingOmniVariant(config, model) : "";
    const acceptsVideoReferences = omni === "reference-to-video" || omni === "transformation";
    const imageLimit = omni === "text-to-video" ? 0
        : omni === "image-to-video" ? 2
        : omni === "transformation" ? 4
        : klingWorkbench && omni !== "reference-to-video" ? 2
        : limits.images;
    const videoLimit = acceptsVideoReferences ? 1 : klingWorkbench ? 0 : limits.videos;
    const audioLimit = klingWorkbench ? 0 : limits.audios;
    return { limits, omni, klingWorkbench, acceptsVideoReferences, imageLimit, videoLimit, audioLimit };
}

export function videoFrameReferencesEnabled(config: AiConfig, model: string, options?: VideoCapacityOptions) {
    if (options?.workflow) return true;
    if (videoKlingWorkbench(config, model)) return false;
    return supportsVideoFrameReferences(model, videoChannelProtocol(config, model));
}
