import { isKIEKlingV3Config, kieKlingOmniVariant } from "@/components/video-settings-panel";
import { isAutoDLConfig } from "@/lib/autodl";
import { isMimoVoiceCloneModel } from "@/lib/mimo-tts";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";

import type { NodeGenerationContext } from "../../components/canvas-node-generation";
import type { CanvasNodeMetadata } from "../../types";
import { referenceUrl } from "./canvas-node-builders";

export function selectAudioReference(config: AiConfig, metadata: CanvasNodeMetadata | undefined, references: ReferenceAudio[]) {
    const autodl = isAutoDLConfig(config, config.model || config.audioModel);
    if (!autodl && !isMimoVoiceCloneModel(config.model || config.audioModel)) return undefined;
    const selectedId = (autodl ? metadata?.referenceAudioNodeId : metadata?.mimoVoiceCloneAudioNodeId) || "";
    if (selectedId) {
        const selected = references.find((item) => item.id === selectedId);
        if (selected) return selected;
    }
    if (references.length === 1) return references[0];
    if (!references.length) throw new Error("请连接参考音频节点");
    throw new Error("已连接多个音频节点，请在音频设置中选择参考音频");
}

export function withCanvasVideoAdvancedConfig(config: AiConfig, context: Pick<NodeGenerationContext, "videoMultiPrompt" | "videoElementList">): AiConfig {
    const kieKlingV3 = isKIEKlingV3Config(config, config.model || config.videoModel);
    const kieKlingOmni = kieKlingOmniVariant(config, config.model || config.videoModel);
    return {
        ...config,
        videoNegativePrompt: kieKlingV3 ? "" : config.videoNegativePrompt,
        videoMultiShot: kieKlingOmni === "transformation" ? "false" : config.videoMultiShot,
        videoShotType: kieKlingV3 && !kieKlingOmni ? "intelligence" : config.videoShotType,
        videoMultiPrompt: context.videoMultiPrompt.length ? context.videoMultiPrompt : config.videoMultiPrompt,
        videoElementList: context.videoElementList.length ? context.videoElementList : config.videoElementList,
    };
}

export function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; firstFrame?: ReferenceImage | null; lastFrame?: ReferenceImage | null; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        context.firstFrame ? referenceUrl(context.firstFrame) : null,
        context.lastFrame ? referenceUrl(context.lastFrame) : null,
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ].filter((url): url is string => Boolean(url));
}
