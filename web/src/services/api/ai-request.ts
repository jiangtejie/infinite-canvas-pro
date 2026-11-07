import { geminiDirectHeaders, isGeminiConfig } from "@/lib/gemini";
import { modelChannelAttributionHeaders } from "@/lib/model-channel";
import { buildApiUrl, channelIdForActiveModel, channelProtocolForConfig, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

/** 登录用户或云端渠道时统一走后端代理；未登录的本地直连直接请求渠道地址。 */
export function usesAccountProxy(config: AiConfig) {
    const token = useUserStore.getState().token;
    return config.channelMode === "remote" || (config.channelMode === "local" && Boolean(token));
}

export function aiApiUrl(config: AiConfig, path: string) {
    if (usesAccountProxy(config)) return `/api/v1${path}`;
    const channel = localChannelForActiveModel(config);
    return buildApiUrl(channel?.baseUrl || config.baseUrl, path);
}

type AiHeadersOptions = { contentType?: string; requireRemoteLogin?: boolean };

/**
 * 图片 / 视频 / 音频共用的请求头：云端走 X-Model-Channel-ID，登录用户本地直连走 X-User-Model-Channel-ID。
 * 音频侧原本允许远端渠道未登录调用且固定 JSON Content-Type，通过 options 保留差异。
 */
export function aiHeaders(config: AiConfig, contentTypeOrOptions?: string | AiHeadersOptions) {
    const { contentType, requireRemoteLogin = true } = typeof contentTypeOrOptions === "string"
        ? { contentType: contentTypeOrOptions }
        : contentTypeOrOptions || {};
    const token = useUserStore.getState().token;
    if (config.channelMode === "remote" && requireRemoteLogin && !token) throw new Error("请先登录后再使用云端渠道");
    if (config.channelMode === "remote") {
        return {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(channelIdForActiveModel(config) ? { "X-Model-Channel-ID": channelIdForActiveModel(config) } : {}),
            ...(contentType ? { "Content-Type": contentType } : {}),
        };
    }
    if (token) {
        return {
            Authorization: `Bearer ${token}`,
            ...(channelIdForActiveModel(config) ? { "X-User-Model-Channel-ID": channelIdForActiveModel(config) } : {}),
            ...(contentType ? { "Content-Type": contentType } : {}),
        };
    }
    if (isGeminiConfig(config)) return geminiDirectHeaders(config);
    return {
        Authorization: `Bearer ${localChannelForActiveModel(config)?.apiKey || config.apiKey}`,
        ...modelChannelAttributionHeaders(channelProtocolForConfig(config)),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export function refreshRemoteUser(config: AiConfig) {
    if (usesAccountProxy(config)) void useUserStore.getState().hydrateUser();
}

export function formatErrorDetail(detail: unknown) {
    if (detail == null) return "";
    if (typeof detail === "string") return detail;
    try {
        return JSON.stringify(detail, null, 2);
    } catch {
        return String(detail);
    }
}
