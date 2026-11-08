"use client";

import { Button } from "antd";
import { ArrowLeft, ArrowRight, Film, ImagePlus, Music2, Trash2 } from "lucide-react";

import { ReferenceStripShell } from "@/components/workbench/reference-strip";
import { SEEDANCE_REFERENCE_LIMITS, seedanceReferenceLabel } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export function ReferenceImageStrip({ references, compact = false, maxCount = SEEDANCE_REFERENCE_LIMITS.images, onRemoveReference, onMoveReference }: { references: ReferenceImage[]; compact?: boolean; maxCount?: number; onRemoveReference: (id: string) => void; onMoveReference: (index: number, offset: number) => void }) {
    return (
        <ReferenceStripShell compact={compact}>
            {references.map((item, index) => (
                <div key={item.id} className={`${compact ? "size-12" : "size-20"} group relative shrink-0 overflow-hidden rounded-md border border-border`}>
                    <img loading="lazy" decoding="async" src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{seedanceReferenceLabel("image", index)}</span>
                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => onMoveReference(index, offset)} />
                    <button type="button" className="absolute right-1 top-1 flex size-6 items-center justify-center rounded bg-black/60 text-white shadow-sm" onClick={() => onRemoveReference(item.id)} aria-label="移除参考图">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {!references.length ? (
                <div className={`flex min-w-full flex-col items-center justify-center gap-1.5 text-center ${compact ? "py-1" : "py-3"}`}>
                    <span className="flex size-8 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/40 text-muted-foreground">
                        <ImagePlus className="size-4" aria-hidden />
                    </span>
                    <span className="text-xs text-muted-foreground">暂无参考图</span>
                    {compact ? null : <span className="text-[10px] text-muted-foreground/70">最多 {maxCount} 张</span>}
                </div>
            ) : null}
        </ReferenceStripShell>
    );
}

export function ReferenceVideoStrip({ references, compact = false, maxCount = SEEDANCE_REFERENCE_LIMITS.videos, onRemoveReference, onMoveReference }: { references: ReferenceVideo[]; compact?: boolean; maxCount?: number; onRemoveReference: (id: string) => void; onMoveReference: (index: number, offset: number) => void }) {
    return (
        <ReferenceStripShell compact={compact}>
            {references.map((item, index) => (
                <div key={item.id} className={`${compact ? "h-12 w-20" : "h-20 w-32"} group relative shrink-0 overflow-hidden rounded-md border border-border bg-black`}>
                    <video src={item.url} className="size-full object-cover" muted preload="metadata" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{seedanceReferenceLabel("video", index)}</span>
                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => onMoveReference(index, offset)} />
                    <button type="button" className="absolute right-1 top-1 flex size-6 items-center justify-center rounded bg-black/60 text-white shadow-sm" onClick={() => onRemoveReference(item.id)} aria-label="移除参考视频">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {!references.length ? (
                <div className={`flex min-w-full flex-col items-center justify-center gap-1.5 text-center ${compact ? "py-1" : "py-3"}`}>
                    <span className="flex size-8 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/40 text-muted-foreground">
                        <Film className="size-4" aria-hidden />
                    </span>
                    <span className="text-xs text-muted-foreground">暂无参考视频</span>
                    {compact ? null : <span className="text-[10px] text-muted-foreground/70">最多 {maxCount} 个</span>}
                </div>
            ) : null}
        </ReferenceStripShell>
    );
}

export function ReferenceAudioStrip({ references, compact = false, maxCount = SEEDANCE_REFERENCE_LIMITS.audios, onRemoveReference, onMoveReference }: { references: ReferenceAudio[]; compact?: boolean; maxCount?: number; onRemoveReference: (id: string) => void; onMoveReference: (index: number, offset: number) => void }) {
    return (
        <ReferenceStripShell compact={compact}>
            {references.map((item, index) => (
                <div key={item.id} className={`${compact ? "h-12 w-40" : "h-20 w-48"} group relative flex shrink-0 flex-col justify-center gap-2 rounded-md border border-border bg-muted px-2`}>
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <Music2 className="size-4 shrink-0" />
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-foreground/80">{seedanceReferenceLabel("audio", index)}</span>
                        <span className="truncate">{item.name}</span>
                    </div>
                    {!compact ? <audio src={item.url} controls className="h-8 w-full" preload="metadata" /> : null}
                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => onMoveReference(index, offset)} />
                    <button type="button" className="absolute right-1 top-1 flex size-6 items-center justify-center rounded bg-black/60 text-white shadow-sm" onClick={() => onRemoveReference(item.id)} aria-label="移除参考音频">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {!references.length ? (
                <div className={`flex min-w-full flex-col items-center justify-center gap-1.5 text-center ${compact ? "py-1" : "py-3"}`}>
                    <span className="flex size-8 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/40 text-muted-foreground">
                        <Music2 className="size-4" aria-hidden />
                    </span>
                    <span className="text-xs text-muted-foreground">暂无参考音频</span>
                    {compact ? null : <span className="text-[10px] text-muted-foreground/70">最多 {maxCount} 个 · mp3/wav · 单个 15MB 内</span>}
                </div>
            ) : null}
        </ReferenceStripShell>
    );
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}
