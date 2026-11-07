"use client";

import { Button } from "antd";
import { ClipboardPaste, FolderPlus, Trash2, Upload } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { VideoSettingsPanel } from "@/components/video-settings-panel";
import { WorkbenchSection } from "@/components/workbench/prompt-composer";
import { canvasThemes } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ReferenceImage } from "@/types/image";

import type { AssetPickerTarget, UpdateAiConfig } from "../history";

export function FrameReferenceStrip({ firstFrame, lastFrame, compact = false, onPasteFrame, onUploadFrame, onOpenAssetPicker, onRemoveFrame }: { firstFrame: ReferenceImage | null; lastFrame: ReferenceImage | null; compact?: boolean; onPasteFrame?: (slot: "first" | "last") => void; onUploadFrame: (slot: "first" | "last") => void; onOpenAssetPicker?: (target?: AssetPickerTarget) => void; onRemoveFrame: (slot: "first" | "last") => void }) {
    if (!compact) {
        return (
            <div className="space-y-2">
                <FrameReferenceRow label="首帧" slot="first" reference={firstFrame} onPasteFrame={onPasteFrame} onUploadFrame={onUploadFrame} onOpenAssetPicker={onOpenAssetPicker} onRemoveFrame={onRemoveFrame} />
                <FrameReferenceRow label="尾帧" slot="last" reference={lastFrame} onPasteFrame={onPasteFrame} onUploadFrame={onUploadFrame} onOpenAssetPicker={onOpenAssetPicker} onRemoveFrame={onRemoveFrame} />
            </div>
        );
    }
    return (
        <div className={`grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-2 ${compact ? "min-h-14" : "min-h-24"}`}>
            <FrameReferenceSlot label="首帧" reference={firstFrame} compact={compact} onUpload={() => onUploadFrame("first")} onRemove={() => onRemoveFrame("first")} />
            <FrameReferenceSlot label="尾帧" reference={lastFrame} compact={compact} onUpload={() => onUploadFrame("last")} onRemove={() => onRemoveFrame("last")} />
        </div>
    );
}

function FrameReferenceRow({ label, slot, reference, onPasteFrame, onUploadFrame, onOpenAssetPicker, onRemoveFrame }: { label: string; slot: "first" | "last"; reference: ReferenceImage | null; onPasteFrame?: (slot: "first" | "last") => void; onUploadFrame: (slot: "first" | "last") => void; onOpenAssetPicker?: (target?: AssetPickerTarget) => void; onRemoveFrame: (slot: "first" | "last") => void }) {
    return (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <div className="flex flex-wrap gap-1">
                    <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => onPasteFrame?.(slot)}>读取剪贴板</Button>
                    <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => onUploadFrame(slot)}>上传</Button>
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker?.(slot === "first" ? "firstFrame" : "lastFrame")}>从素材库选择</Button>
                </div>
            </div>
            <FrameReferenceSlot label={label} reference={reference} compact={false} onUpload={() => onUploadFrame(slot)} onRemove={() => onRemoveFrame(slot)} />
        </div>
    );
}

function FrameReferenceSlot({ label, reference, compact, onUpload, onRemove }: { label: string; reference: ReferenceImage | null; compact: boolean; onUpload: () => void; onRemove: () => void }) {
    return (
        <div className={`group relative flex min-w-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-xs text-muted-foreground ${compact ? "h-12" : "h-20"}`}>
            {reference ? (
                <>
                    <img loading="lazy" decoding="async" src={reference.dataUrl} alt={reference.name} className="size-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{label}</span>
                    <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">{reference.name}</span>
                    <button type="button" className="absolute right-1 top-1 flex size-6 items-center justify-center rounded bg-black/60 text-white shadow-sm" onClick={onRemove} aria-label={`移除${label}`}>
                        <Trash2 className="size-3.5" />
                    </button>
                </>
            ) : (
                <button type="button" className="flex size-full items-center justify-center gap-1" onClick={onUpload}>
                    <Upload className="size-3.5" />
                    上传{label}
                </button>
            )}
        </div>
    );
}

export function ReferenceQuickActions({ imageCount, videoCount, audioCount, onPasteReferences, onUploadReferences }: { imageCount: number; videoCount: number; audioCount: number; onPasteReferences: () => void; onUploadReferences: () => void }) {
    return (
        <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-background px-2">
            {imageCount || videoCount || audioCount ? <span className="min-w-7 text-xs text-muted-foreground">{imageCount + videoCount + audioCount} 个</span> : null}
            <Button title="读取剪切板" aria-label="读取剪切板" size="small" type="text" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteReferences} />
            <Button title="上传参考素材" aria-label="上传参考素材" size="small" type="text" icon={<Upload className="size-3.5" />} onClick={onUploadReferences} />
        </div>
    );
}

export function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-3">
            <WorkbenchSection title="模型">
                <ModelPicker config={config} value={model} channelId={config.videoChannelId} workflowRef={config.videoWorkflowRef} onWorkflowChange={(value) => updateConfig("videoWorkflowRef", value)} onChange={(value, channelId) => { updateConfig("videoModel", value); if (channelId) updateConfig("videoChannelId", channelId); }} capability="video" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </WorkbenchSection>
            <VideoSettingsPanel config={config} modelName={model} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-3" />
        </div>
    );
}
