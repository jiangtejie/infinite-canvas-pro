"use client";

import { AlertTriangle, History, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_CONTEXT_ROLE_LABELS } from "../lib/film-studio-types";
import { FILM_REFERENCE_ROLE_LABELS } from "../lib/film-reference-labels";
import { useCopyText } from "@/hooks/use-copy-text";
import type { FilmShotNodeData } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmContextLens } from "../lib/film-context-lens";

export function FilmShotContextPanel({ theme, filmShot, media, preview, onClose }: {
    theme: CanvasTheme;
    filmShot?: FilmShotNodeData;
    media: "image" | "video";
    preview?: FilmContextLens | null;
    onClose: () => void;
}) {
    const copyText = useCopyText();
    const versions = (media === "video" ? filmShot?.videoVersions : filmShot?.imageVersions) ?? [];
    const currentUrl = media === "video" ? filmShot?.videoUrl : filmShot?.imageUrl;
    const currentStorageKey = media === "video" ? filmShot?.videoStorageKey : filmShot?.storageKey;
    const activeVersion = versions.find((version) => (currentUrl && version.url === currentUrl) || (currentStorageKey && version.storageKey === currentStorageKey)) ?? versions.at(-1);
    const activeIndex = activeVersion ? versions.indexOf(activeVersion) : -1;
    const pending = filmShot?.pendingTask;
    const context = pending?.generationContext ?? activeVersion?.generationContext;
    const sceneDetails = preview?.scene
        ? [preview.scene.location && `地点 ${preview.scene.location}`, preview.scene.time && `时间 ${preview.scene.time}`, preview.scene.mood && `氛围 ${preview.scene.mood}`, preview.scene.notes && `备注 ${preview.scene.notes}`].filter(Boolean).join(" · ")
        : "";
    const previewIssues = preview
        ? [...new Map(preview.issues.map((issue) => [issue.message, issue])).values()]
        : [];

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
                    {versions.length ? <span>· {versions.length} 个版本</span> : null}
                    {pending ? <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>本次{pending.kind === "video" ? "视频" : "图片"}生成中</span> : null}
                </div>
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
                                            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{FILM_REFERENCE_ROLE_LABELS[reference.role] || reference.role}</span>
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
                ) : preview ? (
                    <>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                            <span>{media === "video" ? "视频" : "分镜图"} · 本次将使用</span>
                            <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: preview.ready ? theme.node.stroke : canvasStatusColors.error, color: preview.ready ? theme.node.muted : canvasStatusColors.error }}>{preview.ready ? "可生成" : "需补充"}</span>
                        </div>
                        <section className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>上下文来源</span>
                            <div className="flex flex-wrap gap-1">
                                {preview.scene ? <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>场次 · {preview.scene.label}</span> : null}
                                {preview.styleName ? <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>风格 · {preview.styleName}</span> : null}
                                {preview.previousShot ? <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>上一镜 · #{preview.previousShot.shotNo}</span> : null}
                                {preview.contexts.map((context) => <span key={context.edgeId} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{FILM_CONTEXT_ROLE_LABELS[context.role]} · {context.name}{context.stateName ? ` · ${context.stateName}` : ""}{context.variantName ? ` · ${context.variantName}` : ""}</span>)}
                            </div>
                            {sceneDetails ? <span className="text-[11px] leading-5" style={{ color: theme.node.muted }}>{sceneDetails}</span> : null}
                        </section>
                        <ContextSection theme={theme} title="将使用的提示词" onCopy={() => copyText(preview.prompt, "提示词已复制")}><PromptText theme={theme} value={preview.prompt} /></ContextSection>
                        {preview.references.length ? (
                            <section className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>参考 · {preview.references.length}</span>
                                <div className="flex flex-col gap-1">
                                    {preview.references.map((reference) => (
                                        <div key={`${reference.role}-${reference.label}`} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                                            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{FILM_REFERENCE_ROLE_LABELS[reference.role] || reference.role}</span>
                                            <span className="truncate" style={{ color: theme.node.text }} title={reference.label}>{reference.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {previewIssues.length ? (
                            <section className="flex flex-col gap-1.5">
                                {previewIssues.map((issue) => <div key={issue.message} className="flex items-start gap-1.5 text-[11px] leading-4" style={{ color: issue.level === "error" ? canvasStatusColors.error : canvasStatusColors.loading }}><AlertTriangle className="mt-0.5 size-3 shrink-0" />{issue.message}</div>)}
                            </section>
                        ) : null}
                        <div className="border-t pt-2 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                            生成前预览{preview.compilerVersion ? ` · 编译器 ${preview.compilerVersion}` : ""}
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
