"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Drawer } from "antd";
import { ClipboardList, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset, FilmAssetKind, FilmLocationVariant, FilmProject } from "@/lib/film/types";
import type { FilmViewPreset } from "../utils/film-view-presets";
import { filmAssetReadiness } from "../utils/film-asset-readiness";
import { buildFilmBreakdownTable, type FilmBreakdownStatus } from "../utils/film-breakdown";
import { FilmCharacterWorkspace } from "./film-character-workspace";
import { FilmLocationWorkspace } from "./film-location-workspace";
import { FilmPropCostumeWorkspace } from "./film-prop-costume-workspace";

type CastTab = "character" | "location" | "prop" | "costume";
type CastFocus = { kind: FilmAssetKind; assetId?: string } | null;

const STATUS_LABELS: Record<FilmBreakdownStatus, { label: string; className: string }> = {
    ready: { label: "就绪", className: "text-acid" },
    missing: { label: "缺参考", className: "text-hot" },
    unlocked: { label: "未锁定", className: "text-amber-500" },
    unbuilt: { label: "未建资产", className: "text-muted-foreground/70" },
};

type FilmCastStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateAsset: (kind: FilmAssetKind, asset: FilmAsset) => void;
    onGenerateView: (kind: FilmAssetKind, asset: FilmAsset, preset: FilmViewPreset) => void;
    onGenerateVariant: (asset: FilmAsset, variant: FilmLocationVariant) => void;
    onStopAsset: () => void;
    generatingAssetId: string;
    focus?: CastFocus;
};

