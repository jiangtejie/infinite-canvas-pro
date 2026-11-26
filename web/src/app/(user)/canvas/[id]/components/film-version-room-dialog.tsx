"use client";

import { useEffect, useState } from "react";
import { Check, Play, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmMediaVersion } from "@/lib/film/types";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { FILM_REFERENCE_ROLE_LABELS } from "../lib/film-reference-labels";
import { defaultFilmVersionPair, filmVersionSummary, type FilmVersionKind, type FilmVersionShot } from "../lib/film-version-room";

export type FilmVersionRoomMode = "compare" | "batch";

type Props = {
    theme: CanvasTheme;
    mode: FilmVersionRoomMode;
    kind: FilmVersionKind;
    shots: FilmVersionShot[];
    activeShotId: string | null;
    picks: Record<string, string>;
    onModeChange: (mode: FilmVersionRoomMode) => void;
    onKindChange: (kind: FilmVersionKind) => void;
    onSetCurrent: (shotId: string, kind: FilmVersionKind, versionId: string) => void;
    onPick: (shotId: string, versionId: string) => void;
    onApply: () => void;
    onClose: () => void;
};

export function FilmVersionRoomDialog({ theme, mode, kind, shots, activeShotId, picks, onModeChange, onKindChange, onSetCurrent, onPick, onApply, onClose }: Props) {
    const activeShot = shots.find((shot) => shot.shotId === activeShotId) ?? shots[0] ?? null;
    const [leftId, setLeftId] = useState<string | null>(null);
    const [rightId, setRightId] = useState<string | null>(null);
    useEffect(() => {
        const pair = activeShot ? defaultFilmVersionPair(activeShot) : { leftId: null, rightId: null };
        setLeftId(pair.leftId);
        setRightId(pair.rightId);
    }, [activeShot]);
    const pickCount = Object.keys(picks).length;
    return (
        <Modal open onCancel={onClose} footer={null} closable={false} centered width="min(1280px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="text-base font-semibold">版本评审</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>对比版本或为多个镜头挑选最佳版本；历史版本始终保留。</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                            {(["compare", "batch"] as const).map((value) => (
                                <button key={value} type="button" className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: mode === value ? theme.canvas.selectionSoft : undefined, color: mode === value ? theme.node.text : theme.node.muted }} onClick={() => onModeChange(value)}>{value === "compare" ? "当前镜对比" : `批量挑选${pickCount ? ` · ${pickCount}` : ""}`}</button>
                            ))}
                        </div>
                        <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                            {(["image", "video"] as const).map((value) => (
                                <button key={value} type="button" className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: kind === value ? theme.canvas.selectionSoft : undefined, color: kind === value ? theme.node.text : theme.node.muted }} onClick={() => onKindChange(value)}>{value === "image" ? "分镜图" : "视频"}</button>
                            ))}
                        </div>
                        <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭版本评审"><X className="size-4" /></button>
                    </div>
                </div>
                {mode === "compare" ? (
                    activeShot ? (
                        <div className="thin-scrollbar max-h-[74vh] overflow-y-auto px-5 py-4">
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                <span>镜头 #{activeShot.shotNo}</span>
                                <span>· {activeShot.versions.length} 个版本</span>
                            </div>
                            <div className={`grid gap-3 ${activeShot.versions.length > 1 ? "md:grid-cols-2" : ""}`}>
                                <VersionPane theme={theme} kind={kind} version={activeShot.versions.find((version) => version.id === leftId) ?? null} versions={activeShot.versions} selectedId={leftId} onSelect={setLeftId} currentId={activeShot.currentVersionId} onSetCurrent={(versionId) => onSetCurrent(activeShot.shotId, kind, versionId)} />
                                {activeShot.versions.length > 1 ? <VersionPane theme={theme} kind={kind} version={activeShot.versions.find((version) => version.id === rightId) ?? null} versions={activeShot.versions} selectedId={rightId} onSelect={setRightId} currentId={activeShot.currentVersionId} onSetCurrent={(versionId) => onSetCurrent(activeShot.shotId, kind, versionId)} /> : null}
                            </div>
                        </div>
                    ) : <div className="grid min-h-[220px] place-items-center px-5 text-sm" style={{ color: theme.node.muted }}>当前镜头还没有可对比的{kind === "image" ? "分镜图" : "视频"}版本。</div>
                ) : (
                    <>
                        <div className="thin-scrollbar max-h-[68vh] overflow-y-auto px-5 py-4">
                            {shots.length ? (
                                <div className="grid gap-3 lg:grid-cols-2">
                                    {shots.map((shot) => {
                                        const currentIndex = shot.versions.findIndex((version) => version.id === shot.currentVersionId);
                                        const pickedIndex = picks[shot.shotId] ? shot.versions.findIndex((version) => version.id === picks[shot.shotId]) : -1;
                                        return (
                                            <section key={shot.shotId} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: picks[shot.shotId] ? theme.canvas.selectionStroke : theme.node.stroke, background: theme.node.fill }}>
                                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                                    <span className="font-mono tabular-nums" style={{ color: theme.node.text }}>#{shot.shotNo}</span>
                                                    <span style={{ color: theme.node.muted }}>{shot.versions.length} 个版本</span>
                                                    {currentIndex >= 0 ? <span style={{ color: theme.node.muted }}>当前 v{currentIndex + 1}</span> : null}
                                                    <span className="ml-auto text-[10px]" style={{ color: pickedIndex >= 0 ? theme.canvas.selectionStroke : theme.node.muted }}>{pickedIndex >= 0 ? `已选 v${pickedIndex + 1}` : "点击缩略图选择最佳"}</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                    {shot.versions.map((version, index) => (
                                                        <VersionThumb key={version.id} theme={theme} kind={kind} version={version} index={index} current={version.id === shot.currentVersionId} picked={picks[shot.shotId] === version.id} onClick={() => onPick(shot.shotId, version.id)} />
                                                    ))}
                                                </div>
                                            </section>
                                        );
                                    })}
                                </div>
                            ) : <div className="grid min-h-[220px] place-items-center text-sm" style={{ color: theme.node.muted }}>没有多版本{kind === "image" ? "分镜图" : "视频"}可挑选。</div>}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                            <span className="text-[11px]" style={{ color: theme.node.muted }}>已选 {pickCount} 镜；应用后只切换当前版本，不删除历史。</span>
                            <div className="flex gap-2">
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>取消</button>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!pickCount} onClick={onApply}>应用 {pickCount} 镜最佳版本</button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

