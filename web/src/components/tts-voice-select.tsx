"use client";

import { Select } from "antd";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/utils";
import { fetchGrokTtsVoices, fetchMiniMaxTtsVoices } from "@/services/api/audio";
import { channelIdForActiveModel, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type TtsVoice = { voice_id: string; name?: string; voice_name?: string };
type TtsProvider = "grok" | "minimax";

const PROVIDERS: Record<TtsProvider, {
    load: (config: AiConfig, model: string) => Promise<TtsVoice[]>;
    label: (voice: TtsVoice) => string;
    fallback: string;
    popupInSettingsPanel: boolean;
}> = {
    grok: { load: fetchGrokTtsVoices, label: (voice) => voice.name || voice.voice_id, fallback: "eve", popupInSettingsPanel: false },
    minimax: { load: fetchMiniMaxTtsVoices, label: (voice) => voice.voice_name || voice.voice_id, fallback: "", popupInSettingsPanel: true },
};

export function TtsVoiceSelect({ provider, config, model, value, onChange, enabled = true }: {
    provider: TtsProvider;
    config: AiConfig;
    model: string;
    value: string;
    onChange: (value: string) => void;
    enabled?: boolean;
}) {
    const configRef = useRef(config);
    const token = useUserStore((state) => state.token);
    const [voices, setVoices] = useState<TtsVoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    const settings = PROVIDERS[provider];
    useEffect(() => {
        configRef.current = config;
    }, [config]);

    const requestConfig = { ...config, model, audioModel: model };
    const channelId = channelIdForActiveModel(requestConfig);
    const localChannel = localChannelForActiveModel(requestConfig);
    const requestKey = `${config.channelMode}|${channelId}|${model}|${localChannel?.baseUrl || config.baseUrl}|${token}`;

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        setLoading(true);
        setError("");
        void settings.load(configRef.current, model)
            .then((items) => {
                if (active) setVoices(items);
            })
            .catch((reason) => {
                if (active) setError(errorMessage(reason, "音色读取失败"));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [enabled, model, reload, requestKey, settings]);

    const options = voices.map((voice) => ({ value: voice.voice_id, label: settings.label(voice) }));
    if (value && !options.some((item) => item.value === value)) options.unshift({ value, label: value });

    return (
        <Select
            className="w-full"
            value={value || settings.fallback}
            options={options}
            loading={loading}
            showSearch
            optionFilterProp="label"
            notFoundContent={loading ? "正在读取音色…" : error || "暂无可用音色"}
            onOpenChange={(open) => {
                if (open && error) setReload((count) => count + 1);
            }}
            onChange={onChange}
            {...(settings.popupInSettingsPanel ? {
                styles: { popup: { root: { zIndex: 1300 } } },
                getPopupContainer: (trigger: HTMLElement) => trigger.closest(".canvas-image-settings-popover") as HTMLElement | null || document.body,
            } : {})}
        />
    );
}
