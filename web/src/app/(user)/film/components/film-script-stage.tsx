"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input } from "antd";
import { Clapperboard, Plus, Trash2, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmProject, FilmShot } from "../types";
import { addFilmEpisode, addFilmScene, addFilmShot, removeFilmScene, removeFilmShot, updateFilmShot } from "../utils/film-edits";
import { countFilmScenes, flattenFilmShots, parseScript } from "../utils/parse-script";
import { FilmShotDetail } from "./film-shot-detail";

type FilmScriptStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
};

export function FilmScriptStage({ project, onUpdate }: FilmScriptStageProps) {
    const { message, modal } = App.useApp();
    const episodes = project.episodes;
    const shots = useMemo(() => flattenFilmShots(episodes), [episodes]);
    const [selectedShotId, setSelectedShotId] = useState("");
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? null;

    useEffect(() => {
        if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) return;
        setSelectedShotId(shots[0]?.id ?? "");
    }, [selectedShotId, shots]);

    const parse = () => {
        if (!project.scriptText.trim()) {
            message.warning("先粘贴一段剧本内容");
            return;
        }
        const parsed = parseScript(project.scriptText);
        if (!parsed.length) {
            message.warning("没有解析出内容，检查一下剧本格式");
            return;
        }
        onUpdate({ episodes: parsed });
        setSelectedShotId(flattenFilmShots(parsed)[0]?.id ?? "");
        message.success(`解析出 ${parsed.length} 集 / ${countFilmScenes(parsed)} 场 / ${flattenFilmShots(parsed).length} 个分镜`);
    };

    const clearScript = () => {
        modal.confirm({
            title: "清空剧本和分镜？",
            content: "剧本文本与已解析的剧集、分镜都会被清空，无法恢复。",
            okText: "清空",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                onUpdate({ scriptText: "", episodes: [] });
                setSelectedShotId("");
            },
        });
    };

    const removeShot = (shotId: string) => {
        onUpdate({ episodes: removeFilmShot(episodes, shotId) });
    };

    return (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
            <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">剧本导入</span>
                    <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">{project.episodes.length} 集</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    <Input.TextArea
                        className="thin-scrollbar !bg-background/40"
                        autoSize={{ minRows: 16, maxRows: 28 }}
                        value={project.scriptText}
                        placeholder={"粘贴完整剧本，例如：\n第1集：手办血案\n1-1 乡村公路/大巴车\n01 MS 一辆破旧的大巴车在山路上颠簸。"}
                        onChange={(event) => onUpdate({ scriptText: event.target.value })}
                    />
                    <p className="mt-3 text-[11px] leading-5 text-muted-foreground/70">按「第X集 / 第X场 / 镜号 景别」规则解析，结果可以逐条修改。</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="primary" size="small" icon={<Wand2 className="size-3.5" />} onClick={parse}>
                            解析剧本
                        </Button>
                        <Button size="small" icon={<Trash2 className="size-3.5" />} onClick={clearScript}>
                            清空
                        </Button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="chip chip-acid">{countFilmScenes(episodes)} 场</span>
                        <span className="chip">{shots.length} 个分镜</span>
                    </div>
                </div>
            </section>

            <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">剧集结构</span>
                    <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => onUpdate({ episodes: addFilmEpisode(episodes) })}>
                        添加一集
                    </Button>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                    {episodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                            <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                                <Clapperboard className="size-5" />
                            </div>
                            <p className="mt-4 text-sm text-foreground">还没有剧集</p>
                            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">粘贴剧本后点「解析剧本」，或手动添加一集。</p>
                        </div>
                    ) : null}
                    {episodes.map((episode, episodeIndex) => (
                        <div key={episode.id} className="border-b border-border/60 last:border-0">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">{String(episodeIndex + 1).padStart(2, "0")}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{episode.title}</span>
                                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{episode.scenes.length} 场</span>
                                <Button type="text" size="small" aria-label="添加场景" title="添加场景" icon={<Plus className="size-3.5" />} onClick={() => onUpdate({ episodes: addFilmScene(episodes, episode.id) })} />
                            </div>
                            {episode.scenes.map((scene, sceneIndex) => (
                                <div key={scene.id} className="border-t border-border/40">
                                    <div className="flex items-center gap-2 bg-background/25 px-3 py-1.5 pl-6">
                                        <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">{episodeIndex + 1}-{sceneIndex + 1}</span>
                                        <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">{scene.name}</span>
                                        <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">{scene.shots.length} 镜</span>
                                        <Button type="text" size="small" aria-label="添加分镜" title="添加分镜" icon={<Plus className="size-3.5" />} onClick={() => onUpdate({ episodes: addFilmShot(episodes, scene.id) })} />
                                        <Button
                                            type="text"
                                            size="small"
                                            danger
                                            aria-label="删除场景"
                                            title="删除场景"
                                            icon={<Trash2 className="size-3.5" />}
                                            onClick={() => onUpdate({ episodes: removeFilmScene(episodes, scene.id) })}
                                        />
                                    </div>
                                    {scene.shots.map((shot) => (
                                        <button
                                            key={shot.id}
                                            type="button"
                                            onClick={() => setSelectedShotId(shot.id)}
                                            className={cn(
                                                "flex w-full items-center gap-2 border-t border-border/30 px-3 py-2 pl-9 text-left transition-colors",
                                                shot.id === selectedShotId ? "bg-acid/[0.06]" : "hover:bg-foreground/[0.03]",
                                            )}
                                        >
                                            <span className={cn("font-mono text-[10px] tabular-nums", shot.id === selectedShotId ? "text-acid" : "text-muted-foreground/70")}>{shot.shotNo}</span>
                                            <span className="w-9 shrink-0 font-mono text-[9px] tracking-wide text-muted-foreground/70">{shot.shotType || "—"}</span>
                                            <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{shot.description || "未填写描述"}</span>
                                            <StatusDot status={shot.status} />
                                        </button>
                                    ))}
                                    {scene.shots.length === 0 ? <p className="border-t border-border/30 px-3 py-2 pl-9 text-[11px] text-muted-foreground/60">还没有分镜</p> : null}
                                </div>
                            ))}
                            {episode.scenes.length === 0 ? <p className="px-3 py-2 pl-6 text-[11px] text-muted-foreground/60">还没有场景</p> : null}
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
                        onChange={(patch) => onUpdate({ episodes: updateFilmShot(episodes, selectedShot.id, patch) })}
                        onDelete={() => removeShot(selectedShot.id)}
                    />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                        <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                            <Plus className="size-5" />
                        </div>
                        <p className="mt-4 text-sm text-foreground">选择一个分镜</p>
                        <p className="mt-1.5 text-xs leading-6 text-muted-foreground">在中间的剧集结构里点一个镜头，就能在这里编辑。</p>
                    </div>
                )}
            </section>
        </div>
    );
}

function StatusDot({ status }: { status: FilmShot["status"] }) {
    const tone = status === "video_ready" ? "bg-acid" : status === "image_ready" ? "bg-acid/60" : status === "failed" ? "bg-hot" : "bg-border";
    return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone)} />;
}
