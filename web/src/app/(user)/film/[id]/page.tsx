"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Modal, Select } from "antd";
import { ArrowLeft, Check } from "lucide-react";

import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import { FilmCastStage } from "../components/film-cast-stage";
import { FilmEditStage } from "../components/film-edit-stage";
import { FilmScriptStage } from "../components/film-script-stage";
import { FilmStoryboardStage } from "../components/film-storyboard-stage";
import { useFilmAssetImage } from "../hooks/use-film-asset-image";
import { useFilmShotImage } from "../hooks/use-film-shot-image";
import { useFilmShotVideo } from "../hooks/use-film-shot-video";
import { useFilmStore } from "../stores/use-film-store";
import type { FilmAspect, FilmStage } from "../types";
import { FILM_ASPECT_OPTIONS, filmAspectLabel, normalizeFilmAspect } from "../utils/film-aspects";

const STAGES: Array<{ key: FilmStage; label: string }> = [
    { key: "script", label: "剧本" },
    { key: "cast", label: "角色与场景" },
    { key: "storyboard", label: "导演台" },
    { key: "edit", label: "剪辑" },
];

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
            <header className="shrink-0 border-b border-border/70 bg-background/40">
                <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
                    <Link href="/film" aria-label="返回影视项目" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                        <ArrowLeft className="size-4" />
                    </Link>
                    <div className="min-w-0">
                        <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">FILM / PROJECT</p>
                        <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{project.title}</h1>
                    </div>
                    <nav className="ml-3 hidden h-14 items-center gap-1 sm:flex" aria-label="影视阶段">
                        {STAGES.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => switchStage(item.key)}
                                aria-current={currentStage === item.key ? "page" : undefined}
                                className={cn(
                                    "relative h-14 px-3 text-[13px] transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t-full after:transition-colors",
                                    currentStage === item.key ? "font-medium text-foreground after:bg-acid" : "text-muted-foreground after:bg-transparent hover:text-foreground",
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                    <button
                        type="button"
                        onClick={() => {
                            setAspectDraft(normalizeFilmAspect(project.aspect));
                            setAspectOpen(true);
                        }}
                        className="ml-auto hidden items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase transition-colors hover:border-acid/50 hover:text-foreground sm:flex"
                    >
                        画幅 {filmAspectLabel(project.aspect)}
                    </button>
                    <span className="hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase sm:flex">
                        <Check className="size-3 text-acid" aria-hidden />
                        已自动保存
                    </span>
                </div>
                <div className="flex gap-1 border-t border-border/50 px-4 sm:hidden">
                    {STAGES.map((item) => (
                        <button key={item.key} type="button" onClick={() => switchStage(item.key)} className={cn("relative px-3 py-2 text-xs", currentStage === item.key ? "text-acid" : "text-muted-foreground")}>
                            {item.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:overflow-hidden">
                <div className="mx-auto max-w-[1600px] lg:h-full lg:min-h-0">
                    {currentStage === "script" ? (
                        <FilmScriptStage
                            project={project}
                            onUpdate={(patch) => updateProject(project.id, patch)}
                            onGenerateImage={imageGeneration.generate}
                            generatingShotId={imageGeneration.generatingShotId}
                            onGenerateVideo={videoGeneration.generateVideo}
                            generatingVideoShotId={videoGeneration.generatingShotId}
                            videoProgress={videoGeneration.videoProgress}
                        />
                    ) : currentStage === "cast" ? (
                        <FilmCastStage
                            project={project}
                            onUpdate={(patch) => updateProject(project.id, patch)}
                            onGenerateAsset={assetGeneration.generateAsset}
                            onGenerateView={assetGeneration.generateView}
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
                            batchProgress={imageGeneration.batchProgress}
                            onGenerateVideo={videoGeneration.generateVideo}
                            generatingVideoShotId={videoGeneration.generatingShotId}
                            videoProgress={videoGeneration.videoProgress}
                            onGenerateVideoBatch={videoGeneration.generateVideoBatch}
                            videoBatchProgress={videoGeneration.batchProgress}
                        />
                    )}
                </div>
            </div>

            <Modal
                title="项目画幅"
                open={aspectOpen}
                okText="保存"
                cancelText="取消"
                onOk={() => {
                    updateProject(project.id, { aspect: normalizeFilmAspect(aspectDraft) });
                    setAspectOpen(false);
                }}
                onCancel={() => setAspectOpen(false)}
            >
                <div className="grid gap-3 py-2">
                    <p className="text-xs leading-6 text-muted-foreground">画幅只影响之后生成的图片（分镜图、角色/场景设定图），已经生成的结果不会自动重做。</p>
                    <Select value={normalizeFilmAspect(aspectDraft)} options={FILM_ASPECT_OPTIONS} onChange={(value: FilmAspect) => setAspectDraft(value)} />
                </div>
            </Modal>
        </div>
    );
}
