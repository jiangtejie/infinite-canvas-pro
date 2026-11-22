"use client";

import { useState } from "react";
import { AlertTriangle, Box, Check, Library, MapPin, Plus, Shirt, Sparkles, UserRound } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAssetKind } from "@/lib/film/types";
import { FilmAssetThumbnail } from "@/app/(user)/film/components/film-asset-thumbnail";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { FilmLibraryPickerDialog } from "./film-library-picker-dialog";

const KINDS: FilmAssetKind[] = ["character", "location", "prop", "costume", "style"];
const CREATE_KINDS: FilmAssetKind[] = ["character", "location", "prop", "costume"];
const KIND_ICONS = { character: UserRound, location: MapPin, prop: Box, costume: Shirt, style: Library } as const;

export function FilmAssetOverviewView({ theme, model }: { theme: CanvasTheme; model: FilmStudioModel }) {
    const [tab, setTab] = useState<FilmAssetKind>("character");
    const [mode, setMode] = useState<"assets" | "coverage">("assets");
    const [createOpen, setCreateOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importKind, setImportKind] = useState<FilmAssetKind | null>(null);
    const view = model.assetView;
    const items = view.groups[tab];
    const totalFor = (kind: FilmAssetKind) => view.groups[kind].length;
    return (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Library className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>资产</span>
                {[`${view.totals.assets} 项`, `就绪 ${view.totals.ready}`, `缺参考 ${view.totals.missing}`, `未使用 ${view.totals.unused}`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
                <span className="ml-auto flex items-center gap-1">
                    <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={model.onOpenAssetProduction}><Sparkles className="size-3" />生产队列{view.totals.missing ? ` · ${view.totals.missing}` : ""}</button>
                    <div className="relative">
                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => { setCreateOpen((value) => !value); setImportOpen(false); }}><Plus className="size-3" />新建资产</button>
                        {createOpen ? (
                            <div className="absolute right-0 top-8 z-30 flex w-36 flex-col gap-0.5 rounded-lg border p-1 shadow-xl" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                {CREATE_KINDS.map((kind) => <button key={kind} type="button" className="rounded px-2 py-1.5 text-left text-[11px]" style={{ color: theme.node.text }} onClick={() => { setCreateOpen(false); model.onCreateAsset(kind); }}>{FILM_ASSET_KIND_LABELS[kind]}</button>)}
                            </div>
                        ) : null}
                    </div>
                    <div className="relative">
                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => { setImportOpen((value) => !value); setCreateOpen(false); }}><Library className="size-3" />从母版库导入</button>
                        {importOpen ? (
                            <div className="absolute right-0 top-8 z-30 flex w-36 flex-col gap-0.5 rounded-lg border p-1 shadow-xl" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                {CREATE_KINDS.map((kind) => <button key={kind} type="button" className="rounded px-2 py-1.5 text-left text-[11px]" style={{ color: theme.node.text }} onClick={() => { setImportOpen(false); setImportKind(kind); }}>{FILM_ASSET_KIND_LABELS[kind]}</button>)}
                            </div>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                        {(["assets", "coverage"] as const).map((value) => <button key={value} type="button" className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: mode === value ? theme.canvas.selectionSoft : undefined, color: mode === value ? theme.node.text : theme.node.muted }} onClick={() => setMode(value)}>{value === "assets" ? "资产清单" : "场景覆盖"}</button>)}
                    </div>
                </span>
            </div>
            {mode === "assets" ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <div className="mb-3 flex flex-wrap items-center gap-1">
                        {KINDS.map((kind) => {
                            const Icon = KIND_ICONS[kind];
                            return <button key={kind} type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: tab === kind ? theme.canvas.selectionStroke : theme.node.stroke, background: tab === kind ? theme.canvas.selectionSoft : undefined, color: tab === kind ? theme.node.text : theme.node.muted }} onClick={() => setTab(kind)}><Icon className="size-3" />{FILM_ASSET_KIND_LABELS[kind]} {totalFor(kind)}</button>;
                        })}
                    </div>
                    {items.length ? (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {items.map((item) => (
                                <div key={item.nodeId} className="flex min-w-0 flex-col rounded-xl border" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                    <button type="button" className="flex min-w-0 items-start gap-2 p-2.5 text-left" onClick={() => model.onEditAsset(item.nodeId)}>
                                        <FilmAssetThumbnail asset={item.asset} className="h-14 w-14 shrink-0 rounded-lg" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-medium" style={{ color: theme.node.text }}>{item.name}</span>
                                            <span className="mt-0.5 block truncate text-[10px]" style={{ color: theme.node.muted }}>{item.description || "未填写设定"}</span>
                                            <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                                                <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: item.pending ? canvasStatusColors.loading : item.ready ? theme.node.stroke : canvasStatusColors.error, color: item.pending ? canvasStatusColors.loading : item.ready ? theme.node.muted : canvasStatusColors.error }}>{item.pending ? "生成中" : item.ready ? "参考就绪" : "缺参考"}</span>
                                                {!item.usedShots ? <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>未使用</span> : null}
                                                {item.sourceLibraryAssetId ? <span className="rounded-full border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>母版库</span> : null}
                                            </span>
                                        </span>
                                    </button>
                                    <div className="mt-auto flex items-center justify-between gap-2 border-t px-2.5 py-1.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                        <span>{item.usedShots} 镜 · {item.usedScenes} 场</span>
                                        <button type="button" className="rounded border px-1.5 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => model.onLocateAsset(item.nodeId)}>画布定位</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <div className="grid min-h-[180px] place-items-center text-sm" style={{ color: theme.node.muted }}>还没有{FILM_ASSET_KIND_LABELS[tab]}资产，先新建或从母版库导入。</div>}
                </div>
            ) : (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {view.coverage.length ? (
                        <div className="flex flex-col gap-2">
                            {view.coverage.map((scene) => (
                                <section key={scene.sceneId} className="rounded-lg border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                        <span className="font-medium" style={{ color: theme.node.text }}>{scene.label}</span>
                                        <span style={{ color: theme.node.muted }}>{scene.shotCount} 镜</span>
                                        {scene.missing.length ? <span className="ml-auto inline-flex items-center gap-1" style={{ color: canvasStatusColors.loading }}><AlertTriangle className="size-3" />{scene.missing.join(" · ")}</span> : <span className="ml-auto inline-flex items-center gap-1" style={{ color: theme.node.muted }}><Check className="size-3" />角色/场景已覆盖</span>}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {[...scene.characters, ...scene.locations, ...scene.props].map((binding) => <span key={`${binding.id}-${binding.name}`} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: binding.ready ? theme.node.stroke : canvasStatusColors.error, color: binding.ready ? theme.node.text : canvasStatusColors.error }}>{binding.name}</span>)}
                                        {!scene.characters.length && !scene.locations.length && !scene.props.length ? <span className="text-[10px]" style={{ color: theme.node.muted }}>本场镜头还没有绑定资产</span> : null}
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : <div className="grid min-h-[180px] place-items-center text-sm" style={{ color: theme.node.muted }}>还没有场次或镜头，先去 Studio/画布创建。</div>}
                </div>
            )}
            <FilmLibraryPickerDialog
                open={Boolean(importKind)}
                theme={theme}
                kind={importKind ?? "character"}
                currentAssetName={undefined}
                onClose={() => setImportKind(null)}
                onImport={(entry) => { if (importKind) model.onImportAssetFromLibrary(importKind, entry); setImportKind(null); }}
            />
        </div>
    );
}
