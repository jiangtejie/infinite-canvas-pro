"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { App, Button, Segmented } from "antd";
import { ArrowLeft, BookOpen, Download, Library } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LocalSaveIndicator } from "@/components/film/local-save-indicator";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useDownloadFile } from "@/hooks/use-download-file";
import type { ComicProject } from "../types";
import { useComicStore } from "../stores/use-comic-store";
import { COMIC_STAGE_LABELS, comicStageLabel, comicStats, serializeComicProject } from "../utils/comic-project";
import { ComicCanvasSyncDialog } from "./components/comic-canvas-sync-dialog";
import { ComicCastStage } from "./components/comic-cast-stage";
import { ComicConceptStage } from "./components/comic-concept-stage";
import { ComicLayoutStage } from "./components/comic-layout-stage";
import { ComicReviewStage } from "./components/comic-review-stage";
import { ComicScriptStage } from "./components/comic-script-stage";

export default function ComicWorkspacePage() {
    const params = useParams<{ id: string }>();
    const { message } = App.useApp();
    const downloadFile = useDownloadFile();
    const hydrated = useComicStore((state) => state.hydrated);
    const project = useComicStore((state) => state.projects.find((item) => item.id === params.id));
    const updateProject = useComicStore((state) => state.updateProject);

    if (!hydrated) return <LoadingState label="正在加载漫画项目" />;
    if (!project) {
        return <main className="min-h-0 flex-1 overflow-y-auto"><div className="page-shell py-16"><EmptyState title="漫画项目不存在" description="它可能已被删除，或来自另一台设备的本机备份。" icon={<BookOpen className="size-6" />} action={<Button href="/comic">返回漫画工作台</Button>} /></div></main>;
    }

    const stats = comicStats(project);
    const exportProject = () => {
        downloadFile(new Blob([serializeComicProject(project)], { type: "application/json" }), `${project.title || "漫画项目"}.json`);
        message.success("项目备份已导出");
    };
    const patchConcept = (patch: Partial<ComicProject>) => {
        const formatChanged = patch.format && patch.format !== project.format;
        const invalidatesComposition = formatChanged || patch.styleGuide !== undefined;
        updateProject(project.id, invalidatesComposition
            ? { ...patch, chapters: project.chapters.map((chapter) => ({ ...chapter, pages: chapter.pages.map((item) => ({ ...item, pageImage: undefined, compositionContext: undefined })) })) }
            : patch);
    };

    return (
        <main className="min-h-0 flex-1 overflow-y-auto bg-transparent text-foreground">
            <div className="page-shell flex flex-col gap-6 py-8 sm:py-10">
                <Link href="/comic" className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-3.5" />漫画工作台</Link>
                <PageHeader
                    eyebrow="漫画工作台"
                    title={project.title}
                    description={project.logline || "从企划开始，把章节、页和格拆到可以作画的粒度。"}
                    meta={
                        <>
                            <span className="chip chip-acid inline-flex items-center gap-1.5"><BookOpen className="size-3" />{comicStageLabel(project.stage)}</span>
                            <span className="chip">{project.format === "strip" ? "条漫" : "页漫"} · {project.direction === "rtl" ? "右→左" : "左→右"}</span>
                            <span className="chip">{stats.chapters} 章 · {stats.pages} 页 · {stats.panels} 格</span>
                            <span className="chip">{(project.characters || []).length} 角色 · {(project.locations || []).length} 场景</span>
                            <LocalSaveIndicator className="self-center" />
                        </>
                    }
                    actions={<><Button href="/comic/library" icon={<Library className="size-4" />}>角色与场景库</Button><Button icon={<Download className="size-4" />} onClick={exportProject}>导出备份</Button><ComicCanvasSyncDialog project={project} onChange={(next) => updateProject(project.id, next)} /></>}
                />

                <div className="flex items-center justify-between gap-3">
                    <Segmented value={project.stage} options={(Object.entries(COMIC_STAGE_LABELS) as Array<[typeof project.stage, string]>).map(([value, label]) => ({ label, value }))} onChange={(stage) => updateProject(project.id, { stage: stage as typeof project.stage })} />
                    <span className="text-[11px] text-muted-foreground/60">编辑页格、布局或重新出图会自动退回草稿；贴字与成品导出统一在画布漫画册。</span>
                </div>

                {project.stage === "script" ? (
                    <ComicScriptStage project={project} onChange={(next) => updateProject(project.id, next)} />
                ) : project.stage === "layout" ? (
                    <ComicLayoutStage project={project} onChange={(next) => updateProject(project.id, next)} />
                ) : project.stage === "review" ? (
                    <ComicReviewStage project={project} onChange={(next) => updateProject(project.id, next)} />
                ) : project.stage === "cast" ? (
                    <ComicCastStage project={project} onChange={(next) => updateProject(project.id, next)} />
                ) : (
                    <ComicConceptStage project={project} onPatch={patchConcept} />
                )}
            </div>
        </main>
    );
}
