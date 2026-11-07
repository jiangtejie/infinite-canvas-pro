"use client";

import { Button, Image, Segmented } from "antd";
import { LoaderCircle, Trash2, Upload } from "lucide-react";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { ReferenceStripShell } from "@/components/workbench/reference-strip";
import { WorkbenchSection } from "@/components/workbench/prompt-composer";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

import type { ReferenceImage } from "@/types/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { UpdateAiConfig } from "../history";

export function ReferenceStrip({ references, compact = false, className = "", onRemoveReference, uploadingCount = 0 }: { references: ReferenceImage[]; compact?: boolean; className?: string; onRemoveReference: (id: string) => void; uploadingCount?: number }) {
    return (
        <ReferenceStripShell compact={compact} className={className}>
            {references.map((item) => (
                <div key={item.id} className={`${compact ? "size-12" : "size-20"} group relative shrink-0 overflow-hidden rounded-md border border-border`}>
                    <Image
                        src={item.dataUrl || undefined}
                        alt={item.name}
                        className="size-full object-cover cursor-pointer"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        preview={{
                            mask: "点击预览",
                        }}
                    />
                    <button type="button" className="absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded bg-black/60 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" onClick={() => onRemoveReference(item.id)} aria-label="移除参考图">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {Array.from({ length: uploadingCount }).map((_, i) => (
                <div key={`loading-${i}`} className={`${compact ? "size-12" : "size-20"} shrink-0 flex items-center justify-center rounded-md border border-border bg-muted/50`}>
                    <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
                </div>
            ))}
            {!references.length && !uploadingCount ? <div className="flex min-w-full items-center justify-center text-sm text-muted-foreground">暂无参考图</div> : null}
        </ReferenceStripShell>
    );
}

export function ReferenceQuickActions({ references, onUploadReferences }: { references: ReferenceImage[]; onUploadReferences: () => void }) {
    return (
        <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-background px-2">
            {references[0] ? <img loading="lazy" decoding="async" src={references[0].dataUrl || undefined} alt={references[0].name} className="size-7 rounded object-cover" /> : null}
            {references.length ? <span className="min-w-7 text-xs text-muted-foreground">{references.length} 张</span> : null}
            <Button size="small" type="text" icon={<Upload className="size-3.5" />} onClick={onUploadReferences} />
        </div>
    );
}

export function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-4">
            <WorkbenchSection title="模型">
                <ModelPicker config={config} value={model} capability="image" channelId={config.imageChannelId} workflowRef={config.imageWorkflowRef} onWorkflowChange={(value) => updateConfig("imageWorkflowRef", value)} onChange={(value, channelId) => { updateConfig("imageModel", value); if (channelId) updateConfig("imageChannelId", channelId); }} fullWidth onMissingConfig={() => openConfigDialog(false)} />
                <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">接口模式</div>
                    <Segmented
                        size="small"
                        className="canvas-config-mode !rounded-md !p-0.5"
                        value={config.apiMode}
                        onChange={(value) => updateConfig("apiMode", value as "images" | "responses" | "chat")}
                        options={[
                            { value: "images", label: "images" },
                            { value: "responses", label: "responses" },
                            { value: "chat", label: "chat" },
                        ]}
                    />
                </div>
            </WorkbenchSection>
            <WorkbenchSection title="生成参数">
                <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-3" maxCount={10} />
            </WorkbenchSection>
        </div>
    );
}
