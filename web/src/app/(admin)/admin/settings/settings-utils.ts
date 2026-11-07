import { videoResolutionOptions } from "@/components/video-settings-panel";
import { isWorkflowProtocol } from "@/lib/model-channel";
import { modelChannelDefaultBaseUrls } from "@/lib/model-channel";
import type { AdminModelChannel, AdminModelCost, AdminSettings, AdminStorageProvider } from "@/services/api/admin";

export const emptySettings: AdminSettings = {
    public: {
        modelChannel: {
            availableModels: [],
            availableWorkflows: [],
            modelCosts: [],
            channels: [],
            defaultModel: "",
            defaultImageModel: "",
            defaultVideoModel: "",
            defaultTextModel: "",
            systemPrompt: "",
            systemPrompts: { image: "", video: "", text: "", workflow: "", workflowAgent: "" },
            allowCustomChannel: true,
            allowUserRemoteChannel: false,
        },
        auth: { allowRegister: true },
        storage: { mode: "local_indexeddb", allowUserProvider: false },
    },
    private: { channels: [], promptSync: { enabled: true, cron: "0 0 * * *" }, aiLog: { localDirectReportEnabled: false, cleanup: { enabled: false, retentionDays: 14, cron: "0 3 * * *" } }, payment: { lxPayServerUrl: "", lxPayAppId: "", lxPayAppSecret: "", lxPayNotifyUrl: "", lxPayApiV3Key: "", lxPayPlatformCertPath: "", lxPayTimeoutMs: 10000, lxPayMaxRetries: 3, orderMinutes: 15 }, storage: { mode: "local_indexeddb", allowUserProvider: false, allowUserGlobalProvider: true, autoSyncAllAssets: false, providers: [], roundRobinCursor: 0, capacityCheck: { enabled: false, cron: "0 */6 * * *" }, capacityLimitBytes: 9 * 1024 * 1024 * 1024 } },
};
export const emptyChannel: AdminModelChannel = { id: "", protocol: "openai", name: "", baseUrl: modelChannelDefaultBaseUrls.openai, apiKey: "", models: [], weight: 1, timeout: 600, enabled: true, remark: "" };
export const emptyS3StorageProvider: AdminStorageProvider = { id: "", name: "", type: "s3", endpoint: "", region: "auto", bucket: "", accessKeyId: "", secretAccessKey: "", publicBaseUrl: "", pathPrefix: "canvas", username: "", password: "", weight: 1, enabled: true, ownerUserId: "", capacityBytes: 0, capacityCheckedAt: "", capacityExceeded: false };
export const emptyWebDAVStorageProvider: AdminStorageProvider = { ...emptyS3StorageProvider, name: "", type: "webdav", region: "", allowPrivateNetwork: false };

export type SettingsTabKey = "public" | "private";
export type EditorMode = "visual" | "json";

export function normalizeSettings(settings: Partial<AdminSettings> = {}): AdminSettings {
    const privateSetting = normalizePrivateSetting(settings.private);
    return {
        public: {
            ...normalizePublicSetting(settings.public),
        },
        private: privateSetting,
    };
}

export function normalizePublicSetting(setting: Partial<AdminSettings["public"]> = {}): AdminSettings["public"] {
    return {
        ...emptySettings.public,
        modelChannel: {
            ...emptySettings.public.modelChannel,
            ...(setting.modelChannel || {}),
            availableModels: setting.modelChannel?.availableModels || [],
            availableWorkflows: setting.modelChannel?.availableWorkflows || [],
            modelCosts: normalizeModelCosts(setting.modelChannel?.modelCosts || []),
            channels: setting.modelChannel?.channels || [],
            systemPrompts: {
                ...emptySettings.public.modelChannel.systemPrompts,
                image: setting.modelChannel?.systemPrompts?.image || setting.modelChannel?.systemPrompt || "",
                video: setting.modelChannel?.systemPrompts?.video || "",
                text: setting.modelChannel?.systemPrompts?.text || setting.modelChannel?.systemPrompt || "",
                workflow: setting.modelChannel?.systemPrompts?.workflow || "",
                workflowAgent: setting.modelChannel?.systemPrompts?.workflowAgent || "",
            },
        },
        auth: {
            allowRegister: setting.auth?.allowRegister !== false,
        },
        storage: {
            mode: setting.storage?.mode || "local_indexeddb",
            allowUserProvider: setting.storage?.allowUserProvider === true,
        },
    };
}

export function normalizeModelCosts(items: Partial<AdminSettings["public"]["modelChannel"]["modelCosts"][number]>[]) {
    return items.filter((item) => item.model).map((item) => ({ model: item.model || "", resolution: item.resolution || "", credits: Math.max(0, Number(item.credits) || 0) }));
}

