"use client";

import { useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { App, Button, Input, InputNumber, Modal, Select } from "antd";
import { Clapperboard, Download, Library, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { FilmAmbient } from "@/components/film/film-ambient";
import { LocalSaveIndicator } from "@/components/film/local-save-indicator";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useDownloadFile } from "@/hooks/use-download-file";
import { useFilmStore } from "@/stores/use-film-store";
import { useFilmDeleteConfirm } from "./hooks/use-film-delete-confirm";
import type { FilmAspect, FilmProject, FilmStylePresetId } from "@/lib/film/types";
import { DEFAULT_FILM_ASPECT, FILM_ASPECT_OPTIONS, filmAspectLabel } from "@/lib/film/film-aspects";
import { DEFAULT_DIRECTOR_STYLE_ID, DIRECTOR_STYLES, directorStyleLabel } from "@/lib/film/director-styles";
import { DEFAULT_FILM_STYLE, FILM_STYLE_PRESETS, filmStyleLabel } from "@/lib/film/film-styles";
import { parseFilmProjectBackup, serializeFilmProject } from "./utils/film-backup";
import { countFilmScenes, countReadyShots, flattenFilmShots } from "./utils/parse-script";
import { errorMessage } from "@/lib/utils";

const STAGE_LABEL: Record<FilmProject["stage"], string> = {
    script: "剧本",
    cast: "角色与场景",
    storyboard: "导演台",
    edit: "剪辑",
};

export default function FilmListPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const hydrated = useFilmStore((state) => state.hydrated);
    const projects = useFilmStore((state) => state.projects);
    const createProject = useFilmStore((state) => state.createProject);
    const importProject = useFilmStore((state) => state.importProject);
    const updateProject = useFilmStore((state) => state.updateProject);
    const deleteProjects = useFilmStore((state) => state.deleteProjects);
    const { confirmDelete } = useFilmDeleteConfirm();
    const downloadFile = useDownloadFile();
    const [createOpen, setCreateOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [visualStyle, setVisualStyle] = useState("");
    const [aspect, setAspect] = useState<FilmAspect>(DEFAULT_FILM_ASPECT);
    const [stylePreset, setStylePreset] = useState<FilmStylePresetId>(DEFAULT_FILM_STYLE);
    const [directorStyleId, setDirectorStyleId] = useState(DEFAULT_DIRECTOR_STYLE_ID);
    const [targetDuration, setTargetDuration] = useState<number | undefined>(undefined);
    const [renameTarget, setRenameTarget] = useState<FilmProject | null>(null);
    const [renameTitle, setRenameTitle] = useState("");
    const importInputRef = useRef<HTMLInputElement>(null);

    const ordered = useMemo(() => [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [projects]);
    const totalShots = projects.reduce((total, project) => total + flattenFilmShots(project.episodes).length, 0);
    const totalScenes = projects.reduce((total, project) => total + countFilmScenes(project.episodes), 0);
    const totalReady = projects.reduce((total, project) => total + countReadyShots(project.episodes), 0);
    const readyRate = totalShots ? Math.round((totalReady / totalShots) * 100) : 0;

    const create = () => {
        if (!title.trim()) {
            message.warning("先给项目起个名字");
            return;
        }
        const id = createProject(title, visualStyle, aspect, stylePreset);
        updateProject(id, { directorStyleId, targetDuration });
        setCreateOpen(false);
        setTitle("");
        setVisualStyle("");
        setAspect(DEFAULT_FILM_ASPECT);
        setStylePreset(DEFAULT_FILM_STYLE);
        setDirectorStyleId(DEFAULT_DIRECTOR_STYLE_ID);
        setTargetDuration(undefined);
        router.push(`/film/${id}`);
    };

    const confirmDeleteProject = (project: FilmProject) => {
        const shots = flattenFilmShots(project.episodes);
        confirmDelete({
            title: `删除「${project.title}」？`,
            description: "剧本、角色和分镜数据会一起删除，无法恢复。",
            detail: `${project.episodes.length} 集 · ${countFilmScenes(project.episodes)} 场 · ${shots.length} 镜 · ${(project.characters || []).length} 角色 · ${(project.locations || []).length} 场景`,
            confirmText: "删除项目",
            onConfirm: () => {
                deleteProjects([project.id]);
                message.success(`已删除「${project.title}」`);
            },
        });
    };

    const openRename = (project: FilmProject) => {
        setRenameTarget(project);
        setRenameTitle(project.title);
    };

    const saveRename = () => {
        if (!renameTarget) return;
        const nextTitle = renameTitle.trim();
        if (!nextTitle) {
            message.warning("项目名称不能为空");
            return;
        }
        updateProject(renameTarget.id, { title: nextTitle });
        setRenameTarget(null);
    };

    const exportProject = (project: FilmProject) => {
        downloadFile(new Blob([serializeFilmProject(project)], { type: "application/json" }), `${project.title || "影视项目"}.json`);
        message.success("项目备份已导出");
    };

    const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            const project = parseFilmProjectBackup(await file.text());
            importProject(project);
            message.success(`已导入「${project.title}」`);
        } catch (error) {
            message.error(errorMessage(error, "导入失败"));
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <div className="relative">
                        <FilmAmbient className="-inset-x-6 -top-10 h-[380px] opacity-90 sm:-inset-x-10" />
                        <div className="relative">
                            <PageHeader
                                eyebrow="FILM / 影视"
                                title="我的影视项目"
                                description="剧本、角色与场景、分镜到成片，按项目推进的影视创作工作台；数据仅保存在本机浏览器。"
                                meta={
                                    <>
                                        <span className="chip chip-acid inline-flex items-center gap-1.5"><span className="punk-signal" aria-hidden />{projects.length} 个项目</span>
                                        <span className="chip">{totalShots} 个分镜</span>
                                        <span className="chip">{readyRate}% 完成</span>
                                        <LocalSaveIndicator className="self-center" />
                                    </>
                                }
                                actions={
                                    <>
                                        <Button icon={<Upload className="size-4" />} onClick={() => importInputRef.current?.click()}>
                                            导入项目
                                        </Button>
                                        <Button icon={<Library className="size-4" />} href="/film/library">
                                            角色与场景库
                                        </Button>
                                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                                            新建项目
                                        </Button>
                                    </>
                                }
                            />
                        </div>
                    </div>

                    {hydrated && ordered.length > 0 ? (
                        <section className="grid gap-3 sm:grid-cols-3">
                            {[
                                { label: "项目", value: String(projects.length), hint: "进行中的影视项目" },
                                { label: "场次", value: String(totalScenes), hint: "已拆解的场景" },
                                { label: "分镜完成", value: `${readyRate}%`, hint: `${totalReady} / ${totalShots} 镜已出图或视频` },
                            ].map((item, index) => (
                                <div key={item.label} className="film-card-hover punk-card enter-up relative overflow-hidden rounded-xl border border-border/70 bg-card/40 px-4 py-3.5" style={{ "--enter-index": index } as CSSProperties}>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">{item.label}</span>
                                        <span className="font-mono text-[26px] font-semibold leading-none tabular-nums text-foreground">{item.value}</span>
                                    </div>
                                    <p className="mt-2 text-[10px] leading-5 text-muted-foreground/65">{item.hint}</p>
                                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/50 via-acid/15 to-transparent" />
                                </div>
                            ))}
                        </section>
                    ) : null}

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
                                        className="film-card-hover punk-card brackets enter-up group relative cursor-pointer overflow-hidden rounded-xl border border-border/70 bg-card/60"
                                        style={{ "--enter-index": Math.min(index, 12) } as CSSProperties}
                                    >
                                        <div className="film-cover-grid relative h-32 overflow-hidden border-b border-border/60 bg-background/40">
                                            <div aria-hidden className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-80" style={{ backgroundImage: "radial-gradient(ellipse at 20% 0%, color-mix(in oklch, var(--acid) 10%, transparent), transparent 62%)" }} />
                                            <span aria-hidden className="absolute font-mono font-bold tabular-nums" style={{ right: -8, top: -32, fontSize: 112, lineHeight: 1, color: "color-mix(in oklch, var(--foreground) 5%, transparent)" }}>{String(index + 1).padStart(2, "0")}</span>
                                            <div className="absolute left-4 top-4 grid size-10 place-items-center rounded-lg border border-border/70 bg-card/80 text-foreground/60 backdrop-blur-sm transition-colors duration-300 group-hover:border-acid/40 group-hover:text-acid/80">
                                                <Clapperboard className="size-[18px]" />
                                            </div>
                                            <span className="chip chip-acid absolute bottom-3 left-4 inline-flex items-center gap-1.5"><span className="punk-signal" aria-hidden />{STAGE_LABEL[project.stage]}</span>
                                            {project.stylePreset && project.stylePreset !== "custom" ? (
                                                <span className="chip absolute bottom-3 right-3 max-w-[45%] truncate">{filmStyleLabel(project.stylePreset)}</span>
                                            ) : project.visualStyle ? (
                                                <span className="chip absolute bottom-3 right-3 max-w-[45%] truncate">{project.visualStyle}</span>
                                            ) : null}
                                        </div>
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">{project.title}</h2>
                                                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                                                    <button
                                                        type="button"
                                                        aria-label={`重命名 ${project.title}`}
                                                        className="grid size-7 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            openRename(project);
                                                        }}
                                                    >
                                                        <Pencil className="size-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label={`导出 ${project.title}`}
                                                        className="grid size-7 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            exportProject(project);
                                                        }}
                                                    >
                                                        <Download className="size-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label={`删除 ${project.title}`}
                                                        className="grid size-7 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-hot/10 hover:text-hot"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            confirmDeleteProject(project);
                                                        }}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            {directorStyleLabel(project.directorStyleId) || project.targetDuration ? (
                                                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                                    {directorStyleLabel(project.directorStyleId) ? <span className="chip">{directorStyleLabel(project.directorStyleId)}</span> : null}
                                                    {project.targetDuration ? <span className="chip">目标 {project.targetDuration} 秒</span> : null}
                                                </div>
                                            ) : null}
                                            <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground/70 uppercase">
                                                {project.episodes.length} 集 · {countFilmScenes(project.episodes)} 场 · {shots.length} 镜 · {filmAspectLabel(project.aspect)}
                                            </p>
                                            <div className="mt-4 h-1 overflow-hidden rounded-full bg-border/60">
                                                <span className={`block h-full rounded-full bg-acid transition-[width] ${progress > 0 && progress < 100 ? "film-shimmer" : ""}`} style={{ width: `${progress}%` }} />
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

            <input ref={importInputRef} hidden type="file" accept="application/json,.json" onChange={onImportFile} />
            <Modal title="重命名项目" open={Boolean(renameTarget)} okText="保存" cancelText="取消" onOk={saveRename} onCancel={() => setRenameTarget(null)} destroyOnHidden>
                <label className="grid gap-1.5 py-2">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">项目名称</span>
                    <Input autoFocus value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} onPressEnter={saveRename} />
                </label>
            </Modal>
            <Modal title="新建影视项目" open={createOpen} okText="创建" cancelText="取消" onOk={create} onCancel={() => setCreateOpen(false)} destroyOnHidden>
                <div className="grid gap-4 py-2">
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">项目名称</span>
                        <Input autoFocus value={title} placeholder="例如：灌篮少女" onChange={(event) => setTitle(event.target.value)} onPressEnter={create} />
                    </label>
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">画面画幅</span>
                        <Select value={aspect} options={FILM_ASPECT_OPTIONS} onChange={(value: FilmAspect) => setAspect(value)} />
                    </label>
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视觉风格预设</span>
                        <Select
                            value={stylePreset}
                            options={FILM_STYLE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
                            onChange={(value: FilmStylePresetId) => setStylePreset(value)}
                        />
                    </label>
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">风格补充（可选）</span>
                        <Input value={visualStyle} placeholder="例如：低饱和、冷色调、颗粒感" onChange={(event) => setVisualStyle(event.target.value)} />
                    </label>
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">导演风格</span>
                        <Select
                            value={directorStyleId}
                            options={DIRECTOR_STYLES.map((style) => ({ value: style.id, label: `${style.name} · ${style.tagline}` }))}
                            onChange={(value: string) => setDirectorStyleId(value)}
                        />
                    </label>
                    <label className="grid gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">目标时长（可选）</span>
                        <InputNumber className="!w-full" min={1} max={7200} placeholder="成片目标秒数，例如 180" addonAfter="秒" value={targetDuration} onChange={(value) => setTargetDuration(typeof value === "number" ? value : undefined)} />
                    </label>
                </div>
            </Modal>
        </div>
    );
}
