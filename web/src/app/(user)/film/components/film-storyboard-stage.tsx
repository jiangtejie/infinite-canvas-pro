"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button } from "antd";
import { Check, Clapperboard, ImageIcon, LayoutGrid, List } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmProject, FilmShot } from "../types";
import { countFilmScenes, countReadyShots, flattenFilmShots } from "../utils/parse-script";
import { updateFilmShot } from "../utils/film-edits";
import { FilmShotDetail } from "./film-shot-detail";
import { FilmShotStatusChip } from "./film-shot-status-chip";
import { FilmStoryboardBoard } from "./film-storyboard-board";
import { FilmShotThumbnail } from "./film-shot-thumbnail";

type ViewMode = "list" | "board";

type FilmStoryboardStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGoScript: () => void;
    onGenerateImage: (shot: FilmShot) => void;
    generatingShotId: string;
    onGenerateImageBatch: (shots: FilmShot[]) => void;
    batchProgress: { done: number; total: number } | null;
    onGenerateVideo: (shot: FilmShot) => void;
    generatingVideoShotId: string;
    videoProgress: number;
    onGenerateVideoBatch: (shots: FilmShot[]) => void;
    videoBatchProgress: { done: number; total: number } | null;
};

export function FilmStoryboardStage({ project, onUpdate, onGoScript, onGenerateImage, generatingShotId, onGenerateImageBatch, batchProgress, onGenerateVideo, generatingVideoShotId, videoProgress, onGenerateVideoBatch, videoBatchProgress }: FilmStoryboardStageProps) {
    const { modal } = App.useApp();
    const shots = useMemo(() => flattenFilmShots(project.episodes), [project.episodes]);
    const readyCount = countReadyShots(project.episodes);
    const [view, setView] = useState<ViewMode>("list");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedShotId, setSelectedShotId] = useState("");

    const toggleSelect = (shotId: string) => {
        setSelectedIds((prev) => prev.includes(shotId) ? prev.filter((id) => id !== shotId) : [...prev, shotId]);
    };
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? null;

    useEffect(() => {
        if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) return;
        setSelectedShotId(shots[0]?.id ?? "");
    }, [selectedShotId, shots]);

    return (
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/40 px-4 py-2.5">
                <span className="eyebrow">导演台</span>
                <span className="chip chip-acid">{shots.length} 个分镜</span>
                <span className="chip">{countFilmScenes(project.episodes)} 场</span>
                <span className="chip">{readyCount}/{shots.length} 已完成</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {view === "list" && selectedIds.length > 0 ? (
                        <>
                            <span className="chip chip-acid">{selectedIds.length} 已选</span>
                            <Button
                                size="small"
                                type="primary"
                                loading={Boolean(batchProgress)}
                                onClick={() => onGenerateImageBatch(shots.filter((shot) => selectedIds.includes(shot.id)))}
                            >
                                {batchProgress ? `批量生成 ${batchProgress.done}/${batchProgress.total}` : "批量生成分镜图"}
                            </Button>
                            <Button
                                size="small"
                                loading={Boolean(videoBatchProgress)}
                                onClick={() => {
                                    const targets = shots.filter((shot) => selectedIds.includes(shot.id));
                                    modal.confirm({
                                        title: `批量生成 ${targets.length} 个分镜视频？`,
                                        content: "会按顺序逐个提交视频任务，耗时取决于视频模型；已有分镜图会自动作为首帧。",
                                        okText: "开始生成",
                                        cancelText: "取消",
                                        onOk: () => onGenerateVideoBatch(targets),
                                    });
                                }}
                            >
                                {videoBatchProgress ? `批量视频 ${videoBatchProgress.done}/${videoBatchProgress.total}` : "批量生成视频"}
                            </Button>
                            <Button size="small" onClick={() => setSelectedIds([])}>清空</Button>
                        </>
                    ) : null}
                    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                        <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="size-3.5" />}>列表</ViewButton>
                        <ViewButton active={view === "board"} onClick={() => setView("board")} icon={<LayoutGrid className="size-3.5" />}>画布</ViewButton>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
                {view === "board" ? (
                    <FilmStoryboardBoard project={project} selectedShotId={selectedShotId} onSelect={setSelectedShotId} />
                ) : (
                    <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <span className="eyebrow">分镜板</span>
                            <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">点击镜头卡编辑</span>
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
                                                    <div
                                                        key={shot.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => setSelectedShotId(shot.id)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                setSelectedShotId(shot.id);
                                                            }
                                                        }}
                                                        className={cn(
                                                            "group flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                                                            shot.id === selectedShotId ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-border",
                                                            selectedIds.includes(shot.id) ? "ring-1 ring-acid/50 ring-inset" : "",
                                                        )}
                                                    >
                                                        <span className="flex items-center justify-between gap-2">
                                                            <span className="flex min-w-0 items-center gap-2">
                                                                <span
                                                                    role="checkbox"
                                                                    aria-checked={selectedIds.includes(shot.id)}
                                                                    aria-label={`选择 ${shot.shotNo}`}
                                                                    tabIndex={0}
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        toggleSelect(shot.id);
                                                                    }}
                                                                    onKeyDown={(event) => {
                                                                        if (event.key === "Enter" || event.key === " ") {
                                                                            event.preventDefault();
                                                                            event.stopPropagation();
                                                                            toggleSelect(shot.id);
                                                                        }
                                                                    }}
                                                                    className={cn("grid size-4 shrink-0 cursor-pointer place-items-center rounded-[3px] border transition-colors", selectedIds.includes(shot.id) ? "border-acid bg-acid/20 text-acid" : "border-border/70 text-transparent hover:border-acid/50")}
                                                                >
                                                                    <Check className="size-2.5" />
                                                                </span>
                                                                <span className={cn("truncate font-mono text-[10px] tabular-nums", shot.id === selectedShotId ? "text-acid" : "text-muted-foreground/70")}>{shot.shotNo}</span>
                                                            </span>
                                                            <FilmShotStatusChip status={shot.status} />
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
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

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
                            characters={project.characters || []}
                            locations={project.locations || []}
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
        </div>
    );
}

function ViewButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors", active ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}
        >
            {icon}
            {children}
        </button>
    );
}
