"use client";

import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { suggestionKindLabel } from "@/lib/film/film-asset-suggestions";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmDirectorAnalysisProposal, FilmDirectorAnalysisSelection } from "../lib/film-director-analysis";
import type { FilmProposalMode } from "../lib/film-structure-proposal";
import { FilmAssetProposalTab } from "./film-asset-proposal-dialog";
import { FilmStructureProposalTab } from "./film-structure-proposal-dialog";

type Props = {
    theme: CanvasTheme;
    proposal: FilmDirectorAnalysisProposal;
    onApply: (selection: FilmDirectorAnalysisSelection) => void;
    onCancel: () => void;
};

type TabKey = "structure" | "shots" | "assets" | "preview";

const TABS: { key: TabKey; label: string }[] = [
    { key: "structure", label: "结构" },
    { key: "shots", label: "镜头" },
    { key: "assets", label: "资产" },
    { key: "preview", label: "应用预览" },
];

export function FilmDirectorAnalysisDialog({ theme, proposal, onApply, onCancel }: Props) {
    const [tab, setTab] = useState<TabKey>("structure");
    const [mode, setMode] = useState<FilmProposalMode>("overwrite");
    const [selectedSceneKeys, setSelectedSceneKeys] = useState(() => new Set(proposal.structure.sceneKeys));
    const [selectedAssetKeys, setSelectedAssetKeys] = useState(() => new Set(proposal.assets.items.filter((item) => item.kind !== "costume").map((item) => item.key)));
    const [bindMentions, setBindMentions] = useState(true);
    const selectedScenes = proposal.structure.sceneKeys.filter((key) => selectedSceneKeys.has(key));
    const selectedAssets = proposal.assets.items.filter((item) => item.kind !== "costume" && selectedAssetKeys.has(item.key));
    const selectedNewAssets = selectedAssets.filter((item) => !item.existingNodeId).length;
    const linkedShots = new Set(selectedAssets.flatMap((item) => item.mentionShotIds)).size;
    const selectedShots = proposal.shots.filter((shot) => selectedSceneKeys.has(shot.sceneKey));

    const toggleScene = (key: string) => setSelectedSceneKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });
    const toggleAsset = (key: string) => setSelectedAssetKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });
    const badges: Record<TabKey, number> = {
        structure: selectedScenes.length,
        shots: selectedShots.length,
        assets: selectedAssets.length,
        preview: 0,
    };

    return (
        <Modal open onCancel={onCancel} footer={null} closable={false} centered width="min(980px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex max-h-[84vh] flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="text-base font-semibold">导演分析</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>结构、镜头与资产一次确认后写入画布；源 {proposal.sourceHash} · {proposal.totals.episodes} 集 {proposal.totals.scenes} 场 {proposal.totals.shots} 镜 · 约 {proposal.totals.duration}s</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onCancel} aria-label="关闭导演分析"><X className="size-4" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-1 border-b px-5 py-2" style={{ borderColor: theme.node.stroke }} role="tablist" aria-label="导演分析标签">
                    {TABS.map((item) => {
                        const active = tab === item.key;
                        return (
                            <button key={item.key} type="button" role="tab" aria-selected={active} className="rounded-full px-3 py-1.5 text-xs" style={{ background: active ? theme.canvas.selectionSoft : undefined, color: active ? theme.node.text : theme.node.muted }} onClick={() => setTab(item.key)}>
                                {item.label}{badges[item.key] ? <span className="ml-1 text-[10px]" style={{ color: theme.node.muted }}>{badges[item.key]}</span> : null}
                            </button>
                        );
                    })}
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {tab === "structure" ? (
                        <FilmStructureProposalTab
                            theme={theme}
                            proposal={proposal.structure}
                            mode={mode}
                            selectedSceneKeys={selectedSceneKeys}
                            onModeChange={setMode}
                            onToggleScene={toggleScene}
                            onSelectAll={() => setSelectedSceneKeys(new Set(proposal.structure.sceneKeys))}
                            onClear={() => setSelectedSceneKeys(new Set())}
                        />
                    ) : null}
                    {tab === "shots" ? (
                        <div className="flex flex-col gap-3">
                            {selectedShots.length ? proposal.episodes.map((episode, episodeIndex) => {
                                const scenes = episode.scenes.map((scene, sceneIndex) => {
                                    const sceneKey = `${episodeIndex}:${sceneIndex}`;
                                    const shots = selectedShots.filter((shot) => shot.sceneKey === sceneKey);
                                    return shots.length ? (
                                        <section key={sceneKey} className="flex flex-col gap-1.5">
                                            <div className="text-[11px] font-medium" style={{ color: theme.node.muted }}>{scene.name || "未命名场次"} · {shots.length} 镜</div>
                                            {shots.map((shot) => (
                                                <div key={shot.id} className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                                                        <span className="font-mono text-xs">{shot.shotNo || "未编号"}</span>
                                                        <span style={{ color: theme.node.muted }}>{shot.shotType || "未设置景别"} · {shot.cameraMovement || "未设置运镜"} · {shot.duration}s</span>
                                                    </div>
                                                    <div className="mt-1 text-xs leading-5">{shot.description || "未填写画面描述"}</div>
                                                    {shot.dialogue ? <div className="mt-1 text-[11px] leading-5" style={{ color: theme.node.muted }}>台词：{shot.dialogue}</div> : null}
                                                </div>
                                            ))}
                                        </section>
                                    ) : null;
                                });
                                return scenes.some(Boolean) ? <div key={episode.id} className="flex flex-col gap-2"><div className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{episode.title || "未分集"}</div>{scenes}</div> : null;
                            }) : <div className="py-10 text-center text-xs" style={{ color: theme.node.muted }}>没有勾选场次，镜头不会写入画布。</div>}
                        </div>
                    ) : null}
                    {tab === "assets" ? (
                        <FilmAssetProposalTab
                            theme={theme}
                            proposal={proposal.assets}
                            selectedKeys={selectedAssetKeys}
                            bindMentions={bindMentions}
                            onToggle={toggleAsset}
                            onSelectAll={() => setSelectedAssetKeys(new Set(proposal.assets.items.filter((item) => item.kind !== "costume").map((item) => item.key)))}
                            onClear={() => setSelectedAssetKeys(new Set())}
                            onBindChange={setBindMentions}
                        />
                    ) : null}
                    {tab === "preview" ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }}>应用 {selectedScenes.length} 场 · {selectedShots.length} 镜</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{mode === "overwrite" ? "替换现有结构" : "追加到画布"}</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>新建资产 {selectedNewAssets} 项</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{bindMentions ? `提及候选 ${linkedShots} 镜` : "不关联提及"}</span>
                            </div>
                            <div className="rounded-lg border px-3 py-2 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                                {mode === "overwrite" ? `替换会先移除画布现有的 ${proposal.structure.current.scenes} 场 ${proposal.structure.current.shots} 镜，再写入勾选场次；画布已有资产不会被删除。` : "追加会保留现有场次与镜头，把勾选场次接在全片镜头链末尾。"}
                            </div>
                            {proposal.conflicts.length ? (
                                <div className="flex flex-col gap-1 rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                    <div className="text-[11px] font-medium" style={{ color: theme.node.muted }}>冲突与提示</div>
                                    {proposal.conflicts.map((conflict) => (
                                        <div key={conflict.message} className="flex items-start gap-1.5 text-[11px] leading-5" style={{ color: conflict.level === "error" ? canvasStatusColors.error : conflict.level === "warning" ? canvasStatusColors.loading : theme.node.muted }}>
                                            {conflict.level === "info" ? <Check className="mt-0.5 size-3 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3 shrink-0" />}
                                            {conflict.message}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <div className="grid gap-2 md:grid-cols-2">
                                <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                                    <div className="text-[11px] font-medium" style={{ color: theme.node.muted }}>写入场次</div>
                                    <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                                        {selectedScenes.length ? proposal.structure.episodes.flatMap((episode) => episode.scenes.filter((scene) => selectedSceneKeys.has(scene.key)).map((scene) => <span key={scene.key} className="truncate">{episode.title} · {scene.name} · {scene.shots.length} 镜</span>)) : <span style={{ color: theme.node.muted }}>未选择场次</span>}
                                    </div>
                                </div>
                                <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                                    <div className="text-[11px] font-medium" style={{ color: theme.node.muted }}>资产</div>
                                    <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                                        {selectedAssets.length ? selectedAssets.map((item) => <span key={item.key} className="truncate">{suggestionKindLabel(item.kind)} · {item.name}{item.existingNodeId ? " · 复用" : " · 新建"}</span>) : <span style={{ color: theme.node.muted }}>不创建资产</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>已选 {selectedScenes.length} 场 · {selectedShots.length} 镜 · 资产 {selectedAssets.length} 项</span>
                    <div className="flex gap-2">
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCancel}>取消</button>
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selectedScenes.length} onClick={() => onApply({ mode, sceneKeys: selectedScenes, assetKeys: [...selectedAssetKeys], bindMentions })}>应用导演分析</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
