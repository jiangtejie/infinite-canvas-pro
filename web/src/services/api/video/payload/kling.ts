import { modelKey } from "@/lib/video-model-capabilities";
import { resolveMediaUrl } from "@/services/file-storage";
import { imageToDataUrl, resolveImageUrl } from "@/services/image-storage";
import { type AiConfig, type VideoElementReference } from "@/stores/use-config-store";

import { normalizeVideoResolution, publicHttpUrl, videoChannelProtocol } from "./shared";


export function isAPIMartKlingV26VideoConfig(config: AiConfig, model: string) {
    return isAPIMartKlingVideoConfig(config, model, "kling-v2-6");
}

export function isAPIMartKlingV3VideoConfig(config: AiConfig, model: string) {
    return isAPIMartKlingVideoConfig(config, model, "kling-v3");
}

export function isAPIMartKlingMotionControlVideoConfig(config: AiConfig, model: string) {
    return isAPIMartKlingVideoConfig(config, model, "kling-v2-6-motion-control") || isAPIMartKlingVideoConfig(config, model, "kling-v3-motion-control");
}

export function isKIEKlingMotionControlVideoConfig(config: AiConfig, model: string) {
    return isKIEKlingVideoConfig(config, model, "kling-2-6-motion-control") || isKIEKlingVideoConfig(config, model, "kling-3-0-motion-control");
}

function isAPIMartKlingVideoConfig(config: AiConfig, model: string, key: string) {
    return modelKey(model) === key && videoChannelProtocol(config, model) === "apimart";
}

function isKIEKlingVideoConfig(config: AiConfig, model: string, key: string) {
    return modelKey(model) === key && videoChannelProtocol(config, model) === "kie";
}

export function normalizeCharacterOrientation(value: string | undefined) {
    return value === "image" ? "image" : "video";
}

export function normalizeKlingV26Mode(value: string) {
    return value === "pro" ? "pro" : "std";
}

export function normalizeAPIMartKlingMotionControlMode(value: string) {
    return normalizeVideoResolution(value) === "1080p" ? "pro" : "std";
}

export function normalizeKlingV26Duration(value: string) {
    return String(value).trim() === "10" ? "10" : "5";
}

export function normalizeKlingV3Mode(value: string) {
    return value === "4k" ? "4k" : value === "pro" ? "pro" : "std";
}

export function normalizeKlingV3Duration(value: string) {
    const seconds = Math.floor(Number(value) || 3);
    return String(Math.max(3, Math.min(15, seconds)));
}

export function normalizeKlingShotType(value: string) {
    return value === "customize" ? "customize" : "intelligence";
}

export function normalizeKlingMultiPrompt(value: AiConfig["videoMultiPrompt"] | undefined) {
    const items = Array.isArray(value) && value.length ? value : [{ prompt: "", duration: "1" }];
    return items.map((item, index) => ({ index: index + 1, prompt: item?.prompt || "", duration: normalizeKlingMultiPromptDuration(item?.duration) }));
}

export function normalizeKIEKlingMultiPrompt(value: AiConfig["videoMultiPrompt"] | undefined) {
    const items = Array.isArray(value) && value.length ? value : [{ prompt: "", duration: "1" }];
    return items.map((item) => ({ prompt: item?.prompt || "", duration: normalizeKlingMultiPromptDuration(item?.duration) }));
}

function normalizeKlingMultiPromptDuration(value: string | undefined) {
    const duration = Math.floor(Number(value) || 1);
    return Math.max(1, Math.min(15, duration));
}

export async function normalizeKlingElementList(value: AiConfig["videoElementList"] | undefined) {
    const items = Array.isArray(value) ? value.slice(0, 3) : [];
    const result = [];
    for (const item of items) {
        const refs = Array.isArray(item?.references) ? item.references.slice(0, 4) : [];
        if (!refs.length) continue;
        const urls = (await Promise.all(refs.map(elementReferenceToInputUrl))).filter(Boolean).slice(0, 4);
        if (!urls.length) continue;
        result.push({ name: item.name || "", description: item.description || "", element_input_urls: urls });
    }
    return result;
}

export async function normalizeKIEKlingElementList(value: AiConfig["videoElementList"] | undefined) {
    const items = Array.isArray(value) ? value.slice(0, 3) : [];
    const result = [];
    for (const item of items) {
        const refs = Array.isArray(item?.references) ? item.references.slice(0, 4) : [];
        if (!refs.length) continue;
        const references = (await Promise.all(refs.map(async (reference) => ({ kind: reference.kind, url: await elementReferenceToInputUrl(reference) })))).filter((reference) => reference.url).slice(0, 4);
        if (!references.length) continue;
        result.push({ name: item.name || "", description: item.description || "", references });
    }
    return result;
}

export async function elementReferenceToInputUrl(reference: VideoElementReference) {
    if (reference.kind === "image") {
        const resolvedUrl = await resolveImageUrl(reference.storageKey, "");
        for (const url of [reference.url, resolvedUrl]) {
            const publicUrl = publicHttpUrl(url);
            if (publicUrl) return publicUrl;
        }
        if (reference.dataUrl) return reference.dataUrl;
        return imageToDataUrl({ dataUrl: reference.dataUrl || reference.url || resolvedUrl, storageKey: reference.storageKey });
    }
    const resolvedUrl = await resolveMediaUrl(reference.storageKey, reference.url || "");
    return publicHttpUrl(resolvedUrl) || publicHttpUrl(reference.url) || resolvedUrl || reference.url || "";
}

export function normalizeKlingV26AspectRatio(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["9:16", "720x1280", "1080x1920"].includes(normalized)) return "9:16";
    if (["1:1", "1024x1024", "1080x1080"].includes(normalized)) return "1:1";
    return "16:9";
}
