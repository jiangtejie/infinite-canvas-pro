"use client";

import { CheckCircle2, CircleAlert, Image as ImageIcon, LoaderCircle, Send } from "lucide-react";
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
            <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-8 text-center" style={{ color: theme.node.muted }}>
                <LoaderCircle className="size-7 animate-spin" style={{ color: theme.node.activeStroke }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>正在生成发布二维码…</span>
                <span className="max-w-[300px] text-[11px] leading-5">正在上传图片并预检内容，请稍候</span>
            </div>
        );
    }

    if (!record && status === "error") {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-8 text-center">
                <CircleAlert className="size-7" style={{ color: token.colorError }} />
                <span className="text-sm font-medium" style={{ color: token.colorError }}>发布准备失败</span>
                <span className="line-clamp-3 max-w-[320px] text-xs leading-5" style={{ color: theme.node.muted }}>{error || "请打开面板检查内容后重试"}</span>
                {openButton}
            </div>
        );
    }

    if (!record) {
        const firstImage = selectedImages[0];
        const thumbs = selectedImages.slice(0, 4);
        const tagsText = (node.metadata?.publishDraft?.tags || []).map((tag) => `#${tag}`).join(" ");
        return (
            <div className="flex h-full w-full flex-col gap-2.5 p-4 text-left" style={{ color: theme.node.text }}>
                <div className="flex min-h-0 flex-1 gap-3">
                    <div className="h-full w-[148px] shrink-0 overflow-hidden rounded-xl border" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke }}>
                        {firstImage ? (
                            <img src={firstImage.image.dataUrl} alt={firstImage.title} draggable={false} className="size-full object-cover" />
                        ) : (
                            <div className="flex size-full flex-col items-center justify-center gap-1.5 px-3 text-center">
                                <ImageIcon className="size-6" style={{ color: theme.node.muted }} />
                                <span className="text-[10px] leading-4" style={{ color: theme.node.placeholder }}>暂无发布图片</span>
                            </div>
                        )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
                        <div className="line-clamp-2 text-base font-semibold leading-6">{draftTitle || "编辑发布内容并生成二维码"}</div>
                        <p className="m-0 line-clamp-3 text-xs leading-5" style={{ color: theme.node.muted }}>{draftBody || "点开面板填写标题、正文并选择发布图片"}</p>
                        {tagsText ? <p className="m-0 line-clamp-1 text-[11px]" style={{ color: token.colorLink }}>{tagsText}</p> : null}
                        <div className="mt-auto flex min-w-0 items-center gap-1.5">
                            {thumbs.map((item) => (
                                <span key={item.nodeId} className="size-9 shrink-0 overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke }}>
                                    <img src={item.image.dataUrl} alt={item.title} draggable={false} className="size-full object-cover" />
                                </span>
                            ))}
                            <span className="truncate text-[11px]" style={{ color: theme.node.placeholder }}>已选 {selectedImages.length} 张图片</span>
                        </div>
                    </div>
                </div>
                <button type="button" className="flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition hover:opacity-90" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke, color: theme.toolbar.activeText }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
                    <Send className="size-4" />
                    编辑并生成二维码
                </button>
            </div>
        );
    }

    const confirmed = record.status === "confirmed";
    return (
        <div className="flex h-full w-full flex-col gap-2.5 overflow-hidden p-4 text-left" style={{ color: theme.node.text }}>
            <div className="flex min-w-0 items-start gap-2">
                <Send className="mt-0.5 size-4 shrink-0" style={{ color: theme.node.muted }} />
                <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-sm font-semibold leading-5">{draftTitle || record.id}</div>
                    <div className="mt-0.5 truncate text-[11px]" style={{ color: theme.node.muted }}>{imageSummary}</div>
                </div>
                {record.mock ? <Tag className="!m-0 !text-[10px]" color="warning">MOCK</Tag> : null}
            </div>

            <div className="flex min-h-0 flex-1 items-center gap-3">
                {confirmed ? (
                    <div className="flex h-[156px] w-[144px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: token.colorSuccess }}>
                        <CheckCircle2 className="size-8" />
                        <span className="text-xs font-medium">已发布</span>
                    </div>
                ) : draftDirty ? (
                    <div className="flex h-[156px] w-[144px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-3 text-center" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: token.colorWarning }}>
                        <CircleAlert className="size-7" />
                        <span className="text-xs font-medium">待更新</span>
                        <span className="text-[10px] leading-4">旧二维码已失效</span>
                    </div>
                ) : (
                    <div className="shrink-0 self-center rounded-xl bg-white p-1.5">
                        <QRCode value={record.qrText} size={132} bordered={false} errorLevel="L" bgColor="#ffffff" color="#111111" status={expired ? "expired" : "active"} />
                    </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1">
                        <Tag className="!m-0 !text-[10px]" color={confirmed ? "success" : "processing"}>{confirmed ? "已发布" : "待扫码发布"}</Tag>
                        {record.mock ? <Tag className="!m-0 !text-[10px]" color="warning">MOCK 模拟</Tag> : null}
                    </div>
                    {confirmed ? (
                        record.publishedUrl ? (
                            <a href={record.publishedUrl} target="_blank" rel="noreferrer" className="line-clamp-2 break-all text-[11px] underline underline-offset-2" style={{ color: theme.node.muted }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => event.stopPropagation()}>
                                {record.publishedUrl}
                            </a>
                        ) : (
                            <span className="text-[11px]" style={{ color: theme.node.placeholder }}>未回填作品链接，可点开面板补充</span>
                        )
                    ) : draftDirty ? (
                        <>
                            <span className="text-xs font-medium" style={{ color: token.colorWarning }}>内容已修改，请重新生成二维码</span>
                            <span className="text-[11px] leading-5" style={{ color: theme.node.muted }}>旧二维码已失效，点开面板重新生成后再扫码发布</span>
                        </>
                    ) : (
                        <>
                            <span className="text-xs font-medium">{expired ? "二维码已过期" : "抖音 App 扫码 → 编辑页 → 确认发布"}</span>
                            <span className="text-[11px] leading-5" style={{ color: expired ? token.colorWarning : theme.node.muted }}>{expired ? "点开发布面板重新生成二维码" : `有效期至 ${formatPublishDeadline(record.expiresAt)}`}</span>
                            <span className="text-[11px] leading-5" style={{ color: theme.node.placeholder }}>点开节点显示可扫码大图并回填作品链接</span>
                        </>
                    )}
                </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2">
                <span className="truncate text-[11px]" style={{ color: draftDirty ? token.colorWarning : theme.node.placeholder }}>{draftDirty ? "内容已修改，请重新生成二维码" : record.mock ? "模拟模式：二维码不会真正打开抖音发布页" : expired ? "二维码已过期，请点开面板重新生成" : confirmed ? "已标记发布，可继续更新作品链接" : "二维码有效期内扫码有效"}</span>
                {openButton}
            </div>
        </div>
    );
}

function formatPublishDeadline(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
