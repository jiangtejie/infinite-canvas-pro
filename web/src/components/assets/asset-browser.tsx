"use client";

import type { ReactNode } from "react";
import { Button, Tag } from "antd";

import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import type { AssetKind } from "@/stores/use-asset-store";

export type AssetFilterKind = AssetKind | "all";

const KIND_LABELS: Record<AssetKind, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };

export const ASSET_KIND_OPTIONS: Array<{ label: string; value: AssetFilterKind }> = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export function assetKindLabel(kind: AssetKind) {
    return KIND_LABELS[kind];
}

export type AssetBrowserItem = {
    id: string;
    title: string;
    coverUrl: string;
    videoUrl?: string;
    kind: AssetKind;
    summary: string;
    tags: string[];
    meta: string;
};

/** 我的素材 / 素材库共用：卡片、类型筛选、加载态与空态。 */
export function AssetBrowserCard({ item, onOpen, actions }: { item: AssetBrowserItem; onOpen: () => void; actions: ReactNode }) {
    return (
        <article className="punk-card group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
            <button type="button" className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-muted/50 text-left" onClick={onOpen} aria-label={`查看 ${item.title}`}>
                {item.coverUrl ? (
                    <img loading="lazy" decoding="async" src={item.coverUrl} alt={item.title} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : item.videoUrl ? (
                    <video src={item.videoUrl + "#t=0.1"} muted playsInline preload="metadata" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                    <span className="flex size-full items-center justify-center bg-muted/60 p-5 text-center text-xs leading-6 text-muted-foreground">{item.summary || "暂无封面"}</span>
                )}
                <span className="absolute left-2.5 top-2.5 inline-flex h-5 items-center rounded-[3px] border border-white/15 bg-black/55 px-1.5 font-mono text-[10px] tracking-[0.12em] text-white/90 uppercase backdrop-blur">
                    {assetKindLabel(item.kind)}
                </span>
            </button>
            <div className="flex flex-1 flex-col gap-2.5 p-4">
                <button type="button" className="cursor-pointer text-left" onClick={onOpen}>
                    <h2 className="line-clamp-1 text-sm font-medium text-foreground">{item.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.summary}</p>
                </button>
                <div className="flex flex-wrap gap-1.5">
                    {item.tags.slice(0, 3).map((tag) => (
                        <Tag key={tag} className="!m-0 !rounded-[3px] !text-[10px]">{tag}</Tag>
                    ))}
                    {!item.tags.length ? <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground/60 uppercase">无标签</span> : null}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <span className="truncate font-mono text-[10px] tracking-[0.1em] text-muted-foreground/70 uppercase">{item.meta}</span>
                    <div className="flex shrink-0 items-center gap-1">{actions}</div>
                </div>
            </div>
        </article>
    );
}

export function AssetKindFilter({ value, onChange }: { value: AssetFilterKind; onChange: (value: AssetFilterKind) => void }) {
    return <FilterTagGroup inline options={ASSET_KIND_OPTIONS} isSelected={(option) => option === value} onSelect={(option) => onChange(option as AssetFilterKind)} />;
}

export function AssetBrowserEmpty({ onClear, className }: { onClear: () => void; className?: string }) {
    return (
        <EmptyState
            className={cn("rounded-xl border border-dashed border-border bg-card/40", className)}
            title="没有找到素材"
            description="调整类型、分类、标签或搜索关键词后再试。"
            action={<Button onClick={onClear}>清空筛选</Button>}
        />
    );
}

export function AssetBrowserLoading({ label = "正在加载素材", className }: { label?: string; className?: string }) {
    return <LoadingState className={cn("min-h-[320px] rounded-xl border border-dashed border-border", className)} label={label} />;
}
