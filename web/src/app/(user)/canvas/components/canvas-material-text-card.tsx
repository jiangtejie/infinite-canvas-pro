"use client";

import { Lock } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";

/** 原始文案节点：只读参考，手改不会进入复刻；需要改原文请回到素材源重新解析。 */
export function CanvasMaterialTextCard({ node }: { node: CanvasNodeData }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const content = node.metadata?.content || "";
    return (
        <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-4 text-left" style={{ color: theme.node.text }}>
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: theme.node.placeholder }}>
                <Lock className="size-3" />
                只读参考 · 手改不会进入复刻
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">
                {content || "原文案为空"}
            </div>
        </div>
    );
}
