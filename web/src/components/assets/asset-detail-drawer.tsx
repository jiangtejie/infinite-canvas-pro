"use client";

import type { ReactNode } from "react";
import { Copy, Download } from "lucide-react";
import { Button, Drawer, Image, Tag } from "antd";
import { saveAs } from "file-saver";

import { assetKindLabel } from "@/components/assets/asset-browser";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AssetKind } from "@/stores/use-asset-store";

export type AssetDetailModel = {
    kind: AssetKind;
    title: string;
    coverUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    fallbackText?: string;
    tags?: string[];
    category?: string;
    textContent?: string;
    contentUrl?: string;
    prompt?: string;
    description?: string;
    metaLines?: Array<[string, string]>;
    copyValue?: string;
    inlineCopy?: boolean;
    downloadUrl?: string;
    downloadFileName?: string;
    actionLabel?: string;
};

/** 我的素材 / 素材库共用详情抽屉：两页只负责把数据映射成 AssetDetailModel 并补「加入我的素材」动作。 */
export function AssetDetailDrawer({ detail, onClose, extraActions }: { detail: AssetDetailModel | null; onClose: () => void; extraActions?: ReactNode }) {
    const copyText = useCopyText();
    const copySuccessText = detail?.textContent ? "文本已复制" : "链接已复制";
    const copy = detail?.copyValue ? () => copyText(detail.copyValue!, copySuccessText) : undefined;

    return (
        <Drawer title="素材详情" open={Boolean(detail)} size="large" onClose={onClose} destroyOnHidden>
            {detail ? (
                <div className="grid gap-4">
                    {detail.videoUrl ? (
                        <video src={detail.videoUrl} controls className="aspect-video w-full rounded-xl border border-border/60 bg-black" />
                    ) : detail.audioUrl ? (
                        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                            <audio src={detail.audioUrl} controls className="w-full" />
                        </div>
                    ) : detail.coverUrl ? (
                        <Image src={detail.coverUrl} alt={detail.title} className="rounded-xl border border-border/60" style={{ maxHeight: "42vh", width: "auto", maxWidth: "100%", objectFit: "contain" }} preview={{ getContainer: () => document.body }} />
                    ) : detail.fallbackText ? (
                        <div className="rounded-lg border border-border bg-muted p-5 text-sm leading-6 text-muted-foreground">{detail.fallbackText}</div>
                    ) : null}

                    <div>
                        <h2 className="break-words text-lg font-semibold leading-7 text-foreground">{detail.title || "未命名素材"}</h2>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Tag className="!m-0">{assetKindLabel(detail.kind)}</Tag>
                            {detail.category ? <Tag className="!m-0" color="processing">{detail.category}</Tag> : null}
                            {(detail.tags || []).map((tag) => <Tag key={tag} className="!m-0">{tag}</Tag>)}
                        </div>
                    </div>

                    {detail.textContent || detail.contentUrl ? (
                        <section className="grid gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">内容</span>
                                {copy && detail.inlineCopy ? (
                                    <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={copy}>
                                        {detail.actionLabel || "复制"}
                                    </Button>
                                ) : null}
                            </div>
                            {detail.textContent ? (
                                <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground/85">{detail.textContent}</p>
                            ) : (
                                <p className="break-words text-xs leading-6 text-foreground/85">{detail.contentUrl}</p>
                            )}
                        </section>
                    ) : null}

                    {detail.prompt ? (
                        <section className="grid gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">提示词</span>
                                <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(detail.prompt!, "提示词已复制")}>复制提示词</Button>
                            </div>
                            <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-background/40 px-2.5 py-2 font-mono text-[11px] leading-6 text-foreground/80">{detail.prompt}</p>
                        </section>
                    ) : null}

                    {detail.metaLines?.length ? (
                        <section className="grid gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">文件信息</span>
                            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                                {detail.metaLines.map(([label, value]) => (
                                    <div key={label} className="grid gap-0.5">
                                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{label}</span>
                                        <span className="break-words text-[11px] leading-5 text-foreground/80">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}

                    {detail.description ? <p className="text-xs leading-6 text-muted-foreground">{detail.description}</p> : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                        {detail.downloadUrl ? (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => saveAs(detail.downloadUrl!, detail.downloadFileName || "asset")}>
                                {detail.actionLabel || "下载"}
                            </Button>
                        ) : copy ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={copy}>
                                {detail.actionLabel || "复制"}
                            </Button>
                        ) : null}
                        {extraActions}
                    </div>
                </div>
            ) : null}
        </Drawer>
    );
}
