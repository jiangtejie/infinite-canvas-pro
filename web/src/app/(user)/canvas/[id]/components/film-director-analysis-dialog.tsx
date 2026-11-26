"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { suggestionKindLabel } from "@/lib/film/film-asset-suggestions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmDirectorAnalysisProposal, FilmDirectorAnalysisSelection } from "../lib/film-director-analysis";
import { filmAnalysisSceneKey, filmAnalysisShotKey, type FilmAnalysisLandingPlan } from "../lib/film-landing-plan";
import type { FilmAnalysisDraftCommand } from "../lib/film-analysis-draft";
import type { FilmProposalMode } from "../lib/film-structure-proposal";
import { FilmAssetProposalTab } from "./film-asset-proposal-dialog";
import { FilmProposalSceneBrowser } from "./film-proposal-scene-browser";
import { CANVAS_DIALOG_SIZE } from "../../utils/canvas-dialog-size";

type Props = {
    theme: CanvasTheme;
    proposal: FilmDirectorAnalysisProposal;
    expired?: boolean;
    plans?: Record<FilmProposalMode, FilmAnalysisLandingPlan>;
    targetDuration?: number;
    onRetryScene?: (sceneKey: string) => void;
    retryingSceneKey?: string | null;
    onEdit?: (command: FilmAnalysisDraftCommand) => void;
    onApply: (selection: FilmDirectorAnalysisSelection) => void;
    onCancel: () => void;
};

type TabKey = "shots" | "assets" | "preview";

const TABS: { key: TabKey; label: string }[] = [
    { key: "shots", label: "分镜" },
    { key: "assets", label: "资产" },
    { key: "preview", label: "落图预览" },
];

const MODE_LABELS: Record<FilmProposalMode, string> = { merge: "智能合并", append: "追加", replace: "替换" };

const LANDING_ACTION_LABELS = { added: "新增", updated: "更新", kept: "保留", protected: "受保护", removed: "删除" } as const;

function landingActionColor(action: keyof typeof LANDING_ACTION_LABELS, theme: CanvasTheme) {
    if (action === "added") return canvasStatusColors.success;
    if (action === "updated") return theme.canvas.selectionStroke;
    if (action === "protected") return canvasStatusColors.loading;
    if (action === "removed") return canvasStatusColors.error;
    return theme.node.muted;
}

function planActionMap(plan: FilmAnalysisLandingPlan) {
    const map = new Map<string, keyof typeof LANDING_ACTION_LABELS>();
    (Object.keys(LANDING_ACTION_LABELS) as Array<keyof typeof LANDING_ACTION_LABELS>).forEach((action) => {
        plan[action].forEach((item) => map.set(item.key, action));
    });
    return map;
}

/** 落图小地图：场次列 + 镜头块按计划着色，资产按复用/新建着色。 */
function LandingMiniMap({ theme, proposal, plan }: { theme: CanvasTheme; proposal: FilmDirectorAnalysisProposal; plan: FilmAnalysisLandingPlan }) {
    const actions = planActionMap(plan);
    return (
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex gap-3 overflow-x-auto">
                <div className="flex shrink-0 flex-col gap-1 border-r pr-2" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[9px]" style={{ color: theme.node.muted }}>资产</span>
                    {proposal.assets.items.filter((item) => item.kind !== "costume").slice(0, 14).map((item) => (
                        <span key={item.key} title={item.name} className="h-2 w-14 rounded" style={{ background: landingActionColor(item.match === "new" ? "added" : item.match === "library" ? "updated" : "kept", theme) }} />
                    ))}
                </div>
                {proposal.structure.episodes.flatMap((episode) => episode.scenes.map((scene) => {
                    const key = filmAnalysisSceneKey(episode.title, scene.name);
                    return (
                        <div key={`${episode.title}:${scene.name}`} className="flex w-14 shrink-0 flex-col gap-1">
                            <span className="truncate text-[9px]" style={{ color: theme.node.muted }}>{scene.name}</span>
                            <span className="h-2 rounded" style={{ background: landingActionColor(actions.get(key) ?? "kept", theme) }} />
                            {Array.from({ length: Math.max(1, scene.shots.length) }, (_, index) => (
                                <span key={index} className="h-1.5 rounded" style={{ background: landingActionColor(actions.get(filmAnalysisShotKey(key, index)) ?? "kept", theme) }} />
                            ))}
                        </div>
                    );
                }))}
            </div>
            <div className="flex flex-wrap gap-2 text-[9px]" style={{ color: theme.node.muted }}>
                {(Object.keys(LANDING_ACTION_LABELS) as Array<keyof typeof LANDING_ACTION_LABELS>).map((action) => (
                    <span key={action} className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm" style={{ background: landingActionColor(action, theme) }} />{LANDING_ACTION_LABELS[action]}</span>
                ))}
            </div>
        </div>
    );
}

