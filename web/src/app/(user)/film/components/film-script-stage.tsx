"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, InputNumber, Modal, Select } from "antd";
import { Clapperboard, ClipboardList, Link2, Plus, ShieldCheck, Sparkles, Trash2, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmEpisode, FilmProject, FilmShot } from "../types";
import { addFilmEpisode, addFilmScene, addFilmShot, filmSceneOptions, filmShotPosition, moveFilmShot, moveFilmShotToScene, removeFilmScene, removeFilmShot, updateFilmShot } from "../utils/film-edits";
import { useFilmAiParse } from "../hooks/use-film-ai-parse";
import { useFilmContinuity } from "../hooks/use-film-continuity";
import type { FilmImageBatchOptions, FilmImageBatchProgress } from "../hooks/use-film-shot-image";
import { applyFilmContinuity, applyFilmContinuityValidation } from "../utils/film-continuity-sheet";
import { useFilmContinuityCheck } from "../hooks/use-film-continuity-check";
import { bindFilmCast } from "../utils/film-cast-bind";
import { mergeFilmEpisodes } from "../utils/film-ai-parse";
import { filmShotTypeLabel } from "../utils/film-shot-types";
import { resolveFilmStyleText } from "../utils/film-styles";
import { countFilmScenes, flattenFilmShots } from "../utils/parse-script";
import { FilmShotDetail } from "./film-shot-detail";

type FilmScriptStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateImage: (shot: FilmShot) => void;
    onGenerateImageBatch: (shots: FilmShot[], options?: FilmImageBatchOptions) => void;
    generatingShotId: string;
    batchProgress: FilmImageBatchProgress | null;
    onStopBatch: () => void;
    onGenerateVideo: (shot: FilmShot) => void;
    generatingVideoShotId: string;
    videoProgress: number;
};

