import { isGlmTtsModel } from "@/lib/audio-generation";
import { isGeminiConfig, isGeminiTtsModel } from "@/lib/gemini";
import { isGrok2APITtsConfig } from "@/lib/grok-tts";
import { isMiniMaxTtsConfig } from "@/lib/minimax-tts";
import { supportsVideoAudioGeneration } from "@/lib/video-model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import { CanvasNodeType, type CanvasNodeMetadata } from "../../types";
import { canvasAgentVideoDurationHint, validateCanvasAgentVideoSeconds } from "./canvas-agent-summary";
import { buildGenerationConfig } from "./canvas-generation-config";

type AgentMediaPlanInput = {
    mode: CanvasNodeGenerationMode;
    requestId: string;
    config: AiConfig;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    hasToken: boolean;
    prompt: string;
    title?: string;
    size?: string;
    count?: number;
    seconds?: number;
    generateAudio?: boolean;
    voice?: string;
    instructions?: string;
};

export type AgentMediaPlan =
    | { ok: true; targetType: CanvasNodeType; metadata: CanvasNodeMetadata; generationConfig: AiConfig; title: string }
    | { ok: false; code: string; message: string; supported?: unknown };

/**
 * Agent 媒体工具的参数校验与节点元数据构造：模型配置、时长、声音能力、TTS 音色分别落到节点 metadata。
 */
export function buildAgentMediaPlan(input: AgentMediaPlanInput): AgentMediaPlan {
    const mode = input.mode;
    const targetType = mode === "video" ? CanvasNodeType.Video : mode === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image;
    const generationConfig = buildGenerationConfig(input.config, undefined, mode);
    const agentWorkflowRef = mode === "image" ? input.config.imageWorkflowRef : mode === "video" ? input.config.videoWorkflowRef : input.config.audioWorkflowRef;
    if (!agentWorkflowRef && (!generationConfig.model || !input.isAiConfigReady(generationConfig, generationConfig.model))) {
        return { ok: false, code: "model_not_configured", message: "请先在全局配置中完成" + (mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片") + "模型配置" };
    }
    if (agentWorkflowRef && !input.hasToken) return { ok: false, code: "login_required", message: "工作流生成需要先登录" };

    const metadata: CanvasNodeMetadata = {
        prompt: input.prompt,
        agentRequestId: input.requestId,
        excludeUpstreamText: true,
        status: "idle",
        model: generationConfig.model,
        workflowRef: agentWorkflowRef,
        channelId: mode === "video" ? generationConfig.videoChannelId : mode === "audio" ? generationConfig.audioChannelId : generationConfig.imageChannelId,
        size: input.size || generationConfig.size,
    };
    if (mode === "image") {
        metadata.quality = generationConfig.quality;
        metadata.count = typeof input.count === "number" ? Math.max(1, Math.floor(input.count)) : 1;
    }
    if (mode === "video") {
        metadata.vquality = generationConfig.vquality;
        const seconds = typeof input.seconds === "number" ? input.seconds : Number(generationConfig.videoSeconds);
        const durationError = agentWorkflowRef ? "" : validateCanvasAgentVideoSeconds(generationConfig.model, seconds);
        if (durationError) return { ok: false, code: "unsupported_duration", message: durationError, supported: canvasAgentVideoDurationHint(generationConfig.model) };
        const generateAudio = typeof input.generateAudio === "boolean" ? input.generateAudio : generationConfig.videoGenerateAudio === "true";
        if (!agentWorkflowRef && generateAudio && !supportsVideoAudioGeneration(generationConfig.model)) {
            return { ok: false, code: "video_audio_not_supported", message: "当前全局视频模型不支持视频原生声音" };
        }
        metadata.seconds = String(seconds);
        metadata.generateAudio = String(generateAudio);
    }
    if (mode === "audio") {
        if (isGeminiTtsModel(generationConfig.model) && isGeminiConfig(generationConfig, generationConfig.model)) {
            metadata.geminiTtsVoice = input.voice || generationConfig.geminiTtsVoice;
        } else if (isMiniMaxTtsConfig(generationConfig, generationConfig.model)) {
            metadata.miniMaxTtsVoice = input.voice || generationConfig.miniMaxTtsVoice;
            metadata.miniMaxTtsFormat = generationConfig.miniMaxTtsFormat;
            metadata.miniMaxTtsSpeed = generationConfig.miniMaxTtsSpeed;
        } else if (isGlmTtsModel(generationConfig.model)) {
            metadata.glmTtsVoice = input.voice || generationConfig.glmTtsVoice;
            metadata.glmTtsFormat = generationConfig.glmTtsFormat;
            metadata.glmTtsSpeed = generationConfig.glmTtsSpeed;
        } else if (isGrok2APITtsConfig(generationConfig, generationConfig.model)) {
            metadata.grokTtsVoice = input.voice || generationConfig.grokTtsVoice;
            metadata.grokTtsLanguage = generationConfig.grokTtsLanguage;
            metadata.grokTtsFormat = generationConfig.grokTtsFormat;
            metadata.grokTtsSpeed = generationConfig.grokTtsSpeed;
        } else {
            metadata.audioVoice = input.voice || generationConfig.audioVoice;
            metadata.audioInstructions = input.instructions || generationConfig.audioInstructions;
        }
    }

    const title = input.title || input.prompt.slice(0, 32) || (mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片");
    return { ok: true, targetType, metadata, generationConfig, title };
}
