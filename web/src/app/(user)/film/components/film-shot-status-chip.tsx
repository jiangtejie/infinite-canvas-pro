import { cn } from "@/lib/utils";
import type { FilmShotStatus } from "../types";

export function FilmShotStatusChip({ status }: { status: FilmShotStatus }) {
    const style = status === "video_ready"
        ? "border-acid/60 bg-acid/10 text-acid"
        : status === "image_ready"
            ? "border-acid/40 text-acid/90"
            : status === "failed"
                ? "border-hot/50 text-hot"
                : "border-border/70 text-muted-foreground/70";
    const label = status === "video_ready" ? "视频" : status === "image_ready" ? "分镜图" : status === "failed" ? "失败" : "未开始";
    return <span className={cn("rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-wide", style)}>{label}</span>;
}
