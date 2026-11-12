"use client";

import { App, Form } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAutoDLWorkflowNames } from "@/hooks/use-autodl-workflow";
import { isWorkflowProtocol, modelChannelApiKeyUrls } from "@/lib/model-channel";
import { startTokenDanceOAuth } from "@/lib/tokendance-oauth";
import { fetchAdminSettings, fetchChannelModels, measureAdminStorageProvider, saveAdminSettings, testChannelModel, type AdminModelChannel, type AdminModelCost, type AdminSettings } from "@/services/api/admin";
import { clearStorageConfigCache as clearMediaStorageConfigCache } from "@/services/file-storage";
import { clearStorageConfigCache as clearImageStorageConfigCache } from "@/services/image-storage";
import { useUserStore } from "@/stores/use-user-store";
import { filterChannelModelsByCapability, type ModelCapabilities } from "@/stores/use-config-store";

import {
    collectChannelModels,
    collectChannelWorkflows,
    collectKnownModels,
    collectSettings,
    emptyChannel,
    filterModels,
    formatStorageBytes,
    getJsonError,
    mergeChannelApiKeys,
    normalizeChannel,
    normalizePrivateSetting,
    normalizePublicSetting,
    normalizeSettings,
    normalizeStorageProvider,
    parseTabJson,
    uniqueModels,
    type EditorMode,
    type SettingsTabKey,
} from "./settings-utils";

