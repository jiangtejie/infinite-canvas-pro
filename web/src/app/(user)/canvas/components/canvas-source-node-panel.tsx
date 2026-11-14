"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { Button, Dropdown, Input, Tag, Typography, theme as antdTheme } from "antd";
import { useConfirm } from "@/components/ui/confirm-dialog";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";

export type CanvasSourceNodePanelProps = {
    node: CanvasNodeData;
    parsing: boolean;
    parseEnabled: boolean;
    onParse: (input: string) => void;
    onCancel: () => void;
    expandedNeedsSync: boolean;
    remixStale: boolean;
    onToggleExpanded: () => { ok: boolean; needsSync?: boolean; updated?: boolean; reason?: string; blockedNodeIds?: string[]; blocked?: number; removed?: number };
    onReset: () => { ok: boolean; removed?: number; blocked?: number };
    onRemixWithAgent: () => void;
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onClose: () => void;
};

/**
 * 素材源面板：粘贴解析、文字摘要、展开素材。图片只在节点卡片上轮播预览，面板不重复铺图。
 * 复刻交给创作 Agent 对话完成，面板不再承载复刻流程步骤。
 */
export function CanvasSourceNodePanel({ node, parsing, parseEnabled, onParse, onCancel, expandedNeedsSync, remixStale, onToggleExpanded, onReset, onRemixWithAgent, onChange, onClose }: CanvasSourceNodePanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
    const confirm = useConfirm();
    const [input, setInput] = useState(node.metadata?.sourceInput || "");
    const [manualText, setManualText] = useState("");
    const [textExpanded, setTextExpanded] = useState(false);
    const [actionFeedback, setActionFeedback] = useState("");
    const status = node.metadata?.sourceStatus || "idle";
    const tags = node.metadata?.sourceTags || [];
    const images = node.metadata?.sourceImages || [];
    const coverUrl = node.metadata?.sourceCoverUrl || "";
    const text = node.metadata?.sourceText || "";
    const stats = node.metadata?.sourceStats;
    const author = node.metadata?.sourceAuthor || "";
    const title = node.metadata?.sourceTitle || "";
    const hasMaterial = Boolean(title.trim() || text.trim() || images.length || coverUrl.trim());
    const errorText = node.metadata?.sourceError || "";
    const showErrorBlock = Boolean(errorText) || status === "error";
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();
    const tagStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted };
    const sourceExpanded = node.metadata?.sourceExpanded === true;
    const updateExpandedMaterials = () => {
        setActionFeedback("");
        const result = onToggleExpanded();
        if (!result.ok) setActionFeedback(result.needsSync ? `无法安全更新以下素材节点，请先处理这些内容或连接：${result.blockedNodeIds?.join("、") || "未知节点"}` : result.reason || "素材更新失败。");
        else if (result.updated) setActionFeedback("素材已同步到画布。");
        else if (!sourceExpanded) setActionFeedback("素材已展开到画布。");
    };
    const resetExpandedMaterials = async () => {
        const accepted = await confirm({
            title: "重置展开素材？",
            description: "会删除当前素材源派生的素材和复刻节点；已连接到其他画布内容的节点会保留。",
            confirmText: "重置素材",
            tone: "danger",
        });
        if (!accepted) return;
        const result = onReset();
        setActionFeedback(result.blocked ? `已重置 ${result.removed || 0} 个节点；${result.blocked} 个已连接到其他内容的节点保留。` : "素材已重置。重新解析或展开即可继续使用。");
    };

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
                    <div className="text-xs font-medium" style={{ color: token.colorError }}>{errorText || "解析失败，请检查链接后重试"}</div>
                    {hasMaterial && errorText ? <div className="text-[11px] leading-5" style={{ color: theme.node.muted }}>本次更新失败，仍显示上次解析内容。{expandedNeedsSync ? "画布中的展开素材尚未更新。" : ""}</div> : null}
                    {parseEnabled ? (
                        <>
                            <Input.TextArea rows={3} value={manualText} placeholder="解析失败时，可直接粘贴文案作为手动兜底" style={{ background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.node.stroke }} onChange={(event) => setManualText(event.target.value)} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                            <Button size="small" disabled={!manualText.trim()} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={applyManualText}>使用这段文字</Button>
                        </>
                    ) : null}
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
                        <div>
                            <Typography.Paragraph className={`!mb-0 whitespace-pre-wrap break-words text-xs ${textExpanded ? "" : "line-clamp-5"}`} style={{ color: theme.node.muted }}>
                                {text}
                            </Typography.Paragraph>
                            {text.length > 240 ? (
                                <Button type="link" size="small" className="!h-6 !px-0 !text-[11px]" icon={textExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => setTextExpanded((expanded) => !expanded)}>
                                    {textExpanded ? "收起正文" : "展开完整正文"}
                                </Button>
                            ) : null}
                        </div>
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
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {sourceExpanded ? (
                            <div className="flex min-w-0 items-center">
                                <Button size="small" disabled={parsing || !expandedNeedsSync} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={updateExpandedMaterials}>
                                    {expandedNeedsSync ? "更新展开素材" : "已展开"}
                                </Button>
                                <Dropdown
                                    trigger={["click"]}
                                    menu={{ items: [{ key: "reset", label: "重置展开素材", danger: true, onClick: () => void resetExpandedMaterials() }] }}
                                    disabled={parsing}
                                >
                                    <Button size="small" aria-label="更多素材操作" icon={<ChevronDown className="size-3.5" />} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                                </Dropdown>
                            </div>
                        ) : (
                            <Button size="small" disabled={parsing} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={updateExpandedMaterials}>
                                展开素材
                            </Button>
                        )}
                        <Button type="primary" size="small" icon={<Sparkles className="size-3.5" />} disabled={parsing} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={onRemixWithAgent}>
                            交给 Agent 复刻
                        </Button>
                        {sourceExpanded ? <span className="text-[11px]" style={{ color: theme.node.placeholder }}>{expandedNeedsSync ? "素材有更新" : ""}</span> : null}
                    </div>
                    {actionFeedback ? <div role="status" className="text-[11px] leading-5" style={{ color: token.colorWarning }}>{actionFeedback}</div> : null}
                    {remixStale ? <div role="status" className="text-[11px] leading-5" style={{ color: token.colorWarning }}>原素材已更新，复刻配图需要重新策划后再生成。</div> : null}

                    <div className="text-[11px] leading-5" style={{ color: theme.node.placeholder }}>
                        复刻在创作 Agent 里对话完成：Agent 会读懂整组原图的关系，先做组级策划再整组生成配图；要换风格或改叙事时让 Agent 重新策划整组。
                    </div>
                </div>
            ) : null}

            {!hasMaterial && !showErrorBlock && parseEnabled ? (
                <div className="mt-3 text-[11px]" style={{ color: theme.node.placeholder }}>{parsing ? "正在解析抖音素材，请稍候…" : "解析结果会显示标题、正文、话题与作者；图片在节点卡片上轮播预览"}</div>
            ) : null}
        </div>
    );
}
