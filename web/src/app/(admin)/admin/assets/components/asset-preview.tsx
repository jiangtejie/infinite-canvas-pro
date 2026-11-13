"use client";

import { Image } from "antd";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { AdminAsset } from "@/services/api/admin";

export function AssetPreview({ asset, mode = "card" }: { asset: AdminAsset; mode?: "card" | "detail" }) {
    const [failed, setFailed] = useState(false);
    const cover = asset.coverUrl || (asset.type === "image" ? asset.url : "");

    if (asset.type === "text") {
        return (
            <div className={cn("flex size-full flex-col gap-4 bg-gradient-to-br from-muted/80 to-muted/20", mode === "card" ? "justify-between p-4" : "min-h-48 rounded-xl p-5")}>
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <p className={cn("text-foreground/80", mode === "card" ? "line-clamp-4 text-[12px] leading-5" : "whitespace-pre-wrap text-[13px] leading-6")}>{asset.content || asset.description || "空文本素材"}</p>
            </div>
        );
    }

    if (asset.type === "video" && mode === "detail" && asset.url) {
        return <video src={asset.url} controls className="w-full rounded-xl border border-border" />;
    }

    if (asset.type === "audio" && mode === "detail" && asset.url) {
        return <audio src={asset.url} controls className="w-full" />;
    }

    if (cover && !failed) {
        return mode === "detail" ? (
            <Image src={cover} alt={asset.title} width="100%" className="rounded-xl" preview={{ mask: "放大" }} fallback="/logo.svg" />
        ) : (
            <img src={cover} alt={asset.title} loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
        );
    }

    const Icon = asset.type === "video" ? Video : asset.type === "audio" ? Music2 : ImageIcon;
    return (
        <div className={cn("grid place-items-center bg-muted/30", mode === "card" ? "size-full" : "min-h-40 rounded-xl")}>
            <Icon className="size-6 text-muted-foreground" />
        </div>
    );
}
