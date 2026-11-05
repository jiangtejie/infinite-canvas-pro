"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, Input, InputNumber, Modal, Select } from "antd";
import { Clapperboard, ClipboardList, FileUp, Link2, Plus, ShieldCheck, Sparkles, Trash2, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmEpisode, FilmProject, FilmShot } from "../types";
import { addFilmEpisode, addFilmScene, addFilmShot, filmSceneOptions, filmShotPosition, moveFilmShot, moveFilmShotToScene, removeFilmScene, removeFilmShot, updateFilmShot } from "../utils/film-edits";
import { useFilmAiParse } from "../hooks/use-film-ai-parse";
import { useFilmContinuity } from "../hooks/use-film-continuity";
import { useFilmScriptAnalysis } from "../hooks/use-film-script-analysis";
import type { FilmImageBatchOptions, FilmImageBatchProgress } from "../hooks/use-film-shot-image";
import { applyFilmContinuity, applyFilmContinuityValidation } from "../utils/film-continuity-sheet";
import { useFilmContinuityCheck } from "../hooks/use-film-continuity-check";
import { bindFilmCast } from "../utils/film-cast-bind";
import { mergeFilmEpisodes } from "../utils/film-ai-parse";
import { filmShotTypeLabel } from "../utils/film-shot-types";
import { resolveFilmStyleText } from "../utils/film-styles";
import { countFilmScenes, flattenFilmShots } from "../utils/parse-script";
import { filmScriptDocumentToEpisodes, parseFilmScriptDocument, readFilmScriptFile, type FilmScriptDocument } from "../utils/film-script-import";
import { buildScriptAnalysisAssets, normalizeEntityKey, validateFilmScriptAnalysis, type FilmScriptAnalysisIssue } from "../utils/film-script-analysis";
import type { FilmScriptAnalysis, FilmScriptRelationshipAnalysis } from "../types";
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
    const { analyzing: analyzingScript, progress: analysisProgress, analyzeDocument } = useFilmScriptAnalysis();
    const episodes = project.episodes;
    const shots = useMemo(() => flattenFilmShots(episodes), [episodes]);
    const [selectedShotId, setSelectedShotId] = useState("");
    const [continuityPreviewEpisodeId, setContinuityPreviewEpisodeId] = useState("");
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? null;
    const previewEpisode = episodes.find((episode) => episode.id === continuityPreviewEpisodeId) || null;
    const previewSheets = previewEpisode
        ? flattenFilmShots([previewEpisode]).filter((shot) => Boolean(shot.continuity)).map((shot) => ({ shot, sheet: shot.continuity! }))
        : [];

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
        setContinuityPreviewEpisodeId(episode.id);
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
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState("");
    const [importFormat, setImportFormat] = useState<FilmScriptDocument["format"]>("plain");
    const [importFileName, setImportFileName] = useState("");
    const [importDoc, setImportDoc] = useState<FilmScriptDocument | null>(null);
    const [importError, setImportError] = useState("");
    const [importParsing, setImportParsing] = useState(false);
    const [scriptAnalysis, setScriptAnalysis] = useState<FilmScriptAnalysis | null>(null);
    const [analysisIssues, setAnalysisIssues] = useState<FilmScriptAnalysisIssue[]>([]);
    const [acceptedCharacters, setAcceptedCharacters] = useState<string[]>([]);
    const [acceptedRelationships, setAcceptedRelationships] = useState<string[]>([]);
    const importFileRef = useRef<HTMLInputElement>(null);
    const [pendingParsed, setPendingParsed] = useState<FilmEpisode[] | null>(null);
    const [episodeHistory, setEpisodeHistory] = useState<FilmEpisode[][]>([]);

    const openImport = () => {
        setImportOpen(true);
        setImportText(project.scriptText || "");
        setImportFileName("");
        setImportFormat("plain");
        setImportDoc(null);
        setImportError("");
        setScriptAnalysis(null);
        setAnalysisIssues([]);
        setAcceptedCharacters([]);
        setAcceptedRelationships([]);
    };

    const parseImportDocument = (text: string, format: FilmScriptDocument["format"]) => {
        setImportParsing(true);
        setScriptAnalysis(null);
        setAnalysisIssues([]);
        setAcceptedCharacters([]);
        setAcceptedRelationships([]);
        try {
            const doc = parseFilmScriptDocument(text, format);
            setImportDoc(doc);
            setImportError("");
        } catch (error) {
            setImportDoc(null);
            setImportError(error instanceof Error ? error.message : "剧本解析失败");
        } finally {
            setImportParsing(false);
        }
    };

    const handleImportFile = async (file: File | undefined) => {
        if (!file) return;
        setImportParsing(true);
        try {
            const { text, format } = await readFilmScriptFile(file);
            setImportText(text);
            setImportFormat(format);
            setImportFileName(file.name);
            setScriptAnalysis(null);
            setAnalysisIssues([]);
            setAcceptedCharacters([]);
            setAcceptedRelationships([]);
            const doc = parseFilmScriptDocument(text, format);
            setImportDoc(doc);
            setImportError("");
        } catch (error) {
            setImportDoc(null);
            setImportError(error instanceof Error ? error.message : "文件读取失败");
        } finally {
            setImportParsing(false);
        }
    };

    const applyImportDocument = (mode: "replace" | "append") => {
        if (!importDoc) return;
        commitParsed(filmScriptDocumentToEpisodes(importDoc), mode);
        setImportOpen(false);
    };

    const relationshipSelectionKey = (relationship: FilmScriptRelationshipAnalysis) => `${normalizeEntityKey(relationship.from)}->${normalizeEntityKey(relationship.to)}|${relationship.type}`;

    const selectedScriptAnalysis = useMemo(() => {
        if (!scriptAnalysis) return null;
        const characters = scriptAnalysis.characters.filter((character) => acceptedCharacters.includes(normalizeEntityKey(character.name)));
        const characterKeys = new Set(characters.map((character) => normalizeEntityKey(character.name)));
        const relationships = scriptAnalysis.relationships.filter((relationship) => acceptedRelationships.includes(relationshipSelectionKey(relationship))
            && characterKeys.has(normalizeEntityKey(relationship.from))
            && characterKeys.has(normalizeEntityKey(relationship.to)));
        return { ...scriptAnalysis, characters, relationships };
    }, [scriptAnalysis, acceptedCharacters, acceptedRelationships]);

    const acceptAllAnalysis = () => {
        if (!scriptAnalysis) return;
        setAcceptedCharacters(scriptAnalysis.characters.map((character) => normalizeEntityKey(character.name)));
        setAcceptedRelationships(scriptAnalysis.relationships.map((relationship) => relationshipSelectionKey(relationship)));
    };

    const toggleAcceptedCharacter = (key: string, checked: boolean) => {
        setAcceptedCharacters((current) => checked ? [...current, key] : current.filter((item) => item !== key));
    };

    const toggleAcceptedRelationship = (key: string, checked: boolean) => {
        setAcceptedRelationships((current) => checked ? [...current, key] : current.filter((item) => item !== key));
    };

    const analyzeImportSemantics = async () => {
        if (!importDoc) return;
        const result = await analyzeDocument(importDoc);
        if (!result) return;
        setScriptAnalysis(result.analysis);
        setAnalysisIssues(result.issues);
        setAcceptedCharacters(result.analysis.characters.map((character) => normalizeEntityKey(character.name)));
        setAcceptedRelationships(result.analysis.relationships.map((relationship) => relationshipSelectionKey(relationship)));
    };

    const reuseAnalysisSnapshot = () => {
        if (!project.scriptAnalysis || !importDoc) return;
        if (project.scriptAnalysis.scriptHash !== importDoc.scriptHash) {
            message.warning("剧本内容已变化，旧分析快照不能直接复用");
            return;
        }
        setScriptAnalysis(project.scriptAnalysis);
        setAnalysisIssues(validateFilmScriptAnalysis(project.scriptAnalysis));
        setAcceptedCharacters(project.scriptAnalysis.characters.map((character) => normalizeEntityKey(character.name)));
        setAcceptedRelationships(project.scriptAnalysis.relationships.map((relationship) => relationshipSelectionKey(relationship)));
    };

    const sameHashSnapshot = Boolean(importDoc && project.scriptAnalysis && project.scriptAnalysis.scriptHash === importDoc.scriptHash);

    const applyAnalysisImport = (mode: "replace" | "append") => {
        if (!importDoc) return;
        commitParsed(filmScriptDocumentToEpisodes(importDoc), mode);
        if (selectedScriptAnalysis) {
            const locationNames = [...new Set(importDoc.episodes.flatMap((episode) => episode.scenes.map((scene) => scene.location)).filter(Boolean))];
            const assets = buildScriptAnalysisAssets(project, selectedScriptAnalysis, locationNames);
            onUpdate({ characters: assets.characters, locations: assets.locations, scriptAnalysis: selectedScriptAnalysis });
        }
        setImportOpen(false);
    };

    const importStats = importDoc
        ? {
            episodes: importDoc.episodes.length,
            scenes: importDoc.episodes.reduce((total, episode) => total + episode.scenes.length, 0),
            characters: [...new Set(importDoc.episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.characters)))],
            blocks: importDoc.episodes.reduce((total, episode) => total + episode.scenes.reduce((sum, scene) => sum + scene.blocks.length, 0), 0),
        }
        : null;

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
                        <Button size="small" icon={<FileUp className="size-3.5" />} onClick={openImport}>
                            导入剧本
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
                                {(() => {
                                    const count = episode.scenes.reduce((total, scene) => total + scene.shots.filter((shot) => shot.continuity).length, 0);
                                    return count ? (
                                        <button type="button" className="chip chip-acid" title="查看场记交接单" onClick={() => setContinuityPreviewEpisodeId(episode.id)}>
                                            场记 {count}
                                        </button>
                                    ) : null;
                                })()}
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
                                            {shot.continuity ? <span className="shrink-0 font-mono text-[9px] text-acid/80">场记</span> : null}
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
                title="导入剧本"
                open={importOpen}
                onCancel={() => setImportOpen(false)}
                width={860}
                destroyOnHidden
                footer={
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button onClick={() => setImportOpen(false)}>取消</Button>
                        {!importDoc ? (
                            <Button type="primary" loading={importParsing} onClick={() => parseImportDocument(importText, importFormat)}>解析预览</Button>
                        ) : (
                            <>
                                {analyzingScript ? <span className="self-center text-[11px] text-muted-foreground/70">{analysisProgress ? `语义分析 ${analysisProgress.done}/${analysisProgress.total}` : "正在分析…"}</span> : null}
                                <Button loading={analyzingScript} onClick={() => void analyzeImportSemantics()}>AI 语义解析</Button>
                                {scriptAnalysis ? (
                                    <>
                                        <Button onClick={() => applyImportDocument("append")}>仅导入分镜</Button>
                                        <Button onClick={() => applyAnalysisImport("append")}>追加导入并应用</Button>
                                        <Button type="primary" danger onClick={() => applyAnalysisImport("replace")}>覆盖导入并应用</Button>
                                    </>
                                ) : (
                                    <>
                                        <Button onClick={() => applyImportDocument("append")}>追加导入</Button>
                                        <Button type="primary" danger onClick={() => applyImportDocument("replace")}>覆盖导入</Button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                }
            >
                <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="small" icon={<FileUp className="size-3.5" />} onClick={() => importFileRef.current?.click()}>选择文件</Button>
                        <input ref={importFileRef} hidden type="file" accept=".txt,.md,.markdown,.fountain,.fdx,.docx" onChange={(event) => void handleImportFile(event.target.files?.[0])} />
                        <span className="text-[11px] text-muted-foreground/70">支持 txt / md / docx / fountain / fdx，也可以直接粘贴</span>
                        {importFileName ? <span className="chip">{importFileName}</span> : null}
                    </div>
                    <Input.TextArea autoSize={{ minRows: 8, maxRows: 16 }} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="粘贴剧本，或直接选择文件" />
                    {importError ? <p className="text-[11px] text-hot">{importError}</p> : null}
                    {importDoc && importStats ? (
                        <div className="grid gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="chip">{importStats.episodes} 集</span>
                                <span className="chip">{importStats.scenes} 场</span>
                                <span className="chip">{importStats.blocks} 段内容</span>
                                <span className="chip">{importStats.characters.length} 个对白角色</span>
                                <span className="font-mono text-[9px] text-muted-foreground/60">v{importDoc.parserVersion} · #{importDoc.scriptHash}</span>
                            </div>
                            {importStats.scenes === 1 && importStats.blocks > 6 ? (
                                <p className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">没有识别到场次标题，当前会作为单个场景导入；建议使用「1-1 内景 咖啡馆 日」这类场次行。</p>
                            ) : null}
                            {importStats.characters.length ? <p className="text-[11px] text-muted-foreground/70">对白角色：{importStats.characters.join("、")}</p> : null}
                            {sameHashSnapshot && !scriptAnalysis ? (
                                <div className="flex flex-wrap items-center gap-2 rounded-md border border-acid/25 bg-acid/[0.04] px-2.5 py-2">
                                    <span className="text-[11px] text-acid">已有同版本分析快照（{project.scriptAnalysis?.characters.length} 角色 / {project.scriptAnalysis?.relationships.length} 关系），可以直接复用。</span>
                                    <Button size="small" onClick={reuseAnalysisSnapshot}>复用分析</Button>
                                </div>
                            ) : null}
                            <div className="thin-scrollbar grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-border/60 bg-background/30 p-2">
                                {importDoc.episodes.map((episode, episodeIndex) => (
                                    <div key={`${episode.title}-${episodeIndex}`} className="grid gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="eyebrow">{episode.title}</span>
                                            <span className="font-mono text-[9px] text-muted-foreground/60">{episode.scenes.length} 场</span>
                                        </div>
                                        {episode.scenes.map((scene, sceneIndex) => (
                                            <div key={`${scene.heading}-${sceneIndex}`} className="grid gap-1 rounded border border-border/50 bg-card/40 p-2">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-xs font-medium text-foreground">{scene.heading}</span>
                                                    {scene.interiorExterior ? <span className="chip">{scene.interiorExterior}</span> : null}
                                                    {scene.timeOfDay ? <span className="chip">{scene.timeOfDay}</span> : null}
                                                    {scene.characters.length ? <span className="font-mono text-[9px] text-muted-foreground/60">{scene.characters.join("、")}</span> : null}
                                                </div>
                                                <p className="line-clamp-2 text-[10px] leading-4 text-muted-foreground/70">
                                                    {scene.blocks.slice(0, 4).map((block) => block.type === "dialogue" ? `${block.character}：${block.text}` : block.text).join(" / ") || "（空场）"}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-[11px] leading-5 text-muted-foreground/60">导入后先做规则切分（场次、对白、出场角色），确认预览后再写入项目；此步骤不调用 AI。</p>
                    )}
                    {scriptAnalysis ? (
                        <div className="grid gap-2 rounded-lg border border-acid/25 bg-acid/[0.04] p-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="chip chip-acid">{scriptAnalysis.characters.length} 个角色</span>
                                <span className="chip chip-acid">{scriptAnalysis.relationships.length} 条关系</span>
                                <span className="chip chip-acid">{scriptAnalysis.scenes.reduce((total, scene) => total + scene.beats.length, 0)} 个节拍</span>
                                <span className={cn("chip", analysisIssues.length ? "border-hot/40 text-hot" : "")}>{analysisIssues.length} 条警告</span>
                            </div>
                            {analysisIssues.length ? (
                                <div className="grid gap-1">
                                    {analysisIssues.slice(0, 5).map((issue, index) => <p key={`${issue.message}-${index}`} className="text-[11px] leading-5 text-hot">· {issue.message}</p>)}
                                </div>
                            ) : <p className="text-[11px] text-acid">自动校验通过</p>}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground/70">已接受 {selectedScriptAnalysis?.characters.length ?? 0} 个角色、{selectedScriptAnalysis?.relationships.length ?? 0} 条关系</span>
                                <Button size="small" type="text" onClick={acceptAllAnalysis}>全部接受</Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="grid gap-1">
                                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">角色（取消勾选则不导入）</span>
                                    {scriptAnalysis.characters.slice(0, 12).map((character) => {
                                        const key = normalizeEntityKey(character.name);
                                        return (
                                            <Checkbox key={character.name} checked={acceptedCharacters.includes(key)} onChange={(event) => toggleAcceptedCharacter(key, event.target.checked)}>
                                                <span className="text-[11px] leading-5 text-foreground/80">
                                                    {character.name}{character.role ? `（${character.role}）` : ""}{character.description ? `：${character.description}` : ""}
                                                </span>
                                            </Checkbox>
                                        );
                                    })}
                                </div>
                                <div className="grid gap-1">
                                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">关系（两端角色需保留）</span>
                                    {scriptAnalysis.relationships.slice(0, 12).map((relationship) => {
                                        const key = relationshipSelectionKey(relationship);
                                        return (
                                            <Checkbox key={key} checked={acceptedRelationships.includes(key)} onChange={(event) => toggleAcceptedRelationship(key, event.target.checked)}>
                                                <span className="text-[11px] leading-5 text-foreground/80">
                                                    {relationship.from} → {relationship.to} · {relationship.type} · 第 {relationship.sceneRange.start + 1}-{relationship.sceneRange.end + 1} 场
                                                </span>
                                            </Checkbox>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </Modal>

            <Modal
                title={previewEpisode ? `${previewEpisode.title} · 场记交接单` : "场记交接单"}
                open={Boolean(previewEpisode)}
                onCancel={() => setContinuityPreviewEpisodeId("")}
                footer={null}
                width={760}
            >
                {previewSheets.length ? (
                    <div className="thin-scrollbar grid max-h-[65vh] gap-2 overflow-y-auto pr-1">
                        {previewSheets.map(({ shot, sheet }) => (
                            <div key={shot.id} className="grid gap-2 rounded-lg border border-border/70 bg-card/40 p-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground transition-colors hover:text-acid"
                                        onClick={() => {
                                            setSelectedShotId(shot.id);
                                            setContinuityPreviewEpisodeId("");
                                        }}
                                    >
                                        {shot.shotNo} · {shot.description || "未填写描述"}
                                    </button>
                                    <span className={cn("shrink-0 font-mono text-[9px]", sheet.validation.startsWith("通过") ? "text-acid" : sheet.validation ? "text-hot" : "text-muted-foreground/50")}>
                                        {sheet.validation || "未校验"}
                                    </span>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {([
                                        ["上一镜末帧", sheet.prevFrameSummary],
                                        ["本镜要求", sheet.nextFrameRequirement],
                                        ["角色状态", sheet.characterState],
                                        ["道具状态", sheet.propState],
                                        ["环境光线", sheet.environment],
                                        ["镜头参数", sheet.cameraParams],
                                        ["声音", sheet.audioState],
                                        ["情绪叙事", sheet.emotionNarrative],
                                        ["连续性风险", sheet.risks],
                                        ["禁项", sheet.forbidden],
                                    ] as Array<[string, string]>).filter(([, value]) => value).map(([label, value]) => (
                                        <div key={label} className="grid gap-0.5">
                                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{label}</span>
                                            <span className="text-[11px] leading-5 text-foreground/80">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">这一集还没有场记交接单，先点「AI 场记分析」。</p>
                )}
            </Modal>

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