export function normalizePrivateSetting(setting: Partial<AdminSettings["private"]> = {}): AdminSettings["private"] {
    return {
        channels: (setting.channels || []).map(normalizeChannel),
        promptSync: {
            enabled: setting.promptSync?.enabled !== false,
            cron: setting.promptSync?.cron || "0 0 * * *",
        },
        aiLog: {
            localDirectReportEnabled: setting.aiLog?.localDirectReportEnabled === true,
            cleanup: {
                enabled: setting.aiLog?.cleanup?.enabled === true,
                retentionDays: Number(setting.aiLog?.cleanup?.retentionDays) || 14,
                cron: setting.aiLog?.cleanup?.cron || "0 3 * * *",
            },
        },
        payment: {
            lxPayServerUrl: setting.payment?.lxPayServerUrl || "",
            lxPayAppId: setting.payment?.lxPayAppId || "",
            lxPayAppSecret: setting.payment?.lxPayAppSecret || "",
            lxPayNotifyUrl: setting.payment?.lxPayNotifyUrl || "",
            lxPayApiV3Key: setting.payment?.lxPayApiV3Key || "",
            lxPayPlatformCertPath: setting.payment?.lxPayPlatformCertPath || "",
            lxPayTimeoutMs: Number(setting.payment?.lxPayTimeoutMs) || 10000,
            lxPayMaxRetries: Number(setting.payment?.lxPayMaxRetries) || 3,
            orderMinutes: Number(setting.payment?.orderMinutes) || 15,
        },
        storage: {
            mode: setting.storage?.mode || "local_indexeddb",
            allowUserProvider: setting.storage?.allowUserProvider === true,
            allowUserGlobalProvider: setting.storage?.allowUserGlobalProvider === true,
            autoSyncAllAssets: setting.storage?.autoSyncAllAssets === true,
            providers: (setting.storage?.providers || []).map(normalizeStorageProvider),
            roundRobinCursor: Number(setting.storage?.roundRobinCursor) || 0,
            capacityCheck: {
                enabled: setting.storage?.capacityCheck?.enabled === true,
                cron: setting.storage?.capacityCheck?.cron || "0 */6 * * *",
            },
            capacityLimitBytes: Number(setting.storage?.capacityLimitBytes) || 9 * 1024 * 1024 * 1024,
        },
    };
}

export function normalizeStorageProvider(item: Partial<AdminStorageProvider> = {}): AdminStorageProvider {
    const type = item.type === "webdav" ? "webdav" : "s3";
    return {
        ...(type === "webdav" ? emptyWebDAVStorageProvider : emptyS3StorageProvider),
        ...item,
        id: item.id || "",
        type,
        region: type === "s3" ? item.region || "auto" : "",
        weight: Math.max(1, Number(item.weight) || 1),
        enabled: item.enabled !== false,
        capacityBytes: Number(item.capacityBytes) || 0,
        capacityCheckedAt: item.capacityCheckedAt || "",
        capacityExceeded: item.capacityExceeded === true,
    };
}

export function newAdminStorageProvider(type: AdminStorageProvider["type"], providers: AdminStorageProvider[]) {
    const template = type === "webdav" ? emptyWebDAVStorageProvider : emptyS3StorageProvider;
    return {
        ...template,
        enabled: !providers.some((provider) => provider.enabled && provider.type !== type),
    };
}

export function normalizeChannel(item: Partial<AdminModelChannel> = {}): AdminModelChannel {
    return {
        id: item.id || "",
        protocol: item.protocol || "openai",
        name: item.name || "",
        baseUrl: item.baseUrl || "",
        apiKey: item.apiKey || "",
        models: item.models || [],
        modelCapabilities: item.modelCapabilities || {},
        parameterTranslation: item.parameterTranslation || "",
        uploadApiKey: item.uploadApiKey || "",
        bridgeId: item.bridgeId || "",
        comfyUrl: item.comfyUrl || "",
        workflowDir: item.workflowDir || "",
        workflows: item.workflows || [],
        weight: Math.max(1, Number(item.weight) || 1),
        timeout: Math.max(1, Number(item.timeout) || 600),
        enabled: item.enabled !== false,
        remark: item.remark || "",
    };
}

export function modelCostCredits(items: AdminSettings["public"]["modelChannel"]["modelCosts"], model: string, resolution = "") {
    return items.find((item) => item.model === model && (item.resolution || "") === resolution)?.credits || 0;
}

export function setModelCost(form: any, setModelCosts: (items: AdminModelCost[]) => void, model: string, credits: number, resolution = "", previousResolution = resolution) {
    const current = (form.getFieldValue(["public", "modelChannel", "modelCosts"]) || []) as AdminSettings["public"]["modelChannel"]["modelCosts"];
    const next = current.filter((item) => item.model !== model || (item.resolution || "") !== previousResolution);
    next.push({ model, resolution, credits: Math.max(0, credits) });
    form.setFieldValue(["public", "modelChannel", "modelCosts"], next);
    setModelCosts(next);
}

