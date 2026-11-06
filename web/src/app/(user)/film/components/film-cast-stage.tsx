"use client";

import { useState } from "react";
import { Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmAsset, FilmAssetKind, FilmProject } from "../types";
import type { FilmViewPreset } from "../utils/film-view-presets";
import { FilmCharacterWorkspace } from "./film-character-workspace";
import { FilmLocationWorkspace } from "./film-location-workspace";

type FilmCastStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateAsset: (asset: FilmAsset, kind: FilmAssetKind) => void;
    onGenerateView: (asset: FilmAsset, kind: FilmAssetKind, preset: FilmViewPreset) => void;
    generatingAssetId: string;
};

export function FilmCastStage({ project, onUpdate, onGenerateAsset, onGenerateView, generatingAssetId }: FilmCastStageProps) {
    const [tab, setTab] = useState<"character" | "location">("character");
    const characters = project.characters || [];
    const locations = project.locations || [];

    return (
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
            <div className="punk-panel relative flex shrink-0 flex-wrap items-center gap-2 overflow-hidden px-4 py-2.5">
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                <span aria-hidden className="pointer-events-none absolute -left-8 top-1/2 size-24 -translate-y-1/2 rounded-full bg-acid/[0.06] blur-2xl" />
                <span className="eyebrow">角色与场景</span>
                <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                    {([{ value: "character", label: `角色 ${characters.length}` }, { value: "location", label: `场景 ${locations.length}` }] as const).map((item) => (
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
                <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">
                    <Users className="size-3" aria-hidden />
                    {tab === "character" ? "部位参考包 + 全身合成" : "场景概念图 + 视图设定"}
                </span>
            </div>
            <div key={tab} className="film-stage-enter min-h-0 flex-1">
                {tab === "character" ? (
                    <FilmCharacterWorkspace project={project} onUpdate={onUpdate} />
                ) : (
                    <FilmLocationWorkspace project={project} onUpdate={onUpdate} onGenerateAsset={onGenerateAsset} onGenerateView={onGenerateView} generatingAssetId={generatingAssetId} />
                )}
            </div>
        </div>
    );
}
