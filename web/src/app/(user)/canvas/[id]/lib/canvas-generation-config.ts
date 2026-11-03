import { defaultConfig, resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";

import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import type { CanvasNodeData } from "../../types";
import { PANORAMA_IMAGE_SIZE, isPanoramaNodeType } from "../../utils/canvas-panorama";

export function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : mode === "audio" ? config.audioModel : config.textModel;
    const channelId = node?.metadata?.channelId || "";
    const imageChannelId = mode === "image" ? channelId || config.imageChannelId : config.imageChannelId;
    const videoChannelId = mode === "video" ? channelId || config.videoChannelId : config.videoChannelId;
    const textChannelId = mode === "text" ? channelId || config.textChannelId : config.textChannelId;
    const audioChannelId = mode === "audio" ? channelId || config.audioChannelId : config.audioChannelId;
    const activeChannelId = mode === "image" ? imageChannelId : mode === "video" ? videoChannelId : mode === "text" ? textChannelId : mode === "audio" ? audioChannelId || config.activeChannelId : config.activeChannelId;
    return {
        ...config,
        model: mode === "text" ? resolveModelForCapability(config, node?.metadata?.model, "text") : node?.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : config.model || defaultConfig.model),
        activeChannelId,
        imageChannelId,
        videoChannelId,
        textChannelId,
        audioChannelId,
        quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
        size: isPanoramaNodeType(node?.type) ? PANORAMA_IMAGE_SIZE : node?.metadata?.size || (mode === "video" ? config.videoSize || defaultConfig.videoSize : config.size || defaultConfig.size),
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoMode: node?.metadata?.mode || config.videoMode || defaultConfig.videoMode,
        videoNegativePrompt: node?.metadata?.negativePrompt || config.videoNegativePrompt || defaultConfig.videoNegativePrompt,
        videoMultiShot: node?.metadata?.multiShot || config.videoMultiShot || defaultConfig.videoMultiShot,
        videoShotType: node?.metadata?.shotType || config.videoShotType || defaultConfig.videoShotType,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoCharacterOrientation: node?.metadata?.characterOrientation || config.videoCharacterOrientation || defaultConfig.videoCharacterOrientation,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node?.metadata?.audioVoice || config.audioVoice || defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat || config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed || config.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node?.metadata?.audioInstructions || config.audioInstructions || defaultConfig.audioInstructions,
        grokTtsVoice: node?.metadata?.grokTtsVoice || config.grokTtsVoice || defaultConfig.grokTtsVoice,
        grokTtsLanguage: node?.metadata?.grokTtsLanguage || config.grokTtsLanguage || defaultConfig.grokTtsLanguage,
        grokTtsFormat: node?.metadata?.grokTtsFormat || config.grokTtsFormat || defaultConfig.grokTtsFormat,
        grokTtsSpeed: node?.metadata?.grokTtsSpeed || config.grokTtsSpeed || defaultConfig.grokTtsSpeed,
        glmTtsVoice: node?.metadata?.glmTtsVoice || config.glmTtsVoice || defaultConfig.glmTtsVoice,
        glmTtsFormat: node?.metadata?.glmTtsFormat || config.glmTtsFormat || defaultConfig.glmTtsFormat,
        glmTtsSpeed: node?.metadata?.glmTtsSpeed || config.glmTtsSpeed || defaultConfig.glmTtsSpeed,
        mimoTtsVoice: node?.metadata?.mimoTtsVoice || config.mimoTtsVoice || defaultConfig.mimoTtsVoice,
        mimoTtsFormat: node?.metadata?.mimoTtsFormat || config.mimoTtsFormat || defaultConfig.mimoTtsFormat,
        mimoVoiceDesignPrompt: node?.metadata?.mimoVoiceDesignPrompt || config.mimoVoiceDesignPrompt || defaultConfig.mimoVoiceDesignPrompt,
        geminiTtsVoice: node?.metadata?.geminiTtsVoice || config.geminiTtsVoice || defaultConfig.geminiTtsVoice,
        miniMaxTtsVoice: node?.metadata?.miniMaxTtsVoice || config.miniMaxTtsVoice || defaultConfig.miniMaxTtsVoice,
        miniMaxTtsFormat: node?.metadata?.miniMaxTtsFormat || config.miniMaxTtsFormat || defaultConfig.miniMaxTtsFormat,
        miniMaxTtsSpeed: node?.metadata?.miniMaxTtsSpeed || config.miniMaxTtsSpeed || defaultConfig.miniMaxTtsSpeed,
        count: String(node?.metadata?.count || (mode === "image" ? config.canvasImageCount || config.count : config.count) || defaultConfig.count),
    };
}
