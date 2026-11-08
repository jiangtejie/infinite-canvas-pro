"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, InputNumber, Modal, Select } from "antd";
import { Check, Clapperboard, GitBranch, ImageIcon, LayoutGrid, Link2, List, Maximize2, Pencil, ShieldAlert, Table2, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { FilmProject, FilmShot } from "@/lib/film/types";
import { countFilmScenes, countReadyShots, flattenFilmShots } from "../utils/parse-script";
import { filmSceneOptions, filmShotPosition, moveFilmShot, moveFilmShotToScene, removeFilmShot, updateFilmShot } from "../utils/film-edits";
import { filmAspectCssRatio, filmAspectLabel } from "@/lib/film/film-aspects";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { checkFilmBindingIssues } from "../utils/film-binding-check";
import { FILM_SHOT_TYPE_OPTIONS, filmShotTypeLabel } from "../utils/film-shot-types";
import { deriveFilmShotStatus } from "../utils/film-status";
import { estimateFilmVideoMinutes } from "../utils/film-video-limits";
import { countFilmShotConnections, pruneFilmEdges } from "../utils/film-shot-groups";
import { FilmShotDetail } from "./film-shot-detail";
import { FilmShotStatusChip } from "./film-shot-status-chip";
import { FilmBranchPanel } from "./film-branch-panel";
import { FilmPrevisDrawer } from "./film-previs-drawer";
import { collectFilmBranches } from "../utils/film-branch";
import { FilmShotGroupPanel } from "./film-shot-group-panel";
import { FilmStoryboardBoard } from "./film-storyboard-board";
import { FilmShotThumbnail } from "./film-shot-thumbnail";
import { checkFilmStyle } from "../utils/film-style-check";
import { appendDirectorStyleToPrompt } from "@/lib/film/director-styles";

type ViewMode = "list" | "groups" | "table" | "board";

type ShotGroup = { id: string; episodeTitle: string; sceneName: string; startIndex: number; shots: FilmShot[] };

type FilmStoryboardStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGoScript: () => void;
    onGenerateImage: (shot: FilmShot) => void;
    generatingShotId: string;
    onGenerateImageBatch: (shots: FilmShot[]) => void;
    onStopImageBatch: () => void;
    batchProgress: { done: number; total: number } | null;
    onGenerateVideo: (shot: FilmShot) => void;
    onStopVideo: () => void;
    generatingVideoShotId: string;
    videoProgress: number;
    onGenerateVideoBatch: (shots: FilmShot[]) => void;
    onStopVideoBatch: () => void;
    videoBatchProgress: { done: number; total: number } | null;
};

