"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Modal } from "antd";
import { ArrowLeft } from "lucide-react";

import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { FilmAmbient } from "@/components/film/film-ambient";
import { FilmScriptSource } from "../components/film-script-source";
import { LocalSaveIndicator } from "@/components/film/local-save-indicator";
import { cn } from "@/lib/utils";
import { FilmCastStage } from "../components/film-cast-stage";
import { FilmEditStage } from "../components/film-edit-stage";
import { FilmScriptStage } from "../components/film-script-stage";
import { FilmStoryboardStage } from "../components/film-storyboard-stage";
import { FilmProjectSettingsFields } from "../components/film-project-settings-fields";
import { useFilmAssetImage } from "../hooks/use-film-asset-image";
import { useFilmShotImage } from "../hooks/use-film-shot-image";
import { useFilmShotVideo } from "../hooks/use-film-shot-video";
import { useFilmTaskRecovery } from "../hooks/use-film-task-recovery";
import { useFilmStore } from "@/stores/use-film-store";
import type { FilmAspect, FilmStage, FilmStylePresetId } from "@/lib/film/types";
import { DEFAULT_DIRECTOR_STYLE_ID, directorStyleLabel } from "@/lib/film/director-styles";
import { filmAspectLabel, normalizeFilmAspect } from "@/lib/film/film-aspects";
import { DEFAULT_FILM_STYLE, filmStyleLabel, normalizeFilmStylePreset } from "@/lib/film/film-styles";
import { FILM_STAGES } from "@/lib/film/film-stages";