export function useAdminSettings() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [form] = Form.useForm<AdminSettings>();
    const settingsRef = useRef<AdminSettings | null>(null);
    const savingRef = useRef(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [activeTab, setActiveTab] = useState<SettingsTabKey>("public");
    const [editorMode, setEditorMode] = useState<Record<SettingsTabKey, EditorMode>>({ public: "visual", private: "visual" });
    const [jsonText, setJsonText] = useState<Record<SettingsTabKey, string>>({ public: "", private: "" });
    const [channels, setChannels] = useState<AdminModelChannel[]>([]);
    const [channelForm] = Form.useForm<AdminModelChannel>();
    const [editingChannelIndex, setEditingChannelIndex] = useState<number | null>(null);
    const [isChannelDrawerOpen, setIsChannelDrawerOpen] = useState(false);
    const [channelDraftToApply, setChannelDraftToApply] = useState<AdminModelChannel | null>(null);
    const [workflowChannelDraft, setWorkflowChannelDraft] = useState<AdminModelChannel>(emptyChannel);
    const [testChannelIndex, setTestChannelIndex] = useState<number | null>(null);
    const [testKeyword, setTestKeyword] = useState("");
    const [selectedTestModels, setSelectedTestModels] = useState<string[]>([]);
    const [testingModels, setTestingModels] = useState<string[]>([]);
    const [testResults, setTestResults] = useState<Record<string, { status: "success" | "error"; duration?: string; message: string }>>({});
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [measuringProviderIndex, setMeasuringProviderIndex] = useState<number | null>(null);
    const [modelCosts, setModelCosts] = useState<AdminModelCost[]>([]);
    const [knownModels, setKnownModels] = useState<string[]>([]);
    const watchedPublicModels = Form.useWatch(["public", "modelChannel", "availableModels"], form);
    const publicModels = useMemo(() => watchedPublicModels || [], [watchedPublicModels]);
    const publicVideoModels = useMemo(() => new Set(filterChannelModelsByCapability(channels, "video", publicModels)), [channels, publicModels]);
    const orderedPublicModels = useMemo(() => uniqueModels([
        ...publicVideoModels,
        ...(["audio", "image", "text"] as const).flatMap((capability) => filterChannelModelsByCapability(channels, capability, publicModels)),
        ...publicModels,
    ]), [channels, publicModels, publicVideoModels]);
    const publicWorkflows = Form.useWatch(["public", "modelChannel", "availableWorkflows"], form) || [];
    const storageProviders = Form.useWatch(["private", "storage", "providers"], form) || [];
    const channelProtocol = Form.useWatch("protocol", channelForm);
    const channelBaseUrl = Form.useWatch("baseUrl", channelForm);
    const modelLabel = useAutoDLWorkflowNames([...channels, { protocol: channelProtocol, baseUrl: channelBaseUrl }]);
    const publicModelLabel = (model: string) => modelLabel(model, channels.find((channel) => channel.protocol === "autodl" && channel.models.includes(model)));
    const channelApiKeyUrl = channelProtocol ? modelChannelApiKeyUrls[channelProtocol] : undefined;
    const channelModels = useMemo(() => collectChannelModels(channels), [channels]);
    const channelWorkflows = useMemo(() => collectChannelWorkflows(channels), [channels]);
    const channelTableData = useMemo(() => channels.map((channel, index) => ({ ...channel, _index: index, _rowKey: `${index}-${channel.name}-${channel.baseUrl}` })), [channels]);
    const activeMode = editorMode[activeTab];
    const activeJsonText = jsonText[activeTab];
    const jsonError = activeMode === "json" ? getJsonError(activeJsonText) : "";

    const updateJson = (tab: SettingsTabKey, value: string) => {
        setJsonText((current) => ({ ...current, [tab]: value }));
    };

    const loadSettings = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const data = normalizeSettings(await fetchAdminSettings(token));
            settingsRef.current = data;
            form.setFieldsValue(data);
            setChannels(data.private.channels);
            setModelCosts(data.public.modelChannel.modelCosts);
            setKnownModels(collectKnownModels(data));
            setJsonText({
                public: JSON.stringify(data.public, null, 2),
                private: JSON.stringify(data.private, null, 2),
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取设置失败");
        } finally {
            setIsLoading(false);
        }
    }, [form, message, token]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    useEffect(() => () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }, []);

    useEffect(() => {
        if (!token) return;
        const url = new URL(window.location.href);
        const flow = url.searchParams.get("tokendance_oauth");
        const storageKey = flow ? `tokendance:oauth-result:${flow}` : "";
        const raw = storageKey ? sessionStorage.getItem(storageKey) : null;
        if (!raw) return;

        try {
            const result = JSON.parse(raw) as {
                key?: string;
                draft?: Partial<AdminModelChannel>;
                editingChannelIndex?: number | null;
            };
            if (!result.key || !result.draft) throw new Error("TokenDance 授权结果不完整");

            const channel = normalizeChannel({ ...result.draft, apiKey: result.key });
            setActiveTab("private");
            setEditingChannelIndex(typeof result.editingChannelIndex === "number" ? result.editingChannelIndex : null);
            setChannelDraftToApply(channel);
            setWorkflowChannelDraft(channel);
            setIsChannelDrawerOpen(true);
            rememberModels(channel.models);
            message.success("TokenDance 登录成功，API Key 已填入");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "TokenDance 授权结果读取失败");
        } finally {
            sessionStorage.removeItem(storageKey);
            url.searchParams.delete("tokendance_oauth");
            window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
    }, [channelForm, message, token]);

    const changeTab = (nextTab: SettingsTabKey) => {
        setActiveTab(nextTab);
    };

    const saveSettings = async () => {
        if (!token || savingRef.current) return;
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
        savingRef.current = true;
        setIsSaving(true);
        try {
            const values = await collectSettings(form, editorMode, jsonText, message);
            if (!values) return;
            const saved = normalizeSettings(await saveAdminSettings(token, values));
            clearImageStorageConfigCache();
            clearMediaStorageConfigCache();
            const merged = mergeChannelApiKeys(values.private.channels, saved);
            settingsRef.current = merged;
            form.setFieldsValue(merged);
            setChannels(merged.private.channels);
            setModelCosts(merged.public.modelChannel.modelCosts);
            rememberKnownModels(merged);
            setJsonText({
                public: JSON.stringify(merged.public, null, 2),
                private: JSON.stringify(merged.private, null, 2),
            });
            message.success("已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    /** 权限开关自动保存：300ms 防抖；保存中再次触发会排队，避免与手动保存并发。 */
    const autoSavePermissions = () => {
        if (!token) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            if (savingRef.current) {
                autoSavePermissions();
                return;
            }
            void runAutoSavePermissions();
        }, 300);
    };

    async function runAutoSavePermissions() {
        if (!token || savingRef.current) return;
        savingRef.current = true;
        try {
            const snapshot = settingsRef.current;
            let values: AdminSettings;
            if (snapshot) {
                // 权限开关只自动保存当前公开配置。私有配置使用最近一次已加载/保存的快照，
                // 避免私有页未挂载时默认值覆盖渠道、密钥等真实配置。
                const current = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
                current.private = snapshot.private;
                current.public.modelChannel.availableModels = filterModels(current.public.modelChannel.availableModels, collectChannelModels(current.private.channels));
                current.public.modelChannel.availableWorkflows = filterModels(current.public.modelChannel.availableWorkflows, collectChannelWorkflows(current.private.channels).map((item) => item.value));
                current.public.modelChannel.systemPrompt = current.public.modelChannel.systemPrompts.image || current.public.modelChannel.systemPrompts.text || "";
                values = normalizeSettings(current);
            } else {
                const collected = await collectSettings(form, editorMode, jsonText, message);
                if (!collected) return;
                values = collected;
            }
            const saved = normalizeSettings(await saveAdminSettings(token, values));
            clearImageStorageConfigCache();
            clearMediaStorageConfigCache();
            const merged = mergeChannelApiKeys(values.private.channels, saved);
            settingsRef.current = merged;
            form.setFieldsValue({ public: merged.public });
            setChannels(merged.private.channels);
            setModelCosts(merged.public.modelChannel.modelCosts);
            rememberKnownModels(merged);
            setJsonText((current) => ({
                ...current,
                public: JSON.stringify(merged.public, null, 2),
            }));
            message.success("权限已自动保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "权限自动保存失败");
        } finally {
            savingRef.current = false;
        }
    }

    const toggleMode = (tab: SettingsTabKey, nextMode: EditorMode) => {
        if (nextMode === "json") {
            setJsonText((current) => ({
                ...current,
                [tab]: JSON.stringify(tab === "public" ? normalizePublicSetting(form.getFieldValue(["public"]) as Partial<AdminSettings["public"]>) : normalizePrivateSetting(form.getFieldValue(["private"]) as Partial<AdminSettings["private"]>), null, 2),
            }));
            setEditorMode((current) => ({ ...current, [tab]: nextMode }));
            return;
        }
        const parsed = parseTabJson(tab, jsonText[tab]);
        if (!parsed) {
            message.error("JSON 格式不正确");
            return;
        }
        form.setFieldsValue({ [tab]: parsed } as Partial<AdminSettings>);
        if (tab === "private") setChannels((parsed as AdminSettings["private"]).channels);
        if (tab === "public") setModelCosts((parsed as AdminSettings["public"]).modelChannel.modelCosts);
        rememberKnownModels({ ...normalizeSettings(form.getFieldsValue(true) as AdminSettings), [tab]: parsed });
        setEditorMode((current) => ({ ...current, [tab]: nextMode }));
    };

    const formatJson = (tab: SettingsTabKey) => {
        const parsed = parseTabJson(tab, jsonText[tab]);
        if (!parsed) {
            message.error("JSON 格式不正确");
            return;
        }
        if (tab === "public") setModelCosts((parsed as AdminSettings["public"]).modelChannel.modelCosts);
        setJsonText((current) => ({
            ...current,
            [tab]: JSON.stringify(parsed, null, 2),
        }));
    };

    const openChannelDrawer = (index: number | null) => {
        setEditingChannelIndex(index);
        setIsChannelDrawerOpen(true);
        const channel = index === null ? emptyChannel : normalizeChannel(channels[index]);
        setChannelDraftToApply(channel);
        setWorkflowChannelDraft(channel);
        rememberModels(channel.models);
    };

    useEffect(() => {
        if (!isChannelDrawerOpen || !channelDraftToApply) return;
        channelForm.setFieldsValue(channelDraftToApply);
    }, [channelDraftToApply, channelForm, isChannelDrawerOpen]);

    const closeChannelDrawer = () => {
        setIsChannelDrawerOpen(false);
        setEditingChannelIndex(null);
        channelForm.resetFields();
    };

    const loginTokenDance = () => {
        void startTokenDanceOAuth({
            target: "admin",
            draft: channelForm.getFieldsValue(true) as unknown as Record<string, unknown>,
            editingChannelIndex,
        }).catch((error) => message.error(error instanceof Error ? error.message : "TokenDance 登录失败"));
    };

    const saveChannel = async () => {
        const values = await channelForm.validateFields();
        const channel = normalizeChannel(isWorkflowProtocol(values.protocol) ? { ...workflowChannelDraft, ...channelForm.getFieldsValue(true), ...values } : { ...values, modelCapabilities: channelForm.getFieldValue("modelCapabilities"), parameterTranslation: channelForm.getFieldValue("parameterTranslation") });
        if (channel.protocol === "runninghub" && (!channel.baseUrl.trim() || (!channel.apiKey.trim() && editingChannelIndex === null))) {
            message.error("请填写 RunningHub Base URL 和积分 API Key");
            return;
        }
        rememberModels(channel.models);
        const nextChannels = [...channels];
        if (editingChannelIndex === null) nextChannels.push(channel);
        else nextChannels[editingChannelIndex] = channel;
        await persistChannels(nextChannels);
        closeChannelDrawer();
    };

    const fetchChannelModelList = async () => {
        if (!token) return;
        const channel = channelForm.getFieldsValue();
        if (!channel?.baseUrl) {
            message.warning("请先填写接口地址");
            return;
        }
        if (editingChannelIndex === null && !channel?.apiKey) {
            message.warning("请先填写 API Key");
            return;
        }
        return fetchChannelModels(token, { index: editingChannelIndex ?? undefined, channel: normalizeChannel(channel) });
    };

    const openChannelModelSelector = () => setIsModelSelectorOpen(true);

    const closeChannelModelSelector = () => setIsModelSelectorOpen(false);

    const confirmChannelModelSelector = (models: string[], modelCapabilities: ModelCapabilities, parameterTranslation: string) => {
        channelForm.setFieldsValue({ models, modelCapabilities, parameterTranslation });
        rememberModels(models);
        closeChannelModelSelector();
    };

    function rememberModels(models: string[]) {
        setKnownModels((current) => uniqueModels([...current, ...models]));
    }

    function rememberKnownModels(settings: AdminSettings) {
        rememberModels(collectKnownModels(settings));
    }

    const openTestDialog = (index: number) => {
        const channel = normalizeChannel(channels[index]);
        if (!channel.baseUrl || channel.models.length === 0) {
            message.warning("请先填写接口地址和至少一个模型");
            return;
        }
        setTestChannelIndex(index);
        setTestKeyword("");
        setSelectedTestModels([]);
        setTestingModels([]);
        setTestResults({});
    };

    const closeTestDialog = () => {
        setTestChannelIndex(null);
        setTestKeyword("");
        setSelectedTestModels([]);
        setTestingModels([]);
        setTestResults({});
    };

    const testModelOnline = async (model: string) => {
        if (testChannelIndex === null) return;
        if (!token) return;
        const channel = normalizeChannel(channels[testChannelIndex]);
        setTestingModels((current) => [...current, model]);
        try {
            const startedAt = performance.now();
            const result = await testChannelModel(token, { index: testChannelIndex, channel, model });
            setTestResults((current) => ({ ...current, [model]: { status: "success", duration: `${((performance.now() - startedAt) / 1000).toFixed(2)}s`, message: result } }));
        } catch (error) {
            setTestResults((current) => ({ ...current, [model]: { status: "error", message: error instanceof Error ? error.message : "测试失败" } }));
        } finally {
            setTestingModels((current) => current.filter((item) => item !== model));
        }
    };

    const batchTestModels = async () => {
        for (const model of selectedTestModels) {
            await testModelOnline(model);
        }
    };

    const testChannel = testChannelIndex === null ? null : normalizeChannel(channels[testChannelIndex]);
    const testModels = (testChannel?.models || []).filter((model) => `${model} ${modelLabel(model, testChannel)}`.toLowerCase().includes(testKeyword.trim().toLowerCase()));

    async function persistChannels(nextChannels: AdminModelChannel[]) {
        if (!token) throw new Error("请先登录");
        const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
        const nextChannelModels = collectChannelModels(nextChannels);
        const nextChannelWorkflows = collectChannelWorkflows(nextChannels);
        const nextSettings = normalizeSettings({
            ...values,
            public: { ...values.public, modelChannel: { ...values.public.modelChannel, availableModels: filterModels(values.public.modelChannel.availableModels, nextChannelModels), availableWorkflows: filterModels(values.public.modelChannel.availableWorkflows, nextChannelWorkflows.map((item) => item.value)) } },
            private: { ...values.private, channels: nextChannels },
        });
        const saved = normalizeSettings(await saveAdminSettings(token, nextSettings));
        clearImageStorageConfigCache();
        clearMediaStorageConfigCache();
        const merged = mergeChannelApiKeys(nextChannels, saved);
        setChannels(merged.private.channels);
        setModelCosts(merged.public.modelChannel.modelCosts);
        rememberKnownModels(merged);
        form.setFieldsValue(merged);
        setJsonText({
            public: JSON.stringify(merged.public, null, 2),
            private: JSON.stringify(merged.private, null, 2),
        });
        message.success("已保存");
    }

    async function measureStorageProviderAt(index: number) {
        if (!token) return;
        const provider = normalizeStorageProvider(form.getFieldValue(["private", "storage", "providers", index]));
        setMeasuringProviderIndex(index);
        try {
            const result = await measureAdminStorageProvider(token, { index, provider });
            const next = normalizeSettings(await fetchAdminSettings(token));
            form.setFieldsValue(next);
            setJsonText({ public: JSON.stringify(next.public, null, 2), private: JSON.stringify(next.private, null, 2) });
            message.success(`容量统计完成：${formatStorageBytes(result.bytes)}${result.overLimit ? "，已达到上限并禁用" : ""}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "容量统计失败");
        } finally {
            setMeasuringProviderIndex(null);
        }
    }
    return {
        token,
        form,
        activeTab,
        changeTab,
        editorMode,
        activeMode,
        activeJsonText,
        jsonText,
        updateJson,
        jsonError,
        toggleMode,
        formatJson,
        loadSettings,
        isLoading,
        isSaving,
        saveSettings,
        autoSavePermissions,
        channels,
        setChannels,
        channelForm,
        editingChannelIndex,
        isChannelDrawerOpen,
        workflowChannelDraft,
        setWorkflowChannelDraft,
        channelDraftToApply,
        testChannelIndex,
        testKeyword,
        setTestKeyword,
        selectedTestModels,
        setSelectedTestModels,
        testingModels,
        testResults,
        isModelSelectorOpen,
        setModelCosts,
        modelCosts,
        knownModels,
        publicModels,
        publicVideoModels,
        orderedPublicModels,
        publicWorkflows,
        storageProviders,
        channelProtocol,
        channelBaseUrl,
        channelApiKeyUrl,
        modelLabel,
        publicModelLabel,
        channelModels,
        channelWorkflows,
        channelTableData,
        openChannelDrawer,
        closeChannelDrawer,
        loginTokenDance,
        saveChannel,
        fetchChannelModelList,
        openChannelModelSelector,
        closeChannelModelSelector,
        confirmChannelModelSelector,
        rememberModels,
        openTestDialog,
        closeTestDialog,
        testModelOnline,
        batchTestModels,
        testChannel,
        testModels,
        persistChannels,
        measuringProviderIndex,
        measureStorageProviderAt,
    };
}

export type AdminSettingsController = ReturnType<typeof useAdminSettings>;
