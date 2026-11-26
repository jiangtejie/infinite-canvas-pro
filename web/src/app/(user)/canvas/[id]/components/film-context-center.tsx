"use client";

import { useState } from "react";
import { AlertTriangle, Box, Crosshair, Library, MapPin, Palette, Plus, RefreshCw, Sparkles, UserRound } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { FilmAssetThumbnail } from "@/app/(user)/film/components/film-asset-thumbnail";
import { filmLibraryEntryIsNewer, findFilmLibraryEntry } from "@/app/(user)/film/utils/film-library";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmContextCenterRole } from "../lib/film-context-center";
import { FILM_CONTEXT_ROLE_LABELS, type FilmDirectorBoardModel } from "../lib/film-studio-types";
import { FilmLibraryPickerDialog } from "./film-library-picker-dialog";

const ROLE_ORDER: FilmContextCenterRole[] = ["character", "location", "prop", "style"];
const ROLE_ICONS = { character: UserRound, location: MapPin, prop: Box, style: Palette } as const;
const CREATE_KINDS: Array<Exclude<FilmAssetKind, "costume">> = ["character", "location", "prop"];
const IMPORT_KINDS: Array<Exclude<FilmAssetKind, "costume">> = ["character", "location", "prop"];

/** 卡片本身点击进入检查器存库；这里只提示库状态。 */
function LibraryBadge({ card, library, theme }: { card: { asset: FilmAsset; sourceLibraryAssetId?: string }; library: FilmAsset[]; theme: CanvasTheme }) {
    const entry = findFilmLibraryEntry(library, card.asset);
    if (!entry) return <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>未存库</span>;
    if (filmLibraryEntryIsNewer(entry, card.asset)) return <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>库有更新</span>;
    if (card.asset.updatedAt > entry.updatedAt) return <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>更新库</span>;
    return <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>母版库</span>;
}

type PickerState = { mode: "import"; kind: FilmAssetKind } | { mode: "replace"; nodeId: string; kind: FilmAssetKind; name: string };

