"use client";

import { AlertCircle, ImageIcon, Loader2, Video } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { CanvasNodeData } from "../../types";
import { filmShotMediaSummary } from "../lib/film-shot-views";

export function FilmShotMediaBadges({ theme, shot, compact = false }: { theme: CanvasTheme; shot: CanvasNodeData; compact?: boolean }) {
    const media = filmShotMediaSummary(shot);
    const size = compact ? "text-[9px]" : "text-[10px]";
    return (
        <span className={`flex flex-wrap items-center gap-1 ${size}`}>
            {media.generating ? (
                <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                    <Loader2 className="size-2.5 animate-spin" />{media.generating === "video" ? "视频" : "图片"}生成中
                </span>
            ) : (
                <>
                    {media.hasImage ? <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}><ImageIcon className="size-2.5" />图</span> : null}
                    {media.hasVideo ? <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}><Video className="size-2.5" />视频</span> : null}
                </>
            )}
            {media.failed ? <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}><AlertCircle className="size-2.5" />失败</span> : null}
        </span>
    );
}
