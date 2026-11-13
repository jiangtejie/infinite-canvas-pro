"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, FileText, Link2, LoaderCircle } from "lucide-react";
import { theme as antdTheme, Tooltip } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";

/**
 * 素材源节点卡片：展示解析状态与结果摘要，双击/点击打开面板由外层处理。
 */
export function CanvasSourceNodeCard({ node, onOpen }: { node: CanvasNodeData; onOpen: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewFailed, setPreviewFailed] = useState(false);
    const status = node.metadata?.sourceStatus || "idle";
    const parsing = node.metadata?.sourceParsing === true;
    const images = (node.metadata?.sourceImages || []).filter((image) => Boolean(image.url));
    const coverUrl = node.metadata?.sourceCoverUrl || "";
    const title = node.metadata?.sourceTitle || "";
    const text = node.metadata?.sourceText || "";
    const author = node.metadata?.sourceAuthor || "";
    const stats = node.metadata?.sourceStats;
    const hasData = Boolean(title.trim() || text.trim() || images.length || coverUrl.trim());
    const previewUrls = images.length ? images.map((image) => image.url) : coverUrl ? [coverUrl] : [];
    const previewKey = previewUrls.join("|");
    const safePreviewIndex = previewUrls.length ? Math.min(previewIndex, previewUrls.length - 1) : 0;
    const previewUrl = previewUrls[safePreviewIndex] || "";
    const actionStyle = { background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text };

    useEffect(() => {
        setPreviewIndex(0);
    }, [node.id, previewKey]);

    useEffect(() => {
        setPreviewFailed(false);
    }, [node.id, previewKey, safePreviewIndex]);

    if (parsing && !hasData) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.muted }}>
                <LoaderCircle className="size-8 animate-spin" style={{ color: theme.node.activeStroke }} />
                <span className="text-sm">正在解析抖音素材…</span>
            </div>
        );
    }

    if (!hasData && status === "error") {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                <CircleAlert className="size-8" style={{ color: token.colorError }} />
                <span className="text-sm font-medium" style={{ color: token.colorError }}>解析失败</span>
                <span className="line-clamp-3 max-w-[320px] text-xs leading-5" style={{ color: theme.node.muted }}>{node.metadata?.sourceError || "请检查链接后重试"}</span>
                <button type="button" className="mt-1 rounded-lg border px-3 py-1.5 text-xs transition" style={actionStyle} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
                    重新解析
                </button>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: theme.toolbar.activeBg, color: theme.node.muted }}>
                    <Link2 className="size-6" />
                </div>
                <p className="m-0 text-base font-medium" style={{ color: theme.node.text }}>粘贴抖音链接解析图文素材</p>
                <p className="m-0 max-w-[320px] text-xs leading-5" style={{ color: theme.node.placeholder }}>点击节点打开面板，解析后可展开素材 / 交给 Agent 复刻</p>
                <button type="button" className="rounded-lg border px-3 py-1.5 text-xs transition" style={actionStyle} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
                    打开解析面板
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden p-4 text-left" style={{ color: theme.node.text }}>
            <div className="flex min-w-0 items-start gap-2">
                <Link2 className="mt-0.5 size-4 shrink-0" style={{ color: theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold leading-5">{title || "抖音素材"}</div>
                    {author || stats ? (
                        <div className="mt-0.5 truncate text-[11px]" style={{ color: theme.node.muted }}>
                            {author ? `@${author}` : ""}
                            {author && stats ? " · " : ""}
                            {stats ? `赞 ${stats.likes} · 藏 ${stats.collects} · 评 ${stats.comments} · 转 ${stats.shares}` : ""}
                        </div>
                    ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {node.metadata?.sourceError ? (
                        <Tooltip title={node.metadata.sourceError}>
                            <CircleAlert className="size-4" style={{ color: token.colorError }} />
                        </Tooltip>
                    ) : null}
                    {node.metadata?.sourceWarnings?.length ? (
                        <Tooltip title={node.metadata.sourceWarnings.join("；")}>
                            <CircleAlert className="size-4" style={{ color: token.colorWarning }} />
                        </Tooltip>
                    ) : null}
                    {parsing ? <LoaderCircle className="size-4 animate-spin" style={{ color: theme.node.activeStroke }} /> : null}
                </div>
            </div>

            {previewUrls.length ? (
                <div
                    className="relative min-h-0 flex-1 overflow-hidden rounded-lg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ background: theme.toolbar.activeBg, outlineColor: theme.node.activeStroke }}
                    role="group"
                    tabIndex={0}
                    aria-label={`素材图片轮播，第 ${safePreviewIndex + 1} 张，共 ${previewUrls.length} 张`}
                    onKeyDown={(event) => {
                        if (previewUrls.length < 2) return;
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        event.stopPropagation();
                        setPreviewIndex((current) => {
                            const safe = Math.min(current, previewUrls.length - 1);
                            return event.key === "ArrowLeft" ? (safe - 1 + previewUrls.length) % previewUrls.length : (safe + 1) % previewUrls.length;
                        });
                    }}
                >
                    {!previewFailed ? (
                        <img src={previewUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-25 blur-xl" />
                    ) : null}
                    {previewFailed ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
                            <CircleAlert className="size-5" style={{ color: token.colorError }} />
                            <span className="text-[11px] leading-4" style={{ color: theme.node.muted }}>图片加载失败，打开面板重新解析</span>
                        </div>
                    ) : (
                        <img src={previewUrl} alt={title || "素材图片"} draggable={false} className="relative size-full object-contain" onError={() => setPreviewFailed(true)} />
                    )}
                    {previewUrls.length > 1 ? (
                        <>
                            <button
                                type="button"
                                className="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full border opacity-85 shadow-md transition hover:opacity-100"
                                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                                aria-label="上一张素材图片"
                                onPointerDown={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setPreviewIndex((safePreviewIndex - 1 + previewUrls.length) % previewUrls.length);
                                }}
                            >
                                <ChevronLeft className="size-4" />
                            </button>
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full border opacity-85 shadow-md transition hover:opacity-100"
                                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                                aria-label="下一张素材图片"
                                onPointerDown={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setPreviewIndex((safePreviewIndex + 1) % previewUrls.length);
                                }}
                            >
                                <ChevronRight className="size-4" />
                            </button>
                            <span
                                className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] tabular-nums"
                                style={{ background: theme.toolbar.panel, color: theme.node.text }}
                                aria-live="polite"
                            >
                                {safePreviewIndex + 1} / {previewUrls.length}
                            </span>
                        </>
                    ) : null}
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                    <FileText className="size-5" style={{ color: theme.node.muted }} />
                    <span className="text-[11px]" style={{ color: theme.node.placeholder }}>文字素材，无图片</span>
                </div>
            )}

            <div className="mt-auto flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px]" style={{ color: theme.node.muted }}>
                    {previewUrls.length ? `共 ${previewUrls.length} 张` : text ? "纯文字素材" : "解析后可展开素材 / 交给 Agent 复刻"}
                </span>
                <button type="button" className="shrink-0 rounded-lg border px-3 py-1.5 text-xs transition" style={actionStyle} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
                    打开素材面板
                </button>
            </div>
        </div>
    );
}