export function FilmContextCenter({ theme, model }: { theme: CanvasTheme; model: FilmDirectorBoardModel }) {
    const [tab, setTab] = useState<FilmContextCenterRole>("character");
    const [createOpen, setCreateOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [picker, setPicker] = useState<PickerState | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [aiOpen, setAiOpen] = useState(false);
    const characters = useFilmCastStore((state) => state.characters);
    const locations = useFilmCastStore((state) => state.locations);
    const props = useFilmCastStore((state) => state.props);
    const styles = useFilmCastStore((state) => state.styles);
    const libraries = { character: characters, location: locations, prop: props, style: styles };
    const view = model.contextCenter;
    const shotById = new Map(model.shots.map((entry) => [entry.shot.id, entry]));
    const pendingAi = Object.entries(model.contextsByShot).flatMap(([shotId, chips]) => chips.filter((chip) => chip.source === "ai").map((chip) => ({ shotId, chip })));
    const shotLabel = (shotId: string) => {
        const entry = shotById.get(shotId);
        return entry ? `${entry.shot.metadata?.filmShot?.shotNo || entry.shot.title || "镜头"} · ${entry.sceneLabel}` : "镜头";
    };
    const cards = view.groups[tab];
    const createKinds: FilmAssetKind[] = view.groups.style.length ? CREATE_KINDS : [...CREATE_KINDS, "style"];
    const importKinds: FilmAssetKind[] = view.groups.style.length ? IMPORT_KINDS : [...IMPORT_KINDS, "style"];
    const toggle = (nodeId: string) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
    });
    return (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Library className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>上下文</span>
                {[`${view.totals.assets} 项`, `就绪 ${view.totals.ready}`, `缺参考 ${view.totals.missing}`, `未使用 ${view.totals.unused}`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
                {pendingAi.length ? <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }} onClick={() => setAiOpen((value) => !value)}>AI 待确认 {pendingAi.length}</button> : null}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                    <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => model.onOpenProduction(selected.size ? { assetIds: [...selected], kind: "asset" } : { kind: "asset" })}><Sparkles className="size-3" />{selected.size ? `制作选中 ${selected.size}` : "制作中心"}</button>
                    <div className="relative">
                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => { setCreateOpen((value) => !value); setImportOpen(false); }}><Plus className="size-3" />新建</button>
                        {createOpen ? (
                            <div className="absolute right-0 top-8 z-30 flex w-36 flex-col gap-0.5 rounded-lg border p-1 shadow-xl" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                {createKinds.map((kind) => <button key={kind} type="button" className="rounded px-2 py-1.5 text-left text-[11px]" style={{ color: theme.node.text }} onClick={() => { setCreateOpen(false); model.onCreateAsset(kind); }}>{FILM_ASSET_KIND_LABELS[kind]}</button>)}
                            </div>
                        ) : null}
                    </div>
                    <div className="relative">
                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => { setImportOpen((value) => !value); setCreateOpen(false); }}><Library className="size-3" />从母版库导入</button>
                        {importOpen ? (
                            <div className="absolute right-0 top-8 z-30 flex w-36 flex-col gap-0.5 rounded-lg border p-1 shadow-xl" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                {importKinds.map((kind) => <button key={kind} type="button" className="rounded px-2 py-1.5 text-left text-[11px]" style={{ color: theme.node.text }} onClick={() => { setImportOpen(false); setPicker({ mode: "import", kind }); }}>{FILM_ASSET_KIND_LABELS[kind]}</button>)}
                            </div>
                        ) : null}
                    </div>
                </span>
            </div>
            {aiOpen && pendingAi.length ? (
                <div className="mx-4 mt-2 flex flex-col gap-1 rounded-lg border px-2.5 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                    <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                        <span>AI 关联待确认 · {pendingAi.length}</span>
                        <button type="button" className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }} onClick={() => pendingAi.forEach(({ chip }) => model.onUpdateContext(chip.edgeId, { source: "manual" }))}>全部接受</button>
                    </div>
                    {pendingAi.map(({ shotId, chip }) => (
                        <div key={chip.edgeId} className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: theme.node.text }}>
                            <span className="min-w-0 flex-1 truncate">{FILM_CONTEXT_ROLE_LABELS[chip.role]} · {chip.name} → {shotLabel(shotId)}</span>
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }} onClick={() => model.onUpdateContext(chip.edgeId, { source: "manual" })}>接受</button>
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => model.onRemoveContext(chip.edgeId)}>移除</button>
                        </div>
                    ))}
                </div>
            ) : null}
            {view.issues.length ? (
                <div className="flex flex-col gap-1 px-4 pt-2.5">
                    {view.issues.map((issue) => (
                        <div key={issue.message} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: issue.level === "error" ? canvasStatusColors.error : theme.node.stroke, color: issue.level === "error" ? canvasStatusColors.error : theme.node.muted }}>
                            <AlertTriangle className="size-3 shrink-0" />{issue.message}
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-3 flex flex-wrap items-center gap-1">
                    {ROLE_ORDER.map((role) => {
                        const Icon = ROLE_ICONS[role];
                        const active = tab === role;
                        return <button key={role} type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : undefined, color: active ? theme.node.text : theme.node.muted }} onClick={() => setTab(role)}><Icon className="size-3" />{FILM_ASSET_KIND_LABELS[role]} {view.groups[role].length}</button>;
                    })}
                </div>
                {cards.length ? (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {cards.map((card) => (
                            <div key={card.nodeId} className="flex min-w-0 flex-col rounded-xl border" style={{ borderColor: selected.has(card.nodeId) ? theme.canvas.selectionStroke : theme.node.stroke, background: theme.node.panel }}>
                                <div className="flex min-w-0 items-start gap-2 p-2.5">
                                    <input type="checkbox" className="mt-1 shrink-0" checked={selected.has(card.nodeId)} onChange={() => toggle(card.nodeId)} aria-label={`选择上下文 ${card.name}`} />
                                    <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => model.onEditAsset(card.nodeId)}>
                                        <FilmAssetThumbnail asset={card.asset} className="h-14 w-14 shrink-0 rounded-lg" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-medium" style={{ color: theme.node.text }}>{card.name}</span>
                                            <span className="mt-0.5 block truncate text-[10px]" style={{ color: theme.node.muted }}>{card.description || "未填写设定"}</span>
                                            <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                                                <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: card.pending ? canvasStatusColors.loading : card.ready ? theme.node.stroke : canvasStatusColors.error, color: card.pending ? canvasStatusColors.loading : card.ready ? theme.node.muted : canvasStatusColors.error }}>{card.pending ? "生成中" : card.ready ? "参考就绪" : "缺参考"}</span>
                                                {!card.impactedShots.length ? <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>未使用</span> : null}
                                                <LibraryBadge card={card} library={libraries[card.role]} theme={theme} />
                                                {card.costumeRefs.length ? <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>服装引用 {card.costumeRefs.length}</span> : null}
                                            </span>
                                        </span>
                                    </button>
                                </div>
                                {card.missingRefs.length ? (
                                    <div className="flex flex-col gap-0.5 px-2.5 pb-1.5">
                                        {card.missingRefs.map((missing) => <span key={missing} className="inline-flex items-center gap-1 text-[10px]" style={{ color: canvasStatusColors.error }}><AlertTriangle className="size-2.5 shrink-0" />{missing}</span>)}
                                    </div>
                                ) : null}
                                <div className="mt-auto flex flex-wrap items-center gap-1 border-t px-2.5 py-1.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                    {card.role === "style" ? <span>影响全片 {card.impactedShots.length} 镜</span> : <span>{card.usedShots.length} 镜 · {card.usedScenes.length} 场</span>}
                                    <span className="ml-auto flex items-center gap-1">
                                        {card.usedShots.slice(0, 4).map((shot) => <button key={shot.id} type="button" className="rounded border px-1 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} title={`打开镜头 ${shot.shotNo}`} onClick={() => model.onOpenShotFocus(shot.id)}>{shot.shotNo}</button>)}
                                        {card.usedShots.length > 4 ? <span>+{card.usedShots.length - 4}</span> : null}
                                        <button type="button" className="rounded border px-1 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} aria-label={`画布定位 ${card.name}`} onClick={() => model.onLocateAsset(card.nodeId)}><Crosshair className="size-3" /></button>
                                        <button type="button" className="rounded border px-1 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} aria-label={`从母版库更新 ${card.name}`} onClick={() => setPicker({ mode: "replace", nodeId: card.nodeId, kind: card.role, name: card.name })}><RefreshCw className="size-3" /></button>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <div className="grid min-h-[180px] place-items-center text-sm" style={{ color: theme.node.muted }}>还没有{FILM_ASSET_KIND_LABELS[tab]}上下文，先新建或从母版库导入。</div>}
            </div>
            <FilmLibraryPickerDialog
                open={Boolean(picker)}
                theme={theme}
                kind={picker?.kind ?? "character"}
                currentAssetName={picker?.mode === "replace" ? picker.name : undefined}
                onClose={() => setPicker(null)}
                onReplace={picker?.mode === "replace" ? (entry) => { model.onReplaceAssetFromLibrary(picker.nodeId, entry); setPicker(null); } : undefined}
                onImport={(entry) => { if (picker?.mode === "import") model.onImportAssetFromLibrary(picker.kind, entry); setPicker(null); }}
            />
        </div>
    );
}