export function FilmCastStage({ project, onUpdate, onGenerateAsset, onGenerateView, onGenerateVariant, onStopAsset, generatingAssetId, focus }: FilmCastStageProps) {
    const [tab, setTab] = useState<CastTab>("character");
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    const [localFocus, setLocalFocus] = useState<CastFocus>(null);
    const activeFocus = localFocus || focus || null;
    const characters = project.characters || [];
    const locations = project.locations || [];
    const props = project.props || [];
    const costumes = project.costumes || [];
    const tabs = [
        { value: "character", label: `角色 ${characters.length}` },
        { value: "location", label: `场景 ${locations.length}` },
        { value: "prop", label: `道具 ${props.length}` },
        { value: "costume", label: `服装 ${costumes.length}` },
    ] as const;
    const hints: Record<CastTab, string> = {
        character: "部位参考包 + 表情集 + 全身合成",
        location: "概念图 + 结构视图 + 气氛变体",
        prop: "道具概念图 + 多视图",
        costume: "服装设计图 + 细节图",
    };
    const readiness = useMemo(() => filmAssetReadiness(project), [project]);
    const breakdown = useMemo(() => buildFilmBreakdownTable(project), [project]);

    useEffect(() => {
        setLocalFocus(null);
    }, [focus]);

    useEffect(() => {
        if (!activeFocus || activeFocus.kind === "style") return;
        setTab(activeFocus.kind);
    }, [activeFocus]);

    const focusAssetId = activeFocus && activeFocus.kind === tab ? activeFocus.assetId : undefined;

    const jumpToAsset = (kind: FilmAssetKind, assetId?: string) => {
        if (kind === "style") return;
        setTab(kind);
        setLocalFocus({ kind, assetId });
        setBreakdownOpen(false);
    };

    return (
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
            <div className="punk-panel relative flex shrink-0 flex-wrap items-center gap-2 overflow-hidden px-4 py-2.5">
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                <span aria-hidden className="pointer-events-none absolute -left-8 top-1/2 size-24 -translate-y-1/2 rounded-full bg-acid/[0.06] blur-2xl" />
                <span className="eyebrow">角色与设定</span>
                <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                    {tabs.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setTab(item.value)}
                            aria-pressed={tab === item.value}
                            className={cn("rounded px-2.5 py-1 text-[11px] transition-colors", tab === item.value ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <span className="chip">{readiness.ready}/{readiness.checked} 就绪</span>
                    {readiness.missing.length ? <span className="chip border-hot/40 text-hot">缺参考 {readiness.missing.length}</span> : null}
                    {readiness.unlocked.length ? <span className="chip">未锁定 {readiness.unlocked.length}</span> : null}
                    <Button size="small" icon={<ClipboardList className="size-3.5" />} onClick={() => setBreakdownOpen(true)}>拆件表</Button>
                    <span className="hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase xl:flex">
                        <Users className="size-3" aria-hidden />
                        {hints[tab]}
                    </span>
                </div>
            </div>
            <div key={tab} className="film-stage-enter min-h-0 flex-1">
                {tab === "character" ? (
                    <FilmCharacterWorkspace
                        project={project}
                        onUpdate={onUpdate}
                        onGenerateConcept={(asset) => onGenerateAsset("character", asset)}
                        onStopConcept={onStopAsset}
                        generatingAssetId={generatingAssetId}
                        focusAssetId={focusAssetId}
                    />
                ) : tab === "location" ? (
                    <FilmLocationWorkspace project={project} onUpdate={onUpdate} onGenerateAsset={onGenerateAsset} onGenerateView={onGenerateView} onGenerateVariant={onGenerateVariant} onStopAsset={onStopAsset} generatingAssetId={generatingAssetId} focusAssetId={focusAssetId} />
                ) : (
                    <FilmPropCostumeWorkspace project={project} onUpdate={onUpdate} kind={tab} onGenerateAsset={onGenerateAsset} onGenerateView={onGenerateView} onStopAsset={onStopAsset} generatingAssetId={generatingAssetId} focusAssetId={focusAssetId} />
                )}
            </div>

            <Drawer title="拆件表" open={breakdownOpen} onClose={() => setBreakdownOpen(false)} size="min(1180px, 96vw)">
                <div className="grid gap-3">
                    <p className="text-xs leading-5 text-muted-foreground">
                        按集 × 资产出场矩阵，数据来自语义分析与镜头绑定；点击行可跳到对应工作台补全。
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        {Object.entries(STATUS_LABELS).map(([status, item]) => (
                            <span key={status} className={cn("rounded border border-border/60 px-1.5 py-0.5", item.className)}>{item.label}</span>
                        ))}
                    </div>
                    <div className="thin-scrollbar overflow-auto rounded-lg border border-border/60">
                        <table className="w-full min-w-[720px] border-collapse text-xs">
                            <thead>
                                <tr className="bg-background/70 text-left text-[10px] tracking-[0.12em] text-muted-foreground/70 uppercase">
                                    <th className="sticky left-0 z-10 bg-background/95 px-2 py-2">资产</th>
                                    <th className="px-2 py-2">类型</th>
                                    {breakdown.episodes.map((episode) => <th key={episode} className="px-2 py-2 whitespace-nowrap">{episode}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {breakdown.rows.map((row) => (
                                    <tr key={row.key} className="cursor-pointer border-t border-border/40 transition-colors hover:bg-foreground/[0.04]" onClick={() => jumpToAsset(row.kind, row.assetId)}>
                                        <td className="sticky left-0 z-10 max-w-56 truncate bg-background/95 px-2 py-1.5 text-foreground/85">{row.name}</td>
                                        <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground/60">{FILM_ASSET_KIND_LABELS[row.kind]}</td>
                                        {breakdown.episodes.map((episode) => {
                                            const status = row.cells[episode];
                                            return (
                                                <td key={episode} className="px-2 py-1.5">
                                                    {status ? <span className={STATUS_LABELS[status].className}>{STATUS_LABELS[status].label}</span> : <span className="text-muted-foreground/30">—</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!breakdown.rows.length ? <p className="px-3 py-8 text-center text-xs text-muted-foreground">还没有可拆解的资产；先解析剧本或绑定镜头。</p> : null}
                    </div>
                </div>
            </Drawer>
        </div>
    );
}
