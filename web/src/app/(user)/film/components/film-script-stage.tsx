"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, Input, InputNumber, Modal, Select } from "antd";
import { Clapperboard, ClipboardList, FileUp, Link2, Network, Plus, ShieldCheck, Sparkles, Trash2, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmEpisode, FilmProject, FilmShot, FilmShotStatus } from "@/lib/film/types";
import { addFilmEpisode, addFilmScene, addFilmShot, filmSceneOptions, filmShotPosition, moveFilmShot, moveFilmShotToScene, removeFilmScene, removeFilmShot, updateFilmShot } from "../utils/film-edits";
import { useFilmAiParse } from "../hooks/use-film-ai-parse";
import { useFilmContinuity } from "../hooks/use-film-continuity";
import { useFilmScriptAnalysis } from "../hooks/use-film-script-analysis";
import { useFilmDeleteConfirm } from "../hooks/use-film-delete-confirm";
import type { FilmImageBatchOptions, FilmImageBatchProgress } from "../hooks/use-film-shot-image";
import { applyFilmContinuity, applyFilmContinuityChecks } from "../utils/film-continuity-sheet";
import { useFilmContinuityCheck } from "../hooks/use-film-continuity-check";
import { bindFilmCast } from "../utils/film-cast-bind";
import { mergeFilmEpisodes } from "../utils/film-ai-parse";
import { filmShotTypeLabel } from "../utils/film-shot-types";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { countFilmScenes, flattenFilmShots } from "../utils/parse-script";
import { deriveFilmShotStatus } from "../utils/film-status";
import { filmScriptDocumentToEpisodes, parseFilmScriptDocument, readFilmScriptFile, scriptTextHash, type FilmScriptDocument } from "@/lib/film/film-script-import";
import { buildScriptAnalysisAssets, normalizeEntityKey, validateFilmScriptAnalysis, type FilmScriptAnalysisIssue } from "../utils/film-script-analysis";
import type { FilmScriptAnalysis, FilmScriptRelationshipAnalysis } from "@/lib/film/types";
import { FilmShotDetail } from "./film-shot-detail";
import { FilmScriptGraph } from "./film-script-graph";
import { FilmContinuityNotebook } from "./film-continuity-notebook";

type FilmScriptStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateImage: (shot: FilmShot) => void;
    onGenerateImageBatch: (shots: FilmShot[], options?: FilmImageBatchOptions) => void;
    generatingShotId: string;
    batchProgress: FilmImageBatchProgress | null;
    onStopBatch: () => void;
    onGenerateVideo: (shot: FilmShot) => void;
    onStopVideo?: () => void;
    generatingVideoShotId: string;
    videoProgress: number;
};

