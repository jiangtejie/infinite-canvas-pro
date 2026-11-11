"use client";

import { CircleAlert, Link2, LoaderCircle } from "lucide-react";
import { theme as antdTheme } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";

/**
 * 素材源节点卡片：展示解析状态与结果摘要，双击/点击打开面板由外层处理。
 */
export function CanvasSourceNodeCard({ node, onOpen }: { node: CanvasNodeData; onOpen: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
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
    const actionStyle = { background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text };

    if (parsing && !hasData) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.muted }}>
                <LoaderCircle className="size-6 animate-spin" style={{ color: theme.node.activeStroke }} />
                <span className="text-sm">正在解析抖音素材…</span>
            </div>
        );
    }

    if (!hasData && status === "error") {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                <CircleAlert className="size-6" style={{ color: token.colorError }} />
                <span className="text-sm font-medium" style={{ color: token.colorError }}>解析失败</span>
                <span className="line-clamp-3 text-xs leading-5" style={{ color: theme.node.muted }}>{node.metadata?.sourceError || "请检查链接后重试"}</span>
                <button type="button" className="mt-1 rounded-lg border px-3 py-1.5 text-xs transition" style={actionStyle} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
                    重新解析
                </button>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl" style={{ background: theme.toolbar.activeBg, color: theme.node.muted }}>
                    <Link2 className="size-5" />
                </div>
                <p className="m-0 text-sm font-medium" style={{ color: theme.node.text }}>粘贴抖音链接解析图文素材</p>
                <p className="m-0 text-[11px] leading-5" style={{ color: theme.node.placeholder }}>点击节点打开面板，解析后可展开素材 / 一键复刻</p>
                <button type="button" className="rounded-lg border px-3 py-1.5 text-xs transition" style={actionStyle} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
                    打开解析面板
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-4 text-left" style={{ color: theme.node.text }}>
            <div className="flex min-w-0 items-start gap-2">
                <Link2 className="mt-0.5 size-4 shrink-0" style={{ color: theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold leading-5">{title || "抖音素材"}</div>
                    {author || stats ? (
                        <div className="mt-1 truncate text-[11px]" style={{ color: theme.node.muted }}>
                            {author ? `@${author}` : ""}
                            {author && stats ? " · " : ""}
                            {stats ? `赞 ${stats.likes} · 藏 ${stats.collects} · 评 ${stats.comments} · 转 ${stats.shares}` : ""}
                        </div>
                    ) : null}
                </div>
                {parsing ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" style={{ color: theme.node.activeStroke }} /> : null}
            </div>
            {node.metadata?.sourceError ? <div className="line-clamp-2 text-[11px] leading-4" style={{ color: token.colorError }}>{node.metadata.sourceError}</div> : null}
            {text ? <p className="m-0 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5" style={{ color: theme.node.muted }}>{text}</p> : null}
            {node.metadata?.sourceWarnings?.length ? <div className="line-clamp-2 text-[11px] leading-4" style={{ color: token.colorWarning }}>{node.metadata.sourceWarnings.join("；")}</div> : null}
            {previewUrls.length ? (
                <div className="mt-auto flex items-center gap-1.5">
                    {previewUrls.slice(0, 3).map((url, index) => (
                        <img key={`${url}-${index}`} src={url} alt="" draggable={false} className="size-12 rounded-md object-cover" />
                    ))}
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>共 {previewUrls.length} 张</span>
                </div>
            ) : null}
            {!node.metadata?.sourceExpanded ? <div className="text-[11px]" style={{ color: theme.node.placeholder }}>点开可展开素材/一键复刻</div> : null}
        </div>
    );
}