function VersionPane({ theme, kind, version, versions, selectedId, onSelect, currentId, onSetCurrent }: {
    theme: CanvasTheme;
    kind: FilmVersionKind;
    version: FilmMediaVersion | null;
    versions: FilmMediaVersion[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    currentId: string | null;
    onSetCurrent: (id: string) => void;
}) {
    const src = useResolvedMediaSrc(version?.url, version?.storageKey, kind === "video" ? "media" : undefined);
    const summary = version ? filmVersionSummary(version) : null;
    const index = version ? versions.findIndex((item) => item.id === version.id) : -1;
    return (
        <section className="flex min-w-0 flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex items-center gap-2">
                <select className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[11px]" style={{ background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)} aria-label="选择对比版本">
                    {versions.map((item, itemIndex) => <option key={item.id} value={item.id}>v{itemIndex + 1} · {formatTime(item.createdAt)}</option>)}
                </select>
                {version && version.id === currentId ? <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.canvas.selectionStroke, color: theme.canvas.selectionStroke }}>当前</span> : null}
            </div>
            <div className="grid aspect-video place-items-center overflow-hidden rounded-md" style={{ background: theme.canvas.background }}>
                {src ? (kind === "image" ? <img src={src} alt="" className="h-full w-full object-contain" /> : <video src={src} controls className="h-full w-full object-contain" />) : <span className="text-[11px]" style={{ color: theme.node.muted }}>媒体不可用</span>}
            </div>
            <div className="flex flex-wrap gap-1 text-[10px]" style={{ color: theme.node.muted }}>
                <span>v{index + 1}</span>
                {summary?.characters.length ? <span>· 角色 {summary.characters.length}</span> : null}
                {summary?.references.length ? <span>· 参考 {summary.references.length}</span> : null}
                {summary?.warnings.length ? <span style={{ color: canvasStatusColors.loading }}>· 警告 {summary.warnings.length}</span> : null}
                {summary?.missing ? <span style={{ color: canvasStatusColors.error }}>· 缺参考 {summary.missing}</span> : null}
            </div>
            {summary?.hasContext ? (
                <>
                    <div className="thin-scrollbar max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border px-2 py-1.5 text-[10px] leading-4" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        {summary.prompt || "该版本没有记录生成提示词。"}
                    </div>
                    <div className="thin-scrollbar flex max-h-24 flex-col gap-1.5 overflow-y-auto rounded-md border px-2 py-1.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        {summary.characters.length ? <div className="flex flex-wrap gap-1">{summary.characters.map((character, characterIndex) => <span key={`${character.name}-${characterIndex}`} className="rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{character.name}{character.stateName ? ` · ${character.stateName}` : ""}</span>)}</div> : null}
                        {summary.references.length ? <div className="flex flex-col gap-0.5">{summary.references.map((reference, referenceIndex) => <div key={`${reference.role}-${referenceIndex}`} className="flex min-w-0 items-center gap-1"><span className="shrink-0 rounded border px-1 py-0.5" style={{ borderColor: theme.node.stroke }}>{FILM_REFERENCE_ROLE_LABELS[reference.role] || reference.role}</span><span className="truncate" style={{ color: theme.node.text }}>{reference.label}</span></div>)}</div> : null}
                        {summary.warnings.map((warning, warningIndex) => <div key={`${warning}-${warningIndex}`} style={{ color: canvasStatusColors.loading }}>警告：{warning}</div>)}
                        {summary.missing ? <div style={{ color: canvasStatusColors.error }}>缺参考 {summary.missing} 项</div> : null}
                    </div>
                </>
            ) : <span className="rounded-md border px-2 py-1.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>该版本没有记录生成上下文，可能是上传或旧版本。</span>}
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px]" style={{ color: theme.node.muted }}>{summary?.compilerVersion || "无编译器记录"}</span>
                {version && version.id !== currentId ? <button type="button" className="rounded-full border px-2 py-1 text-[10px]" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={() => onSetCurrent(version.id)}>设为当前</button> : <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: theme.node.muted }}><Check className="size-3" />当前版本</span>}
            </div>
        </section>
    );
}

function VersionThumb({ theme, kind, version, index, current, picked, onClick }: { theme: CanvasTheme; kind: FilmVersionKind; version: FilmMediaVersion; index: number; current: boolean; picked: boolean; onClick: () => void }) {
    const src = useResolvedMediaSrc(version.url, version.storageKey, kind === "video" ? "media" : undefined);
    return (
        <button type="button" className="relative w-full overflow-hidden rounded-md border text-left" style={{ borderColor: picked ? theme.canvas.selectionStroke : theme.node.stroke, background: theme.canvas.background }} onClick={onClick} aria-pressed={picked}>
            <span className="relative grid aspect-video place-items-center">
                {src ? (kind === "image" ? <img src={src} alt="" className="h-full w-full object-cover" /> : <video src={src} muted preload="metadata" className="h-full w-full object-cover" />) : <span className="text-[10px]" style={{ color: theme.node.muted }}>不可用</span>}
                {kind === "video" ? <Play className="absolute size-5 text-white/85" /> : null}
            </span>
            <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-[10px]" style={{ color: picked ? theme.node.text : theme.node.muted }}>
                <span>v{index + 1}</span>
                {current ? <span>当前</span> : picked ? <Check className="size-3" /> : null}
            </span>
        </button>
    );
}

function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
