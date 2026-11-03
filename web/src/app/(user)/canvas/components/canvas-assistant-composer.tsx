"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Brain, FolderOpen, ImageIcon, Menu, Navigation, Square, Upload, Video } from "lucide-react";
import { Button } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasAgentConfig, type CanvasAgentSkillSelection, type CanvasAssistantReference } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { CanvasAgentSkillPopover } from "./canvas-agent-skill-popover";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";

export type CanvasAssistantComposerProps = {
    prompt: string;
    isRunning: boolean;
    codexControls?: ReactNode;
    references: CanvasAssistantReference[];
    availableReferences?: CanvasResourceReference[];
    pendingReferences?: CanvasResourceReference[];
    selectedSkills?: CanvasAgentSkillSelection[];
    agentConfig: CanvasAgentConfig;
    onAgentConfigChange: (patch: Partial<CanvasAgentConfig>) => void;
    onPromptChange: (prompt: string) => void;
    onReferenceIdsChange: (ids: string[]) => void;
    onSkillSelect?: (skill: CanvasAgentSkillSelection) => void;
    onSkillRemove?: (id: string, source: CanvasAgentSkillSelection["source"]) => void;
    onSubmit: (prompt?: string, referenceIds?: string[]) => void | Promise<void>;
    onStop?: () => void;
    onOpenUpload: () => void;
    onOpenAssets: () => void;
    onPasteImage: (file: File) => void;
};

