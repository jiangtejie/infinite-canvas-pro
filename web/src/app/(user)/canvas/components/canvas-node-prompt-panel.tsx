"use client";

import { useEffect, useState } from "react";
import { ArrowUp, LoaderCircle, Maximize2, Square } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { useAutoDLWorkflow } from "@/hooks/use-autodl-workflow";
import { useFocusRestore } from "@/hooks/use-focus-restore";
import { getAutoDLCapabilities, isAutoDLConfig } from "@/lib/autodl";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasCameraControl } from "./canvas-camera-control";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasVideoSettingsPopover, type CanvasVideoFrameOption, type CanvasVideoResourceOption } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { buildGenerationConfig } from "../[id]/lib/canvas-generation-config";
import { isCanvasImageNodeType, isPanoramaNodeType } from "../utils/canvas-panorama";
import { inferNegativePrompt } from "../utils/canvas-negative-prompt";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

export type { CanvasVideoFrameOption };

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    connectedNodes?: CanvasNodeData[];
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
    videoFrameOptions?: CanvasVideoFrameOption[];
    videoResourceOptions?: CanvasVideoResourceOption[];
    onImageSettingsOpenChange?: (open: boolean) => void;
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], connectedNodes = [], videoFrameOptions = [], videoResourceOptions = [], onDisconnectReference, onStartReferenceSelection, onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const globalConfig = useEffectiveConfig();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const config = buildGenerationConfig(globalConfig, node, mode);
    const { data: autodlWorkflow } = useAutoDLWorkflow(config, mode === "video" ? config.model : "");
    const isPanorama = isPanoramaNodeType(node.type);
    const textOverwrite = node.type === CanvasNodeType.Text && globalConfig.nodeRegenerateBehavior === "overwrite" && Boolean(node.metadata?.clientTaskId);
    const mediaLoading = (isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio || textOverwrite) && node.metadata?.status === "loading";
    const isStopping = node.metadata?.status === "stopping";
    const stopFailed = isStopping && Boolean(node.metadata?.errorDetails);
    const canStop = Boolean(node.metadata?.clientTaskId) && !node.metadata?.isBatchRoot && (mediaLoading || stopFailed);
    const generating = (isRunning && node.metadata?.status !== "stopped") || mediaLoading;
    const showStop = canStop || isStopping;
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = isCanvasImageNodeType(node.type) && Boolean(node.metadata?.content);
    const sourcePrompt = isPanorama ? node.metadata?.panoramaSourcePrompt || "" : node.metadata?.prompt || "";
    const [prompt, setPrompt] = useState(sourcePrompt);
    const [expanded, setExpanded] = useState(false);
    const workflowRef = node.metadata?.workflowRef;
    const billingModel = workflowRef
        ? `workflow:${workflowRef.scope}:${workflowRef.channelId}:${workflowRef.kind}:${workflowRef.workflowId}`
        : config.model;
    useFocusRestore();

    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: billingModel, resolution: mode === "video" ? config.vquality : undefined, count: mode === "image" ? config.count : 1, seconds: mode === "video" ? config.videoSeconds : undefined });

    useEffect(() => {
        setPrompt(sourcePrompt);
    }, [node.id, sourcePrompt]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        onPromptChange(node.id, value);
    };

    const canSubmit = node.metadata?.status === "stopped" || Boolean(prompt.trim()) || (mode !== "text" && Boolean(node.metadata?.workflowRef)) || (mode === "video" && isAutoDLConfig(config) && getAutoDLCapabilities(autodlWorkflow)?.promptRequired === false) || (isPanorama && (hasImageContent || mentionReferences.length > 0));

    const submit = () => {
        const text = prompt.trim();
        if (!canSubmit || generating || isStopping) return;
        onGenerate(node.id, mode, text);
    };

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <CanvasNodeReferenceBar nodeId={node.id} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onStartSelection={onStartReferenceSelection} />
            <CanvasPromptChipInput
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                className="thin-scrollbar h-32 w-full resize-none touch-pan-y rounded-xl px-3 py-2 text-sm leading-5 outline-none"
                style={{ background: "transparent", color: theme.node.text }}
                placeholder={isPanorama ? "描述想生成的全景，或上传/连接图片作为参考" : promptPlaceholder(mode, hasImageContent, hasTextContent)}
            />

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2 max-sm:flex-wrap max-sm:items-start">
                <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:w-full max-sm:flex-none max-sm:flex-wrap">
                    <Tooltip title="放大编辑">
                        <Button type="text" className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0" style={{ color: theme.node.text }} icon={<Maximize2 className="size-3.5" />} onClick={() => setExpanded(true)} aria-label="放大编辑" />
                    </Tooltip>
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker className="!w-[180px] !min-w-0 !shrink-0" config={config} value={config.model} channelId={config.imageChannelId} workflowRef={node.metadata?.workflowRef} onWorkflowChange={(workflowRef) => onConfigChange(node.id, { workflowRef })} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="image" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={node.metadata?.workflowRef ? { ...config, model: "" } : config}
                                placement="topLeft"
                                buttonClassName="!h-10 !w-[148px] !shrink-0 !justify-start !rounded-full !px-3"
                                negativePrompt={node.metadata?.negativePrompt || ""}
                                onNegativePromptChange={(value) => onConfigChange(node.id, { negativePrompt: value })}
                                negativePromptSuggestion={inferNegativePrompt(prompt)}
                                autoNegativePrompt={node.metadata?.autoNegativePrompt !== false}
                                onAutoNegativePromptChange={(value) => onConfigChange(node.id, { autoNegativePrompt: value })}
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                                showSize={!isPanorama}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker className="!w-[180px] !min-w-0 !shrink-0" config={config} value={config.model} channelId={config.videoChannelId} workflowRef={node.metadata?.workflowRef} onWorkflowChange={(workflowRef) => onConfigChange(node.id, { workflowRef })} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="video" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !w-[148px] !shrink-0 !justify-start !rounded-full !px-3" frameOptions={videoFrameOptions} resourceOptions={videoResourceOptions} metadata={node.metadata} firstFrameNodeId={node.metadata?.firstFrameNodeId} lastFrameNodeId={node.metadata?.lastFrameNodeId} onFrameChange={(patch) => onConfigChange(node.id, patch)} onMetadataChange={(patch) => onConfigChange(node.id, patch)} onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker className="!w-[180px] !min-w-0 !shrink-0" config={config} value={config.model} channelId={config.audioChannelId || config.activeChannelId} workflowRef={node.metadata?.workflowRef} onWorkflowChange={(workflowRef) => onConfigChange(node.id, { workflowRef })} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="audio" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover config={config} resourceOptions={videoResourceOptions} metadata={node.metadata} onMetadataChange={(patch) => onConfigChange(node.id, patch)} buttonClassName="!h-10 !w-[148px] !shrink-0 !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <ModelPicker config={config} value={config.model} channelId={config.textChannelId} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                    )}
                </div>
                <div className="ml-auto flex shrink-0 items-center justify-end gap-2 max-sm:w-full max-sm:shrink max-sm:flex-wrap">
                    {mode === "video" || (mode === "image" && !isPanorama) ? (
                        <CanvasCameraControl value={node.metadata?.cameraControl} onChange={(cameraControl) => onConfigChange(node.id, { cameraControl })} buttonClassName="!h-10 !min-w-[92px] !justify-start !rounded-full !px-3" />
                    ) : null}
                <Button
                    type="primary"
                    danger={showStop}
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    disabled={(isStopping && !stopFailed) || (!canStop && (generating || !canSubmit))}
                    onClick={canStop ? () => onStop(node.id) : submit}
                    aria-label={canStop ? stopFailed ? "重试停止" : "停止" : isStopping ? "停止中" : "生成"}
                >
                    <span className="relative inline-flex">
                        <span className={`flex items-center gap-1.5${showStop ? " invisible" : ""}`}>
                            <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums"><CreditSymbol />{credits.toLocaleString()}</span>
                            {generating ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        </span>
                        {showStop ? <span className="absolute inset-0 flex items-center justify-center">
                            {isStopping && !stopFailed ? <LoaderCircle className="size-4 animate-spin" /> : <Square className="size-3.5" fill="currentColor" />}
                        </span> : null}
                    </span>
                </Button>
                </div>
            </div>
            <Modal title="编辑提示词" open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <div data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    <CanvasNodeReferenceBar nodeId={node.id} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onStartSelection={(nodeId) => { setExpanded(false); onStartReferenceSelection?.(nodeId); }} />
                    <CanvasPromptChipInput
                        value={prompt}
                        references={mentionReferences}
                        onChange={updatePrompt}
                        className="thin-scrollbar h-[52dvh] min-h-80 w-full cursor-text overflow-y-auto rounded-2xl border p-4 text-[15px] leading-6 outline-none"
                        style={{ background: "transparent", borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder={isPanorama ? "描述想生成的全景，或上传/连接图片作为参考" : promptPlaceholder(mode, hasImageContent, hasTextContent)}
                    />
                </div>
            </Modal>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}


function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述要生成的视频内容";
    if (mode === "audio") return "描述要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoMode") return { mode: value };
    if (key === "videoNegativePrompt") return { negativePrompt: value };
    if (key === "videoMultiShot") return { multiShot: value };
    if (key === "videoShotType") return { shotType: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoCharacterOrientation") return { characterOrientation: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string): Partial<CanvasNodeMetadata> {
    return { [key]: value } as Partial<CanvasNodeMetadata>;
}