export function FilmScriptStage({ project, onUpdate, onGenerateImage, onGenerateImageBatch, generatingShotId, batchProgress, onStopBatch, onGenerateVideo, generatingVideoShotId, videoProgress }: FilmScriptStageProps) {
    const { message, modal } = App.useApp();
    const { analyzingEpisodeId, analyzeEpisode } = useFilmContinuity();
    const { batchProgress: checkingBatchProgress, checkShots } = useFilmContinuityCheck();
    const episodes = project.episodes;
    const shots = useMemo(() => flattenFilmShots(episodes), [episodes]);
    const [selectedShotId, setSelectedShotId] = useState("");
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? null;

    useEffect(() => {
        if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) return;
        setSelectedShotId(shots[0]?.id ?? "");
    }, [selectedShotId, shots]);

    const sceneTargets = useMemo(() => filmSceneOptions(episodes), [episodes]);
    const selectedPosition = selectedShot ? filmShotPosition(episodes, selectedShot.id) : null;

    const checkEpisodeContinuity = (episode: FilmEpisode) => {
        const episodeShots = episode.scenes.flatMap((scene) => scene.shots);
        const checkable = episodeShots.filter((shot) => shot.imageUrl || shot.storageKey);
        if (!checkable.length) {
            message.warning("本集还没有可校验的分镜图");
            return;
        }
        modal.confirm({
            title: `校验本集 ${checkable.length} 张分镜图？`,
            content: "会逐张用多模态模型对照场记交接单检查，消耗相应次数的模型调用；校验结果会写回每个镜头的交接单。",
            okText: "开始校验",
            cancelText: "取消",
            onOk: async () => {
                const results = await checkShots(episodeShots);
                if (!results || !Object.keys(results).length) return;
                onUpdate({ episodes: episodes.map((item) => item.id === episode.id ? applyFilmContinuityValidation(item, results) : item) });
            },
        });
    };

    const analyzeContinuity = async (episode: FilmEpisode) => {
        const sheets = await analyzeEpisode(episode);
        if (!sheets?.length) return;
        onUpdate({ episodes: episodes.map((item) => item.id === episode.id ? applyFilmContinuity(item, sheets) : item) });
    };

    const generateSceneImages = (sceneShots: FilmShot[]) => {
        if (batchProgress) return;
        const describable = sceneShots.filter((shot) => (shot.prompt || shot.description).trim());
        if (!describable.length) {
            message.warning("本场镜头还没有画面描述或提示词");
            return;
        }
        const pending = describable.filter((shot) => !shot.imageUrl);
        if (!pending.length) {
            message.info("本场镜头都已有分镜图");
            return;
        }
        modal.confirm({
            title: `生成本场 ${pending.length} 张分镜图？`,
            content: "已有分镜图的镜头会跳过；会用本场第一个镜头做锚点，后续镜头引用它保持色调与画风，按顺序生成。",
            okText: "开始生成",
            cancelText: "取消",
            onOk: () => onGenerateImageBatch(sceneShots, { anchorShotId: sceneShots[0]?.id, skipExisting: true }),
        });
    };

    const moveSelectedShot = (direction: "up" | "down") => {
        if (!selectedShot) return;
        onUpdate({ episodes: moveFilmShot(episodes, selectedShot.id, direction === "up" ? -1 : 1) });
    };

    const moveSelectedShotToScene = (sceneId: string) => {
        if (!selectedShot || selectedPosition?.sceneId === sceneId) return;
        onUpdate({ episodes: moveFilmShotToScene(episodes, selectedShot.id, sceneId) });
    };

    const [pacing, setPacing] = useState<"fast" | "normal" | "slow">("normal");
    const [targetDuration, setTargetDuration] = useState<number | undefined>(undefined);
    const [pendingParsed, setPendingParsed] = useState<FilmEpisode[] | null>(null);
    const [episodeHistory, setEpisodeHistory] = useState<FilmEpisode[][]>([]);

    const commitParsed = (parsed: FilmEpisode[], mode: "replace" | "append") => {
        setEpisodeHistory((prev) => [...prev, episodes].slice(-3));
        let next = parsed;
        if (mode === "append") {
            next = structuredClone(episodes);
            mergeFilmEpisodes(next, parsed);
        }
        const bound = bindFilmCast(next, project.characters || [], project.locations || []);
        onUpdate({ episodes: bound.episodes });
        setSelectedShotId(flattenFilmShots(bound.episodes)[0]?.id ?? "");
        setPendingParsed(null);
        const parts = [`${mode === "append" ? "已追加" : "已覆盖"} ${flattenFilmShots(parsed).length} 个分镜`];
        if (bound.boundCharacters) parts.push(`绑定 ${bound.boundCharacters} 个镜头角色`);
        if (bound.boundLocations) parts.push(`绑定 ${bound.boundLocations} 个场景`);
        message.success(parts.join("，"));
    };

    const { parsing, progress, parseWithAi } = useFilmAiParse((parsed) => {
        if (flattenFilmShots(episodes).length > 0) {
            setPendingParsed(parsed);
            return;
        }
        commitParsed(parsed, "replace");
    });

    const autoBind = () => {
        const result = bindFilmCast(episodes, project.characters || [], project.locations || []);
        if (!result.boundCharacters && !result.boundLocations) {
            message.info("没有匹配到角色或场景名称，先补全资产名称再试");
            return;
        }
        onUpdate({ episodes: result.episodes });
        message.success(`已绑定 ${result.boundCharacters} 个镜头角色、${result.boundLocations} 个场景`);
    };

    const undoParse = () => {
        const snapshot = episodeHistory[episodeHistory.length - 1];
        if (!snapshot) return;
        modal.confirm({
            title: "撤销上次解析？",
            content: "会恢复解析前的分镜，解析后手动修改的内容会丢失。",
            okText: "撤销",
            cancelText: "取消",
            onOk: () => {
                onUpdate({ episodes: snapshot });
                setEpisodeHistory((prev) => prev.slice(0, -1));
                setSelectedShotId(flattenFilmShots(snapshot)[0]?.id ?? "");
            },
        });
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
                        placeholder={"粘贴完整剧本，或已经排好的分镜表格：\n| 镜号 | 景别 | 运镜 | 画面内容 | 声音/台词 | 时长 |\n| 01 | 大远景 | 缓慢横移 | 夜色下的东京湾… | 海浪声低沉 | 5s |"}
                        onChange={(event) => onUpdate({ scriptText: event.target.value })}
                    />
                    <p className="mt-3 text-[11px] leading-5 text-muted-foreground/70">粘贴剧本或分镜表格后点「AI 解析」，会按 镜号 / 景别 / 运镜 / 画面内容 / 声音台词 / 时长 拆成中文分镜表；长剧本会自动分块解析。</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="grid gap-1">
                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">目标时长（秒）</span>
                            <InputNumber className="w-full" min={5} max={1200} placeholder="可选" value={targetDuration} onChange={(value) => setTargetDuration(typeof value === "number" ? value : undefined)} />
                        </label>
                        <label className="grid gap-1">
                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">节奏</span>
                            <Select
                                size="small"
                                value={pacing}
                                options={[{ value: "fast", label: "快剪" }, { value: "normal", label: "常规" }, { value: "slow", label: "慢节奏" }]}
                                onChange={(value: "fast" | "normal" | "slow") => setPacing(value)}
                            />
                        </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                            type="primary"
                            size="small"
                            loading={parsing}
                            icon={<Sparkles className="size-3.5" />}
                            onClick={() => void parseWithAi(project.scriptText, { pacing, targetDuration })}
                        >
                            {parsing ? `AI 解析中 ${progress?.done ?? 0}/${progress?.total ?? 1}` : "AI 解析"}
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
                    <div className="flex items-center gap-1">
                        {batchProgress ? (
                            <>
                                <span className="font-mono text-[10px] text-acid tabular-nums">批量生成 {batchProgress.done}/{batchProgress.total}</span>
                                <Button type="text" size="small" danger onClick={onStopBatch}>
                                    停止
                                </Button>
                            </>
                        ) : null}
                        {episodeHistory.length ? (
                            <Button type="text" size="small" icon={<Undo2 className="size-3.5" />} onClick={undoParse}>
                                撤销解析
                            </Button>
                        ) : null}
                        <Button type="text" size="small" icon={<Link2 className="size-3.5" />} onClick={autoBind}>
                            自动绑定
                        </Button>
                        <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => onUpdate({ episodes: addFilmEpisode(episodes) })}>
                            添加一集
                        </Button>
                    </div>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                    {episodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                            <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                                <Clapperboard className="size-5" />
                            </div>
                            <p className="mt-4 text-sm text-foreground">还没有剧集</p>
                            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">粘贴剧本后点「AI 解析」，或手动添加一集。</p>
                        </div>
                    ) : null}
                    {episodes.map((episode, episodeIndex) => (
                        <div key={episode.id} className="border-b border-border/60 last:border-0">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">{String(episodeIndex + 1).padStart(2, "0")}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{episode.title}</span>
                                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{episode.scenes.length} 场</span>
                                <Button
                                    type="text"
                                    size="small"
                                    aria-label="AI 场记分析"
                                    title="AI 场记分析（生成场记交接单）"
                                    loading={analyzingEpisodeId === episode.id}
                                    disabled={Boolean(analyzingEpisodeId)}
                                    icon={<ClipboardList className="size-3.5" />}
                                    onClick={() => void analyzeContinuity(episode)}
                                />
                                <Button
                                    type="text"
                                    size="small"
                                    aria-label="AI 场记校验"
                                    title="AI 场记校验（逐张检查本集分镜图）"
                                    loading={Boolean(checkingBatchProgress)}
                                    disabled={Boolean(analyzingEpisodeId) || Boolean(checkingBatchProgress)}
                                    icon={<ShieldCheck className="size-3.5" />}
                                    onClick={() => checkEpisodeContinuity(episode)}
                                />
                                {checkingBatchProgress ? <span className="font-mono text-[9px] text-acid tabular-nums">{checkingBatchProgress.done}/{checkingBatchProgress.total}</span> : null}
                                <Button type="text" size="small" aria-label="添加场景" title="添加场景" icon={<Plus className="size-3.5" />} onClick={() => onUpdate({ episodes: addFilmScene(episodes, episode.id) })} />
                            </div>
                            {episode.scenes.map((scene, sceneIndex) => (
                                <div key={scene.id} className="border-t border-border/40">
                                    <div className="flex items-center gap-2 bg-background/25 px-3 py-1.5 pl-6">
                                        <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">{episodeIndex + 1}-{sceneIndex + 1}</span>
                                        <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">{scene.name}</span>
                                        <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">{scene.shots.length} 镜</span>
                                        <Button
                                            type="text"
                                            size="small"
                                            aria-label="生成本场分镜图"
                                            title="生成本场分镜图（首镜锚定）"
                                            disabled={Boolean(batchProgress)}
                                            icon={<Sparkles className="size-3.5" />}
                                            onClick={() => generateSceneImages(scene.shots)}
                                        />
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
                                            <span className="w-12 shrink-0 font-mono text-[9px] tracking-wide text-muted-foreground/70">{shot.shotType ? filmShotTypeLabel(shot.shotType) : "—"}</span>
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
                        onGenerate={() => onGenerateImage(selectedShot)}
                        generating={generatingShotId === selectedShot.id}
                        onGenerateVideo={() => onGenerateVideo(selectedShot)}
                        generatingVideo={generatingVideoShotId === selectedShot.id}
                        videoProgress={videoProgress}
                        characters={project.characters || []}
                        locations={project.locations || []}
                        aspect={project.aspect}
                        styleText={resolveFilmStyleText(project)}
                        onMove={moveSelectedShot}
                        canMoveUp={Boolean(selectedPosition && selectedPosition.shotIndex > 0)}
                        canMoveDown={Boolean(selectedPosition && selectedPosition.shotIndex < selectedPosition.sceneShotCount - 1)}
                        onMoveToScene={moveSelectedShotToScene}
                        sceneTargets={sceneTargets}
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

            <Modal
                title="已有分镜，如何处理？"
                open={Boolean(pendingParsed)}
                onCancel={() => setPendingParsed(null)}
                footer={[
                    <Button key="cancel" onClick={() => setPendingParsed(null)}>取消</Button>,
                    <Button key="append" onClick={() => pendingParsed && commitParsed(pendingParsed, "append")}>追加在后面</Button>,
                    <Button key="replace" type="primary" danger onClick={() => pendingParsed && commitParsed(pendingParsed, "replace")}>覆盖现有</Button>,
                ]}
            >
                <p className="text-xs leading-6 text-muted-foreground">
                    当前已有 {shots.length} 个分镜，本次解析出 {pendingParsed ? flattenFilmShots(pendingParsed).length : 0} 个。覆盖会替换现有分镜，追加会按集/场合并到现有分镜后面。
                </p>
            </Modal>
        </div>
    );
}

function StatusDot({ status }: { status: FilmShot["status"] }) {
    const tone = status === "video_ready" ? "bg-acid" : status === "image_ready" ? "bg-acid/60" : status === "failed" ? "bg-hot" : "bg-border";
    return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone)} />;
}
