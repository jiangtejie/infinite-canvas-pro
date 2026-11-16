"use client";

import type { FilmGenerationContext } from "@/lib/film/types";
import { cn } from "@/lib/utils";
import { filmSignatureDigest } from "../utils/film-character";
import type { FilmMediaContextState } from "../utils/film-shot-generation";

const STATE_META: Record<FilmMediaContextState, { label: string; text: string; dot: string }> = {
    current: { label: "当前", text: "text-acid", dot: "bg-acid" },
    stale: { label: "设定已变", text: "text-amber-500", dot: "bg-amber-500" },
    incomplete: { label: "参考缺失", text: "text-amber-500", dot: "bg-amber-500" },
    unrecorded: { label: "未记录", text: "text-muted-foreground/50", dot: "bg-muted-foreground/30" },
};

export function FilmMediaStateBadge({ state, className }: { state: FilmMediaContextState; className?: string }) {
    return <span className={cn("font-mono text-[9px]", STATE_META[state].text, className)}>{STATE_META[state].label}</span>;
}

export function FilmMediaStateDot({ state, className }: { state: FilmMediaContextState; className?: string }) {
    return <span className={cn("inline-block size-1.5 rounded-full", STATE_META[state].dot, className)} />;
}

/** 展开显示某个媒体版本提交时的实际提示词、角色设定签名与参考加载情况。 */
export function FilmGenerationInfo({ context }: { context?: FilmGenerationContext }) {
    if (!context) return <p className="text-[11px] leading-5 text-muted-foreground/60">该版本未记录生成上下文，重新生成后会保存。</p>;
    const missing = new Set(context.missingReferenceIds);
    return (
        <details className="rounded-lg border border-border/60 bg-background/30 p-3">
            <summary className="cursor-pointer font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">生成信息</summary>
            <div className="mt-2 grid gap-2">
                <pre className="thin-scrollbar max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-foreground/75">{context.prompt}</pre>
                {context.characters.length ? (
                    <div className="grid gap-0.5">
                        {context.characters.map((character) => (
                            <p key={character.characterId} className="text-[10px] leading-4 text-muted-foreground/70" title={character.characterSignature}>
                                {character.characterName}{character.stateName ? ` · ${character.stateName}` : ""} · 设定签名 {character.characterSignature ? filmSignatureDigest(character.characterSignature) : "无"}
                            </p>
                        ))}
                    </div>
                ) : null}
                {context.references.length ? (
                    <div className="flex flex-wrap gap-1">
                        {context.references.map((ref) => (
                            <span key={ref.id} className={cn("chip", missing.has(ref.id) && "line-through opacity-50")}>{ref.label}{missing.has(ref.id) ? "（缺失）" : ""}</span>
                        ))}
                    </div>
                ) : null}
                {context.warnings.map((warning) => <p key={warning} className="text-[10px] leading-4 text-amber-500">{warning}</p>)}
            </div>
        </details>
    );
}