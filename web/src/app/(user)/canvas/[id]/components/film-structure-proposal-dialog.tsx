"use client";

import { AlertTriangle, Check } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmProposalMode, FilmStructureProposal } from "../lib/film-structure-proposal";

type Props = {
    theme: CanvasTheme;
    proposal: FilmStructureProposal;
    mode: FilmProposalMode;
    selectedSceneKeys: Set<string>;
    onModeChange: (mode: FilmProposalMode) => void;
    onToggleScene: (key: string) => void;
    onSelectAll: () => void;
    onClear: () => void;
};

export function FilmStructureProposalTab({ theme, proposal, mode, selectedSceneKeys, onModeChange, onToggleScene, onSelectAll, onClear }: Props) {
    const selectedCount = proposal.sceneKeys.filter((key) => selectedSceneKeys.has(key)).length;
    return (
        <div className="flex flex-col gap-3" style={{ color: theme.node.text }}>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[`${proposal.totals.episodes} 集`, `${proposal.totals.scenes} 场`, `${proposal.totals.shots} 镜`, `约 ${proposal.totals.duration}s`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{label}</span>
                ))}
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>现有 {proposal.current.scenes} 场 {proposal.current.shots} 镜</span>
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已选 {selectedCount} 场</span>
            </div>
            {proposal.issues.length ? (
                <div className="flex flex-col gap-1 rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                    {proposal.issues.map((issue) => (
                        <div key={issue.message} className="flex items-start gap-1.5 text-[11px] leading-5" style={{ color: issue.level === "error" ? canvasStatusColors.error : issue.level === "warning" ? canvasStatusColors.loading : theme.node.muted }}>
                            {issue.level === "info" ? <Check className="mt-0.5 size-3 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3 shrink-0" />}
                            {issue.message}
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                    {(["overwrite", "append"] as const).map((value) => (
                        <button key={value} type="button" className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: mode === value ? theme.canvas.selectionSoft : undefined, color: mode === value ? theme.node.text : theme.node.muted }} onClick={() => onModeChange(value)}>{value === "overwrite" ? "替换现有结构" : "追加到画布"}</button>
                    ))}
                </div>
                <span className="text-[11px]" style={{ color: theme.node.muted }}>{mode === "overwrite" ? "只保留勾选的提案场次" : "保留现有场次与镜头"}</span>
                <span className="ml-auto flex items-center gap-1">
                    <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onSelectAll}>全选</button>
                    <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onClear}>清空</button>
                </span>
            </div>
            <div className="flex flex-col gap-3">
                {proposal.episodes.map((episode) => (
                    <section key={episode.title} className="flex flex-col gap-2">
                        <div className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{episode.title} · {episode.scenes.length} 场</div>
                        {episode.scenes.map((scene) => {
                            const selected = selectedSceneKeys.has(scene.key);
                            return (
                                <div key={scene.key} className="rounded-lg border px-3 py-2" style={{ borderColor: selected ? theme.canvas.selectionStroke : theme.node.stroke, background: selected ? theme.canvas.selectionSoft : theme.node.fill }}>
                                    <label className="flex cursor-pointer items-center gap-2">
                                        <input type="checkbox" checked={selected} onChange={() => onToggleScene(scene.key)} aria-label={`选择场次 ${scene.name}`} />
                                        <span className="min-w-0 flex-1 truncate text-xs">{scene.name}</span>
                                        <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>{scene.shots.length} 镜 · {scene.duration}s</span>
                                    </label>
                                    {scene.shots.length ? (
                                        <div className="mt-1.5 flex flex-col gap-0.5 pl-6 text-[10px]" style={{ color: theme.node.muted }}>
                                            {scene.shots.slice(0, 5).map((shot, index) => <div key={`${scene.key}-${shot.shotNo}-${index}`} className="truncate">{shot.shotNo} · {shot.shotType || "未设置"} · {shot.duration}s · {shot.description}</div>)}
                                            {scene.shots.length > 5 ? <div>等 {scene.shots.length} 镜</div> : null}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </section>
                ))}
            </div>
        </div>
    );
}