export function CanvasAssistantComposer({
    prompt,
    isRunning,
    codexControls,
    references,
    availableReferences,
    pendingReferences,
    selectedSkills,
    agentConfig,
    onAgentConfigChange,
    onPromptChange,
    onReferenceIdsChange,
    onSkillSelect,
    onSkillRemove,
    onSubmit,
    onStop,
    onOpenUpload,
    onOpenAssets,
    onPasteImage,
}: CanvasAssistantComposerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [assetMenuOpen, setAssetMenuOpen] = useState(false);
    const assetMenuRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [openDown, setOpenDown] = useState(false);
    const canSend = isRunning || Boolean(prompt.trim());

    useEffect(() => {
        const update = () => {
            const rect = toolbarRef.current?.getBoundingClientRect();
            if (!rect) return;
            setOpenDown(window.innerHeight - rect.bottom > 280);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    useEffect(() => {
        if (!assetMenuOpen) return;
        const closeOnPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && assetMenuRef.current?.contains(target)) return;
            setAssetMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setAssetMenuOpen(false);
        };
        document.addEventListener("pointerdown", closeOnPointerDown, true);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnPointerDown, true);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [assetMenuOpen]);
    const effectiveConfig = useEffectiveConfig();
    const reasoningEnabled = agentConfig.textReasoningEnabled === true;
    const imageConfig = useMemo(() => ({ ...effectiveConfig, quality: agentConfig.imageQuality, size: agentConfig.imageSize }), [agentConfig.imageQuality, agentConfig.imageSize, effectiveConfig]);
    const videoConfig = useMemo(() => ({ ...effectiveConfig, activeChannelId: effectiveConfig.videoChannelId || effectiveConfig.activeChannelId, vquality: agentConfig.videoQuality, size: agentConfig.videoSize }), [agentConfig.videoQuality, agentConfig.videoSize, effectiveConfig]);
    const promptReferences = useMemo(() => {
        const seen = new Set<string>();
        return [...(availableReferences || []), ...references.map(assistantToPromptReference)].filter((reference) => {
            if (seen.has(reference.nodeId)) return false;
            seen.add(reference.nodeId);
            return true;
        });
    }, [availableReferences, references]);
    const submit = (nextPrompt = prompt, referenceIds = references.map((reference) => reference.id)) => onSubmit(nextPrompt, referenceIds);

    return (
        <div className="px-2 pb-2" onWheelCapture={(event) => event.stopPropagation()}>
            <div className="rounded-2xl border px-3 pb-3 pt-3" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}>
                <CanvasPromptChipInput
                    value={prompt}
                    references={promptReferences}
                    pendingReferences={pendingReferences}
                    skills={selectedSkills}
                    onSkillRemove={onSkillRemove}
                    onChange={onPromptChange}
                    onReferenceIdsChange={onReferenceIdsChange}
                    onPasteImage={onPasteImage}
                    onSubmit={submit}
                    className="thin-scrollbar min-h-16 max-h-[220px] w-full px-1 py-0 text-sm leading-5"
                    style={{ color: theme.node.text }}
                    placeholder="描述创作目标，或让我继续操作画布"
                    placeholderClassName="!left-1 !top-0"
                />
                <div ref={toolbarRef} className="@container mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                        <div ref={assetMenuRef} className="relative">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.text, background: assetMenuOpen ? theme.toolbar.activeBg : undefined }} icon={<Menu className="size-4" />} aria-label="添加素材" aria-haspopup="menu" aria-expanded={assetMenuOpen} onClick={() => {
                                const rect = toolbarRef.current?.getBoundingClientRect();
                                setOpenDown(rect ? window.innerHeight - rect.bottom > 200 : false);
                                setAssetMenuOpen((value) => !value);
                            }} />
                            {assetMenuOpen ? (
                                <div role="menu" className={`absolute left-0 z-50 w-40 overflow-hidden rounded-xl border p-1 ${openDown ? "top-full mt-2" : "bottom-full mb-2"}`} style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, boxShadow: "0 12px 32px rgba(0,0,0,0.28)" }}>
                                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/5" style={{ color: theme.node.text }} onClick={() => { setAssetMenuOpen(false); onOpenUpload(); }}>
                                        <Upload className="size-4 shrink-0 opacity-70" />
                                        上传文件
                                    </button>
                                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/5" style={{ color: theme.node.text }} onClick={() => { setAssetMenuOpen(false); onOpenAssets(); }}>
                                        <FolderOpen className="size-4 shrink-0 opacity-70" />
                                        我的素材
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        {onSkillSelect && onSkillRemove ? <CanvasAgentSkillPopover selectedSkills={selectedSkills} onSelect={onSkillSelect} onDeleteSelected={onSkillRemove} /> : null}
                        {codexControls}
                        <CanvasImageSettingsPopover
                            config={imageConfig}
                            placement="bottomLeft"
                            showCount={false}
                            buttonIcon={<ImageIcon className="size-3.5" />}
                            buttonClassName="!h-8 !max-w-[116px] !justify-start !rounded-full !px-2.5"
                            onConfigChange={(key, value) => {
                                if (key === "quality") onAgentConfigChange({ imageQuality: value });
                                else if (key === "size") onAgentConfigChange({ imageSize: value });
                            }}
                        />
                        <CanvasVideoSettingsPopover
                            config={videoConfig}
                            placement="bottomLeft"
                            visualOnly
                            buttonIcon={<Video className="size-3.5" />}
                            buttonClassName="!h-8 !max-w-[124px] !justify-start !rounded-full !px-2.5"
                            onConfigChange={(key, value) => {
                                if (key === "vquality") onAgentConfigChange({ videoQuality: value });
                                else if (key === "size") onAgentConfigChange({ videoSize: value });
                            }}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {!codexControls ? (
                        <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-full border transition-colors hover:opacity-90 active:scale-95"
                            style={{
                                borderColor: reasoningEnabled ? "color-mix(in oklab, var(--acid) 45%, transparent)" : "color-mix(in oklab, var(--acid) 22%, transparent)",
                                backgroundColor: reasoningEnabled ? "color-mix(in oklab, var(--acid) 12%, transparent)" : "transparent",
                                color: reasoningEnabled ? "var(--acid)" : "color-mix(in oklab, var(--acid) 55%, transparent)",
                                boxShadow: reasoningEnabled ? "0 0 16px -7px var(--acid)" : "none",
                            }}
                            title={reasoningEnabled ? "推理已开启" : "推理已关闭"}
                            aria-label={reasoningEnabled ? "关闭推理" : "开启推理"}
                            aria-pressed={reasoningEnabled}
                            onClick={() => onAgentConfigChange({ textReasoningEnabled: !reasoningEnabled })}
                        >
                            <Brain className="size-4" />
                        </button>
                        ) : null}
                        <button
                            type="button"
                            className="grid size-10 shrink-0 place-items-center rounded-full border transition-colors hover:opacity-90 active:scale-95"
                            style={{
                                borderColor: canSend ? "transparent" : "color-mix(in oklab, var(--acid) 28%, transparent)",
                                backgroundColor: canSend ? "var(--acid)" : "color-mix(in oklab, var(--acid) 7%, transparent)",
                                color: canSend ? "#0b0b09" : "color-mix(in oklab, var(--acid) 55%, transparent)",
                                boxShadow: canSend ? "0 0 22px -6px var(--acid)" : "none",
                            }}
                            disabled={!canSend}
                            onClick={() => (isRunning ? onStop?.() : void submit())}
                            aria-label={isRunning ? "停止" : "发送"}
                        >
                            {isRunning ? <Square className="size-3.5 fill-current" /> : <Navigation className="size-4 fill-current" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function assistantToPromptReference(reference: CanvasAssistantReference): CanvasResourceReference {
    const kind = reference.type === CanvasNodeType.Video ? "video" : reference.type === CanvasNodeType.Audio ? "audio" : reference.type === CanvasNodeType.Text ? "text" : "image";
    return { id: reference.id, nodeId: reference.id, kind, label: reference.label || reference.title, title: reference.title, previewUrl: reference.dataUrl || reference.url, text: reference.text, active: true };
}
