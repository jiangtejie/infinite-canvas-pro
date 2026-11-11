"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button, Input, Popconfirm, Tag, Typography, theme as antdTheme } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";

export type CanvasSourceNodePanelProps = {
    node: CanvasNodeData;
    parsing: boolean;
    parseEnabled: boolean;
    onParse: (input: string) => void;
    onCancel: () => void;
    onExpand: () => void;
    onRunRemix: () => void;
    onReset: () => void;
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onClose: () => void;
};

/**
 * 素材源面板：粘贴解析、结果预览、展开素材与一键复刻。
 */
export function CanvasSourceNodePanel({ node, parsing, parseEnabled, onParse, onCancel, onExpand, onRunRemix, onReset, onChange, onClose }: CanvasSourceNodePanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
    const [input, setInput] = useState(node.metadata?.sourceInput || "");
    const [manualText, setManualText] = useState("");
    const status = node.metadata?.sourceStatus || "idle";
    const tags = node.metadata?.sourceTags || [];
    const images = node.metadata?.sourceImages || [];
    const coverUrl = node.metadata?.sourceCoverUrl || "";
    const text = node.metadata?.sourceText || "";
    const stats = node.metadata?.sourceStats;
    const author = node.metadata?.sourceAuthor || "";
    const title = node.metadata?.sourceTitle || "";
    const previewUrls = images.length ? images.map((image) => image.url) : coverUrl ? [coverUrl] : [];
    const hasMaterial = Boolean(title.trim() || text.trim() || images.length || coverUrl.trim());
    const errorText = node.metadata?.sourceError || "";
    const showErrorBlock = Boolean(errorText) || status === "error" || !parseEnabled;
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();
    const tagStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted };

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
            sourceImages: node.metadata?.sourceImages,
        });
    };

    return (
        <div
            data-canvas-no-zoom
            className="thin-scrollbar max-h-[min(70vh,560px)] overflow-y-auto rounded-2xl border p-3 shadow-2xl backdrop-blur"
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
                <div className="mb-2 rounded-lg border px-2.5 py-2 text-[11px] leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                    管理员已关闭内容解析；你仍可以手动粘贴文案继续创作。
                </div>
            ) : null}
            <Input.TextArea rows={2} value={input} disabled={!parseEnabled || parsing} placeholder="粘贴抖音链接或整段分享文案" style={{ background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke }} onChange={(event) => setInput(event.target.value)} onPointerDown={stopPointer} onMouseDown={stopPointer} />
            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px]" style={{ color: theme.node.placeholder }}>{parsing ? "正在解析，可随时取消" : "支持作品链接与整段分享文案，解析后可展开成真实素材节点"}</span>
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
                    <div className="text-xs font-medium" style={{ color: token.colorError }}>{errorText || (parseEnabled ? "解析失败，请检查链接后重试" : "内容解析已关闭")}</div>
                    <Input.TextArea rows={3} value={manualText} placeholder="解析失败时，可直接粘贴文案作为手动兜底" style={{ background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.node.stroke }} onChange={(event) => setManualText(event.target.value)} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                    <Button size="small" disabled={!manualText.trim()} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={applyManualText}>
                        使用这段文字
                    </Button>
                </div>
            ) : null}

            {hasMaterial ? (
                <div className="mt-3 space-y-2 rounded-xl border p-2.5" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                    <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 text-sm font-semibold">{title || "抖音素材"}</div>
                        {parsing ? <span className="text-[11px]" style={{ color: theme.node.placeholder }}>正在刷新解析…</span> : null}
                    </div>
                    {author || stats ? (
                        <div className="truncate text-[11px]" style={{ color: theme.node.muted }}>
                            {author ? `@${author}` : ""}
                            {author && stats ? " · " : ""}
                            {stats ? `赞 ${stats.likes} · 藏 ${stats.collects} · 评 ${stats.comments} · 转 ${stats.shares}` : ""}
                        </div>
                    ) : null}
                    {text ? (
                        <Typography.Paragraph className="thin-scrollbar !mb-0 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs" style={{ color: theme.node.muted }}>
                            {text}
                        </Typography.Paragraph>
                    ) : null}
                    {tags.length ? (
                        <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                                <Tag key={tag} className="!m-0 !text-[11px]" style={tagStyle}>
                                    #{tag.replace(/^#+/, "")}
                                </Tag>
                            ))}
                        </div>
                    ) : null}
                    {node.metadata?.sourceWarnings?.length ? (
                        <div className="text-[11px] leading-5" style={{ color: token.colorWarning }}>{node.metadata.sourceWarnings.join("；")}</div>
                    ) : null}
                    {previewUrls.length ? (
                        <div className="grid grid-cols-4 gap-1.5">
                            {previewUrls.map((url, index) => (
                                <img key={`${url}-${index}`} src={url} alt="" draggable={false} className="h-16 w-full rounded-md object-cover" />
                            ))}
                        </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <Button size="small" disabled={parsing} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={onExpand}>
                            展开素材
                        </Button>
                        <Button type="primary" size="small" disabled={parsing} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={onRunRemix}>
                            一键复刻
                        </Button>
                        {node.metadata?.sourceExpanded ? (
                            <>
                                <span className="text-[11px]" style={{ color: theme.node.placeholder }}>已展开</span>
                                <Popconfirm
                                    title="重置素材"
                                    description="会删除由当前素材源展开的素材/复刻节点；已经连到画布其他节点的会保留。"
                                    okText="重置"
                                    cancelText="取消"
                                    onConfirm={onReset}
                                >
                                    <Button size="small" danger disabled={parsing} onPointerDown={stopPointer} onMouseDown={stopPointer}>
                                        重置素材
                                    </Button>
                                </Popconfirm>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {!hasMaterial && !showErrorBlock ? (
                <div className="mt-3 text-[11px]" style={{ color: theme.node.placeholder }}>{parsing ? "正在解析抖音素材，请稍候…" : "解析结果会显示标题、正文、话题、作者与图片预览"}</div>
            ) : null}
        </div>
    );
}