export default function FilmProjectPage() {
    const params = useParams<{ id: string }>();
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const hydrated = useFilmStore((state) => state.hydrated);
    const projects = useFilmStore((state) => state.projects);
    const updateProject = useFilmStore((state) => state.updateProject);
    const project = projects.find((item) => item.id === id);
    const [stage, setStage] = useState<FilmStage | null>(null);
    const [aspectOpen, setAspectOpen] = useState(false);
    const [aspectDraft, setAspectDraft] = useState<FilmAspect>("16:9");
    const [stylePresetDraft, setStylePresetDraft] = useState<FilmStylePresetId>(DEFAULT_FILM_STYLE);
    const [visualStyleDraft, setVisualStyleDraft] = useState("");
    const [directorStyleIdDraft, setDirectorStyleIdDraft] = useState(DEFAULT_DIRECTOR_STYLE_ID);
    const [targetDurationDraft, setTargetDurationDraft] = useState<number | undefined>(undefined);
    const currentStage = stage ?? project?.stage ?? "script";
    const imageGeneration = useFilmShotImage(project, (patch) => {
        if (project) updateProject(project.id, patch);
    });
    const videoGeneration = useFilmShotVideo(project, (patch) => {
        if (project) updateProject(project.id, patch);
    });
    const assetGeneration = useFilmAssetImage(project, (patch) => {
        if (project) updateProject(project.id, patch);
    });
    useFilmTaskRecovery(project, (patch) => {
        if (project) updateProject(project.id, patch);
    }, {
        shotIds: [imageGeneration.generatingShotId, videoGeneration.generatingShotId].filter(Boolean),
        assetIds: [assetGeneration.generatingAssetId].filter(Boolean),
    });

    const switchStage = (next: FilmStage) => {
        setStage(next);
        if (project) updateProject(project.id, { stage: next });
    };

    if (!hydrated) {
        return <div className="grid h-full place-items-center"><LoadingState label="正在加载项目" /></div>;
    }

    if (!project) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState
                    title="项目不存在"
                    description="可能已经被删除，或者链接不正确。"
                    action={<Link href="/film" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition hover:border-acid/60">返回影视项目</Link>}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-foreground">
            <header className="relative shrink-0 overflow-hidden border-b border-border/70 bg-background/40">
                <FilmAmbient className="-top-24 h-44 opacity-60" />
                <div className="relative z-10 mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
                    <Link href="/film" aria-label="返回影视项目" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground [@media(pointer:coarse)]:size-10">
                        <ArrowLeft className="size-4" />
                    </Link>
                    <div className="min-w-0">
                        <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">创作工作台</p>
                        <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{project.title}</h1>
                    </div>
                    <nav className="ml-3 hidden h-16 items-center gap-1 sm:flex" aria-label="影视阶段">
                        {FILM_STAGES.map((item, index) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => switchStage(item.key)}
                                aria-current={currentStage === item.key ? "page" : undefined}
                                className={cn(
                                    "relative flex h-16 items-center gap-1.5 px-3 text-[13px] transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t-full after:transition-all after:duration-300",
                                    currentStage === item.key ? "font-medium text-foreground after:bg-acid after:shadow-[0_0_14px_var(--acid)]" : "text-muted-foreground after:bg-transparent hover:text-foreground",
                                )}
                            >
                                <span className={cn("font-mono text-[9px] tabular-nums", currentStage === item.key ? "text-acid/80" : "text-muted-foreground/35")}>{String(index + 1).padStart(2, "0")}</span>
                                {item.label}
                            </button>
                        ))}
                    </nav>
                    <button
                        type="button"
                        onClick={() => {
                            setAspectDraft(normalizeFilmAspect(project.aspect));
                            setStylePresetDraft(normalizeFilmStylePreset(project.stylePreset));
                            setVisualStyleDraft(project.visualStyle || "");
                            setDirectorStyleIdDraft(project.directorStyleId || DEFAULT_DIRECTOR_STYLE_ID);
                            setTargetDurationDraft(project.targetDuration);
                            setAspectOpen(true);
                        }}
                        className="ml-auto hidden items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase transition-colors hover:border-acid/50 hover:text-foreground sm:flex"
                    >
                        画幅 {filmAspectLabel(project.aspect)} · {filmStyleLabel(project.stylePreset)}
                    </button>
                    {directorStyleLabel(project.directorStyleId) ? (
                        <span className="hidden items-center gap-1.5 rounded-full border border-acid/30 bg-acid/[0.06] px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-acid/85 sm:flex" title="导演风格（只影响后续生成与预演校验）">
                            {directorStyleLabel(project.directorStyleId)}
                        </span>
                    ) : null}
                    <span className="hidden sm:block">
                        <LocalSaveIndicator compact />
                    </span>
                </div>
                <div className="relative z-10 flex gap-1 overflow-x-auto border-t border-border/50 px-4 sm:hidden">
                    {FILM_STAGES.map((item) => (
                        <button key={item.key} type="button" onClick={() => switchStage(item.key)} className={cn("relative px-3 py-2 text-xs [@media(pointer:coarse)]:py-2.5", currentStage === item.key ? "text-acid" : "text-muted-foreground")}>
                            {item.label}
                        </button>
                    ))}
                </div>
            </header>

            {project.scriptProjectId ? (
                <div className="shrink-0 border-b border-border/60 bg-background/30">
                    <div className="mx-auto flex min-h-9 max-w-[1600px] flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 text-xs sm:px-6">
                        <FilmScriptSource project={project} onUpdate={(patch) => updateProject(project.id, patch)} />
                    </div>
                </div>
            ) : null}

            <div className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-lg:overscroll-contain lg:overflow-hidden lg:pb-4">
                <div key={currentStage} className="film-stage-enter mx-auto max-w-[1600px] lg:h-full lg:min-h-0">
                    {currentStage === "script" ? (
                        <FilmScriptStage
                            project={project}
                            onUpdate={(patch) => updateProject(project.id, patch)}
                            onGenerateImage={imageGeneration.generate}
                            onGenerateImageBatch={imageGeneration.generateBatch}
                            generatingShotId={imageGeneration.generatingShotId}
                            batchProgress={imageGeneration.batchProgress}
                            onStopBatch={imageGeneration.stopBatch}
                            onGenerateVideo={videoGeneration.generateVideo}
                            onStopVideo={videoGeneration.stopVideo}
                            generatingVideoShotId={videoGeneration.generatingShotId}
                            videoProgress={videoGeneration.videoProgress}
                        />
                    ) : currentStage === "cast" ? (
                        <FilmCastStage
                            project={project}
                            onUpdate={(patch) => updateProject(project.id, patch)}
                            onGenerateAsset={assetGeneration.generateAsset}
                            onGenerateView={assetGeneration.generateView}
                            onStopAsset={assetGeneration.stopAsset}
                            generatingAssetId={assetGeneration.generatingAssetId}
                        />
                    ) : currentStage === "edit" ? (
                        <FilmEditStage project={project} onGoStoryboard={() => switchStage("storyboard")} />
                    ) : (
                        <FilmStoryboardStage
                            project={project}
                            onUpdate={(patch) => updateProject(project.id, patch)}
                            onGoScript={() => switchStage("script")}
                            onGenerateImage={imageGeneration.generate}
                            generatingShotId={imageGeneration.generatingShotId}
                            onGenerateImageBatch={imageGeneration.generateBatch}
                            onStopImageBatch={imageGeneration.stopBatch}
                            batchProgress={imageGeneration.batchProgress}
                            onGenerateVideo={videoGeneration.generateVideo}
                            onStopVideo={videoGeneration.stopVideo}
                            generatingVideoShotId={videoGeneration.generatingShotId}
                            videoProgress={videoGeneration.videoProgress}
                            onGenerateVideoBatch={videoGeneration.generateVideoBatch}
                            onStopVideoBatch={videoGeneration.stopVideo}
                            videoBatchProgress={videoGeneration.batchProgress}
                        />
                    )}
                </div>
            </div>

            <Modal
                title="项目设置"
                open={aspectOpen}
                okText="保存"
                cancelText="取消"
                onOk={() => {
                    updateProject(project.id, {
                        aspect: normalizeFilmAspect(aspectDraft),
                        stylePreset: normalizeFilmStylePreset(stylePresetDraft),
                        visualStyle: visualStyleDraft.trim(),
                        directorStyleId: directorStyleIdDraft,
                        targetDuration: targetDurationDraft,
                    });
                    setAspectOpen(false);
                }}
                onCancel={() => setAspectOpen(false)}
            >
                <div className="grid gap-3 py-2">
                    <p className="text-xs leading-6 text-muted-foreground">画幅、视觉风格与导演风格只影响之后的生成和预演校验，已经生成的结果不会自动重做。</p>
                    <FilmProjectSettingsFields
                        value={{ aspect: aspectDraft, stylePreset: stylePresetDraft, visualStyle: visualStyleDraft, directorStyleId: directorStyleIdDraft, targetDuration: targetDurationDraft }}
                        onChange={(patch) => {
                            if (patch.aspect !== undefined) setAspectDraft(patch.aspect);
                            if (patch.stylePreset !== undefined) setStylePresetDraft(patch.stylePreset);
                            if (patch.visualStyle !== undefined) setVisualStyleDraft(patch.visualStyle);
                            if (patch.directorStyleId !== undefined) setDirectorStyleIdDraft(patch.directorStyleId);
                            if ("targetDuration" in patch) setTargetDurationDraft(patch.targetDuration);
                        }}
                    />
                </div>
            </Modal>
        </div>
    );
}
