"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { App, Button, Input, Modal } from "antd";
import { Clapperboard, Library, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useFilmStore } from "./stores/use-film-store";
import type { FilmProject } from "./types";
import { countFilmScenes, countReadyShots, flattenFilmShots } from "./utils/parse-script";

const STAGE_LABEL: Record<FilmProject["stage"], string> = {
    script: "剧本",
    cast: "角色与场景",
    storyboard: "导演台",
    edit: "剪辑",
};

export default function FilmListPage() {
    const router = useRouter();
    const { message, modal } = App.useApp();
    const hydrated = useFilmStore((state) => state.hydrated);
    const projects = useFilmStore((state) => state.projects);
    const createProject = useFilmStore((state) => state.createProject);
    const deleteProjects = useFilmStore((state) => state.deleteProjects);
    const [createOpen, setCreateOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [visualStyle, setVisualStyle] = useState("");

    const ordered = useMemo(() => [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [projects]);
    const totalShots = projects.reduce((total, project) => total + flattenFilmShots(project.episodes).length, 0);

    const create = () => {
        if (!title.trim()) {
            message.warning("先给项目起个名字");
            return;
        }
        const id = createProject(title, visualStyle);
        setCreateOpen(false);
        setTitle("");
        setVisualStyle("");
        router.push(`/film/${id}`);
    };

    const confirmDelete = (project: FilmProject) => {
        modal.confirm({
            title: `删除「${project.title}」？`,
            content: "剧本、角色和分镜数据会一起删除，无法恢复。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => deleteProjects([project.id]),
        });
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <PageHeader
                        eyebrow="FILM / 影视"
                        title="我的影视项目"
                        description="剧本、角色与场景、分镜到成片，按项目推进的影视创作工作台。"
                        meta={
                            <>
                                <span className="chip chip-acid">{projects.length} 个项目</span>
                                <span className="chip">{totalShots} 个分镜</span>
                            </>
                        }
                        actions={
                            <>
                                <Button icon={<Library className="size-4" />} href="/film/library">
                                    角色与场景库
                                </Button>
                                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                                    新建项目
                                </Button>
                            </>
                        }
                    />

                    {!hydrated ? <LoadingState label="正在加载影视项目" /> : null}

                    {hydrated && ordered.length === 0 ? (
                        <EmptyState
                            title="还没有影视项目"
                            description="新建一个项目，从粘贴剧本或手动添加分镜开始；项目会自动保存在本地。"
                            icon={<Clapperboard className="size-6" />}
                            action={
                                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                                    新建项目
                                </Button>
                            }
                        />
                    ) : null}

                    {hydrated && ordered.length > 0 ? (
                        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {ordered.map((project, index) => {
                                const shots = flattenFilmShots(project.episodes);
                                const ready = countReadyShots(project.episodes);
                                const progress = shots.length ? Math.round((ready / shots.length) * 100) : 0;
                                return (
                                    <article
                                        key={project.id}
                                        role="link"
                                        tabIndex={0}
                                        onClick={() => router.push(`/film/${project.id}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                router.push(`/film/${project.id}`);
                                            }
                                        }}
                                        className="punk-card brackets group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card/60 transition-colors hover:border-acid/40"
                                    >
                                        <div className="relative h-28 overflow-hidden border-b border-border/60 bg-background/40">
                                            <span aria-hidden className="absolute -right-2 -top-6 font-mono text-[96px] font-bold leading-none text-foreground/[0.04] tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                                            <div className="absolute left-4 top-4 grid size-10 place-items-center rounded-[6px] border border-border bg-card text-foreground/70">
                                                <Clapperboard className="size-[18px]" />
                                            </div>
                                            <span className="chip chip-acid absolute bottom-3 left-4">{STAGE_LABEL[project.stage]}</span>
                                            {project.visualStyle ? <span className="chip absolute bottom-3 right-3 max-w-[45%] truncate">{project.visualStyle}</span> : null}
                                        </div>
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">{project.title}</h2>
                                                <button
                                                    type="button"
                                                    aria-label={`删除 ${project.title}`}
                                                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-hot/10 hover:text-hot"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        confirmDelete(project);
                                                    }}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                            <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground/70 uppercase">
                                                {project.episodes.length} 集 · {countFilmScenes(project.episodes)} 场 · {shots.length} 镜
                                            </p>
                                            <div className="mt-4 h-1 overflow-hidden rounded-full bg-border/60">
                                                <span className="block h-full rounded-full bg-acid transition-[width]" style={{ width: `${progress}%` }} />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground/70">
                                                <span>{ready}/{shots.length} 个分镜完成</span>
                                                <span className="tabular-nums">{dayjs(project.updatedAt).format("MM-DD HH:mm")}</span>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </section>
                    ) : null}
                </div>
            </main>

            <Modal title="新建影视项目" open={createOpen} okText="创建" cancelText="取消" onOk={create} onCancel={() => setCreateOpen(false)} destroyOnHidden>
                <div className="grid gap-4 py-2">
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">项目名称</span>
                        <Input autoFocus value={title} placeholder="例如：灌篮少女" onChange={(event) => setTitle(event.target.value)} onPressEnter={create} />
                    </label>
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视觉风格（可选）</span>
                        <Input value={visualStyle} placeholder="例如：日式 3D 渲染 2D" onChange={(event) => setVisualStyle(event.target.value)} />
                    </label>
                </div>
            </Modal>
        </div>
    );
}
