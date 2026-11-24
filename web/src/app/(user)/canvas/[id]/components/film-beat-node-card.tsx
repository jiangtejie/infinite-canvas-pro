"use client";

import { useMemo } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { activeSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { FilmNodeShell, type FilmNodeShellAction } from "./film-node-shell";
import { summarizeFilmNode } from "../lib/film-node-summary";
import { filmBeatFrameCount, filmBeatFramesComplete, filmBeatHasContent, filmBeatIsBusy, selectFilmBeatContexts, updateFilmBeatFrame } from "../lib/film-beat";
import { FILM_CONTEXT_ROLE_LABELS } from "../lib/film-studio-types";
import type { FilmNodeCardProps } from "../../components/film-node-card";

/** 动作节拍卡片：总提示词、可编辑九格、非空帧数与关联镜头/上下文只读投影。 */
export function FilmBeatNodeCard(props: FilmNodeCardProps) {
    const beat = props.node.metadata?.filmBeat;
    const summary = useMemo(
        () => props.summary ?? summarizeFilmNode(props.node, props.nodes, props.connections, props.summaryOptions),
        [props.node, props.nodes, props.connections, props.summary, props.summaryOptions],
    );
    const linked = useMemo(() => selectFilmBeatContexts(props.nodes, props.connections, props.node.id), [props.connections, props.node.id, props.nodes]);
    const frameCount = beat ? filmBeatFrameCount(beat.mode) : 9;
    const frames = Array.from({ length: frameCount }, (_, index) => beat?.frames[index] || "");
    const filled = frames.filter((frame) => frame.trim()).length;
    const preview = activeSlotImage(beat?.preview);
    const previewSrc = useResolvedMediaSrc(preview?.url, preview?.storageKey);
    const busy = filmBeatIsBusy(props.node);
    const actions: FilmNodeShellAction[] = [];
    if (props.onDecomposeBeat) actions.push({ label: "AI 拆解动作", primary: !busy, disabled: busy || !filmBeatHasContent(beat), onClick: () => props.onDecomposeBeat?.(props.node.id) });
    if (busy) {
        if (props.onStopBeatTask) actions.push({ label: "停止生成", primary: true, onClick: () => props.onStopBeatTask?.(props.node.id) });
    } else if (props.onGenerateBeatPreview) {
        actions.push({ label: "生成九宫格预览", disabled: !filmBeatFramesComplete(beat), onClick: () => props.onGenerateBeatPreview?.(props.node.id) });
    }
    if (props.onLocateBeatShots) {
        actions.push({
            label: linked.shots.length ? `定位引用镜头 ${linked.shots.length}` : "定位引用镜头",
            disabled: !linked.shots.length,
            onClick: () => props.onLocateBeatShots?.(props.node.id),
        });
    }
    if (props.onEditAsset) actions.push({ label: "编辑节点", onClick: () => props.onEditAsset?.(props.node.id) });

    return (
        <FilmNodeShell node={props.node} theme={props.theme} summary={summary} onTitleChange={props.onTitleChange} actions={actions}>
            <div className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: props.theme.node.muted }}>
                    <span>{beat?.mode === "grid4" ? "四宫格动作" : beat?.mode === "timeline" ? "时间轴节拍" : "九宫格动作"}</span>
                    <span>节拍 {filled}/{frameCount} · 关联 {linked.shots.length} 镜</span>
                </div>
                <div className="flex items-start gap-2">
                    <p className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5" style={{ color: props.theme.node.text }}>
                        {beat?.prompt || "总提示词尚未填写"}
                    </p>
                    {previewSrc ? (
                        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded border" style={{ borderColor: props.theme.node.stroke, background: props.theme.node.fill }} onPointerDown={(event) => event.stopPropagation()}>
                            <img src={previewSrc} alt={beat?.title || "九宫格预览"} className="max-h-full max-w-full object-contain" draggable={false} />
                        </div>
                    ) : null}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {frames.map((frame, index) => (
                        <label key={index} className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[9px]" style={{ color: props.theme.node.muted }}>节拍 {index + 1}</span>
                            <textarea
                                value={frame}
                                rows={2}
                                maxLength={120}
                                readOnly={!props.onUpdateBeat}
                                placeholder="动作"
                                aria-label={`节拍 ${index + 1}`}
                                className="thin-scrollbar min-h-11 w-full resize-none rounded border p-1 text-[10px] leading-4 outline-none"
                                style={{ borderColor: props.theme.node.stroke, background: props.theme.node.fill, color: props.theme.node.text }}
                                onPointerDown={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                                onDoubleClick={(event) => event.stopPropagation()}
                                onContextMenu={(event) => event.stopPropagation()}
                                onWheelCapture={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    props.onUpdateBeat?.(props.node.id, (node) => updateFilmBeatFrame(node, index, value));
                                }}
                            />
                        </label>
                    ))}
                </div>
                {summary.status === "loading" ? <BeatProgress theme={props.theme} progress={summary.progress || 0} /> : null}
                {beat?.errorMessage || summary.status === "error" ? (
                    <div className="line-clamp-2 break-words text-[10px]" style={{ color: canvasStatusColors.error }}>{beat?.errorMessage || "生成失败"}</div>
                ) : null}
                <div className="flex flex-col gap-0.5 text-[10px] leading-4" style={{ color: props.theme.node.muted }}>
                    <span className="break-words">关联镜头：{linked.shots.length ? linked.shots.map((shot) => shot.shotNo).join("、") : "无"}</span>
                    <span className="break-words">上下文：{linked.contexts.length ? linked.contexts.map((context) => `${FILM_CONTEXT_ROLE_LABELS[context.role]}·${context.name}`).join(" / ") : "无"}</span>
                </div>
            </div>
        </FilmNodeShell>
    );
}

function BeatProgress({ theme, progress }: { theme: CanvasTheme; progress: number }) {
    return (
        <div className="flex items-center gap-2 text-[10px]" style={{ color: canvasStatusColors.loading }}>
            <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: canvasStatusColors.loading }} />
            </div>
            <span>{Math.round(progress)}%</span>
        </div>
    );
}
