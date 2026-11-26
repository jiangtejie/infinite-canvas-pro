"use client";

import { useState, type ReactNode } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_CAMERA_MOVEMENT_OPTIONS, FILM_SHOT_TYPE_OPTIONS } from "@/app/(user)/film/utils/film-shot-types";
import { canvasStatusColors } from "../../lib/canvas-palette";

export type FilmProposalShotRow = {
    shotNo: string;
    shotType?: string;
    cameraMovement?: string;
    duration: number;
    description: string;
    dialogue?: string;
};

export type FilmProposalSceneRow = {
    key: string;
    name: string;
    location?: string;
    time?: string;
    mood?: string;
    duration: number;
    shots: FilmProposalShotRow[];
    retryKey?: string;
    retryError?: string;
    retrying?: boolean;
    statusLabel?: string;
    statusColor?: string;
};

export type FilmProposalEpisodeRow = {
    title: string;
    scenes: FilmProposalSceneRow[];
};

export type FilmProposalSceneEditPatch = { name?: string; location?: string; time?: string; mood?: string };
export type FilmProposalShotEditPatch = { shotNo?: string; shotType?: string; cameraMovement?: string; duration?: number; description?: string; dialogue?: string };

export function FilmProposalSceneBrowser({ theme, episodes, selectedSceneKeys, onToggleScene, detailed = false, onRetryScene, onEditScene, onEditShot, onAddShot, onRemoveShot, onMoveShot, onMergeShot, onSplitShot, focusedKey, onFocusScene, checkPanel }: {
    theme: CanvasTheme;
    episodes: FilmProposalEpisodeRow[];
    selectedSceneKeys: Set<string>;
    onToggleScene: (key: string) => void;
    detailed?: boolean;
    onRetryScene?: (key: string) => void;
    onEditScene?: (sceneKey: string, patch: FilmProposalSceneEditPatch) => void;
    onEditShot?: (sceneKey: string, index: number, patch: FilmProposalShotEditPatch) => void;
    onAddShot?: (sceneKey: string) => void;
    onRemoveShot?: (sceneKey: string, index: number) => void;
    onMoveShot?: (sceneKey: string, index: number, direction: -1 | 1) => void;
    onMergeShot?: (sceneKey: string, index: number) => void;
    onSplitShot?: (sceneKey: string, index: number) => void;
    focusedKey?: string;
    onFocusScene?: (key: string) => void;
    checkPanel?: ReactNode;
}) {
    const scenes = episodes.flatMap((episode) => episode.scenes);
    const [internalFocusedKey, setInternalFocusedKey] = useState("");
    const [editing, setEditing] = useState(false);
    const activeKey = focusedKey ?? internalFocusedKey;
    const setFocused = onFocusScene ?? setInternalFocusedKey;
    const focused = scenes.find((scene) => scene.key === activeKey) ?? scenes[0] ?? null;
    const editable = Boolean(onEditScene && onEditShot);
    const inputStyle = { background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke };
    return (
        <div className={`grid min-h-0 gap-3 md:grid-cols-[288px_minmax(0,1fr)] ${checkPanel ? "xl:grid-cols-[288px_minmax(0,1fr)_240px]" : ""}`}>
            <div className="thin-scrollbar flex max-h-[58vh] min-h-[240px] flex-col gap-2 overflow-y-auto pr-1">
                {episodes.map((episode) => (
                    <section key={episode.title} className="flex flex-col gap-1">
                        <div className="px-1 text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{episode.title} · {episode.scenes.length} 场</div>
                        {episode.scenes.map((scene) => {
                            const selected = selectedSceneKeys.has(scene.key);
                            const active = scene === focused;
                            return (
                                <div key={scene.key} role="button" tabIndex={0} className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: selected ? theme.canvas.selectionSoft : active ? theme.node.fill : "transparent" }} onClick={() => setFocused(scene.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocused(scene.key); } }} aria-pressed={active}>
                                    <input type="checkbox" checked={selected} onChange={() => onToggleScene(scene.key)} aria-label={`选择场次 ${scene.name}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1">
                                            <span className="truncate text-xs">{scene.name}</span>
                                            {scene.statusLabel ? <span className="shrink-0 rounded-full border px-1 py-0.5 text-[9px]" style={{ borderColor: scene.statusColor ?? theme.node.stroke, color: scene.statusColor ?? theme.node.muted }}>{scene.statusLabel}</span> : null}
                                        </span>
                                        <span className="block text-[11px]" style={{ color: scene.retryError ? canvasStatusColors.error : theme.node.muted }}>{scene.retryError ? "分镜失败" : `${scene.shots.length} 镜 · ${scene.duration}s`}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </section>
                ))}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
                {focused ? (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium">{focused.name}</span>
                            <span className="flex shrink-0 items-center gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                {focused.shots.length} 镜 · {focused.duration}s
                                {editable ? <button type="button" className="rounded-full border px-2 py-0.5" style={{ borderColor: editing ? theme.canvas.selectionStroke : theme.node.stroke, color: theme.node.text }} onClick={() => setEditing((value) => !value)}>{editing ? "完成编辑" : "编辑本场"}</button> : null}
                                {onRetryScene && focused.retryKey ? <button type="button" className="rounded-full border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={focused.retrying} onClick={() => onRetryScene(focused.retryKey!)}>{focused.retrying ? "重做中…" : "重新分镜本场"}</button> : null}
                            </span>
                        </div>
                        {focused.retryError ? <div className="rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}>{focused.retryError}</div> : null}
                        {editing ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>场次名<input className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={focused.name} onChange={(event) => onEditScene?.(focused.key, { name: event.target.value })} /></label>
                                <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>地点<input className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={focused.location ?? ""} onChange={(event) => onEditScene?.(focused.key, { location: event.target.value })} /></label>
                                <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>时间<input className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={focused.time ?? ""} onChange={(event) => onEditScene?.(focused.key, { time: event.target.value })} /></label>
                                <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>气氛<input className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={focused.mood ?? ""} onChange={(event) => onEditScene?.(focused.key, { mood: event.target.value })} /></label>
                            </div>
                        ) : null}
                        <div className="thin-scrollbar max-h-[54vh] min-h-[200px] overflow-y-auto pr-1">
                            <div className="grid gap-2 sm:grid-cols-2">
                                {focused.shots.map((shot, index) => (
                                    <div key={`${focused.key}-${shot.shotNo}-${index}`} className="rounded-lg border px-2.5 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                        {editing ? (
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex flex-wrap items-center gap-1">
                                                    <input aria-label="镜号" className="w-16 rounded border px-1.5 py-0.5 font-mono text-[11px]" style={inputStyle} value={shot.shotNo} onChange={(event) => onEditShot?.(focused.key, index, { shotNo: event.target.value })} />
                                                    <select aria-label="景别" className="rounded border px-1 py-0.5 text-[11px]" style={inputStyle} value={shot.shotType ?? ""} onChange={(event) => onEditShot?.(focused.key, index, { shotType: event.target.value })}>
                                                        <option value="">景别</option>
                                                        {FILM_SHOT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                    </select>
                                                    <select aria-label="运镜" className="rounded border px-1 py-0.5 text-[11px]" style={inputStyle} value={shot.cameraMovement ?? ""} onChange={(event) => onEditShot?.(focused.key, index, { cameraMovement: event.target.value })}>
                                                        <option value="">运镜</option>
                                                        {FILM_CAMERA_MOVEMENT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                                                    </select>
                                                    <input aria-label="时长" type="number" min={1} className="w-16 rounded border px-1.5 py-0.5 text-[11px]" style={inputStyle} value={shot.duration} onChange={(event) => onEditShot?.(focused.key, index, { duration: Math.max(1, Number(event.target.value) || 1) })} />
                                                </div>
                                                <textarea aria-label="画面描述" rows={2} className="thin-scrollbar rounded border px-2 py-1 text-[11px] leading-5" style={inputStyle} value={shot.description} onChange={(event) => onEditShot?.(focused.key, index, { description: event.target.value })} />
                                                <input aria-label="台词" className="rounded border px-2 py-1 text-[11px]" style={inputStyle} placeholder="台词/声音" value={shot.dialogue ?? ""} onChange={(event) => onEditShot?.(focused.key, index, { dialogue: event.target.value })} />
                                                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                                                    <button type="button" className="rounded border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={index === 0} onClick={() => onMoveShot?.(focused.key, index, -1)}>↑</button>
                                                    <button type="button" className="rounded border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={index === focused.shots.length - 1} onClick={() => onMoveShot?.(focused.key, index, 1)}>↓</button>
                                                    <button type="button" className="rounded border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={index === focused.shots.length - 1} onClick={() => onMergeShot?.(focused.key, index)}>合并下一镜</button>
                                                    <button type="button" className="rounded border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onClick={() => onSplitShot?.(focused.key, index)}>拆分</button>
                                                    <button type="button" className="ml-auto rounded border px-1.5 py-0.5" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }} onClick={() => onRemoveShot?.(focused.key, index)}>删除</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: theme.node.muted }}>
                                                    <span className="font-mono text-xs" style={{ color: theme.node.text }}>{shot.shotNo || "未编号"}</span>
                                                    <span>{shot.shotType || "未设置景别"}</span>
                                                    {detailed && shot.cameraMovement ? <span>{shot.cameraMovement}</span> : null}
                                                    <span>{shot.duration}s</span>
                                                </div>
                                                <div className={`mt-1 text-[11px] leading-5 ${detailed ? "" : "line-clamp-2"}`}>{shot.description || "未填写画面描述"}</div>
                                                {detailed && shot.dialogue ? <div className="mt-1 text-[11px] leading-5" style={{ color: theme.node.muted }}>台词：{shot.dialogue}</div> : null}
                                            </>
                                        )}
                                    </div>
                                ))}
                                {editing ? <button type="button" className="rounded-lg border border-dashed px-2 py-2 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => onAddShot?.(focused.key)}>＋ 添加镜头</button> : null}
                            </div>
                        </div>
                    </>
                ) : <div className="grid min-h-[160px] place-items-center text-xs" style={{ color: theme.node.muted }}>没有可预览的场次；先回剧本发起导演分析。</div>}
            </div>
            {checkPanel ? <div className="md:col-span-2 xl:col-span-1">{checkPanel}</div> : null}
        </div>
    );
}
