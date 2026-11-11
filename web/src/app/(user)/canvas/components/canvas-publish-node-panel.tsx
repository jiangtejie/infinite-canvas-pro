"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowUp, Bookmark, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Heart, LoaderCircle, MessageCircle, Plus, Send, Share2, X } from "lucide-react";
import { App, Button, Input, Modal, QRCode, Select, Tag, theme as antdTheme } from "antd";

import { canvasStatusColors } from "@/app/(user)/canvas/lib/canvas-palette";
import { canvasThemes } from "@/lib/canvas-theme";
import {
    confirmPublishRecord,
    createPublishRecord,
    fetchPublishChannels,
    preflightPublish,
    uploadPublishMedia,
    type PublishChannels,
    type PublishImageInput,
    type PublishIssue,
    type PublishMedia,
    type PublishRecord,
} from "@/services/api/publish";
import { useThemeStore } from "@/stores/use-theme-store";
import {
    buildDefaultPublishDraft,
    canvasImageBlob,
    isPublishDraftDirty,
    publishChannelReasonText,
    publishImageFileName,
    publishQrExpired,
    PUBLISH_MAX_IMAGES,
    PUBLISH_TAGS_LIMIT,
    PUBLISH_TITLE_LIMIT,
    type CanvasPublishInputImage,
    type CanvasPublishInputs,
} from "../[id]/lib/canvas-publish";
import type { CanvasNodeData, CanvasNodeMetadata, CanvasPublishRecord } from "../types";

export type CanvasPublishNodePanelProps = {
    node: CanvasNodeData;
    inputs: CanvasPublishInputs;
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onClose: () => void;
};

/**
 * 发布节点面板：直接编辑要发布的标题/正文/话题与图片（已选图可排序/移除，未选图折叠添加），
 * 转存图片、预检并生成抖音扫码发布二维码。
 */
