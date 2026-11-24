"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { BookOpen, Library, Plus, Upload } from "lucide-react";
import { saveAs } from "file-saver";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { CanvasDeleteProjectsDialog } from "../canvas/components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "../canvas/components/canvas-project-card";
import { useCanvasStore, type CanvasProject } from "../canvas/stores/use-canvas-store";
import { comicCanvasProjects } from "../canvas/utils/canvas-project-domain";
import { applyComicProject, selectComicProject } from "../canvas/[id]/lib/comic-canvas-projection";
import { parseComicProjectBackup, serializeComicProject } from "./utils/comic-project";

export default function ComicListPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createComicProject = useCanvasStore((state) => state.createComicProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const importInputRef = useRef<HTMLInputElement>(null);
    const ordered = useMemo(() => [...comicCanvasProjects(projects)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [projects]);
    const create = () => {
        const id = createComicProject();
        router.push(`/comic/studio/${id}`);
    };
    const exportComic = (project: CanvasProject) => {
        const view = selectComicProject(project);
        if (!view) return void message.warning("漫画册节点缺失，无法导出");
        saveAs(new Blob([serializeComicProject(view)], { type: "application/json" }), `${view.title || "漫画项目"}.json`);
        message.success("漫画项目备份已导出");
    };
    const importComic = async (file: File) => {
        try {
            const backup = parseComicProjectBackup(await file.text());
            const id = createComicProject(backup.title);
            const project = useCanvasStore.getState().projects.find((item) => item.id === id);
            if (!project) throw new Error("漫画项目创建失败");
            const next = applyComicProject(project, { ...backup, id });
            updateProject(id, { nodes: next.nodes, connections: next.connections, comic: next.comic });
            if (next.title !== project.title) renameProject(id, next.title);
            message.success(`已导入「${backup.title}」`);
            router.push(`/comic/studio/${id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败");
        }
    };

    return (
        <main className="min-h-0 flex-1 overflow-y-auto bg-transparent text-foreground">
            <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                <PageHeader
                    eyebrow="创作工作台"
                    title="漫画"
                    description="每个漫画项目是一份画布文档：企划、角色、剧本、页格、审稿和漫画册编排都在同一份项目里。"
                    meta={<span className="chip chip-acid inline-flex items-center gap-1.5"><BookOpen className="size-3" />{ordered.length} 个项目</span>}
                    actions={
                        <>
                            <Button href="/comic/library" icon={<Library className="size-4" />}>角色与场景库</Button>
                            <Button icon={<Upload className="size-4" />} onClick={() => importInputRef.current?.click()}>导入备份</Button>
                            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importComic(file); }} />
                            <Button type="primary" icon={<Plus className="size-4" />} onClick={create}>新建漫画</Button>
                        </>
                    }
                />
                {!hydrated ? <LoadingState label="正在加载漫画项目" /> : null}
                {hydrated && !ordered.length ? (
                    <EmptyState
                        title="还没有漫画项目"
                        description="新建后从企划开始：先定题材、受众和风格，再拆章节与页格。"
                        icon={<BookOpen className="size-6" />}
                        action={<Button type="primary" icon={<Plus className="size-4" />} onClick={create}>新建漫画</Button>}
                    />
                ) : null}
                {hydrated && ordered.length ? (
                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {ordered.map((project, index) => <CanvasProjectCard key={project.id} project={project} index={index} basePath="/comic/studio" onExport={() => exportComic(project)} />)}
                    </section>
                ) : null}
            </div>
            <CanvasDeleteProjectsDialog />
        </main>
    );
}