export function addModelResolutionCost(form: any, setModelCosts: (items: AdminModelCost[]) => void, model: string) {
    const current = (form.getFieldValue(["public", "modelChannel", "modelCosts"]) || []) as AdminModelCost[];
    const resolution = videoResolutionOptions.find((option) => !current.some((item) => item.model === model && item.resolution === option.value))?.value;
    if (resolution) setModelCost(form, setModelCosts, model, 0, resolution);
}

export function removeModelCost(form: any, setModelCosts: (items: AdminModelCost[]) => void, model: string, resolution: string) {
    const current = (form.getFieldValue(["public", "modelChannel", "modelCosts"]) || []) as AdminModelCost[];
    const next = current.filter((item) => item.model !== model || item.resolution !== resolution);
    form.setFieldValue(["public", "modelChannel", "modelCosts"], next);
    setModelCosts(next);
}

export function mergeChannelApiKeys(currentChannels: AdminModelChannel[], saved: AdminSettings): AdminSettings {
    const channels = saved.private.channels.map((item, index) => {
        const source = isWorkflowProtocol(item.protocol) ? currentChannels.find((channel) => channel.id === item.id && channel.protocol === item.protocol) : currentChannels[index];
        return { ...item, apiKey: source?.apiKey || item.apiKey, uploadApiKey: source?.uploadApiKey || item.uploadApiKey };
    });
    return {
        public: saved.public,
        private: { ...saved.private, channels },
    };
}

export function collectChannelModels(channels: AdminModelChannel[]) {
    return uniqueModels(channels.filter((channel) => channel.enabled && !isWorkflowProtocol(channel.protocol)).flatMap((channel) => channel.models || []));
}

export function collectChannelWorkflows(channels: AdminModelChannel[]) {
    return channels.flatMap((channel) => isWorkflowProtocol(channel.protocol) ? (channel.workflows || []).filter((entry) => entry.enabled && entry.provider === channel.protocol).map((entry) => ({ label: `${channel.name} · ${entry.title || entry.workflowId}（工作流）`, value: `workflow:system:${channel.id}:${entry.kind}:${entry.workflowId}` })) : []);
}

export function collectKnownModels(settings: AdminSettings) {
    return uniqueModels([...(settings.public.modelChannel.availableModels || []), ...(settings.public.modelChannel.modelCosts || []).map((item) => item.model), ...settings.private.channels.flatMap((channel) => channel.models || [])]);
}

export function uniqueModels(models: string[]) {
    return Array.from(new Set(models.filter(Boolean)));
}

export function filterModels(models: string[], options: string[]) {
    const optionSet = new Set(options);
    return uniqueModels(models).filter((model) => optionSet.has(model));
}

export function modelSummary(models: string[]) {
    if (!models.length) return "未配置模型";
    const preview = models.slice(0, 3).join(", ");
    return models.length > 3 ? `${models.length} 个模型：${preview}...` : preview;
}

export function formatStorageBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export function parseTabJson(tab: "public", value: string): AdminSettings["public"] | null;
export function parseTabJson(tab: "private", value: string): AdminSettings["private"] | null;
export function parseTabJson(tab: SettingsTabKey, value: string): AdminSettings[SettingsTabKey] | null;
export function parseTabJson(tab: SettingsTabKey, value: string): AdminSettings[SettingsTabKey] | null {
    try {
        return tab === "public" ? normalizePublicSetting(JSON.parse(value) as Partial<AdminSettings["public"]>) : normalizePrivateSetting(JSON.parse(value) as Partial<AdminSettings["private"]>);
    } catch {
        return null;
    }
}

export async function collectSettings(form: any, editorMode: Record<SettingsTabKey, EditorMode>, jsonText: Record<SettingsTabKey, string>, message: { error: (value: string) => void }) {
    const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
    if (editorMode.public === "json") {
        const publicSetting = parseTabJson("public", jsonText.public);
        if (!publicSetting) {
            message.error("公开配置 JSON 格式不正确");
            return null;
        }
        values.public = publicSetting;
    }
    if (editorMode.private === "json") {
        const privateSetting = parseTabJson("private", jsonText.private);
        if (!privateSetting) {
            message.error("私有配置 JSON 格式不正确");
            return null;
        }
        values.private = privateSetting;
    }
    values.public.modelChannel.availableModels = filterModels(values.public.modelChannel.availableModels, collectChannelModels(values.private.channels));
    values.public.modelChannel.availableWorkflows = filterModels(values.public.modelChannel.availableWorkflows, collectChannelWorkflows(values.private.channels).map((item) => item.value));
    values.public.modelChannel.systemPrompt = values.public.modelChannel.systemPrompts.image || values.public.modelChannel.systemPrompts.text || "";
    return normalizeSettings(values);
}

export function getJsonError(value: string) {
    try {
        JSON.parse(value);
        return "";
    } catch (error) {
        return error instanceof Error ? error.message : "JSON 格式不正确";
    }
}
