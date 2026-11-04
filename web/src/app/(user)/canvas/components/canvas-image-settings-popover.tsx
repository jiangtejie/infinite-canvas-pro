"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button, Input } from "antd";

import { ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { isKIESeedreamLayerDecompositionModel } from "@/lib/kie-models";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
    showSize?: boolean;
    showCount?: boolean;
    buttonIcon?: ReactNode;
    negativePrompt?: string;
    onNegativePromptChange?: (value: string) => void;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft", showSize = true, showCount = true, buttonIcon, negativePrompt, onNegativePromptChange }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const layerDecomposition = isKIESeedreamLayerDecompositionModel(config.model);
    const effectiveShowSize = showSize && !layerDecomposition;
    const effectiveShowCount = showCount && !layerDecomposition;
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
            onOpenChange?.(false);
        };

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (document.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")) return;
            event.preventDefault();
            setOpen(false);
            onOpenChange?.(false);
            buttonRef.current?.querySelector("button")?.focus({ preventScroll: true });
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [onOpenChange, open]);

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} onConfigChange={onConfigChange} showSize={effectiveShowSize} showCount={effectiveShowCount} negativePrompt={negativePrompt} onNegativePromptChange={onNegativePromptChange} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"} style={{ background: theme.node.fill, color: theme.node.text }} icon={buttonIcon || <Settings2 className="size-3.5" />} onClick={() => updateOpen(!open)}>
                    <span className="truncate">
                        {effectiveShowSize ? (
                            <>
                                {imageQualityLabel(quality)} · {imageSizeLabel(activeSize)}
                                {effectiveShowCount ? <> · {count} 张</> : null}
                            </>
                        ) : (
                            <>
                                {imageQualityLabel(quality)}
                                {effectiveShowCount ? <> · {count} 张</> : null}
                            </>
                        )}
                    </span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
    showSize,
    showCount,
    negativePrompt,
    onNegativePromptChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    showSize: boolean;
    showCount: boolean;
    negativePrompt?: string;
    onNegativePromptChange?: (value: string) => void;
}) {
    const width = 356;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const spaceAbove = buttonRect.top - gap - margin;
    const spaceBelow = window.innerHeight - buttonRect.bottom - gap - margin;
    const preferTop = placement?.startsWith("top");
    const topPlacement = preferTop ? !(spaceAbove < 260 && spaceBelow > spaceAbove) : spaceBelow < 260 && spaceAbove > spaceBelow;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        border: "1px solid " + theme.toolbar.border,
        borderRadius: 16,
        boxShadow: "inset 0 1px 0 var(--glass-highlight), 0 32px 72px -40px rgba(0, 0, 0, 0.85)",
        padding: 14,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover thin-scrollbar"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {onNegativePromptChange ? (
                <div className="mb-3 grid gap-1.5 border-b pb-3" style={{ borderColor: theme.toolbar.border }}>
                    <span className="text-xs font-medium" style={{ color: theme.node.muted }}>负面提示词</span>
                    <Input.TextArea
                        value={negativePrompt || ""}
                        placeholder="不希望出现的内容，OpenAI 生图会以「Avoid: …」追加到提示词末尾"
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        className="rounded-xl placeholder:!text-[var(--canvas-placeholder)] placeholder:!opacity-55"
                        style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text, "--canvas-placeholder": theme.node.placeholder } as CSSProperties}
                        onMouseDown={(event) => event.stopPropagation()}
                        onChange={(event) => onNegativePromptChange(event.target.value)}
                    />
                </div>
            ) : null}
            <ImageSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} className="space-y-2.5" showSize={showSize} showCount={showCount} />
        </div>,
        document.body,
    );
}
