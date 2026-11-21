"use client";

import { AlertTriangle, History, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmGenerationReferenceRole, FilmMediaVersion } from "@/lib/film/types";
import { useCopyText } from "@/hooks/use-copy-text";
import type { FilmShotNodeData } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";

const REFERENCE_ROLE_LABELS: Record<FilmGenerationReferenceRole, string> = {
    "character-package": "角色母版",
    "character-state": "造型",
    "character-detail": "部位",
    "character-expression": "表情",
    costume: "服装",
    prop: "道具",
    location: "场景",
    "location-variant": "场景变体",
    style: "风格",
    "previous-shot": "上一镜",
    "anchor-shot": "锚定镜",
    storyboard: "分镜参考",
    "first-frame": "首帧",
    "last-frame": "尾帧",
};

export function FilmShotContextPanel({ theme, filmShot, media, onSelectVersion, onClose }: {
    theme: CanvasTheme;
    filmShot?: FilmShotNodeData;
    media: "image" | "video";
    onSelectVersion: (version: FilmMediaVersion) => void;
    onClose: () => void;
}) {
    const copyText = useCopyText();
    const versions = (media === "video" ? filmShot?.videoVersions : filmShot?.imageVersions) ?? [];
    const currentUrl = media === "video" ? filmShot?.videoUrl : filmShot?.imageUrl;
    const activeVersion = versions.find((version) => version.url === currentUrl) ?? versions.at(-1);
    const activeIndex = activeVersion ? versions.indexOf(activeVersion) : -1;
    const pending = filmShot?.pendingTask;
    const context = pending?.generationContext ?? activeVersion?.generationContext;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium"><History className="size-4" style={{ color: theme.node.muted }} />生成信息</span>
                <button type="button" className="grid size-7 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭生成信息">
                    <X className="size-4" />
                </button>
            </div>
            <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                    <span>{media === "video" ? "视频" : "分镜图"}</span>
                    {activeIndex >= 0 ? <span>· 当前 v{activeIndex + 1}</span> : null}
                    {pending ? <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>本次{pending.kind === "video" ? "视频" : "图片"}生成中</span> : null}
                </div>
                <section className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>版本历史 · {versions.length}</span>
                    {versions.length ? [...versions].reverse().map((version) => {
                        const index = versions.indexOf(version);
                        const active = activeVersion?.id === version.id;
                        return (
                            <button key={version.id} type="button" className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs" style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.fill, color: theme.node.text }} onClick={() => onSelectVersion(version)} aria-pressed={active}>
                                <span className="font-mono tabular-nums">v{index + 1}</span>
                                <span className="min-w-0 flex-1 truncate" style={{ color: theme.node.muted }}>{formatVersionTime(version.createdAt)}</span>
                                {version.generationContext ? <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>有上下文</span> : null}
                                {active ? <span className="shrink-0 text-[10px]" style={{ color: theme.canvas.selectionStroke }}>当前</span> : null}
                            </button>
                        );
                    }) : <span className="text-[11px]" style={{ color: theme.node.muted }}>还没有生成版本。</span>}
                </section>
                {context ? (
                    <>
                        {pending ? <ContextSection theme={theme} title="本次生成提示词" onCopy={() => copyText(context.prompt, "提示词已复制")}><PromptText theme={theme} value={context.prompt} /></ContextSection> : (
                            <ContextSection theme={theme} title="当前版本提示词" onCopy={() => copyText(context.prompt, "提示词已复制")}><PromptText theme={theme} value={context.prompt} /></ContextSection>
                        )}
                        {context.characters.length ? (
                            <section className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>角色 · {context.characters.length}</span>
                                <div className="flex flex-wrap gap-1">
                                    {context.characters.map((character) => <span key={character.characterId} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{character.characterName}{character.stateName ? ` · ${character.stateName}` : ""}</span>)}
                                </div>
                            </section>
                        ) : null}
                        {context.references.length ? (
                            <section className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>参考 · {context.references.length}</span>
                                <div className="flex flex-col gap-1">
                                    {context.references.map((reference) => (
                                        <div key={reference.id} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                                            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{REFERENCE_ROLE_LABELS[reference.role] || reference.role}</span>
                                            <span className="truncate" style={{ color: theme.node.text }} title={reference.label}>{reference.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {context.warnings.length || context.missingReferenceIds.length ? (
                            <section className="flex flex-col gap-1.5">
                                {context.missingReferenceIds.length ? <div className="flex items-start gap-1.5 text-[11px]" style={{ color: canvasStatusColors.error }}><AlertTriangle className="mt-0.5 size-3 shrink-0" />缺参考 {context.missingReferenceIds.length} 项</div> : null}
                                {context.warnings.map((warning) => <div key={warning} className="flex items-start gap-1.5 text-[11px]" style={{ color: canvasStatusColors.loading }}><AlertTriangle className="mt-0.5 size-3 shrink-0" />{warning}</div>)}
                            </section>
                        ) : null}
                        <div className="border-t pt-2 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                            编译器 {context.compilerVersion} · {formatVersionTime(context.createdAt)}
                        </div>
                    </>
                ) : <span className="text-[11px] leading-5" style={{ color: theme.node.muted }}>{versions.length ? "该版本没有记录生成上下文，可能是上传或旧版本。" : "生成后会自动记录提示词、角色与参考。"}</span>}
            </div>
        </div>
    );
}

function ContextSection({ theme, title, onCopy, children }: { theme: CanvasTheme; title: string; onCopy: () => void; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
                <button type="button" className="text-[10px] underline underline-offset-2" style={{ color: theme.node.muted }} onClick={onCopy}>复制</button>
            </div>
            {children}
        </section>
    );
}

function PromptText({ theme, value }: { theme: CanvasTheme; value: string }) {
    return <div className="thin-scrollbar max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg border px-2 py-1.5 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}>{value || "—"}</div>;
}

function formatVersionTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
