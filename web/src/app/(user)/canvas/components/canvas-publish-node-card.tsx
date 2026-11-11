"use client";

import { CircleAlert, LoaderCircle, QrCode, Send } from "lucide-react";
import { QRCode, Tag, theme as antdTheme } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { isPublishDraftDirty, publishQrExpired, PUBLISH_MAX_IMAGES, type CanvasPublishInputImage } from "../[id]/lib/canvas-publish";
import type { CanvasNodeData } from "../types";

/**
 * 发布节点卡片：展示发布标题、已选图片数、二维码与发布状态，点击或双击打开面板由外层处理。
 */
export function CanvasPublishNodeCard({ node, imageCount, images = [], onOpen }: { node: CanvasNodeData; textCount: number; imageCount: number; images?: CanvasPublishInputImage[]; onOpen: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
    const record = node.metadata?.publishRecord;
    const status = node.metadata?.publishStatus || "idle";
    const error = node.metadata?.publishError || "";
    const expired = publishQrExpired(record);
    const draftDirty = isPublishDraftDirty(record, node.metadata?.publishDraft, node.metadata?.publishDraftSnapshot);
    const draftTitle = node.metadata?.publishDraft?.title?.trim() || "";
    const draftBody = node.metadata?.publishDraft?.body?.trim() || "";
    const imageByNodeId = new Map(images.map((item) => [item.nodeId, item]));
    const draftImageNodeIds = node.metadata?.publishDraft?.imageNodeIds;
    const selectedImages = (draftImageNodeIds ? draftImageNodeIds.map((nodeId) => imageByNodeId.get(nodeId)).filter((item): item is CanvasPublishInputImage => Boolean(item)) : images).slice(0, PUBLISH_MAX_IMAGES);
    const selectedImageCount = node.metadata?.publishDraft?.imageNodeIds?.length ?? imageCount;
    const imageSummary = selectedImageCount > 0 ? `已选 ${selectedImageCount} 张图片` : `共 ${imageCount} 张图片`;
    const actionStyle = { background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text };
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();

    const openButton = (
        <button type="button" className="rounded-lg border px-3 py-1.5 text-xs transition" style={actionStyle} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
            打开发布面板
        </button>
    );

    if (status === "generating") {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: theme.node.muted }}>
                <LoaderCircle className="size-6 animate-spin" style={{ color: theme.node.activeStroke }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>正在生成发布二维码…</span>
                <span className="text-[11px] leading-5">正在上传图片并预检内容，请稍候</span>
            </div>
        );
    }

    if (!record && status === "error") {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                <CircleAlert className="size-6" style={{ color: token.colorError }} />
                <span className="text-sm font-medium" style={{ color: token.colorError }}>发布准备失败</span>
                <span className="line-clamp-3 text-xs leading-5" style={{ color: theme.node.muted }}>{error || "请打开面板检查内容后重试"}</span>
                {openButton}
            </div>
        );
    }

    if (!record) {
        const firstImage = selectedImages[0];
        return (
            <div className="flex h-full w-full flex-col gap-2 p-3 text-left" style={{ color: theme.node.text }}>
                <div className="flex min-h-0 flex-1 gap-2.5">
                    <div className="h-[104px] w-[78px] shrink-0 overflow-hidden rounded-lg" style={{ background: theme.toolbar.activeBg }}>
                        {firstImage ? (
                            <img src={firstImage.image.dataUrl} alt={firstImage.title} draggable={false} className="size-full object-cover" />
                        ) : (
                            <span className="grid size-full place-items-center" style={{ color: theme.node.muted }}>
                                <Send className="size-5" />
                            </span>
                        )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="line-clamp-2 text-sm font-semibold leading-5">{draftTitle || "编辑发布内容并生成二维码"}</div>
                        <p className="m-0 mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: theme.node.muted }}>{draftBody || "点开面板填写标题、正文并选择发布图片"}</p>
                        <span className="mt-auto text-[11px]" style={{ color: theme.node.placeholder }}>已选 {selectedImages.length} 张图片</span>
                    </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="truncate text-[11px]" style={{ color: theme.node.placeholder }}>图文预览，点开面板可生成二维码</span>
                    {openButton}
                </div>
            </div>
        );
    }

    const confirmed = record.status === "confirmed";
    return (
        <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-4 text-left" style={{ color: theme.node.text }}>
            <div className="flex min-w-0 items-start gap-2">
                <Send className="mt-0.5 size-4 shrink-0" style={{ color: theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold leading-5">{draftTitle || record.id}</div>
                    <div className="mt-1 truncate text-[11px]" style={{ color: theme.node.muted }}>{imageSummary}</div>
                </div>
                {record.mock ? <Tag className="!m-0 !text-[10px]" color="warning">MOCK</Tag> : null}
            </div>

            <div className="flex min-h-0 flex-1 items-center gap-3">
                {confirmed ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: token.colorSuccess }}>
                            <QrCode className="size-4" />
                            已发布
                        </div>
                        {record.publishedUrl ? (
                            <a href={record.publishedUrl} target="_blank" rel="noreferrer" className="line-clamp-2 break-all text-[11px] underline underline-offset-2" style={{ color: theme.node.muted }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => event.stopPropagation()}>
                                {record.publishedUrl}
                            </a>
                        ) : (
                            <span className="text-[11px]" style={{ color: theme.node.placeholder }}>未回填作品链接，可点开面板补充</span>
                        )}
                    </div>
                ) : draftDirty ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: token.colorWarning }}>
                            <CircleAlert className="size-4" />
                            内容已修改
                        </div>
                        <span className="text-[11px] leading-5" style={{ color: theme.node.muted }}>内容已修改，请重新生成二维码</span>
                        <span className="text-[11px] leading-5" style={{ color: theme.node.placeholder }}>旧二维码已失效，点开面板重新生成后再扫码发布</span>
                    </div>
                ) : (
                    <>
                        <div className="shrink-0 rounded-lg bg-white p-1.5">
                            <QRCode value={record.qrText} size={96} bordered={false} errorLevel="L" bgColor="#ffffff" color="#111111" status={expired ? "expired" : "active"} />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-sm font-medium">{expired ? "二维码已过期" : "抖音扫码发布"}</span>
                            <span className="text-[11px] leading-5" style={{ color: theme.node.muted }}>{expired ? "点开发布面板重新生成二维码" : "抖音 App 扫码 → 编辑页 → 确认发布"}</span>
                            <span className="text-[11px] leading-5" style={{ color: theme.node.placeholder }}>点开节点显示可扫码大图并回填作品链接</span>
                        </div>
                    </>
                )}
            </div>

            <div className="mt-auto flex items-center justify-between gap-2">
                <span className="truncate text-[11px]" style={{ color: draftDirty ? token.colorWarning : theme.node.placeholder }}>{draftDirty ? "内容已修改，请重新生成二维码" : record.mock ? "模拟模式：二维码不会真正打开抖音发布页" : expired ? "二维码已过期，请点开面板重新生成" : "二维码有效期内扫码有效"}</span>
                {openButton}
            </div>
        </div>
    );
}