export function FilmStoryboardStage({ project, onUpdate, onGoScript, onGenerateImage, generatingShotId, onGenerateImageBatch, onStopImageBatch, batchProgress, onGenerateVideo, onStopVideo, generatingVideoShotId, videoProgress, onGenerateVideoBatch, onStopVideoBatch, videoBatchProgress }: FilmStoryboardStageProps) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const shots = useMemo(() => flattenFilmShots(project.episodes), [project.episodes]);
    const readyCount = countReadyShots(project.episodes);
    const [view, setView] = useState<ViewMode>("list");
    const [groupSize, setGroupSize] = useState<4 | 9>(4);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedShotId, setSelectedShotId] = useState("");
    const [batchEditOpen, setBatchEditOpen] = useState(false);
    const [continuityOpen, setBindingOpen] = useState(false);
    const [previsOpen, setPrevisOpen] = useState(false);
    const [branchOpen, setBranchOpen] = useState(false);
    const styleReport = useMemo(() => checkFilmStyle(project), [project]);
    const branchEdges = useMemo(() => collectFilmBranches(project), [project]);
    const bindingIssues = useMemo(() => checkFilmBindingIssues(project.episodes, project.characters || [], project.locations || []), [project.episodes, project.characters, project.locations]);
    const connectionCounts = useMemo(() => countFilmShotConnections(project.shotConnections), [project.shotConnections]);
    const [batchDuration, setBatchDuration] = useState<number | undefined>(undefined);
    const [batchShotType, setBatchShotType] = useState("");

    const groups = useMemo(() => {
        const result: ShotGroup[] = [];
        project.episodes.forEach((episode) => episode.scenes.forEach((scene) => {
            for (let index = 0; index < scene.shots.length; index += groupSize) {
                result.push({
                    id: `${scene.id}-${index}`,
                    episodeTitle: episode.title,
                    sceneName: scene.name,
                    startIndex: index,
                    shots: scene.shots.slice(index, index + groupSize),
                });
            }
        }));
        return result;
    }, [project.episodes, groupSize]);

    const confirmGroupVideo = async (targets: FilmShot[]) => {
        const confirmed = await confirm({
            title: `生成本组 ${targets.length} 个分镜视频？`,
            description: `将生成 ${targets.length} 条视频，预计耗时约 ${estimateFilmVideoMinutes(targets.length)} 分钟（按每条 1.5 分钟估算）；已有分镜图会自动作为首帧。生成过程中可随时停止。`,
            confirmText: "开始生成",
        });
        if (!confirmed) return;
        onGenerateVideoBatch(targets);
    };

    const toggleSelect = (shotId: string) => {
        setSelectedIds((prev) => prev.includes(shotId) ? prev.filter((id) => id !== shotId) : [...prev, shotId]);
    };
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? null;
    const sceneTargets = useMemo(() => filmSceneOptions(project.episodes), [project.episodes]);
    const selectedPosition = selectedShot ? filmShotPosition(project.episodes, selectedShot.id) : null;

    const moveSelectedShot = (direction: "up" | "down") => {
        if (!selectedShot) return;
        onUpdate({ episodes: moveFilmShot(project.episodes, selectedShot.id, direction === "up" ? -1 : 1) });
    };

    const moveSelectedShotToScene = (sceneId: string) => {
        if (!selectedShot || selectedPosition?.sceneId === sceneId) return;
        onUpdate({ episodes: moveFilmShotToScene(project.episodes, selectedShot.id, sceneId) });
    };

    const openBatchEdit = () => {
        setBatchDuration(undefined);
        setBatchShotType("");
        setBatchEditOpen(true);
    };

    const applyBatchEdit = () => {
        if (!selectedIds.length) return;
        const patch: Partial<FilmShot> = {};
        if (typeof batchDuration === "number") patch.duration = batchDuration;
        if (batchShotType) patch.shotType = batchShotType;
        if (!Object.keys(patch).length) {
            message.warning("没有选择要修改的字段");
            return;
        }
        let episodes = project.episodes;
        selectedIds.forEach((id) => {
            episodes = updateFilmShot(episodes, id, patch);
        });
        onUpdate({ episodes });
        setBatchEditOpen(false);
        setSelectedIds([]);
        message.success(`已更新 ${selectedIds.length} 个镜头`);
    };

    const deleteSelected = async () => {
        if (!selectedIds.length) return;
        const targets = [...selectedIds];
        const confirmed = await confirm({
            title: `删除选中的 ${targets.length} 个镜头？`,
            description: "删除后已生成的分镜图和视频引用也会一起移除。",
            confirmText: "删除",
            tone: "danger",
        });
        if (!confirmed) return;
        let episodes = project.episodes;
        targets.forEach((id) => {
            episodes = removeFilmShot(episodes, id);
        });
        onUpdate({ episodes });
        setSelectedIds([]);
    };

    useEffect(() => {
        if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) return;
        setSelectedShotId(shots[0]?.id ?? "");
    }, [selectedShotId, shots]);

    // 镜头被删除后自动清理失效的组内引用与连线
    const shotGroups = useMemo(() => project.shotGroups || [], [project.shotGroups]);
    const shotConnections = useMemo(() => project.shotConnections || [], [project.shotConnections]);
    useEffect(() => {
        if (!shotGroups.length && !shotConnections.length) return;
        const next = pruneFilmEdges(shots, shotGroups, shotConnections);
        if (next.groups === shotGroups && next.connections === shotConnections) return;
        onUpdate({ shotGroups: next.groups, shotConnections: next.connections });
    }, [onUpdate, shotConnections, shotGroups, shots]);

    return (
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
            <div className="punk-panel relative flex shrink-0 flex-wrap items-center gap-2 overflow-hidden px-4 py-2.5 [@media(pointer:coarse)]:[&_.ant-btn]:min-h-9">
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                <span className="eyebrow">导演台</span>
                <span className="chip chip-acid">{shots.length} 个分镜</span>
                <span className="chip">{countFilmScenes(project.episodes)} 场</span>
                <span className="chip">{readyCount}/{shots.length} 已完成</span>
                <span className="chip">{filmAspectLabel(project.aspect)}</span>
                {styleReport.style ? (
                    <span className="chip border-acid/30 text-acid" title={"风格规则 " + styleReport.passed + "/" + styleReport.total + " 通过"}>
                        {styleReport.style.name} · {styleReport.score}%
                    </span>
                ) : (
                    <span className="chip text-muted-foreground/60">未选导演风格</span>
                )}
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
                                onClick={async () => {
                                    const targets = shots.filter((shot) => selectedIds.includes(shot.id));
                                    const confirmed = await confirm({
                                        title: `批量生成 ${targets.length} 个分镜视频？`,
                                        description: `将生成 ${targets.length} 条视频，预计耗时约 ${estimateFilmVideoMinutes(targets.length)} 分钟（按每条 1.5 分钟估算）；已有分镜图会自动作为首帧。生成过程中可随时停止。`,
                                        confirmText: "开始生成",
                                    });
                                    if (!confirmed) return;
                                    onGenerateVideoBatch(targets);
                                }}
                            >
                                {videoBatchProgress ? `批量视频 ${videoBatchProgress.done}/${videoBatchProgress.total}` : "批量生成视频"}
                            </Button>
                            <Button size="small" icon={<Pencil className="size-3.5" />} onClick={openBatchEdit}>批量编辑</Button>
                            <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={deleteSelected}>删除</Button>
                            <Button size="small" onClick={() => setSelectedIds([])}>清空</Button>
                        </>
                    ) : null}
                    {batchProgress ? (
                        <Button size="small" danger onClick={onStopImageBatch}>
                            停止批量出图 {batchProgress.done}/{batchProgress.total}
                        </Button>
                    ) : null}
                    {videoBatchProgress ? (
                        <Button size="small" danger onClick={onStopVideoBatch}>
                            停止批量视频 {videoBatchProgress.done}/{videoBatchProgress.total}
                        </Button>
                    ) : null}
                    {view === "groups" ? (
                        <Select
                            size="small"
                            value={groupSize}
                            className="w-28"
                            options={[{ value: 4, label: "4 镜一组" }, { value: 9, label: "9 镜一组" }]}
                            onChange={(value: 4 | 9) => setGroupSize(value)}
                        />
                    ) : null}
                    <Button size="small" icon={<ShieldAlert className="size-3.5" />} onClick={() => setBindingOpen(true)}>
                        绑定检查{bindingIssues.length ? " (" + bindingIssues.length + ")" : ""}
                    </Button>
                    {branchEdges.length ? (
                        <Button size="small" icon={<GitBranch className="size-3.5" />} onClick={() => setBranchOpen(true)}>
                            分支 {branchEdges.length}
                        </Button>
                    ) : null}
                    <Button size="small" type="primary" ghost icon={<Clapperboard className="size-3.5" />} onClick={() => setPrevisOpen(true)}>
                        预演
                    </Button>
                    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                        <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="size-3.5" />}>列表</ViewButton>
                        <ViewButton active={view === "groups"} onClick={() => setView("groups")} icon={<LayoutGrid className="size-3.5" />}>分组</ViewButton>
                        <ViewButton active={view === "table"} onClick={() => setView("table")} icon={<Table2 className="size-3.5" />}>表格</ViewButton>
                        <ViewButton active={view === "board"} onClick={() => setView("board")} icon={<Maximize2 className="size-3.5" />}>画布</ViewButton>
                    </div>
                </div>
            </div>

            <FilmShotGroupPanel project={project} selectedIds={selectedIds} onUpdate={onUpdate} onSelectShots={setSelectedIds} />

            <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
                {view === "board" ? (
                    <FilmStoryboardBoard project={project} selectedShotId={selectedShotId} onSelect={setSelectedShotId} />
                ) : view === "table" ? (
                    <section className="punk-panel flex max-h-[70dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <span className="eyebrow">分镜表</span>
                            <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">点击行编辑</span>
                        </div>
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
                            {shots.length === 0 ? (
                                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                                    <div className="film-float grid size-12 place-items-center rounded-[10px] border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70">
                                        <Clapperboard className="size-5" />
                                    </div>
                                    <p className="mt-4 text-sm text-foreground">还没有分镜</p>
                                    <p className="mt-1.5 text-xs leading-6 text-muted-foreground">先去剧本页用 AI 解析剧本，表格会自动生成。</p>
                                    <button type="button" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition hover:border-acid/60" onClick={onGoScript}>
                                        去剧本页
                                    </button>
                                </div>
                            ) : (
                                <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                                    <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                                        <tr className="border-b border-border/70 text-[10px] tracking-[0.12em] text-muted-foreground/70 uppercase">
                                            <th className="w-20 px-3 py-2 font-medium">镜号</th>
                                            <th className="w-20 px-3 py-2 font-medium">景别</th>
                                            <th className="w-24 px-3 py-2 font-medium">运镜</th>
                                            <th className="min-w-[220px] px-3 py-2 font-medium">画面内容</th>
                                            <th className="w-52 px-3 py-2 font-medium">声音 / 台词</th>
                                            <th className="w-16 px-3 py-2 font-medium">时长</th>
                                            <th className="w-20 px-3 py-2 font-medium">状态</th>
                                        </tr>
                                    </thead>
                                    {project.episodes.flatMap((episode) => episode.scenes.map((scene) => (
                                        <tbody key={scene.id}>
                                            <tr className="border-b border-border/50 bg-background/30">
                                                <td colSpan={7} className="px-3 py-1.5">
                                                    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{episode.title}</span>
                                                    <span className="mx-2 text-muted-foreground/30">/</span>
                                                    <span className="text-[11px] font-medium text-foreground/80">{scene.name}</span>
                                                    <span className="ml-2 font-mono text-[10px] text-muted-foreground/50">{scene.shots.length} 镜</span>
                                                </td>
                                            </tr>
                                            {scene.shots.map((shot) => (
                                                <tr
                                                    key={shot.id}
                                                    onClick={() => setSelectedShotId(shot.id)}
                                                    className={cn("cursor-pointer border-b border-border/30 transition-colors", shot.id === selectedShotId ? "bg-acid/[0.06]" : "hover:bg-foreground/[0.03]")}
                                                >
                                                    <td className={cn("px-3 py-2 font-mono tabular-nums", shot.id === selectedShotId ? "text-acid" : "text-muted-foreground/70")}>{shot.shotNo}</td>
                                                    <td className="px-3 py-2 text-foreground/80">{filmShotTypeLabel(shot.shotType)}</td>
                                                    <td className="px-3 py-2 text-muted-foreground/80">{shot.cameraMovement || "—"}</td>
                                                    <td className="max-w-[360px] px-3 py-2 text-foreground/80"><span className="line-clamp-2 leading-5">{shot.description || <span className="text-muted-foreground/50">未填写画面描述</span>}</span></td>
                                                    <td className="max-w-[220px] px-3 py-2 text-muted-foreground/80"><span className="line-clamp-2 leading-5">{shot.dialogue || "—"}</span></td>
                                                    <td className="px-3 py-2 font-mono text-muted-foreground/80 tabular-nums">{shot.duration}s</td>
                                                    <td className="px-3 py-2"><FilmShotStatusChip status={deriveFilmShotStatus(shot)} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    )))}
                                </table>
                            )}
                        </div>
                    </section>
                ) : view === "groups" ? (
                    <section className="punk-panel flex max-h-[70dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <span className="eyebrow">分组板</span>
                            <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">每 {groupSize} 镜一组</span>
                        </div>
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                            {shots.length === 0 ? (
                                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                                    <div className="film-float grid size-12 place-items-center rounded-[10px] border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70">
                                        <Clapperboard className="size-5" />
                                    </div>
                                    <p className="mt-4 text-sm text-foreground">还没有分镜</p>
                                    <p className="mt-1.5 text-xs leading-6 text-muted-foreground">先去剧本页粘贴剧本并解析，分组会自动生成。</p>
                                    <button type="button" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition hover:border-acid/60" onClick={onGoScript}>
                                        去剧本页
                                    </button>
                                </div>
                            ) : null}
                            <div className="grid gap-3 xl:grid-cols-2">
                                {groups.map((group) => (
                                    <ShotGroupCard
                                        key={group.id}
                                        group={group}
                                        groupSize={groupSize}
                                        aspect={project.aspect}
                                        selectedShotId={selectedShotId}
                                        onSelectShot={setSelectedShotId}
                                        onGenerateImage={onGenerateImageBatch}
                                        onGenerateVideo={confirmGroupVideo}
                                        imageLoading={Boolean(batchProgress)}
                                        videoLoading={Boolean(videoBatchProgress)}
                                    />
                                ))}
                            </div>
                        </div>
                    </section>
                ) : (
                    <section className="punk-panel flex max-h-[70dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                            <span className="eyebrow">分镜板</span>
                            <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">点击镜头卡编辑</span>
                        </div>
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                            {shots.length === 0 ? (
                                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                                    <div className="film-float grid size-12 place-items-center rounded-[10px] border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70">
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
                                                        draggable
                                                        onDragStart={(event) => {
                                                            event.dataTransfer.setData("application/x-film-shot-id", shot.id);
                                                            event.dataTransfer.setData("text/plain", shot.id);
                                                            event.dataTransfer.effectAllowed = "copy";
                                                        }}
                                                        onClick={() => setSelectedShotId(shot.id)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                setSelectedShotId(shot.id);
                                                            }
                                                        }}
                                                        className={cn(
                                                            "group flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5",
                                                            shot.id === selectedShotId ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-acid/40",
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
                                                            <FilmShotStatusChip status={deriveFilmShotStatus(shot)} />
                                                        </span>
                                                        <span className="relative block w-full overflow-hidden rounded-md border border-border/50 bg-background/30" style={{ aspectRatio: filmAspectCssRatio(project.aspect) }}>
                                                            <span aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-background/30 via-transparent to-transparent" />
                                                            {shot.imageUrl || shot.storageKey ? (
                                                                <FilmShotThumbnail shot={shot} className="h-full w-full" />
                                                            ) : (
                                                                <span className="grid h-full w-full place-items-center bg-background/40 text-muted-foreground/25">
                                                                    <ImageIcon className="size-4" aria-hidden />
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className={cn("line-clamp-3 text-xs leading-5", shot.description ? "text-foreground/80" : "text-muted-foreground/50")}>
                                                            {shot.description || "未填写画面描述"}
                                                        </span>
                                                        <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/60">
                                                            <span>{filmShotTypeLabel(shot.shotType)}</span>
                                                            <span aria-hidden>·</span>
                                                            <span>{shot.duration}s</span>
                                                            {connectionCounts.get(shot.id) ? <span className="ml-auto inline-flex items-center gap-0.5 text-acid/80" title={`参与 ${connectionCounts.get(shot.id)} 条镜头连线`}><Link2 className="size-3" aria-hidden />{connectionCounts.get(shot.id)}</span> : null}
                                                            {shot.prompt ? <ImageIcon className={cn("size-3 text-acid/70", connectionCounts.get(shot.id) ? "" : "ml-auto")} aria-label="已填写提示词" /> : null}
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

                <section className="punk-panel flex max-h-[70dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
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
                            onStopVideo={onStopVideo}
                            generatingVideo={generatingVideoShotId === selectedShot.id}
                            videoProgress={videoProgress}
                            characters={project.characters || []}
                            locations={project.locations || []}
                            aspect={project.aspect}
                            styleText={resolveFilmStyleText(project)}
                            directorStyle={styleReport.style}
                            branchTargets={shots.filter((shot) => shot.id !== selectedShot.id).map((shot) => ({ id: shot.id, label: shot.shotNo + " · " + (shot.description || "未填写画面") }))}
                            variables={project.interactiveVariables || []}
                            onApplyStylePrompt={() => {
                                if (!styleReport.style) return;
                                onUpdate({ episodes: updateFilmShot(project.episodes, selectedShot.id, { prompt: appendDirectorStyleToPrompt(selectedShot.prompt, styleReport.style) }) });
                                message.success("已把导演风格提示补进镜头 prompt");
                            }}
                            onMove={moveSelectedShot}
                            canMoveUp={Boolean(selectedPosition && selectedPosition.shotIndex > 0)}
                            canMoveDown={Boolean(selectedPosition && selectedPosition.shotIndex < selectedPosition.sceneShotCount - 1)}
                            onMoveToScene={moveSelectedShotToScene}
                            sceneTargets={sceneTargets}
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

            <Modal title={`绑定检查（${bindingIssues.length}）`} open={continuityOpen} onCancel={() => setBindingOpen(false)} footer={null} width={640}>
                {bindingIssues.length === 0 ? (
                    <p className="py-6 text-center text-xs leading-6 text-muted-foreground">没有发现明显的连戏问题。</p>
                ) : (
                    <div className="thin-scrollbar grid max-h-[60dvh] gap-2 overflow-y-auto">
                        {bindingIssues.map((issue) => (
                            <button
                                key={issue.id}
                                type="button"
                                onClick={() => {
                                    if (issue.shotId) setSelectedShotId(issue.shotId);
                                    setBindingOpen(false);
                                }}
                                className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors", issue.level === "warning" ? "border-hot/40 bg-hot/[0.04]" : "border-border/60 bg-card/40", issue.shotId ? "hover:border-acid/50" : "")}
                            >
                                <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", issue.level === "warning" ? "bg-hot" : "bg-muted-foreground/60")} aria-hidden />
                                <span className="text-xs leading-5 text-foreground/80">{issue.message}</span>
                            </button>
                        ))}
                    </div>
                )}
            </Modal>

            <Modal
                title={`批量编辑 ${selectedIds.length} 个镜头`}
                open={batchEditOpen}
                onCancel={() => setBatchEditOpen(false)}
                okText="应用"
                cancelText="取消"
                onOk={applyBatchEdit}
            >
                <div className="grid gap-3 py-2">
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">时长（秒）</span>
                        <InputNumber className="w-full" min={1} max={120} placeholder="留空不改" value={batchDuration} onChange={(value) => setBatchDuration(typeof value === "number" ? value : undefined)} />
                    </label>
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">景别</span>
                        <Select allowClear placeholder="留空不改" value={batchShotType || undefined} options={FILM_SHOT_TYPE_OPTIONS} onChange={(value?: string) => setBatchShotType(value ?? "")} />
                    </label>
                    <p className="text-[11px] leading-5 text-muted-foreground/70">镜头状态由「是否有分镜图 / 视频」自动派生，不再手动设置。</p>
                </div>
            </Modal>

            <FilmBranchPanel
                open={branchOpen}
                project={project}
                onClose={() => setBranchOpen(false)}
                onJumpToShot={(shotId) => {
                    setSelectedShotId(shotId);
                    setView("list");
                }}
                onVariablesChange={(variables) => onUpdate({ interactiveVariables: variables })}
            />

            <FilmPrevisDrawer
                open={previsOpen}
                project={project}
                onClose={() => setPrevisOpen(false)}
                onJumpToShot={(shotId) => {
                    setSelectedShotId(shotId);
                    setView("list");
                }}
            />
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

function ShotGroupCard({ group, groupSize, aspect, selectedShotId, onSelectShot, onGenerateImage, onGenerateVideo, imageLoading, videoLoading }: {
    group: ShotGroup;
    groupSize: 4 | 9;
    aspect: string;
    selectedShotId: string;
    onSelectShot: (shotId: string) => void;
    onGenerateImage: (shots: FilmShot[]) => void;
    onGenerateVideo: (shots: FilmShot[]) => void;
    imageLoading: boolean;
    videoLoading: boolean;
}) {
    const totalDuration = group.shots.reduce((sum, shot) => sum + shot.duration, 0);
    return (
        <article className="punk-card rounded-xl border border-border/70 bg-card/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="truncate text-xs font-medium text-foreground/85">{group.sceneName}</span>
                <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">第 {group.startIndex + 1}-{group.startIndex + group.shots.length} 镜</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/60 tabular-nums">{group.shots.length} 镜 · {Math.round(totalDuration)}s</span>
            </div>
            <div className={cn("grid gap-1", groupSize === 9 ? "grid-cols-3" : "grid-cols-2")}>
                {group.shots.map((shot) => (
                    <button
                        key={shot.id}
                        type="button"
                        onClick={() => onSelectShot(shot.id)}
                        className={cn(
                            "relative overflow-hidden rounded-md border text-left transition-colors",
                            shot.id === selectedShotId ? "border-acid/60" : "border-border/60 hover:border-border",
                        )}
                    >
                        <span className="block w-full overflow-hidden" style={{ aspectRatio: filmAspectCssRatio(aspect) }}>
                            {shot.imageUrl || shot.storageKey ? (
                                <FilmShotThumbnail shot={shot} className="h-full w-full" />
                            ) : (
                                <span className="grid h-full w-full place-items-center bg-background/40 text-muted-foreground/25">
                                    <ImageIcon className="size-4" aria-hidden />
                                </span>
                            )}
                        </span>
                        <span className="absolute left-1 top-1 rounded bg-background/80 px-1 font-mono text-[8px] text-foreground/80">{shot.shotNo}</span>
                        {deriveFilmShotStatus(shot) === "video_ready" ? <span className="absolute bottom-1 right-1 rounded bg-acid/90 px-1 font-mono text-[8px] text-background">视频</span> : null}
                    </button>
                ))}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
                <Button size="small" icon={<ImageIcon className="size-3.5" />} loading={imageLoading} onClick={() => onGenerateImage(group.shots)}>本组出图</Button>
                <Button size="small" icon={<Clapperboard className="size-3.5" />} loading={videoLoading} onClick={() => onGenerateVideo(group.shots)}>本组视频</Button>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">{group.episodeTitle}</span>
            </div>
        </article>
    );
}