export function FilmDirectorAnalysisDialog({ theme, proposal, expired = false, plans, targetDuration, onRetryScene, retryingSceneKey, onEdit, onApply, onCancel }: Props) {
    const confirm = useConfirm();
    const [tab, setTab] = useState<TabKey>("shots");
    const [mode, setMode] = useState<FilmProposalMode>("merge");
    const [selectedSceneKeys, setSelectedSceneKeys] = useState(() => new Set(proposal.structure.sceneKeys));
    const [selectedAssetKeys, setSelectedAssetKeys] = useState(() => new Set(proposal.assets.items.filter((item) => item.kind !== "costume").map((item) => item.key)));
    const [bindMentions, setBindMentions] = useState(true);
    const sceneKeys = proposal.structure.sceneKeys;
    const [focusedSceneKey, setFocusedSceneKey] = useState(sceneKeys[0] ?? "");
    const selectedScenes = sceneKeys.filter((key) => selectedSceneKeys.has(key));
    const selectedAssets = proposal.assets.items.filter((item) => item.kind !== "costume" && selectedAssetKeys.has(item.key));
    const selectedNewAssets = selectedAssets.filter((item) => item.match === "new").length;
    const selectedLibraryAssets = selectedAssets.filter((item) => item.match === "library").length;
    const linkedShots = new Set(selectedAssets.flatMap((item) => item.mentionShotIds)).size;
    const selectedShots = proposal.shots.filter((shot) => selectedSceneKeys.has(shot.sceneKey));
    const selectedDuration = selectedShots.reduce((sum, shot) => sum + Math.max(1, shot.duration || 4), 0);
    const actionByKey = plans ? planActionMap(plans[mode]) : null;
    const sceneRows = proposal.episodes.map((episode, episodeIndex) => ({
        title: episode.title || "未分集",
        scenes: episode.scenes.map((scene, sceneIndex) => {
            const key = `${episodeIndex}:${sceneIndex}`;
            const retryKey = `${episode.title}::${scene.name}`;
            const shots = proposal.shots.filter((shot) => shot.sceneKey === key);
            const action = actionByKey?.get(filmAnalysisSceneKey(episode.title, scene.name));
            return {
                key,
                name: scene.name || "未命名场次",
                location: scene.location,
                time: scene.time,
                mood: scene.mood,
                duration: shots.reduce((sum, shot) => sum + Math.max(1, shot.duration || 4), 0),
                shots: shots.map((shot) => ({ ...shot, description: shot.description || shot.prompt || "未填写画面描述" })),
                retryKey,
                retryError: proposal.sceneErrors?.[retryKey],
                retrying: retryingSceneKey === retryKey,
                statusLabel: action ? LANDING_ACTION_LABELS[action] : undefined,
                statusColor: action ? landingActionColor(action, theme) : undefined,
            };
        }),
    }));
    const flatSceneRows = sceneRows.flatMap((episode) => episode.scenes);
    const focusedEntry = flatSceneRows.find((scene) => scene.key === focusedSceneKey) ?? flatSceneRows[0] ?? null;
    const focusedShotIds = new Set(proposal.shots.filter((shot) => shot.sceneKey === focusedEntry?.key).map((shot) => shot.id));
    const focusedAssets = proposal.assets.items.filter((item) => item.kind !== "costume" && item.mentionShotIds.some((id) => focusedShotIds.has(id)));
    const sceneProblems = proposal.structure.episodes.flatMap((episode, episodeIndex) => episode.scenes.map((scene, sceneIndex) => {
        const key = `${episodeIndex}:${sceneIndex}`;
        const shots = proposal.shots.filter((shot) => shot.sceneKey === key);
        const issues: string[] = [];
        const missing = shots.filter((shot) => !shot.description.trim() && !shot.prompt.trim()).length;
        if (missing) issues.push(`${missing} 镜缺画面描述`);
        const numbers = shots.map((shot) => shot.shotNo).filter(Boolean);
        if (new Set(numbers).size !== numbers.length) issues.push("存在重复镜号");
        return issues.length ? [{ key, name: scene.name || "未命名场次", issues }] : [];
    })).flat();

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
        shots: selectedScenes.length,
        assets: selectedAssets.length,
        preview: 0,
    };
    const submit = async () => {
        if (expired) {
            const ok = await confirm({
                title: "应用过期提案？",
                description: "剧本正文在分析后已经修改，本次落图仍使用旧正文的分析结果。建议先重新分析。",
                confirmText: "仍然应用",
                tone: "warning",
                stacked: true,
            });
            if (!ok) return;
        }
        const current = proposal.structure.current;
        if (mode === "replace" && (current.scenes || current.shots)) {
            const protectedCount = plans?.replace.protected.length ?? current.mediaShots;
            const ok = await confirm({
                title: "替换现有场次与镜头？",
                description: `将删除画布现有的 ${current.scenes} 场 ${current.shots} 镜，其中 ${protectedCount} 镜已有媒体或人工修改；画布已有资产不会删除。`,
                confirmText: "替换并应用",
                tone: protectedCount ? "danger" : "warning",
                stacked: true,
            });
            if (!ok) return;
        }
        onApply({ mode, sceneKeys: selectedScenes, assetKeys: [...selectedAssetKeys], bindMentions });
    };

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
            if (event.key === "j" || event.key === "J" || event.key === "k" || event.key === "K") {
                if (!sceneKeys.length) return;
                event.preventDefault();
                const index = Math.max(0, sceneKeys.indexOf(focusedSceneKey));
                const step = event.key === "j" || event.key === "J" ? 1 : -1;
                setFocusedSceneKey(sceneKeys[(index + step + sceneKeys.length) % sceneKeys.length]);
                return;
            }
            if (event.code === "Space") {
                if (!focusedSceneKey || target?.closest("button, a, [role='button'], [role='tab']")) return;
                event.preventDefault();
                toggleScene(focusedSceneKey);
                return;
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    });
    const sceneShotIds = new Map(flatSceneRows.map((scene) => [scene.key, new Set(proposal.shots.filter((shot) => shot.sceneKey === scene.key).map((shot) => shot.id))]));
    const checkPanel = (
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="text-[11px] font-medium" style={{ color: theme.node.text }}>检查</div>
            <div className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>
                <div className="flex items-center justify-between"><span>选中时长</span><span style={{ color: theme.node.text }}>{selectedDuration}s{targetDuration ? ` / ${targetDuration}s` : ""}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                    <div className="h-full rounded-full" style={{ width: `${targetDuration ? Math.min(100, selectedDuration / targetDuration * 100) : 0}%`, background: canvasStatusColors.success }} />
                </div>
                {targetDuration ? <span>偏差 {selectedDuration - targetDuration > 0 ? "+" : ""}{selectedDuration - targetDuration}s</span> : <span>项目未设置目标时长</span>}
            </div>
            <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                <span className="text-[11px]" style={{ color: theme.node.muted }}>分镜问题</span>
                {sceneProblems.length ? sceneProblems.map((problem) => <button key={problem.key} type="button" className="text-left text-[11px] leading-5" style={{ color: canvasStatusColors.loading }} onClick={() => { setFocusedSceneKey(problem.key); setTab("shots"); }}>{problem.name} · {problem.issues.join("、")}</button>) : <span className="text-[11px]" style={{ color: theme.node.muted }}>没有缺描述或重复镜号。</span>}
            </div>
            <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                <span className="text-[11px]" style={{ color: theme.node.muted }}>本场资产</span>
                {focusedAssets.length ? focusedAssets.map((item) => <span key={item.key} className="truncate text-[11px]" style={{ color: theme.node.text }}>{suggestionKindLabel(item.kind)} · {item.name}{item.match === "canvas" ? " · 画布" : item.match === "library" ? " · 母版库" : " · 新建"}</span>) : <span className="text-[11px]" style={{ color: theme.node.muted }}>本场没有关联资产。</span>}
            </div>
            <div className="mt-auto border-t pt-2 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>现有 {proposal.structure.current.scenes} 场 {proposal.structure.current.shots} 镜</div>
        </div>
    );

    return (
        <Modal open onCancel={onCancel} footer={null} closable={false} centered width={CANVAS_DIALOG_SIZE.lg} mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex max-h-[88vh] flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="text-base font-semibold">导演分析</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>源 {proposal.sourceHash} · {proposal.totals.episodes} 集 {proposal.totals.scenes} 场 {proposal.totals.shots} 镜 · 约 {proposal.totals.duration}s</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onCancel} aria-label="关闭导演分析"><X className="size-4" /></button>
                </div>
                {expired ? <div className="flex items-center gap-1.5 border-b px-5 py-2 text-[11px]" style={{ borderColor: theme.node.stroke, color: canvasStatusColors.loading }}><AlertTriangle className="size-3 shrink-0" />剧本正文已改动，此提案基于旧正文；建议重新分析后再应用。</div> : null}
                <div className="flex flex-wrap items-center gap-1 border-b px-5 py-2" style={{ borderColor: theme.node.stroke }} role="tablist" aria-label="导演分析标签">
                    {TABS.map((item) => {
                        const active = tab === item.key;
                        return (
                            <button key={item.key} type="button" role="tab" aria-selected={active} className="rounded-full px-3 py-1.5 text-xs" style={{ background: active ? theme.canvas.selectionSoft : undefined, color: active ? theme.node.text : theme.node.muted }} onClick={() => setTab(item.key)}>
                                {item.label}{badges[item.key] ? <span className="ml-1 text-[11px]" style={{ color: theme.node.muted }}>{badges[item.key]}</span> : null}
                            </button>
                        );
                    })}
                    <span className="ml-auto text-[11px]" style={{ color: theme.node.muted }}>J/K 切场 · 空格勾选 · ⌘/Ctrl+Enter 应用</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {tab === "shots" ? (
                        <div className="flex flex-col gap-3">
                            {selectedScenes.length ? null : <div className="text-[11px]" style={{ color: theme.node.muted }}>没有勾选场次，镜头不会写入画布；仍可在左侧浏览提案。</div>}
                            <FilmProposalSceneBrowser
                                theme={theme}
                                detailed
                                selectedSceneKeys={selectedSceneKeys}
                                onToggleScene={toggleScene}
                                episodes={sceneRows}
                                focusedKey={focusedSceneKey}
                                onFocusScene={setFocusedSceneKey}
                                checkPanel={checkPanel}
                                onRetryScene={onRetryScene}
                                onEditScene={(sceneKey, patch) => onEdit?.({ type: "scene", sceneKey, patch })}
                                onEditShot={(sceneKey, index, patch) => onEdit?.({ type: "shot", sceneKey, index, patch })}
                                onAddShot={(sceneKey) => onEdit?.({ type: "add-shot", sceneKey })}
                                onRemoveShot={(sceneKey, index) => onEdit?.({ type: "remove-shot", sceneKey, index })}
                                onMoveShot={(sceneKey, index, direction) => onEdit?.({ type: "move-shot", sceneKey, index, direction })}
                                onMergeShot={(sceneKey, index) => onEdit?.({ type: "merge-shot", sceneKey, index })}
                                onSplitShot={(sceneKey, index) => onEdit?.({ type: "split-shot", sceneKey, index })}
                            />
                        </div>
                    ) : null}
                    {tab === "assets" ? (
                        <div className="flex flex-col gap-3">
                        <FilmAssetProposalTab
                            theme={theme}
                            proposal={proposal.assets}
                            selectedKeys={selectedAssetKeys}
                            bindMentions={bindMentions}
                            onToggle={toggleAsset}
                            onSelectAll={() => setSelectedAssetKeys(new Set(proposal.assets.items.filter((item) => item.kind !== "costume").map((item) => item.key)))}
                            onClear={() => setSelectedAssetKeys(new Set())}
                            onBindChange={setBindMentions}
                            onEditAsset={(key, patch) => onEdit?.({ type: "asset", key, patch })}
                            onMergeAsset={(sourceKey, targetKey) => onEdit?.({ type: "merge-asset", sourceKey, targetKey })}
                        />
                        <details className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                            <summary className="cursor-pointer text-[11px]" style={{ color: theme.node.muted }}>资产 × 场次</summary>
                            <div className="thin-scrollbar mt-2 max-h-56 overflow-auto">
                                <table className="w-full border-collapse text-[11px]">
                                    <thead>
                                        <tr>
                                            <th className="sticky left-0 px-1 py-0.5 text-left font-medium" style={{ background: theme.node.panel, color: theme.node.muted }}>资产</th>
                                            {flatSceneRows.map((scene) => <th key={scene.key} className="px-1 py-0.5 text-center font-normal" style={{ color: theme.node.muted }} title={scene.name}>{scene.name.slice(0, 6)}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {proposal.assets.items.filter((item) => item.kind !== "costume").slice(0, 16).map((item) => (
                                            <tr key={item.key}>
                                                <td className="sticky left-0 max-w-24 truncate px-1 py-0.5" style={{ background: theme.node.panel, color: theme.node.text }}>{item.name}</td>
                                                {flatSceneRows.map((scene) => {
                                                    const hit = item.mentionShotIds.some((id) => sceneShotIds.get(scene.key)?.has(id));
                                                    return <td key={scene.key} className="px-1 py-0.5 text-center" style={{ color: hit ? canvasStatusColors.success : theme.node.muted }}>{hit ? "✓" : "·"}</td>;
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                        </div>
                    ) : null}
                    {tab === "preview" ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }}>应用 {selectedScenes.length} 场 · {selectedShots.length} 镜</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{mode === "replace" ? "替换现有结构" : mode === "append" ? "追加到画布" : "智能合并"}</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>新建资产 {selectedNewAssets} 项</span>
                                {selectedLibraryAssets ? <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.muted }}>母版库复用 {selectedLibraryAssets} 项</span> : null}
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{bindMentions ? `提及候选 ${linkedShots} 镜` : "不关联提及"}</span>
                            </div>
                            {plans ? (
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px]" style={{ color: theme.node.muted }}>
                                        <span>全量计划</span>
                                        <span>新增 {plans[mode].added.length}</span>
                                        <span>更新 {plans[mode].updated.length}</span>
                                        <span>保留 {plans[mode].kept.length}</span>
                                        <span style={{ color: plans[mode].protected.length ? canvasStatusColors.loading : undefined }}>受保护 {plans[mode].protected.length}</span>
                                        <span style={{ color: plans[mode].removed.length ? canvasStatusColors.error : undefined }}>删除 {plans[mode].removed.length}</span>
                                    </div>
                                    <LandingMiniMap theme={theme} proposal={proposal} plan={plans[mode]} />
                                </div>
                            ) : null}
                            <div className="rounded-lg border px-3 py-2 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                                {mode === "replace" ? `替换会先移除画布现有的 ${proposal.structure.current.scenes} 场 ${proposal.structure.current.shots} 镜，再写入勾选场次；画布已有资产不会被删除。` : mode === "append" ? "追加会保留现有场次与镜头，把勾选场次接在全片镜头链末尾。" : "智能合并会按集标题与场次名复用已有场次、按场内顺序复用镜头；已有媒体或人工修改的镜头不会被覆盖。"}
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
                                        {selectedAssets.length ? selectedAssets.map((item) => <span key={item.key} className="truncate">{suggestionKindLabel(item.kind)} · {item.name}{item.match === "canvas" ? " · 画布复用" : item.match === "library" ? " · 母版库复用" : " · 新建"}</span>) : <span style={{ color: theme.node.muted }}>不创建资产</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }} role="group" aria-label="应用方式">
                            {(["merge", "append", "replace"] as const).map((value) => <button key={value} type="button" className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: mode === value ? theme.canvas.selectionSoft : undefined, color: mode === value ? theme.node.text : theme.node.muted }} onClick={() => setMode(value)}>{MODE_LABELS[value]}</button>)}
                        </div>
                        <span className="text-[11px]" style={{ color: theme.node.muted }}>已选 {selectedScenes.length} 场 · {selectedShots.length} 镜 · 资产 {selectedAssets.length} 项</span>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCancel}>取消</button>
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selectedScenes.length} onClick={() => void submit()}>应用导演分析</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
