"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Switch } from "antd";
import { ClipboardPaste, FolderPlus, Sparkles, Upload } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import type { WorkbenchLayout } from "@/components/workbench-header";
import { QuickNumber, QuickSelect } from "@/components/workbench-controls";
import { klingModeOptions, klingRatioOptions, klingSecondsOptions, klingV3DefaultSeconds, klingV3SecondsRange } from "@/components/workbench/kling-parameter-options";
import { WorkbenchCreditHint } from "@/components/workbench/credit-hint";
import { BottomPromptComposer, WorkbenchPromptSection, WorkbenchSection } from "@/components/workbench/prompt-composer";
import { WorkbenchSidePanel } from "@/components/workbench/workbench-side-panel";
import { normalizeVideoResolutionValue, videoResolutionOptions, videoSizeForResolution, videoSizeOptions } from "@/components/video-settings-panel";
import { useAutoDLWorkflow } from "@/hooks/use-autodl-workflow";
import { isAutoDLConfig, normalizeAutoDLDuration } from "@/lib/autodl";
import { ARK_SEEDANCE_REFERENCE_LIMITS, boolConfig, isSeedanceVideoConfig, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { COGVIDEOX3_DURATIONS, isCogVideoX3Model, modelKey, normalizeCogVideoX3Duration, supportsVideoAudioGeneration, supportsVideoFrameReferences } from "@/lib/video-model-capabilities";
import { channelProtocolForConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import type { AssetPickerTarget, UpdateAiConfig } from "../history";
import { characterOrientationOptions, isAPIMartKlingMotionControlConfig, isKIEKlingMotionControlConfig, normalizeCharacterOrientation, normalizeKlingV26Ratio, normalizeKlingV26Seconds, normalizeVideoCount, normalizeVideoSeconds, resolveKlingWorkbenchConfig, videoChannelProtocol } from "../history";
import { ReferenceAudioStrip, ReferenceImageStrip, ReferenceVideoStrip } from "./reference-strips";
import { FrameReferenceStrip, GenerationSettings, ReferenceQuickActions } from "./workbench-controls";

const cogVideoX3DurationOptions = COGVIDEOX3_DURATIONS.map((value) => ({ value, label: `${value}s` }));

export function VideoWorkbenchPanel({
    layout,
    currentLayout,
    prompt,
    negativePrompt = "",
    references,
    firstFrame,
    lastFrame,
    videoReferences,
    audioReferences,
    config,
    model,
    canGenerate,
    pendingCount,
    taskCount,
    onTaskCountChange,
    updateConfig,
    openConfigDialog,
    onLayoutChange,
    onPromptChange,
    onNegativePromptChange,
    onOpenPromptLibrary,
    onOpenAssetPicker,
    onPastePrompt,
    onClearPrompt,
    onPasteReferences,
    onPasteFrame,
    onPasteVideoReferences,
    onPasteAudioReferences,
    onUploadReferences,
    onUploadFrame,
    onRemoveFrame,
    onRemoveReference,
    onMoveReference,
    onRemoveVideoReference,
    onMoveVideoReference,
    onRemoveAudioReference,
    onMoveAudioReference,
    onGenerate,
    bottomSettingsCollapsed = true,
    setBottomSettingsCollapsed,
}: {
    layout: WorkbenchLayout;
    currentLayout: WorkbenchLayout;
    prompt: string;
    negativePrompt?: string;
    references: ReferenceImage[];
    firstFrame: ReferenceImage | null;
    lastFrame: ReferenceImage | null;
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    config: AiConfig;
    model: string;
    canGenerate: boolean;
    running: boolean;
    pendingCount: number;
    taskCount: number;
    onTaskCountChange: (value: number) => void;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    onPromptChange: (value: string) => void;
    onNegativePromptChange?: (value: string) => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: (target?: AssetPickerTarget) => void;
    onPastePrompt: () => void;
    onClearPrompt: () => void;
    onPasteReferences: () => void;
    onPasteFrame: (slot: "first" | "last") => void;
    onPasteVideoReferences: () => void;
    onPasteAudioReferences: () => void;
    onUploadReferences: () => void;
    onUploadFrame: (slot: "first" | "last") => void;
    onRemoveFrame: (slot: "first" | "last") => void;
    onRemoveReference: (id: string) => void;
    onMoveReference: (index: number, offset: number) => void;
    onRemoveVideoReference: (id: string) => void;
    onMoveVideoReference: (index: number, offset: number) => void;
    onRemoveAudioReference: (id: string) => void;
    onMoveAudioReference: (index: number, offset: number) => void;
    onGenerate: () => void;
    bottomSettingsCollapsed?: boolean;
    setBottomSettingsCollapsed?: (value: boolean) => void;
}) {
    const frameReferencesEnabled = Boolean(config.videoWorkflowRef) || supportsVideoFrameReferences(model, channelProtocolForConfig({ ...config, model }));
    const referenceLimits = !config.videoWorkflowRef && channelProtocolForConfig({ ...config, model, videoModel: model }) === "ark" && (modelKey(model).includes("seedance-2-5") || modelKey(model).includes("seedance2-5")) ? ARK_SEEDANCE_REFERENCE_LIMITS : SEEDANCE_REFERENCE_LIMITS;
    const autodl = !config.videoWorkflowRef && isAutoDLConfig(config, model);
    const { data: autodlWorkflow } = useAutoDLWorkflow(config, model);
    const cogVideoX3 = !config.videoWorkflowRef && isCogVideoX3Model(model);
    const audioGenerationEnabled = supportsVideoAudioGeneration(model);
    const generateAudio = boolConfig(config.videoGenerateAudio, false);
    const klingBottomConfig = config.videoWorkflowRef ? null : resolveKlingWorkbenchConfig(config, model);
    const klingBottomVariant = klingBottomConfig?.variant || "";
    const klingBottomProvider = klingBottomConfig?.provider || "apimart";
    const klingBottom = Boolean(klingBottomConfig);
    const showAudioSwitch = klingBottom || audioGenerationEnabled;
    const motionControl = !config.videoWorkflowRef && (isAPIMartKlingMotionControlConfig(config, model) || isKIEKlingMotionControlConfig(config, model) || (videoChannelProtocol(config, model) === "tokendance" && modelKey(model) === "kling-3-0"));
    const bottomSettingsGridClass = motionControl
        ? showAudioSwitch ? "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr_0.7fr_auto_auto]" : "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.8fr_0.7fr_auto_auto]"
        : showAudioSwitch ? "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.8fr_0.7fr_auto_auto]" : "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.7fr_auto_auto]";
    const initializedKlingV3BottomSecondsRef = useRef(false);

    useEffect(() => {
        if (klingBottomVariant !== "v3" || initializedKlingV3BottomSecondsRef.current) return;
        initializedKlingV3BottomSecondsRef.current = true;
        const nextSeconds = klingV3DefaultSeconds(config.videoSeconds);
        if (nextSeconds) updateConfig("videoSeconds", nextSeconds);
    }, [config.videoSeconds, klingBottomVariant, updateConfig]);

    const [settingsOpen, setSettingsOpen] = useState(false);
    useEffect(() => {
        const media = window.matchMedia("(min-width: 1024px)");
        const sync = () => setSettingsOpen(media.matches);
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, []);

    if (layout === "bottom") {
        return (
            <BottomPromptComposer
                prompt={prompt}
                placeholder="描述镜头运动、主体动作、场景氛围和画面风格"
                onPromptChange={onPromptChange}
                canGenerate={canGenerate}
                pendingCount={pendingCount}
                settingsOpen={!bottomSettingsCollapsed}
                onToggleSettings={() => setBottomSettingsCollapsed?.(!bottomSettingsCollapsed)}
                onClearPrompt={onClearPrompt}
                onOpenPromptLibrary={onOpenPromptLibrary}
                onOpenAssetPicker={() => onOpenAssetPicker()}
                onSwitchToSide={() => onLayoutChange("side")}
                onGenerate={onGenerate}
                hint={<WorkbenchCreditHint config={config} model={model} mode="video" seconds={config.videoSeconds} resolution={config.vquality} />}
            >
                        {klingBottom && klingBottomProvider !== "kie" ? (
                            <Input.TextArea
                                value={negativePrompt}
                                onChange={(event) => onNegativePromptChange?.(event.target.value)}
                                placeholder="负面提示词"
                                autoSize={{ minRows: 1, maxRows: 3 }}
                                className="rounded-lg"
                            />
                        ) : null}
                        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${bottomSettingsGridClass} ${bottomSettingsCollapsed ? "hidden lg:grid" : "grid"}`}>
                            <label className="grid gap-1 text-xs text-muted-foreground">
                                模型
                                <ModelPicker config={config} value={model} channelId={config.videoChannelId} workflowRef={config.videoWorkflowRef} onWorkflowChange={(value) => updateConfig("videoWorkflowRef", value)} onChange={(value, channelId) => { updateConfig("videoModel", value); if (channelId) updateConfig("videoChannelId", channelId); }} capability="video" className="canvas-compact-control !h-11 !rounded-xl" onMissingConfig={() => openConfigDialog(false)} fullWidth />
                            </label>
                            {klingBottom ? (
                                <KlingV26BottomSettings config={config} updateConfig={updateConfig} generateAudio={generateAudio} isKlingV3={klingBottomVariant === "v3"} />
                            ) : (
                                <>
                                    <QuickSelect label="清晰度" value={normalizeVideoResolutionValue(config.vquality)} options={isSeedanceVideoConfig(config) ? videoResolutionOptions.slice(0, 3) : videoResolutionOptions} onChange={(value) => { updateConfig("vquality", value); updateConfig("size", videoSizeForResolution(value, config.size)); }} />
                                    <QuickSelect label="尺寸" value={videoSizeForResolution(config.vquality, config.size)} options={videoSizeOptions(config.vquality)} onChange={(value) => updateConfig("size", value)} />
                                    {cogVideoX3 ? <QuickSelect label="秒数" value={normalizeCogVideoX3Duration(config.videoSeconds)} options={cogVideoX3DurationOptions} onChange={(value) => updateConfig("videoSeconds", value)} /> : <QuickNumber label="秒数" value={autodl ? config.videoSeconds ?? "" : normalizeVideoSeconds(config.videoSeconds)} min={1} max={30} onChange={(value) => updateConfig("videoSeconds", value)} clampOnChange={!autodl} normalizeOnBlur={autodl ? (value) => normalizeAutoDLDuration(value, autodlWorkflow) : undefined} />}
                                    {audioGenerationEnabled ? <QuickSwitch label="生成音频" checked={generateAudio} onChange={(checked) => updateConfig("videoGenerateAudio", String(checked))} /> : null}
                                    {motionControl ? <QuickSelect label="角色朝向参考" value={normalizeCharacterOrientation(config.videoCharacterOrientation)} options={characterOrientationOptions} onChange={(value) => updateConfig("videoCharacterOrientation", value)} /> : null}
                                </>
                            )}
                            <QuickNumber label="任务" value={String(taskCount)} min={1} max={6} onChange={(value) => onTaskCountChange(normalizeVideoCount(value))} />
                            <ReferenceQuickActions imageCount={references.length} videoCount={videoReferences.length} audioCount={audioReferences.length} onPasteReferences={onPasteReferences} onUploadReferences={onUploadReferences} />
                            <Button type="primary" className="hidden h-11 min-w-28 items-center justify-center gap-1.5 rounded-xl lg:flex" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                                {pendingCount ? `${pendingCount} 生成中` : "开始创作"}
                            </Button>
                        </div>
                        {firstFrame || lastFrame || references.length || videoReferences.length || audioReferences.length ? (
                            <div className="grid gap-2">
                                {firstFrame || lastFrame ? <FrameReferenceStrip firstFrame={firstFrame} lastFrame={lastFrame} compact onUploadFrame={onUploadFrame} onRemoveFrame={onRemoveFrame} /> : null}
                                {references.length ? <ReferenceImageStrip references={references} compact onRemoveReference={onRemoveReference} onMoveReference={onMoveReference} /> : null}
                                {videoReferences.length ? <ReferenceVideoStrip references={videoReferences} compact onRemoveReference={onRemoveVideoReference} onMoveReference={onMoveVideoReference} /> : null}
                                {audioReferences.length ? <ReferenceAudioStrip references={audioReferences} compact onRemoveReference={onRemoveAudioReference} onMoveReference={onMoveAudioReference} /> : null}
                            </div>
                        ) : null}
            </BottomPromptComposer>
        );
    }

    return (
        <WorkbenchSidePanel
            title="视频创作台"
            currentLayout={currentLayout}
            onLayoutChange={onLayoutChange}
            canGenerate={canGenerate}
            onGenerate={onGenerate}
            generateLabel={pendingCount ? `生成中（${pendingCount}）` : "开始生成"}
            generateHint={<WorkbenchCreditHint config={config} model={model} mode="video" seconds={config.videoSeconds} resolution={config.vquality} />}
        >
            <WorkbenchPromptSection prompt={prompt} placeholder="描述镜头运动、主体动作、场景氛围和画面风格" onPromptChange={onPromptChange} onPastePrompt={onPastePrompt} onClearPrompt={onClearPrompt} onOpenPromptLibrary={onOpenPromptLibrary} onOpenAssetPicker={() => onOpenAssetPicker()} />
            {frameReferencesEnabled ? (
                <WorkbenchSection title="首尾帧" count={[firstFrame, lastFrame].filter(Boolean).length}>
                    <FrameReferenceStrip firstFrame={firstFrame} lastFrame={lastFrame} onPasteFrame={onPasteFrame} onUploadFrame={onUploadFrame} onOpenAssetPicker={onOpenAssetPicker} onRemoveFrame={onRemoveFrame} />
                </WorkbenchSection>
            ) : null}
            <WorkbenchSection title="参考图" count={references.length}>
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteReferences}>剪切板</Button>
                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker("image")}>从素材库选择</Button>
                    </div>
                    <ReferenceImageStrip references={references} maxCount={referenceLimits.images} onRemoveReference={onRemoveReference} onMoveReference={onMoveReference} />
                </div>
            </WorkbenchSection>
            <WorkbenchSection title="参考视频" count={videoReferences.length} collapsible defaultOpen={videoReferences.length > 0}>
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteVideoReferences}>剪贴板</Button>
                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker("video")}>从素材库选择</Button>
                    </div>
                    <ReferenceVideoStrip references={videoReferences} maxCount={referenceLimits.videos} onRemoveReference={onRemoveVideoReference} onMoveReference={onMoveVideoReference} />
                </div>
            </WorkbenchSection>
            <WorkbenchSection title="参考音频" count={audioReferences.length} collapsible defaultOpen={audioReferences.length > 0}>
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteAudioReferences}>剪贴板</Button>
                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker("audio")}>从素材库选择</Button>
                    </div>
                    <ReferenceAudioStrip references={audioReferences} maxCount={referenceLimits.audios} onRemoveReference={onRemoveAudioReference} onMoveReference={onMoveAudioReference} />
                </div>
            </WorkbenchSection>
            {motionControl ? <CharacterOrientationSetting value={config.videoCharacterOrientation} onChange={(value) => updateConfig("videoCharacterOrientation", value)} /> : null}
            <WorkbenchSection title="视频参数" collapsible defaultOpen={settingsOpen} key={settingsOpen ? "settings-open" : "settings-closed"}>
                <GenerationSettings config={config} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
            </WorkbenchSection>
            <WorkbenchSection title="任务数量">
                <TaskCountControl value={taskCount} onChange={onTaskCountChange} />
            </WorkbenchSection>
        </WorkbenchSidePanel>
    );
}

function TaskCountControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
    return (
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 text-xs text-muted-foreground">
            <span className="shrink-0">任务</span>
            <input className="h-7 w-16 rounded-lg border border-border/70 bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-acid/50" type="number" min={1} max={6} value={value} onChange={(event) => onChange(normalizeVideoCount(event.target.value))} />
        </label>
    );
}

function CharacterOrientationSetting({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const current = normalizeCharacterOrientation(value);
    return (
        <WorkbenchSection title="角色朝向参考">
            <div className="grid grid-cols-2 gap-2.5">
                {characterOrientationOptions.map((item) => (
                    <button key={item.value} type="button" className={optionPillClass(current === item.value)} onClick={() => onChange(item.value)}>
                        {item.label}
                    </button>
                ))}
            </div>
        </WorkbenchSection>
    );
}

function optionPillClass(active: boolean) {
    return [
        "h-9 rounded-full border bg-transparent px-2 text-sm font-medium transition-colors duration-200",
        active ? "border-acid/60 bg-acid/10 text-foreground" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
    ].join(" ");
}

function KlingV26BottomSettings({ config, updateConfig, generateAudio, isKlingV3 }: { config: AiConfig; updateConfig: UpdateAiConfig; generateAudio: boolean; isKlingV3: boolean }) {
    const mode = isKlingV3 && config.videoMode === "4k" ? "4k" : config.videoMode === "pro" ? "pro" : "std";
    return (
        <>
            <QuickSelect label="模式选择" value={mode} options={klingModeOptions(isKlingV3)} onChange={(value) => updateConfig("videoMode", value)} />
            <QuickSelect label="尺寸" value={normalizeKlingV26Ratio(config.size)} options={klingRatioOptions} onChange={(value) => updateConfig("size", value === "1:1" ? "1024x1024" : value)} />
            {isKlingV3 ? (
                <QuickNumber label="秒数" value={String(config.videoSeconds ?? "")} min={klingV3SecondsRange.min} max={klingV3SecondsRange.max} onChange={(value) => updateConfig("videoSeconds", value)} />
            ) : (
                <QuickSelect label="秒数" value={normalizeKlingV26Seconds(config.videoSeconds)} options={klingSecondsOptions(false)} onChange={(value) => updateConfig("videoSeconds", value)} />
            )}
            <QuickSwitch label="生成音频" checked={generateAudio} onChange={(checked) => updateConfig("videoGenerateAudio", String(checked))} />
        </>
    );
}

function QuickSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="grid gap-1 text-xs text-muted-foreground">
            {label}
            <span className="flex h-11 items-center justify-center rounded-xl border border-border/70 bg-background px-3">
                <Switch size="small" checked={checked} onChange={onChange} />
            </span>
        </label>
    );
}