export function CanvasPublishNodePanel({ node, inputs, onChange, onClose }: CanvasPublishNodePanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { token } = antdTheme.useToken();
    const { message } = App.useApp();
    const projectId = useParams<{ id: string }>().id;
    const [channels, setChannels] = useState<PublishChannels | null>(null);
    const [channelsError, setChannelsError] = useState("");
    const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
    const [issues, setIssues] = useState<PublishIssue[]>([]);
    const [confirming, setConfirming] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [addImagesOpen, setAddImagesOpen] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [publishedUrl, setPublishedUrl] = useState(node.metadata?.publishRecord?.publishedUrl || "");
    const [now, setNow] = useState(Date.now());
    const uploadCacheRef = useRef(new Map<string, PublishMedia>());
    const record = node.metadata?.publishRecord;
    const recordId = record?.id || "";
    const recordPublishedUrl = record?.publishedUrl || "";
    const qrExpiresAt = record?.status === "confirmed" ? "" : record?.expiresAt || "";
    const generating = node.metadata?.publishStatus === "generating";
    const uploadBusy = uploading !== null;
    const busy = generating || uploadBusy || confirming;
    const locked = generating || uploadBusy;
    const draft = node.metadata?.publishDraft;
    const defaultDraft = buildDefaultPublishDraft(inputs);
    const draftTitle = draft?.title ?? defaultDraft.title;
    const draftBody = draft?.body ?? defaultDraft.body;
    const draftTags = draft?.tags ?? defaultDraft.tags;
    const draftImageNodeIds = draft?.imageNodeIds ?? defaultDraft.imageNodeIds;
    const imageByNodeId = new Map(inputs.images.map((item) => [item.nodeId, item]));
    const selectedImageIds = draftImageNodeIds.filter((nodeId) => imageByNodeId.has(nodeId)).slice(0, PUBLISH_MAX_IMAGES);
    const selectedImages = selectedImageIds.map((nodeId) => imageByNodeId.get(nodeId)!);
    const unselectedImages = inputs.images.filter((item) => !selectedImageIds.includes(item.nodeId));
    const orderedImages = selectedImages.slice(0, PUBLISH_MAX_IMAGES);
    const selectedImageKey = selectedImageIds.join("|");
    const safePreviewIndex = selectedImages.length ? Math.min(previewIndex, selectedImages.length - 1) : 0;
    const previewImage = selectedImages[safePreviewIndex];
    const channel = channels?.channels.find((item) => item.id === "douyin-h5") || channels?.channels[0];
    const channelReady = Boolean(channel?.available);
    const unavailableText = channelsError || (channels && !channelReady ? publishChannelReasonText(channel?.reason) : "");
    const expired = record ? record.status !== "confirmed" && publishQrExpired(record, now) : false;
    const draftSnapshot = node.metadata?.publishDraftSnapshot;
    const draftDirty = isPublishDraftDirty(record, { title: draftTitle, body: draftBody, tags: draftTags, imageNodeIds: draftImageNodeIds }, draftSnapshot);
    const hideQr = Boolean(record && draftDirty && record.status !== "confirmed");
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();

    useEffect(() => {
        let cancelled = false;
        fetchPublishChannels()
            .then((data) => {
                if (cancelled) return;
                setChannels(data);
                setChannelsError("");
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setChannelsError(error instanceof Error ? error.message : "发布渠道加载失败");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        setPublishedUrl(recordPublishedUrl);
    }, [recordId, recordPublishedUrl]);

    useEffect(() => {
        if (!qrExpiresAt) return;
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, [qrExpiresAt]);

    useEffect(() => {
        setPreviewIndex(0);
    }, [selectedImageKey]);

    const updateDraft = (patch: Partial<{ title: string; body: string; tags: string[]; imageNodeIds: string[] }>) => {
        onChange({
            publishDraft: { title: draftTitle, body: draftBody, tags: draftTags, imageNodeIds: draftImageNodeIds, ...patch },
            publishStatus: "idle",
            publishError: undefined,
        });
    };

    const toggleImage = (imageNodeId: string) => {
        if (locked) return;
        const next = selectedImageIds.includes(imageNodeId) ? selectedImageIds.filter((id) => id !== imageNodeId) : [...selectedImageIds, imageNodeId];
        updateDraft({ imageNodeIds: next });
    };

    const moveImage = (imageNodeId: string, offset: number) => {
        if (locked) return;
        const index = selectedImageIds.indexOf(imageNodeId);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= selectedImageIds.length) return;
        const next = [...selectedImageIds];
        [next[index], next[target]] = [next[target], next[index]];
        updateDraft({ imageNodeIds: next });
    };

    const uploadOneImage = async (item: CanvasPublishInputImage, index: number): Promise<PublishImageInput> => {
        const cacheKey = item.image.storageKey || item.image.dataUrl;
        const cached = uploadCacheRef.current.get(cacheKey);
        if (cached) return { url: cached.url, width: cached.width, height: cached.height, bytes: cached.bytes, mimeType: cached.mimeType };
        const blob = await canvasImageBlob({ url: item.image.dataUrl, storageKey: item.image.storageKey });
        const media = await uploadPublishMedia(blob, publishImageFileName(item.title, blob.type || item.image.type, index));
        uploadCacheRef.current.set(cacheKey, media);
        return { url: media.url, width: media.width, height: media.height, bytes: media.bytes, mimeType: media.mimeType };
    };

    const generate = async () => {
        if (busy) return;
        if (!channelReady) {
            message.warning(unavailableText || "发布渠道暂不可用");
            return;
        }
        const title = draftTitle.trim();
        if (!title) {
            message.warning("请先填写发布标题");
            return;
        }
        if (!orderedImages.length) {
            message.warning("请至少勾选一张图片");
            return;
        }
        onChange({ publishStatus: "generating", publishError: undefined });
        setIssues([]);
        try {
            const images: PublishImageInput[] = [];
            for (const [index, item] of orderedImages.entries()) {
                setUploading({ current: index + 1, total: orderedImages.length });
                images.push(await uploadOneImage(item, index));
            }
            setUploading(null);
            const input = { title, body: draftBody, tags: draftTags, images, source: "canvas", sourceId: projectId, nodeId: node.id };
            const preflightResult = await preflightPublish(input);
            setIssues(preflightResult.preflight.issues);
            if (!preflightResult.preflight.passed) {
                const firstError = preflightResult.preflight.issues.find((issue) => issue.level === "error")?.message || "发布内容未通过预检";
                onChange({ publishStatus: "error", publishError: firstError });
                message.error(firstError);
                return;
            }
            const created = await createPublishRecord(input);
            onChange({
                publishDraft: { title, body: draftBody, tags: draftTags, imageNodeIds: selectedImageIds },
                publishDraftSnapshot: { title, body: draftBody, tags: draftTags, imageNodeIds: selectedImageIds },
                publishStatus: "idle",
                publishError: undefined,
                publishRecord: toCanvasPublishRecord(created.record),
            });
            message.success("发布二维码已生成");
        } catch (error) {
            const reason = error instanceof Error ? error.message : "生成发布二维码失败";
            onChange({ publishStatus: "error", publishError: reason });
            message.error(reason);
        } finally {
            setUploading(null);
        }
    };

    const confirm = async () => {
        if (!record || confirming) return;
        setConfirming(true);
        try {
            const result = await confirmPublishRecord(record.id, publishedUrl.trim());
            onChange({ publishRecord: toCanvasPublishRecord(result.record) });
            message.success(result.record.status === "confirmed" ? "已标记为发布成功" : "发布记录已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "标记发布失败");
        } finally {
            setConfirming(false);
        }
    };

    const sectionStyle = { background: theme.node.fill, borderColor: theme.node.stroke };
    const inputStyle = { background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.node.stroke };

    return (
        <div
            data-canvas-no-zoom
            className="thin-scrollbar relative left-1/2 max-h-[min(76vh,680px)] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 overflow-y-auto rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={stopPointer}
            onPointerDown={stopPointer}
            onWheel={stopPointer}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Send className="size-4" style={{ color: theme.node.muted }} />
                    发布 · {channel?.label || "抖音扫码发布"}
                </span>
                <div className="flex items-center gap-1.5">
                    {record?.mock || channels?.mock ? <Tag className="!m-0 !text-[10px]" color="warning">MOCK</Tag> : null}
                    {record?.status === "confirmed" ? <Tag className="!m-0 !text-[10px]" color="success">已发布</Tag> : null}
                    <Button type="text" size="small" className="!size-7 !min-w-7 !p-0" aria-label="关闭发布面板" style={{ color: theme.node.muted }} icon={<X className="size-4" />} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={onClose} />
                </div>
            </div>

            {unavailableText ? (
                <div className="mb-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: token.colorWarning }}>
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>{unavailableText}</span>
                </div>
            ) : null}

            <div className="mt-2 grid gap-2 md:grid-cols-[240px_minmax(0,1fr)]">
                <div className="order-2 min-w-0 md:order-1">
                    <div className="rounded-[26px] border p-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                        <div className="overflow-hidden rounded-[18px]" style={{ background: theme.canvas.background }}>
                            <div className="flex items-center justify-between px-3 pb-1 pt-2 text-[10px]" style={{ color: theme.node.placeholder }}>
                                <span>抖音图文预览</span>
                                <span>{selectedImages.length ? `${safePreviewIndex + 1}/${selectedImages.length}` : "0/0"}</span>
                            </div>
                            <div className="relative mx-2 aspect-[3/4] overflow-hidden rounded-lg" style={{ background: theme.toolbar.activeBg }}>
                                {previewImage ? (
                                    <img src={previewImage.image.dataUrl} alt={previewImage.title} draggable={false} className="size-full object-cover" />
                                ) : (
                                    <div className="flex size-full items-center justify-center px-4 text-center text-[11px]" style={{ color: theme.node.placeholder }}>暂无发布图片</div>
                                )}
                                {selectedImages.length > 1 ? (
                                    <>
                                        <button type="button" className="absolute left-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full opacity-80 transition hover:opacity-100" style={{ background: theme.toolbar.panel, color: theme.node.text }} aria-label="上一张预览图" onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => setPreviewIndex((safePreviewIndex - 1 + selectedImages.length) % selectedImages.length)}>
                                            <ChevronLeft className="size-4" />
                                        </button>
                                        <button type="button" className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full opacity-80 transition hover:opacity-100" style={{ background: theme.toolbar.panel, color: theme.node.text }} aria-label="下一张预览图" onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => setPreviewIndex((safePreviewIndex + 1) % selectedImages.length)}>
                                            <ChevronRight className="size-4" />
                                        </button>
                                        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{safePreviewIndex + 1}/{selectedImages.length}</span>
                                    </>
                                ) : null}
                            </div>
                            <div className="px-2 pb-2 pt-1.5">
                                <div className="line-clamp-2 text-xs font-semibold leading-5" style={{ color: theme.node.text }}>{draftTitle || "未填写标题"}</div>
                                <p className="m-0 mt-0.5 line-clamp-3 text-[10px] leading-4" style={{ color: theme.node.muted }}>{draftBody || "未填写正文"}</p>
                                {draftTags.length ? <p className="m-0 mt-1 line-clamp-1 text-[10px]" style={{ color: token.colorLink }}>{draftTags.map((tag) => `#${tag}`).join(" ")}</p> : null}
                                <div className="mt-1.5 flex items-center justify-between border-t pt-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.placeholder }}>
                                    {[{ icon: Heart, label: "赞" }, { icon: MessageCircle, label: "评论" }, { icon: Bookmark, label: "收藏" }, { icon: Share2, label: "分享" }].map(({ icon: Icon, label }) => (
                                        <span key={label} className="inline-flex items-center gap-0.5 text-[10px]">
                                            <Icon className="size-3" />
                                            {label}
                                        </span>
                                    ))}
                                </div>
                                <p className="m-0 mt-1 text-center text-[9px] leading-3" style={{ color: theme.node.placeholder }}>仅预览，实际以抖音编辑页为准</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="order-1 min-w-0 space-y-2 md:order-2">
                    <div className="space-y-2 rounded-xl border p-2.5" style={sectionStyle}>
                        <div className="text-xs font-semibold">发布内容</div>
                <Input size="small" value={draftTitle} maxLength={PUBLISH_TITLE_LIMIT} showCount disabled={locked} placeholder="发布标题（不超过 20 个字）" style={inputStyle} onChange={(event) => updateDraft({ title: event.target.value })} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                <Input.TextArea rows={3} value={draftBody} maxLength={1000} showCount disabled={locked} placeholder="发布正文" style={inputStyle} onChange={(event) => updateDraft({ body: event.target.value })} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                <Select
                    mode="tags"
                    size="small"
                    maxCount={PUBLISH_TAGS_LIMIT}
                    value={draftTags}
                    disabled={locked}
                    placeholder="输入话题后回车，最多 5 个"
                    style={{ width: "100%" }}
                    onChange={(values: string[]) => updateDraft({ tags: normalizePublishTags(values) })}
                />
                <div className="text-[11px]" style={{ color: theme.node.placeholder }}>标题最多 {PUBLISH_TITLE_LIMIT} 个字，正文最多 1000 个字，话题最多 {PUBLISH_TAGS_LIMIT} 个（不需要输入 #）。</div>

                <div className="space-y-1.5 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium" style={{ color: theme.node.muted }}>发布图片（按顺序上传）</span>
                        <span className="text-[11px]" style={{ color: theme.node.placeholder }}>已选 {selectedImages.length} 张</span>
                    </div>
                    {selectedImages.length ? (
                        <div className="grid grid-cols-4 gap-1.5">
                            {selectedImages.map((item, index) => (
                                <div key={item.nodeId} className="relative overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke }}>
                                    <img src={item.image.dataUrl} alt={item.title} draggable={false} className="h-16 w-full object-cover" />
                                    <span className="absolute left-1 top-1 grid size-4 place-items-center rounded-full text-[10px] font-semibold" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{index + 1}</span>
                                    <button type="button" className="absolute right-1 top-1 grid size-4 place-items-center rounded-full transition hover:opacity-80" style={{ background: theme.toolbar.panel, color: theme.node.text }} aria-label={`移除第 ${index + 1} 张发布图片`} disabled={locked} onClick={() => toggleImage(item.nodeId)}>
                                        <X className="size-3" />
                                    </button>
                                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-0.5" style={{ background: theme.toolbar.panel }}>
                                        <button type="button" className="grid size-5 place-items-center rounded" style={{ color: theme.node.text, opacity: index === 0 ? 0.35 : 1 }} aria-label="图片前移" disabled={locked || index === 0} onClick={() => moveImage(item.nodeId, -1)}>
                                            <ArrowUp className="size-3" />
                                        </button>
                                        <button type="button" className="grid size-5 place-items-center rounded" style={{ color: theme.node.text, opacity: index === selectedImages.length - 1 ? 0.35 : 1 }} aria-label="图片后移" disabled={locked || index === selectedImages.length - 1} onClick={() => moveImage(item.nodeId, 1)}>
                                            <ArrowDown className="size-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="m-0 text-[11px]" style={{ color: theme.node.placeholder }}>还没有选择发布图片，请连接图片节点后添加。</p>
                    )}
                    {unselectedImages.length ? (
                        <div>
                            <button type="button" className="flex items-center gap-1 text-[11px] transition hover:opacity-80" style={{ color: theme.node.muted }} aria-expanded={addImagesOpen} onClick={() => setAddImagesOpen((open) => !open)}>
                                <ChevronDown className={`size-3.5 transition-transform ${addImagesOpen ? "rotate-180" : ""}`} />
                                添加上游图片（{unselectedImages.length}）
                            </button>
                            {addImagesOpen ? (
                                <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                                    {unselectedImages.map((item) => (
                                        <button key={item.nodeId} type="button" className="relative overflow-hidden rounded-md border transition hover:opacity-90" style={{ borderColor: theme.node.stroke }} aria-label={`加入发布图片：${item.title}`} disabled={locked || selectedImages.length >= PUBLISH_MAX_IMAGES} onClick={() => toggleImage(item.nodeId)}>
                                            <img src={item.image.dataUrl} alt={item.title} draggable={false} className="h-12 w-full object-cover opacity-75" />
                                            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full" style={{ background: theme.toolbar.panel, color: theme.node.text }}>
                                                <Plus className="size-3" />
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="text-[11px]" style={{ color: theme.node.placeholder }}>图片会按顺序转存到发布域名；取消选择后可在上方「添加上游图片」重新加入。</div>
                </div>
            </div>

            <div className="rounded-xl border p-2.5" style={sectionStyle}>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">扫码发布</span>
                    {record && !expired && record.status !== "confirmed" ? <span className="text-[11px]" style={{ color: theme.node.placeholder }}>有效期至 {formatPublishDeadline(record.expiresAt)}</span> : null}
                </div>

                {record ? (
                    <div className="space-y-2">
                        <div className="flex items-start gap-3">
                            {hideQr ? (
                                <div className="flex h-[216px] w-[216px] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border px-4 text-center" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: token.colorWarning }}>
                                    <CircleAlert className="size-6" />
                                    <span className="text-xs font-medium">内容已修改</span>
                                    <span className="text-[11px] leading-5">当前二维码是旧内容，请重新生成</span>
                                </div>
                            ) : (
                                <div className="shrink-0 rounded-lg bg-white p-2">
                                    <QRCode value={record.qrText} size={200} bordered={false} errorLevel="L" bgColor="#ffffff" color="#111111" status={expired ? "expired" : "active"} onRefresh={expired ? () => void generate() : undefined} />
                                </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-1 text-[11px] leading-5">
                                <div className="flex flex-wrap items-center gap-1">
                                    <Tag className="!m-0 !text-[10px]" color={record.status === "confirmed" ? "success" : "processing"}>{record.status === "confirmed" ? "已发布" : "待扫码发布"}</Tag>
                                    {record.mock ? <Tag className="!m-0 !text-[10px]" color="warning">MOCK 模拟</Tag> : null}
                                </div>
                                <p className="m-0" style={{ color: theme.node.muted }}>抖音 App 扫码 → 编辑页 → 确认发布</p>
                                <p className="m-0" style={{ color: expired ? token.colorWarning : theme.node.placeholder }}>{expired ? "二维码已过期，请重新生成。" : `有效期至 ${formatPublishDeadline(record.expiresAt)}`}</p>
                                {record.mock ? <p className="m-0" style={{ color: token.colorWarning }}>当前为模拟模式，二维码不会真正打开抖音发布页，仅用于联调。</p> : null}
                                <p className="m-0" style={{ color: hideQr ? token.colorWarning : theme.node.placeholder }}>{hideQr ? "内容已修改，当前二维码是旧内容，请重新生成。" : "修改标题/正文/图片后需要重新生成二维码。"}</p>
                            </div>
                        </div>

                        {record.status !== "confirmed" ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Button size="small" type="primary" loading={generating || uploadBusy} disabled={!channelReady || generating || uploadBusy || confirming} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => void generate()}>
                                    重新生成二维码
                                </Button>
                                <Button size="small" disabled={expired || hideQr} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => setQrOpen(true)}>
                                    放大二维码
                                </Button>
                                {uploadBusy ? <span className="text-[11px]" style={{ color: theme.node.placeholder }}>正在上传图片 {uploading.current}/{uploading.total}…</span> : null}
                            </div>
                        ) : null}

                        {node.metadata?.publishError ? (
                            <div className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, color: token.colorError }}>
                                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                                <span>{node.metadata.publishError}</span>
                            </div>
                        ) : null}

                        {issues.length ? <IssueList issues={issues} /> : null}

                        <div className="space-y-1.5 rounded-lg border p-2" style={{ borderColor: theme.node.stroke }}>
                            <div className="text-[11px] font-medium">回填作品链接</div>
                            <div className="flex items-center gap-2">
                                <Input size="small" value={publishedUrl} placeholder="https://www.douyin.com/..." style={inputStyle} onChange={(event) => setPublishedUrl(event.target.value)} onPointerDown={stopPointer} onMouseDown={stopPointer} />
                                <Button size="small" type="primary" loading={confirming} disabled={confirming} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => void confirm()}>
                                    {record.status === "confirmed" ? "更新作品链接" : "标记已发布"}
                                </Button>
                            </div>
                            {record.status === "confirmed" && record.publishedUrl ? (
                                <a href={record.publishedUrl} target="_blank" rel="noreferrer" className="block truncate text-[11px] underline underline-offset-2" style={{ color: theme.node.muted }} onPointerDown={stopPointer} onMouseDown={stopPointer}>
                                    {record.publishedUrl}
                                </a>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="m-0 text-[11px] leading-5" style={{ color: theme.node.placeholder }}>生成时会先按顺序把选中的图片转存到发布域名，再校验标题、正文和图片，通过后立即生成抖音扫码发布二维码。</p>
                        {node.metadata?.publishError ? (
                            <div className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, color: token.colorError }}>
                                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                                <span>{node.metadata.publishError}</span>
                            </div>
                        ) : null}
                        {issues.length ? <IssueList issues={issues} /> : null}
                        <div className="flex items-center gap-2">
                            <Button type="primary" size="small" loading={generating || uploadBusy} disabled={!channelReady || generating || uploadBusy || confirming || !orderedImages.length} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={() => void generate()}>
                                {generating && !uploadBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                                生成二维码
                            </Button>
                            {uploadBusy ? <span className="text-[11px]" style={{ color: theme.node.placeholder }}>正在上传图片 {uploading.current}/{uploading.total}…</span> : generating ? <span className="text-[11px]" style={{ color: theme.node.placeholder }}>正在预检并生成二维码…</span> : null}
                        </div>
                    </div>
                )}
            </div>
                </div>
            </div>

            <Modal open={qrOpen} onCancel={() => setQrOpen(false)} footer={null} centered width={520} title="抖音扫码发布" destroyOnHidden>
                <div className="flex flex-col items-center gap-3 py-2">
                    {record && !draftDirty ? <QRCode value={record.qrText} size={400} bordered={false} bgColor="#ffffff" color="#111111" /> : (
                        <p className="m-0 py-10 text-center text-sm" style={{ color: theme.node.muted }}>内容已修改，当前二维码是旧内容，请重新生成。</p>
                    )}
                    {record && !draftDirty ? <p className="m-0 text-center text-sm text-muted-foreground">抖音 App 扫码 → 编辑页 → 确认发布</p> : null}
                    {record?.mock ? <p className="m-0 text-center text-xs text-amber-500">当前为 MOCK 模式，二维码不会真正打开抖音发布页。</p> : null}
                </div>
            </Modal>
        </div>
    );
}

function IssueList({ issues }: { issues: PublishIssue[] }) {
    return (
        <ul className="m-0 list-none space-y-1 p-0">
            {issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`} className="flex items-start gap-1.5 text-[11px] leading-5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: issue.level === "error" ? canvasStatusColors.error : canvasStatusColors.loading }} />
                    <span>{issue.message}</span>
                </li>
            ))}
        </ul>
    );
}

function normalizePublishTags(values: string[]) {
    const tags: string[] = [];
    for (const value of values) {
        const tag = value.trim().replace(/^#+/, "");
        if (!tag || tags.includes(tag)) continue;
        tags.push(tag);
        if (tags.length >= PUBLISH_TAGS_LIMIT) break;
    }
    return tags;
}

function toCanvasPublishRecord(record: PublishRecord): CanvasPublishRecord {
    return {
        id: record.id,
        qrText: record.qrText,
        expiresAt: record.expiresAt,
        mock: record.mock,
        status: record.status === "confirmed" ? "confirmed" : "issued",
        publishedUrl: record.publishedUrl || undefined,
    };
}

function formatPublishDeadline(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
