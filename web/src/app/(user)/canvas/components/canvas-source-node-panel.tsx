"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button, Input, theme as antdTheme } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";

export type CanvasSourceNodePanelProps = {
    node: CanvasNodeData;
    parsing: boolean;
    parseEnabled: boolean;
    onParse: (input: string) => void;
    onCancel: () => void;
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onClose: () => void;
};

/**
 * 素材源面板：只负责粘贴链接解析。素材展开与复刻在节点工具栏。
 */
export function CanvasSourceNodePanel({ node, parsing, parseEnabled, onParse, onCancel, onChange, onClose }: CanvasSourceNodePanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
    const [input, setInput] = useState(node.metadata?.sourceInput || "");
    const [manualText, setManualText] = useState("");
    const status = node.metadata?.sourceStatus || "idle";
    const errorText = node.metadata?.sourceError || "";
    const showErrorBlock = Boolean(errorText) || status === "error";
    const hasMaterial = Boolean(node.metadata?.sourceTitle?.trim() || node.metadata?.sourceText?.trim() || node.metadata?.sourceImages?.length || node.metadata?.sourceCoverUrl?.trim());
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();

    const applyManualText = () => {
        const value = manualText.trim();
        if (!value) return;
        const firstLine = value.split("\n").find((line) => line.trim())?.trim() || value;
        onChange({
            sourceText: value,
            sourceTitle: firstLine.slice(0, 24),
            sourceStatus: "success",
            sourceError: undefined,
            sourceWarnings: undefined,
            sourceExpanded: node.metadata?.sourceExpanded === true,
            sourceExpandedSignature: undefined,
            sourceImages: node.metadata?.sourceImages,
        });
    };

    return (
        <div
            data-canvas-no-zoom
            className="thin-scrollbar max-h-[min(70vh,560px)] overflow-y-auto rounded-xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={stopPointer}
            onPointerDown={stopPointer}
            onWheel={stopPointer}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">素材源 · 抖音</span>
                <Button type="text" size="small" className="!size-7 !min-w-7 !p-0" aria-label="关闭素材源面板" style={{ color: theme.node.muted }} icon={<X className="size-4" />} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={onClose} />
            </div>

            {!parseEnabled ? (
                <div className="mb-2 space-y-2 rounded-lg border px-2.5 py-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                    <div className="text-[11px] leading-5">管理员已关闭内容解析；你仍可以手动粘贴文案继续创作。</div>
                    {!hasMaterial ? (
                        <>
                            <Input.TextArea rows={3} value={manualText} placeholder="粘贴素材文案" style={{ background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.node.stroke }} onChange={(event) => setManualText(event.target.value)} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                            <Button size="small" disabled={!manualText.trim()} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={applyManualText}>使用这段文字</Button>
                        </>
                    ) : null}
                </div>
            ) : null}
            <Input.TextArea rows={2} value={input} disabled={!parseEnabled || parsing} placeholder="粘贴抖音链接或整段分享文案" style={{ background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke }} onChange={(event) => setInput(event.target.value)} onPointerDown={stopPointer} onMouseDown={stopPointer} />
            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px]" style={{ color: theme.node.placeholder }}>{parsing ? "正在解析，可随时取消" : "支持作品链接与整段分享文案"}</span>
                <div className="flex shrink-0 items-center gap-2">
                    {parsing ? (
                        <Button size="small" onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={onCancel}>
                            取消
                        </Button>
                    ) : null}
                    <Button type="primary" size="small" loading={parsing} disabled={!input.trim() || parsing || !parseEnabled} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => onParse(input)}>
                        解析
                    </Button>
                </div>
            </div>

            {showErrorBlock ? (
                <div className="mt-3 space-y-2 rounded-xl border p-2.5" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                    <div className="text-xs font-medium" style={{ color: token.colorError }}>{errorText || "解析失败，请检查链接后重试"}</div>
                    {hasMaterial && errorText ? <div className="text-[11px] leading-5" style={{ color: theme.node.muted }}>本次更新失败，仍显示上次解析内容。</div> : null}
                    {parseEnabled ? (
                        <>
                            <Input.TextArea rows={3} value={manualText} placeholder="解析失败时，可直接粘贴文案作为手动兜底" style={{ background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.node.stroke }} onChange={(event) => setManualText(event.target.value)} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                            <Button size="small" disabled={!manualText.trim()} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={applyManualText}>使用这段文字</Button>
                        </>
                    ) : null}
                </div>
            ) : null}

            {node.metadata?.sourceWarnings?.length ? (
                <div className="mt-2 text-[11px] leading-5" style={{ color: token.colorWarning }}>{node.metadata.sourceWarnings.join("；")}</div>
            ) : null}

            {!hasMaterial && !showErrorBlock && parseEnabled ? (
                <div className="mt-3 text-[11px]" style={{ color: theme.node.placeholder }}>{parsing ? "正在解析抖音素材，请稍候…" : "解析后可在节点工具栏复刻，或展开原文案与原图"}</div>
            ) : null}
        </div>
    );
}