export function FilmScriptStage({ project, onUpdate, onGenerateImage, onGenerateImageBatch, generatingShotId, batchProgress, onStopBatch, onGenerateVideo, onStopVideo, generatingVideoShotId, videoProgress }: FilmScriptStageProps) {
    const { message, modal } = App.useApp();
    const { confirmDelete, deleteConfirmNode } = useFilmDeleteConfirm();
    const { analyzingEpisodeId, analyzeEpisode } = useFilmContinuity();
    const { batchProgress: checkingBatchProgress, checkShots } = useFilmContinuityCheck();
    const { analyzing: analyzingScript, progress: analysisProgress, analyzeDocument } = useFilmScriptAnalysis();
    const episodes = project.episodes;
    const shots = useMemo(() => flattenFilmShots(episodes), [episodes]);
    const [selectedShotId, setSelectedShotId] = useState("");
    const [continuityPreviewEpisodeId, setContinuityPreviewEpisodeId] = useState("");
    const [graphOpen, setGraphOpen] = useState(false);
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? null;
    const previewEpisode = episodes.find((episode) => episode.id === continuityPreviewEpisodeId) || null;
    const previewSheets = previewEpisode
        ? flattenFilmShots([previewEpisode]).filter((shot) => Boolean(shot.continuity || shot.continuityCheck)).map((shot) => ({ shot, sheet: shot.continuity }))
        : [];

    useEffect(() => {
        if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) return;
        setSelectedShotId(shots[0]?.id ?? "");
    }, [selectedShotId, shots]);

    const sceneTargets = useMemo(() => filmSceneOptions(episodes), [episodes]);
    const selectedPosition = selectedShot ? filmShotPosition(episodes, selectedShot.id) : null;
    const currentScriptHash = useMemo(() => scriptTextHash(project.scriptText || ""), [project.scriptText]);
    const analysisStale = Boolean(project.scriptAnalysis && currentScriptHash !== project.scriptAnalysis.scriptHash);

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
                onUpdate({ episodes: episodes.map((item) => item.id === episode.id ? applyFilmContinuityChecks(item, results) : item) });
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
    const [analysisEditing, setAnalysisEditing] = useState(false);
    const [analysisTab, setAnalysisTab] = useState<"characters" | "relationships" | "scenes" | "beats">("characters");
    const [importTextExpanded, setImportTextExpanded] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);
    const importStep = !importDoc ? 1 : scriptAnalysis ? 3 : 2;
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
        setImportTextExpanded(false);
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

    const confirmApplyImport = (mode: "replace" | "append") => {
        if (!importDoc) return;
        if (mode === "replace" && episodes.length) {
            modal.confirm({
                title: "覆盖现有剧集和分镜？",
                content: "当前项目已有剧集/分镜，覆盖导入会替换现有内容（可用「撤销解析」恢复上一版）。",
                okText: "覆盖导入",
                okButtonProps: { danger: true },
                cancelText: "取消",
                onOk: () => applyImportDocument("replace"),
            });
            return;
        }
        applyImportDocument(mode);
    };

    const confirmApplyAnalysis = (mode: "replace" | "append") => {
        if (!scriptAnalysis) return;
        if (mode === "replace" && episodes.length) {
            modal.confirm({
                title: "覆盖现有剧集和分镜？",
                content: "覆盖导入会替换现有剧集/分镜，并把勾选接受的角色、关系应用到项目。",
                okText: "覆盖导入",
                okButtonProps: { danger: true },
                cancelText: "取消",
                onOk: () => applyAnalysisImport("replace"),
            });
            return;
        }
        applyAnalysisImport(mode);
    };

    const applyImportDocument = (mode: "replace" | "append") => {
        if (!importDoc) return;
        commitParsed(filmScriptDocumentToEpisodes(importDoc), mode);
        onUpdate({ scriptDocument: importDoc });
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

    const mutateAnalysis = (updater: (analysis: FilmScriptAnalysis) => FilmScriptAnalysis) => {
        if (!scriptAnalysis) return;
        const next = updater(scriptAnalysis);
        setScriptAnalysis(next);
        setAnalysisIssues(validateFilmScriptAnalysis(next));
    };

    const updateAnalysisCharacter = (name: string, patch: Partial<FilmScriptAnalysis["characters"][number]>) => {
        mutateAnalysis((analysis) => ({ ...analysis, characters: analysis.characters.map((character) => character.name === name ? { ...character, ...patch } : character) }));
    };

    const updateAnalysisRelationship = (index: number, patch: Partial<FilmScriptRelationshipAnalysis>) => {
        mutateAnalysis((analysis) => ({ ...analysis, relationships: analysis.relationships.map((relationship, itemIndex) => itemIndex === index ? { ...relationship, ...patch } : relationship) }));
    };

    const toggleAcceptedCharacter = (key: string, checked: boolean) => {
        setAcceptedCharacters((current) => checked ? [...current, key] : current.filter((item) => item !== key));
    };

    const toggleAcceptedRelationship = (key: string, checked: boolean) => {
        setAcceptedRelationships((current) => checked ? [...current, key] : current.filter((item) => item !== key));
    };

    const analyzeImportSemantics = async () => {
        if (!importDoc) return;
        const previousAnalysis = project.scriptAnalysis && project.scriptAnalysis.scriptHash !== importDoc.scriptHash ? project.scriptAnalysis : undefined;
        const result = await analyzeDocument(importDoc, previousAnalysis);
        if (!result) return;
        setScriptAnalysis(result.analysis);
        setAnalysisIssues(result.issues);
        setAnalysisEditing(false);
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
        setAnalysisEditing(false);
        setAcceptedCharacters(project.scriptAnalysis.characters.map((character) => normalizeEntityKey(character.name)));
        setAcceptedRelationships(project.scriptAnalysis.relationships.map((relationship) => relationshipSelectionKey(relationship)));
    };

    const sameHashSnapshot = Boolean(importDoc && project.scriptAnalysis && project.scriptAnalysis.scriptHash === importDoc.scriptHash);

    const applyGraphAssets = () => {
        if (!project.scriptAnalysis) return;
        const locationNames = [...new Set((project.episodes || []).flatMap((episode) => episode.scenes.map((scene) => scene.location)).filter(Boolean))];
        const assets = buildScriptAnalysisAssets(project, project.scriptAnalysis, locationNames);
        const addedCharacters = assets.characters.length - project.characters.length;
        const addedLocations = assets.locations.length - project.locations.length;
        if (!addedCharacters && !addedLocations) {
            message.info("分析里的角色和场景都已经在项目里了");
            return;
        }
        onUpdate({ characters: assets.characters, locations: assets.locations });
        message.success(`已补 ${addedCharacters} 个角色、${addedLocations} 个场景`);
    };

    const applyAnalysisImport = (mode: "replace" | "append") => {
        if (!importDoc) return;
        commitParsed(filmScriptDocumentToEpisodes(importDoc), mode);
        if (selectedScriptAnalysis) {
            const locationNames = [...new Set(importDoc.episodes.flatMap((episode) => episode.scenes.map((scene) => scene.location)).filter(Boolean))];
            const assets = buildScriptAnalysisAssets(project, selectedScriptAnalysis, locationNames);
            onUpdate({ characters: assets.characters, locations: assets.locations, scriptAnalysis: selectedScriptAnalysis, scriptDocument: importDoc });
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
        confirmDelete({
            title: "清空剧本和分镜？",
            description: "剧本文本与已解析的剧集、分镜都会被清空，无法恢复。",
            detail: `${episodes.length} 集 · ${countFilmScenes(episodes)} 场 · ${shots.length} 镜`,
            confirmText: "清空",
            onConfirm: () => {
                onUpdate({ scriptText: "", episodes: [] });
                setSelectedShotId("");
            },
        });
    };

    const removeShot = (shotId: string) => {
        onUpdate({ episodes: removeFilmShot(episodes, shotId) });
    };

    return (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)_380px] xl:gap-5">
            <section className="punk-panel flex max-h-[70dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
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
                            title="按分镜表直接拆分镜：会提示覆盖或追加到现有分镜"
                            icon={<Sparkles className="size-3.5" />}
                            onClick={() => void parseWithAi(project.scriptText, { pacing, targetDuration })}
                        >
                            {parsing ? `AI 解析中 ${progress?.done ?? 0}/${progress?.total ?? 1}` : "AI 解析并拆分镜"}
                        </Button>
                        <Button size="small" icon={<FileUp className="size-3.5" />} title="先规则切分场次，可选 AI 语义分析（生成剧情图谱/角色关系），确认后才写分镜" onClick={openImport}>
                            导入剧本并分析
                        </Button>
                        <Button size="small" icon={<Trash2 className="size-3.5" />} onClick={clearScript}>
                            清空
                        </Button>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground/60">两条入口用途不同：「AI 解析并拆分镜」直接把原文拆成分镜；「导入剧本并分析」先规则切分再可选 AI 语义分析，用于生成剧情图谱与角色关系，分镜确认后才写入。</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="chip chip-acid">{countFilmScenes(episodes)} 场</span>
                        <span className="chip">{shots.length} 个分镜</span>
                    </div>
                </div>
            </section>

            <section className="punk-panel flex max-h-[70dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                <div className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                    <span className="eyebrow">剧集结构</span>
                    <div className="flex items-center gap-1">
                        <Button
                            type="text"
                            size="small"
                            aria-label="剧情图谱"
                            title={project.scriptAnalysis ? "查看剧情图谱" : "先在导入剧本里完成 AI 语义解析"}
                            disabled={!project.scriptAnalysis}
                            icon={<Network className="size-3.5" />}
                            onClick={() => setGraphOpen(true)}
                        >
                            剧情图谱
                        </Button>
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
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
                    {project.scriptDocument ? <span className="chip" title={`parser v${project.scriptDocument.parserVersion} · ${project.scriptDocument.format}`}>规则快照 #{project.scriptDocument.scriptHash.slice(0, 8)}</span> : null}
                    {project.scriptAnalysis ? (
                        <>
                            <span className="chip">{project.scriptAnalysis.characters.length} 角色</span>
                            <span className="chip">{project.scriptAnalysis.relationships.length} 关系</span>
                            <span className="chip">{project.scriptAnalysis.scenes.length} 场</span>
                            {analysisStale ? (
                                <span className="rounded border border-hot/40 bg-hot/10 px-1.5 py-0.5 font-mono text-[9px] text-hot">剧本已变更 · 分析可能过期</span>
                            ) : (
                                <span className="font-mono text-[9px] text-acid/80">分析已就绪</span>
                            )}
                        </>
                    ) : (
                        <span className="font-mono text-[10px] text-muted-foreground/60">未做 AI 语义分析</span>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/60 tabular-nums">{episodes.length} 集 · {countFilmScenes(episodes)} 场 · {shots.length} 镜</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                    {episodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                            <div className="film-float grid size-12 place-items-center rounded-[10px] border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70">
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
                                    const count = episode.scenes.reduce((total, scene) => total + scene.shots.filter((shot) => shot.continuity || shot.continuityCheck).length, 0);
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
                                                "group flex w-full items-center gap-2 border-t border-border/30 px-3 py-2 pl-9 text-left transition-colors",
                                                shot.id === selectedShotId ? "bg-acid/[0.06]" : "hover:bg-foreground/[0.03]",
                                            )}
                                        >
                                            <span className={cn("font-mono text-[10px] tabular-nums", shot.id === selectedShotId ? "text-acid" : "text-muted-foreground/70")}>{shot.shotNo}</span>
                                            <span className="w-12 shrink-0 font-mono text-[9px] tracking-wide text-muted-foreground/70">{shot.shotType ? filmShotTypeLabel(shot.shotType) : "—"}</span>
                                            <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{shot.description || "未填写描述"}</span>
                                            {shot.continuity ? <span className="shrink-0 font-mono text-[9px] text-acid/80">场记</span> : null}
                                            <StatusDot status={deriveFilmShotStatus(shot)} />
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

            <section className="punk-panel flex max-h-[70dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                <div className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
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
                        onStopVideo={onStopVideo}
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

            <FilmScriptGraph analysis={project.scriptAnalysis || null} open={graphOpen} onClose={() => setGraphOpen(false)} onApplyAssets={applyGraphAssets} />

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
                                <Button type="text" onClick={() => { setImportDoc(null); setScriptAnalysis(null); setAnalysisIssues([]); }}>上一步</Button>
                                {analyzingScript ? <span className="self-center text-[11px] text-muted-foreground/70">{analysisProgress ? `语义分析 ${analysisProgress.done}/${analysisProgress.total}` : "正在分析…"}</span> : null}
                                {!scriptAnalysis ? (
                                    <>
                                        <Button onClick={() => confirmApplyImport("append")}>仅导入分镜</Button>
                                        <Button type="primary" loading={analyzingScript} onClick={() => void analyzeImportSemantics()}>AI 语义解析</Button>
                                    </>
                                ) : (
                                    <>
                                        <span className="self-center text-[11px] text-muted-foreground/70">已接受 {selectedScriptAnalysis?.characters.length ?? 0} 角色 / {selectedScriptAnalysis?.relationships.length ?? 0} 关系</span>
                                        <Button onClick={() => applyImportDocument("append")}>仅导入分镜</Button>
                                        <Button onClick={() => confirmApplyAnalysis("append")}>追加导入并应用</Button>
                                        <Button type="primary" danger onClick={() => confirmApplyAnalysis("replace")}>覆盖导入并应用</Button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                }
            >
                <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {["导入原文", "规则切分", "AI 分析 / 确认"].map((label, index) => {
                            const step = index + 1;
                            return (
                                <span key={label} className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px]", importStep === step ? "border-acid/50 bg-acid/10 text-acid" : importStep > step ? "border-acid/25 text-acid/70" : "border-border/60 text-muted-foreground/60")}>
                                    {importStep > step ? "✓ " : ""}{step}. {label}
                                </span>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="small" icon={<FileUp className="size-3.5" />} onClick={() => importFileRef.current?.click()}>选择文件</Button>
                        <input ref={importFileRef} hidden type="file" accept=".txt,.md,.markdown,.fountain,.fdx,.docx" onChange={(event) => void handleImportFile(event.target.files?.[0])} />
                        <span className="text-[11px] text-muted-foreground/70">支持 txt / md / docx / fountain / fdx，也可以直接粘贴</span>
                        {importFileName ? <span className="chip">{importFileName}</span> : null}
                    </div>
                    {importDoc ? (
                        <button type="button" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-left" onClick={() => setImportTextExpanded((value) => !value)}>
                            <span className="text-[11px] text-muted-foreground/80">已导入原文 · {importText.length} 字{importFileName ? ` · ${importFileName}` : ""}</span>
                            <span className="font-mono text-[9px] tracking-[0.14em] text-acid/80 uppercase">{importTextExpanded ? "收起原文" : "展开原文"}</span>
                        </button>
                    ) : null}
                    {!importDoc || importTextExpanded ? (
                        <Input.TextArea autoSize={{ minRows: 8, maxRows: 16 }} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="粘贴剧本，或直接选择文件" />
                    ) : null}
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
                            {importDoc && project.scriptAnalysis && project.scriptAnalysis.scriptHash !== importDoc.scriptHash ? (
                                <p className="text-[11px] leading-5 text-muted-foreground/70">检测到剧本内容有变化：AI 语义解析会复用未变化的场次，只重新分析改动过的场次。</p>
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
                                <div className="flex items-center gap-1">
                                    <Button size="small" type="text" onClick={() => setAnalysisEditing((value) => !value)}>{analysisEditing ? "完成" : "编辑"}</Button>
                                    <Button size="small" type="text" onClick={acceptAllAnalysis}>全部接受</Button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                                {([{ value: "characters", label: `角色 ${scriptAnalysis.characters.length}` }, { value: "relationships", label: `关系 ${scriptAnalysis.relationships.length}` }, { value: "scenes", label: `场次 ${scriptAnalysis.scenes.length}` }, { value: "beats", label: `节拍 ${scriptAnalysis.scenes.reduce((total, scene) => total + scene.beats.length, 0)}` }] as const).map((tab) => (
                                    <button key={tab.value} type="button" onClick={() => setAnalysisTab(tab.value)} className={cn("rounded px-2 py-0.5 text-[11px] transition-colors", analysisTab === tab.value ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}>
                                        {tab.label}
                                    </button>
                                ))}
                                <span className="ml-auto pr-1 font-mono text-[9px] text-muted-foreground/50">取消勾选则不导入</span>
                            </div>
                            <div className={cn("sm:col-span-2", analysisTab === "characters" ? "" : "hidden")}>
                                <div className="thin-scrollbar grid max-h-60 gap-1 overflow-y-auto pr-1">
                                    {scriptAnalysis.characters.map((character) => {
                                        const key = normalizeEntityKey(character.name);
                                        return (
                                            <div key={character.name} className="grid gap-1 rounded border border-border/50 bg-background/30 p-1.5">
                                                <Checkbox checked={acceptedCharacters.includes(key)} onChange={(event) => toggleAcceptedCharacter(key, event.target.checked)}>
                                                    <span className="text-[11px] font-medium leading-5 text-foreground/80">{character.name}</span>
                                                </Checkbox>
                                                {analysisEditing ? (
                                                    <div className="grid gap-1">
                                                        <Input size="small" value={character.role} placeholder="定位，如主角/配角" onChange={(event) => updateAnalysisCharacter(character.name, { role: event.target.value })} />
                                                        <Input size="small" value={character.aliases.join("、")} placeholder="别名，用、分隔" onChange={(event) => updateAnalysisCharacter(character.name, { aliases: event.target.value.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean) })} />
                                                        <Input size="small" value={character.description} placeholder="角色描述" onChange={(event) => updateAnalysisCharacter(character.name, { description: event.target.value })} />
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] leading-5 text-muted-foreground/70">
                                                        {character.role ? `${character.role}` : ""}{character.description ? `：${character.description}` : ""}{character.aliases.length ? `（别名：${character.aliases.join("、")}）` : ""}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className={cn("sm:col-span-2", analysisTab === "relationships" ? "" : "hidden")}>
                                <div className="thin-scrollbar grid max-h-60 gap-1 overflow-y-auto pr-1">
                                    {scriptAnalysis.relationships.map((relationship, index) => {
                                        const key = relationshipSelectionKey(relationship);
                                        return (
                                            <div key={key} className="grid gap-1 rounded border border-border/50 bg-background/30 p-1.5">
                                                <Checkbox checked={acceptedRelationships.includes(key)} onChange={(event) => toggleAcceptedRelationship(key, event.target.checked)}>
                                                    <span className="text-[11px] font-medium leading-5 text-foreground/80">{relationship.from} → {relationship.to}</span>
                                                </Checkbox>
                                                {analysisEditing ? (
                                                    <div className="flex items-center gap-1">
                                                        <Input size="small" value={relationship.type} placeholder="关系类型" onChange={(event) => updateAnalysisRelationship(index, { type: event.target.value })} />
                                                        <InputNumber size="small" min={1} max={5} value={relationship.strength} onChange={(value) => updateAnalysisRelationship(index, { strength: Number(value) || 1 })} />
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] leading-5 text-muted-foreground/70">{relationship.type} · 第 {relationship.sceneRange.start + 1}-{relationship.sceneRange.end + 1} 场 · 强度 {relationship.strength}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className={cn("thin-scrollbar grid max-h-60 gap-1 overflow-y-auto pr-1", analysisTab === "scenes" ? "" : "hidden")}>
                                {scriptAnalysis.scenes.map((scene) => (
                                    <div key={`${scene.sceneIndex}-${scene.heading}`} className="grid gap-1 rounded border border-border/50 bg-background/30 p-1.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[11px] font-medium text-foreground">{scene.heading}</span>
                                            <span className="font-mono text-[9px] text-muted-foreground/60">{scene.episode} · 第 {scene.sceneIndex + 1} 场</span>
                                        </div>
                                        <p className="text-[11px] leading-5 text-muted-foreground/70">{scene.summary || "无摘要"}</p>
                                        <p className="font-mono text-[9px] text-muted-foreground/50">角色：{scene.characters.join("、") || "—"} · 节拍 {scene.beats.length}</p>
                                    </div>
                                ))}
                            </div>
                            <div className={cn("thin-scrollbar grid max-h-60 gap-1 overflow-y-auto pr-1", analysisTab === "beats" ? "" : "hidden")}>
                                {scriptAnalysis.scenes.flatMap((scene) => scene.beats.map((beat, index) => (
                                    <div key={`${scene.sceneIndex}-${index}-${beat.type}`} className="grid gap-1 rounded border border-border/50 bg-background/30 p-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="chip chip-acid shrink-0">{beat.type}</span>
                                            <span className="min-w-0 truncate font-mono text-[9px] text-muted-foreground/60">{scene.episode} / {scene.heading}</span>
                                        </div>
                                        <p className="text-[11px] leading-5 text-foreground/80">{beat.summary}</p>
                                    </div>
                                )))}
                                {!scriptAnalysis.scenes.some((scene) => scene.beats.length) ? <p className="py-3 text-center text-[11px] text-muted-foreground/60">还没有分析出剧情节拍</p> : null}
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
                width={1080}
                destroyOnHidden
            >
                <FilmContinuityNotebook
                    episodeTitle={previewEpisode?.title || ""}
                    sheets={previewSheets}
                    onJumpToShot={(shotId) => {
                        setSelectedShotId(shotId);
                        setContinuityPreviewEpisodeId("");
                    }}
                />
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
            {deleteConfirmNode}
        </div>
    );
}

function StatusDot({ status }: { status: FilmShotStatus }) {
    const tone = status === "video_ready" ? "bg-acid" : status === "image_ready" ? "bg-acid/60" : status === "generating" ? "bg-acid/40 animate-pulse" : status === "failed" ? "bg-hot" : "bg-border";
    return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone)} />;
}
