"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmProject, FilmShot, FilmShotStatus } from "../types";
import { countReadyShots, flattenFilmShots, countFilmScenes } from "../utils/parse-script";
import { updateFilmShot } from "../utils/film-edits";
import { FilmShotDetail } from "./film-shot-detail";
import { FilmShotThumbnail } from "./film-shot-thumbnail";

type FilmStoryboardStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGoScript: () => void;
    onGenerateImage: (shot: FilmShot) => void;
    generatingShotId: string;
    onGenerateVideo: (shot: FilmShot) => void;
    generatingVideoShotId: string;
    videoProgress: number;
};

export function FilmStoryboardStage({ project, onUpdate, onGoScript, onGenerateImage, generatingShotId, onGenerateVideo, generatingVideoShotId, videoProgress }: FilmStoryboardStageProps) {
    const shots = useMemo(() => flattenFilmShots(project.episodes), [project.episodes]);
    const readyCount = countReadyShots(project.episodes);
    const [selectedShotId, setSelectedShotId] = useState("");
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? null;

    useEffect(() => {
        if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) return;
        setSelectedShotId(shots[0]?.id ?? "");
    }, [selectedShotId, shots]);

    return (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">导演台</span>
                    <span className="chip chip-acid">{shots.length} 个分镜</span>
                    <span className="chip">{countFilmScenes(project.episodes)} 场</span>
                    <span className="chip">{readyCount}/{shots.length} 已完成</span>
                    <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">分镜板</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    {shots.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                            <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                                <Clapperboard className="size-5" />
                            </div>
                            <p className="mt-4 text-sm text-foreground">还没有分镜</p>
                            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">先去剧本页粘贴剧本并解析，分镜会自动同步到这里。</p>
                            <button type="button" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition hover:border-acid/60" onClick={onGoScript}>
                                去剧本页
                            </button>
                        </div>
                    ) : null}
                    {project.episodes.map((episode) => (
                        <div key={episode.id} className="mb-6 last:mb-0">
                            <div className="mb-2 flex items-center gap-2">
                                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{episode.title}</span>
                                <span aria-hidden className="h-px flex-1 bg-border/50" />
                            </div>
                            {episode.scenes.map((scene) => (
                                <div key={scene.id} className="mb-4 last:mb-0">
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="text-xs font-medium text-foreground/80">{scene.name}</span>
                                        <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">{scene.shots.length} 镜</span>
                                    </div>
                                    {scene.shots.length === 0 ? <p className="px-1 py-2 text-[11px] text-muted-foreground/60">这一场还没有分镜</p> : null}
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {scene.shots.map((shot) => (
                                            <button
                                                key={shot.id}
                                                type="button"
                                                onClick={() => setSelectedShotId(shot.id)}
                                                className={cn(
                                                    "group flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                                                    shot.id === selectedShotId ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-border",
                                                )}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className={cn("font-mono text-[10px] tabular-nums", shot.id === selectedShotId ? "text-acid" : "text-muted-foreground/70")}>{shot.shotNo}</span>
                                                    <StatusChip status={shot.status} />
                                                </span>
                                                <FilmShotThumbnail shot={shot} className="h-24 w-full rounded-md border border-border/50" />
                                                <span className={cn("line-clamp-3 text-xs leading-5", shot.description ? "text-foreground/80" : "text-muted-foreground/50")}>
                                                    {shot.description || "未填写画面描述"}
                                                </span>
                                                <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/60">
                                                    <span>{shot.shotType || "景别未设置"}</span>
                                                    <span aria-hidden>·</span>
                                                    <span>{shot.duration}s</span>
                                                    {shot.prompt ? <ImageIcon className="ml-auto size-3 text-acid/70" aria-label="已填写提示词" /> : null}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </section>

            <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">分镜详情</span>
                    {selectedShot ? <span className="font-mono text-[10px] text-muted-foreground/70">{selectedShot.shotNo}</span> : null}
                </div>
                {selectedShot ? (
                    <FilmShotDetail
                        shot={selectedShot}
                        onChange={(patch) => onUpdate({ episodes: updateFilmShot(project.episodes, selectedShot.id, patch) })}
                        onDelete={() => onUpdate({ episodes: project.episodes.map((episode) => ({ ...episode, scenes: episode.scenes.map((scene) => ({ ...scene, shots: scene.shots.filter((shot) => shot.id !== selectedShot.id) })) })) })}
                        onGenerate={() => onGenerateImage(selectedShot)}
                        generating={generatingShotId === selectedShot.id}
                        onGenerateVideo={() => onGenerateVideo(selectedShot)}
                        generatingVideo={generatingVideoShotId === selectedShot.id}
                        videoProgress={videoProgress}
                    />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                        <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                            <Clapperboard className="size-5" />
                        </div>
                        <p className="mt-4 text-sm text-foreground">选择一个分镜</p>
                        <p className="mt-1.5 text-xs leading-6 text-muted-foreground">点左侧的镜头卡，就能在这里编辑景别、时长和提示词。</p>
                    </div>
                )}
            </section>
        </div>
    );
}

function StatusChip({ status }: { status: FilmShotStatus }) {
    const style = status === "video_ready"
        ? "border-acid/60 bg-acid/10 text-acid"
        : status === "image_ready"
            ? "border-acid/40 text-acid/90"
            : status === "failed"
                ? "border-hot/50 text-hot"
                : "border-border/70 text-muted-foreground/70";
    const label = status === "video_ready" ? "视频" : status === "image_ready" ? "分镜图" : status === "failed" ? "失败" : "未开始";
    return <span className={cn("rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-wide", style)}>{label}</span>;
}
