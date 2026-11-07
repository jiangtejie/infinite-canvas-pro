"use client";

import { useState } from "react";
import { Button, Segmented } from "antd";
import { ClipboardPaste, FolderPlus, Sparkles, Upload } from "lucide-react";

import { imageSizeOptions } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { QuickNumber, QuickSelect } from "@/components/workbench-controls";
import { WorkbenchSidePanel } from "@/components/workbench/workbench-side-panel";
import { BottomPromptComposer, WorkbenchPromptSection, WorkbenchSection } from "@/components/workbench/prompt-composer";
import type { WorkbenchLayout } from "@/components/workbench-header";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import type { UpdateAiConfig } from "../history";
import { GenerationSettings, ReferenceQuickActions, ReferenceStrip } from "./workbench-controls";

const quickQualityOptions = [
    { value: "auto", label: "自动" },
    { value: "high", label: "高 · 4K" },
    { value: "medium", label: "中 · 2K" },
    { value: "low", label: "低 · 1K" },
];

export function ImageWorkbenchPanel({
    layout,
    currentLayout,
    prompt,
    references,
    config,
    model,
    canGenerate,
    pendingCount,
    updateConfig,
    openConfigDialog,
    onLayoutChange,
    onPromptChange,
    onOpenPromptLibrary,
    onOpenAssetPicker,
    onPastePrompt,
    onClearPrompt,
    onPasteReferences,
    onUploadReferences,
    onRemoveReference,
    onGenerate,
    uploadingCount,
}: {
    layout: WorkbenchLayout;
    currentLayout: WorkbenchLayout;
    prompt: string;
    references: ReferenceImage[];
    config: AiConfig;
    model: string;
    canGenerate: boolean;
    pendingCount: number;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    onPromptChange: (value: string) => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
    onPastePrompt: () => void;
    onClearPrompt: () => void;
    onPasteReferences: () => void;
    onUploadReferences: () => void;
    onRemoveReference: (id: string) => void;
    onGenerate: () => void;
    uploadingCount: number;
}) {
    const [bottomSettingsCollapsed, setBottomSettingsCollapsed] = useState(true);

    if (layout === "bottom") {
        return (
            <BottomPromptComposer
                prompt={prompt}
                placeholder="描述你想生成的图片，可输入 @ 来指定参考图..."
                onPromptChange={onPromptChange}
                canGenerate={canGenerate}
                pendingCount={pendingCount}
                settingsOpen={!bottomSettingsCollapsed}
                onToggleSettings={() => setBottomSettingsCollapsed(!bottomSettingsCollapsed)}
                onClearPrompt={onClearPrompt}
                onOpenPromptLibrary={onOpenPromptLibrary}
                onOpenAssetPicker={onOpenAssetPicker}
                onSwitchToSide={() => onLayoutChange("side")}
                onGenerate={onGenerate}
            >
                <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[1.3fr_1.1fr_0.9fr_0.9fr_0.9fr_0.85fr_0.8fr_0.8fr_auto_auto] ${bottomSettingsCollapsed ? "hidden lg:grid" : "grid"}`}>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                        模型
                        <ModelPicker
                            config={config}
                            value={model}
                            capability="image"
                            channelId={config.imageChannelId}
                            workflowRef={config.imageWorkflowRef}
                            onWorkflowChange={(value) => updateConfig("imageWorkflowRef", value)}
                            onChange={(value, channelId) => {
                                updateConfig("imageModel", value);
                                if (channelId) updateConfig("imageChannelId", channelId);
                            }}
                            className="canvas-compact-control !h-11 !rounded-xl"
                            onMissingConfig={() => openConfigDialog(false)}
                            fullWidth
                        />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                        接口模式
                        <div className="flex h-11 items-center rounded-xl border border-border bg-background px-2.5">
                            <Segmented
                                size="small"
                                className="canvas-config-mode !rounded-md !p-0.5 w-full"
                                value={config.apiMode}
                                onChange={(value) => updateConfig("apiMode", value as "images" | "responses" | "chat")}
                                options={[
                                    { value: "images", label: "images" },
                                    { value: "responses", label: "responses" },
                                    { value: "chat", label: "chat" },
                                ]}
                            />
                        </div>
                    </label>
                    <QuickSelect label="尺寸" value={config.size || "auto"} options={imageSizeOptions} onChange={(value) => updateConfig("size", value)} />
                    <QuickSelect label="质量" value={config.quality || "auto"} options={quickQualityOptions} onChange={(value) => updateConfig("quality", value)} />
                    <QuickNumber label="数量" value={config.count || "1"} min={1} max={10} onChange={(value) => updateConfig("count", value)} />
                    <ReferenceQuickActions references={references} onUploadReferences={onUploadReferences} />
                    <Button type="primary" className="h-11 min-w-28 rounded-xl hidden lg:inline-flex" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                        {pendingCount ? `${pendingCount} 生成中` : "开始创作"}
                    </Button>
                </div>
                {references.length || uploadingCount > 0 ? <ReferenceStrip references={references} compact onRemoveReference={onRemoveReference} uploadingCount={uploadingCount} /> : null}
            </BottomPromptComposer>
        );
    }

    return (
        <WorkbenchSidePanel
            title="生图工作台"
            currentLayout={currentLayout}
            onLayoutChange={onLayoutChange}
            canGenerate={canGenerate}
            onGenerate={onGenerate}
            generateLabel={pendingCount ? `继续提交（${pendingCount} 个生成中）` : "开始生成"}
        >
            <WorkbenchPromptSection prompt={prompt} placeholder="描述画面主体、风格、构图、光线和用途" onPromptChange={onPromptChange} onPastePrompt={onPastePrompt} onClearPrompt={onClearPrompt} onOpenPromptLibrary={onOpenPromptLibrary} onOpenAssetPicker={onOpenAssetPicker} />

            <WorkbenchSection title="参考图" count={references.length}>
                <div className="flex flex-wrap gap-1">
                    <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteReferences}>剪切板</Button>
                    <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={onOpenAssetPicker}>从素材库选择</Button>
                </div>
                <ReferenceStrip references={references} onRemoveReference={onRemoveReference} uploadingCount={uploadingCount} />
            </WorkbenchSection>

            <div className="space-y-3">
                <GenerationSettings config={config} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
            </div>
        </WorkbenchSidePanel>
    );
}
