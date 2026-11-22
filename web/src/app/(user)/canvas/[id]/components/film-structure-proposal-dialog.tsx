"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmProposalMode, FilmStructureProposal } from "../lib/film-structure-proposal";

type Props = {
    theme: CanvasTheme;
    proposal: FilmStructureProposal;
    mode: FilmProposalMode;
    selectedSceneKeys: Set<string>;
    applying: boolean;
    onModeChange: (mode: FilmProposalMode) => void;
    onToggleScene: (key: string) => void;
    onSelectAll: () => void;
    onClear: () => void;
    onApply: () => void;
    onCancel: () => void;
};

export function FilmStructureProposalDialog({ theme, proposal, mode, selectedSceneKeys, applying, onModeChange, onToggleScene, onSelectAll, onClear, onApply, onCancel }: Props) {
    const selectedCount = proposal.sceneKeys.filter((key) => selectedSceneKeys.has(key)).length;
    return (
        <Modal open onCancel={onCancel} footer={null} closable={false} centered width="min(860px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="text-base font-semibold">AI 结构提案</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>先确认集、场和镜头数量，再写入画布。</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onCancel} aria-label="关闭结构提案"><X className="size-4" /></button>
                </div>
                <div className="thin-scrollbar flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-5 py-4">
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {[`${proposal.totals.episodes} 集`, `${proposal.totals.scenes} 场`, `${proposal.totals.shots} 镜`, `约 ${proposal.totals.duration}s`].map((label) => (
                            <span key={label} className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{label}</span>
                        ))}
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>现有 {proposal.current.scenes} 场 {proposal.current.shots} 镜</span>
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
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>已选 {selectedCount} 场 · {mode === "overwrite" ? "替换会删除现有场次镜头" : "追加保留现有结构"}</span>
                    <div className="flex gap-2">
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCancel}>取消</button>
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selectedCount || applying} onClick={onApply}>{applying ? "应用中…" : `应用所选 ${selectedCount} 场`}</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
