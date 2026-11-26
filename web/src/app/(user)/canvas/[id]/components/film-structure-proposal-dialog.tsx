"use client";

import { AlertTriangle, Check } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmProposalMode, FilmStructureProposal } from "../lib/film-structure-proposal";
import { FilmProposalSceneBrowser } from "./film-proposal-scene-browser";

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
    return (
        <div className="flex flex-col gap-3" style={{ color: theme.node.text }}>
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
            <FilmProposalSceneBrowser theme={theme} episodes={proposal.episodes} selectedSceneKeys={selectedSceneKeys} onToggleScene={onToggleScene} />
        </div>
    );
}
