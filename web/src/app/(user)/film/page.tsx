"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Pagination } from "antd";
import { Library, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { PunkAura } from "@/components/ui/punk-aura";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { CanvasDeleteProjectsDialog } from "../canvas/components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "../canvas/components/canvas-project-card";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useCanvasUiStore } from "../canvas/stores/use-canvas-ui-store";
import { filmCanvasProjects } from "../canvas/utils/canvas-project-domain";

export default function FilmPage() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const pageSize = 12;
    const hydrated = useCanvasStore((state) => state.hydrated);
    const allProjects = useCanvasStore((state) => state.projects);
    const projects = useMemo(() => filmCanvasProjects(allProjects), [allProjects]);
    const createFilmProject = useCanvasStore((state) => state.createFilmProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const filteredProjects = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return keyword ? projects.filter((project) => project.title.toLowerCase().includes(keyword)) : projects;
    }, [projects, query]);
    const maxPage = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
    const currentPage = Math.min(page, maxPage);
    const visibleProjects = filteredProjects.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const createAndEnter = () => {
        const titles = new Set(projects.map((project) => project.title));
        let title = "未命名影视画布";
        for (let index = 2; titles.has(title); index += 1) title = `未命名影视画布 ${index}`;
        router.push(`/film/studio/${createFilmProject(title)}`);
    };

    return (
        <main className="h-full overflow-auto bg-transparent text-foreground">
            <div className="page-shell relative isolate flex flex-col gap-7 py-10 sm:py-12">
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[400px] overflow-hidden">
                    <PunkAura className="punk-aura opacity-40" />
                </div>
                <PageHeader
                    eyebrow="影视创作"
                    title="影视项目"
                    description="每个影视项目是一份画布文档：剧本、场次、镜头、资产与输出都在节点和边上，按导演板、镜头表、故事板或上下文查看。"
                    meta={
                        <>
                            <span className="chip chip-acid">{projects.length} 个项目</span>
                            <span className="chip">本地优先</span>
                        </>
                    }
                    actions={
                        <>
                            <Button icon={<Library className="size-4" />} onClick={() => router.push("/film/library")}>角色与场景库</Button>
                            <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>新建影视画布</Button>
                        </>
                    }
                />

                {projects.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <Input.Search allowClear placeholder="搜索影视项目" className="w-full max-w-sm" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">{filteredProjects.length} / {projects.length}</span>
                    </div>
                ) : null}

                {selectedIds.length ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-acid/30 bg-acid/[0.06] px-4 py-2.5">
                        <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono tracking-[0.14em] text-acid uppercase">SELECTED</span>
                            <span className="text-muted-foreground">已选 {selectedIds.length} 个项目</span>
                        </div>
                        <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => setDeleteIds(selectedIds)}>删除选中</Button>
                    </div>
                ) : projects.length ? (
                    <div className="flex items-center gap-3">
                        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">按最近更新排序</p>
                        <span aria-hidden className="h-3 w-px bg-border" />
                        <Button size="small" type="text" danger className="!h-6 !px-1.5 !text-[11px]" disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>删除全部</Button>
                    </div>
                ) : null}

                {!hydrated ? (
                    <LoadingState className="min-h-[360px] rounded-xl border border-dashed border-border" label="正在加载影视项目" />
                ) : filteredProjects.length ? (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {visibleProjects.map((project, index) => (
                                <CanvasProjectCard key={project.id} project={project} index={index} basePath="/film/studio" />
                            ))}
                        </div>
                        {filteredProjects.length > pageSize ? <Pagination className="justify-center" current={currentPage} pageSize={pageSize} total={filteredProjects.length} showSizeChanger={false} onChange={setPage} /> : null}
                    </>
                ) : (
                    <EmptyState
                        className="min-h-[360px] rounded-xl border border-dashed border-border bg-card/40"
                        title={projects.length ? "没有匹配的影视项目" : "还没有影视项目"}
                        description={projects.length ? "调整搜索关键词后再试。" : "新建影视画布后，从剧本、场次和镜头开始搭建项目。"}
                        action={projects.length ? <Button onClick={() => { setQuery(""); setPage(1); }}>清空搜索</Button> : <Button type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>新建影视画布</Button>}
                    />
                )}
            </div>
            <CanvasDeleteProjectsDialog />
        </main>
    );
}
