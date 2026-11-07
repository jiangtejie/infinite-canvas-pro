import { isMiniMaxH3Config } from "@/lib/minimax-video";
import { geminiOperationUrl, isGeminiConfig, isGeminiVideoModel } from "@/lib/gemini";
import { boolConfig, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio } from "@/lib/seedance-video";
import { isKIEGrokVideoModel, isKIEKlingV3Config, kieKlingOmniVariant } from "../../protocols/kling-models";
import { autoDLBaseUrl, getAutoDLCapabilities } from "@/lib/autodl";
import { fetchAutoDLWorkflow } from "../../autodl";
import { isAgnesVideoV25Model, isCogVideoX3Model, isWan3VideoModel, modelKey, supportsVideoAudioGeneration } from "@/lib/video-model-capabilities";
import { localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { aiApiUrl, usesAccountProxy } from "../../ai-request";
import { VideoRequestError } from "../types";
import { VideoReferenceInput, VideoResponse } from "../types";

import { agnesBaseUrl, agnesFrameRate, agnesNumFrames, createAgnesVideoV25RequestBody, isAgnesVideoModel } from "./agnes";
import { createArkSeedanceVideoRequestBody } from "./ark";
import { createCogVideoX3RequestBody } from "./cog";
import { createGeminiVeoRequestBody, isGeminiOmniFlashVideoModel, normalizeVideoSecondsForModel } from "./gemini";
import { createGrok2APIVideoRequestBody, isGrok2APIVideoConfig, normalizeGrokVideoMode } from "./grok";
import { isAPIMartKlingMotionControlVideoConfig, isAPIMartKlingV26VideoConfig, isAPIMartKlingV3VideoConfig, isKIEKlingMotionControlVideoConfig, normalizeAPIMartKlingMotionControlMode, normalizeCharacterOrientation, normalizeKIEKlingElementList, normalizeKIEKlingMultiPrompt, normalizeKlingElementList, normalizeKlingMultiPrompt, normalizeKlingShotType, normalizeKlingV26AspectRatio, normalizeKlingV26Duration, normalizeKlingV26Mode, normalizeKlingV3Duration, normalizeKlingV3Mode } from "./kling";
import { createMiniMaxH3VideoRequestBody, miniMaxApiUrl } from "./minimax";
import { createOpenAICloudVideoRequestBody } from "./openai";
import { imageReferenceToFormValue, imageToAgnesReference, mediaReferenceToFormValue, normalizeVideoResolution, normalizeVideoSize, videoChannelProtocol } from "./shared";



export function aiVideoPollUrl(config: AiConfig, model: string, id: string) {
    if (!usesAccountProxy(config) && isGeminiConfig(config, model)) {
        const channel = localChannelForActiveModel(config);
        return geminiOperationUrl(channel?.baseUrl || config.baseUrl, id);
    }
    if (!usesAccountProxy(config) && isMiniMaxH3Config(config, model)) {
        return miniMaxApiUrl(config, `/v2/query/video_generation/${encodeURIComponent(id)}`);
    }
    if (!usesAccountProxy(config) && isCogVideoX3Model(model)) {
        return aiApiUrl(config, `/async-result/${encodeURIComponent(id)}`);
    }
    if (!isAgnesVideoModel(model) || !id.startsWith("video_")) {
        return aiApiUrl(config, `/videos/${encodeURIComponent(id)}`);
    }
    if (usesAccountProxy(config)) {
        return `/api/v1/videos/${encodeURIComponent(id)}`;
    }
    const channel = localChannelForActiveModel(config);
    const baseUrl = agnesBaseUrl(channel?.baseUrl || config.baseUrl);
    return `${baseUrl}/agnesapi?video_id=${encodeURIComponent(id)}&model_name=${encodeURIComponent(model)}`;
}

export async function createVideoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    if (videoChannelProtocol(config, model) === "autodl") {
        const capabilities = getAutoDLCapabilities(await fetchAutoDLWorkflow(autoDLBaseUrl(config, model), model));
        if (!capabilities) throw new VideoRequestError("当前 AutoDL 工作流尚未适配");
        const { autoDLReferenceURL } = await import("../../direct-ai");
        const [images, videos, audios, firstFrame, lastFrame] = await Promise.all([
            Promise.all((capabilities.imageMax ? input.references : []).map((reference) => autoDLReferenceURL(reference))),
            Promise.all((capabilities.videoMax ? input.videoReferences : []).map((reference) => autoDLReferenceURL(reference))),
            Promise.all((capabilities.audioMax ? input.audioReferences : []).map((reference) => autoDLReferenceURL(reference))),
            capabilities.firstFrame && input.firstFrame ? autoDLReferenceURL(input.firstFrame) : Promise.resolve(""),
            capabilities.lastFrame && input.lastFrame ? autoDLReferenceURL(input.lastFrame) : Promise.resolve(""),
        ]);
        return {
            model, prompt, seconds: config.videoSeconds, size: config.size, resolution_name: config.vquality,
            "input_reference[]": images, "video_reference[]": videos, "audio_reference[]": audios,
            ...(firstFrame ? { first_frame_url: firstFrame } : {}),
            ...(lastFrame ? { last_frame_url: lastFrame } : {}),
        };
    }
    const tokenDance = videoChannelProtocol(config, model) === "tokendance";
    if (config.channelMode === "remote" && videoChannelProtocol(config, model) === "openai") return createOpenAICloudVideoRequestBody(config, model, prompt, input);
    if (videoChannelProtocol(config, model) === "ark") return createArkSeedanceVideoRequestBody(config, model, prompt, input);
    const size = normalizeVideoSize(config.size);
    if (isGeminiVideoModel(model) && isGeminiConfig(config, model)) return createGeminiVeoRequestBody(config, model, prompt, input);
    if (isGrok2APIVideoConfig(config, model)) return createGrok2APIVideoRequestBody(config, model, prompt, input);
    if (isMiniMaxH3Config(config, model)) return createMiniMaxH3VideoRequestBody(config, model, prompt, input);
    if (isCogVideoX3Model(model)) return createCogVideoX3RequestBody(config, model, prompt, input);
    if (isAgnesVideoV25Model(model)) return createAgnesVideoV25RequestBody(config, model, prompt, input);
    if (isAgnesVideoModel(model)) {
        const references = input.references;
        const inputReferences = await Promise.all(references.slice(0, 7).map(imageToAgnesReference));
        const dimensions = size ? parseVideoDimensions(size) : null;
        const frameRate = agnesFrameRate(config.videoSeconds);
        const body: Record<string, unknown> = {
            model,
            prompt,
            num_frames: agnesNumFrames(config.videoSeconds, frameRate),
            frame_rate: frameRate,
        };
        if (dimensions) {
            body.width = dimensions.width;
            body.height = dimensions.height;
        }
        if (inputReferences.length === 1) body.image = inputReferences[0];
        if (inputReferences.length > 1) body.extra_body = { image: inputReferences, mode: "keyframes" };
        return body;
    }

    const klingV26 = isAPIMartKlingV26VideoConfig(config, model);
    const apimartKlingV3 = isAPIMartKlingV3VideoConfig(config, model);
    const apimartWan3 = videoChannelProtocol(config, model) === "apimart" && isWan3VideoModel(model);
    const apimartMotionControl = isAPIMartKlingMotionControlVideoConfig(config, model);
    const kieKlingV3 = isKIEKlingV3Config(config, model);
    const kieKlingOmni = kieKlingOmniVariant(config, model);
    const kieMotionControl = isKIEKlingMotionControlVideoConfig(config, model);
    const motionControl = apimartMotionControl || kieMotionControl;
    const klingV3 = apimartKlingV3 || kieKlingV3;
    const kling = klingV26 || klingV3;
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    if (kling) {
        body.append("mode", klingV3 ? normalizeKlingV3Mode(config.videoMode) : normalizeKlingV26Mode(config.videoMode));
        body.append("duration", klingV3 ? normalizeKlingV3Duration(config.videoSeconds) : normalizeKlingV26Duration(config.videoSeconds));
        body.append("aspect_ratio", normalizeKlingV26AspectRatio(config.size));
        if (!kieKlingV3 && config.videoNegativePrompt?.trim()) body.append("negative_prompt", config.videoNegativePrompt.trim());
        if (klingV3 && kieKlingOmni !== "transformation" && boolConfig(config.videoMultiShot, false)) {
            body.append("multi_shot", "true");
            const supportsSmartShots = !kieKlingV3 || kieKlingOmni === "text-to-video" || kieKlingOmni === "image-to-video";
            if (!supportsSmartShots) {
                body.append("multi_prompt", JSON.stringify(normalizeKIEKlingMultiPrompt(config.videoMultiPrompt)));
            } else {
                const shotType = normalizeKlingShotType(config.videoShotType);
                body.append("shot_type", shotType);
                if (shotType === "customize") body.append("multi_prompt", JSON.stringify(kieKlingV3 ? normalizeKIEKlingMultiPrompt(config.videoMultiPrompt) : normalizeKlingMultiPrompt(config.videoMultiPrompt)));
            }
        }
        if (klingV3 && kieKlingOmni !== "transformation") {
            const elementList = await (kieKlingV3 ? normalizeKIEKlingElementList(config.videoElementList) : normalizeKlingElementList(config.videoElementList));
            if (elementList.length) body.append("element_list", JSON.stringify(elementList));
        }
    } else if (apimartMotionControl) {
        body.append("mode", normalizeAPIMartKlingMotionControlMode(config.vquality));
    } else {
        if (!kieMotionControl && !isGeminiOmniFlashVideoModel(model)) {
            const seconds = isSeedanceVideoConfig(config)
                ? String(normalizeSeedanceDuration(config.videoSeconds, (modelKey(model).includes("seedance-2-5") || modelKey(model).includes("seedance2-5") || modelKey(model).includes("sd2-5")) ? 30 : 15))
                : normalizeVideoSecondsForModel(model, config.videoSeconds);
            body.append("seconds", seconds);
        }
        if (tokenDance || isSeedanceVideoConfig(config)) body.append("size", normalizeSeedanceRatio(config.size));
        else if (size) body.append("size", size);
        const resolution = normalizeVideoResolution(config.vquality);
        body.append("resolution_name", resolution);
        if (videoChannelProtocol(config, model) === "openai") body.append("resolution", resolution);
        if (isKIEGrokVideoModel(config, model)) body.append("mode", normalizeGrokVideoMode(config.videoMode));
        else body.append("preset", "normal");
    }
    if (tokenDance || motionControl) body.append("character_orientation", normalizeCharacterOrientation(config.videoCharacterOrientation));
    if (tokenDance || apimartWan3 || supportsVideoAudioGeneration(model)) body.append("video_generate_audio", String(boolConfig(config.videoGenerateAudio, false)));
    if (tokenDance) body.append("video_watermark", String(boolConfig(config.videoWatermark, false)));
    const imageReferenceLimit = kieKlingOmni === "text-to-video" ? 0 : kieKlingOmni === "reference-to-video" ? input.references.length : kieKlingOmni === "transformation" ? 4 : kling ? 2 : 10;
    const files = await Promise.all(input.references.slice(0, imageReferenceLimit).map(imageReferenceToFormValue));
    files.forEach((file) => body.append("input_reference[]", file));
    if (!kling && input.firstFrame) body.append("first_frame_url", await imageReferenceToFormValue(input.firstFrame));
    if (!kling && input.lastFrame) body.append("last_frame_url", await imageReferenceToFormValue(input.lastFrame));
    const videoFiles = kling && kieKlingOmni !== "reference-to-video" && kieKlingOmni !== "transformation" ? [] : await Promise.all(input.videoReferences.slice(0, kieKlingOmni ? 1 : input.videoReferences.length).map(mediaReferenceToFormValue));
    videoFiles.forEach((file) => body.append("video_reference[]", file));
    const audioFiles = kling ? [] : await Promise.all(input.audioReferences.map(mediaReferenceToFormValue));
    audioFiles.forEach((file) => body.append("audio_reference[]", file));
    return body;
}

export function videoPollId(model: string, task: VideoResponse) {
    return isAgnesVideoModel(model) ? task.video_id || task.id : task.id || task.task_id || task.video_id || "";
}

function parseVideoDimensions(size: string) {
    const match = size.match(/^(\d+)x(\d+)$/);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}
