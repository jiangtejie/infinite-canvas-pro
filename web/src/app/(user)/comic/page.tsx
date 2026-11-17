"use client";

import { useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { App, Button, Input, Modal, Select } from "antd";
import { BookOpen, Download, Library, Pencil, Plus, Upload, X } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LocalSaveIndicator } from "@/components/film/local-save-indicator";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useDownloadFile } from "@/hooks/use-download-file";
import { errorMessage } from "@/lib/utils";
import { useComicStore } from "./stores/use-comic-store";
import type { ComicDirection, ComicFormat, ComicProject } from "./types";
import { comicStageLabel, comicStats, parseComicProjectBackup, serializeComicProject } from "./utils/comic-project";

const FORMAT_OPTIONS: { value: ComicFormat; label: string }[] = [
    { value: "page", label: "页漫" },
    { value: "strip", label: "条漫" },
];

const DIRECTION_OPTIONS: { value: ComicDirection; label: string }[] = [
    { value: "rtl", label: "右 → 左" },
    { value: "ltr", label: "左 → 右" },
];

export default function ComicListPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const confirm = useConfirm();
    const downloadFile = useDownloadFile();
    const hydrated = useComicStore((state) => state.hydrated);
    const projects = useComicStore((state) => state.projects);
    const createProject = useComicStore((state) => state.createProject);
    const importProject = useComicStore((state) => state.importProject);
    const updateProject = useComicStore((state) => state.updateProject);
    const deleteProjects = useComicStore((state) => state.deleteProjects);
    const importInputRef = useRef<HTMLInputElement>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [genre, setGenre] = useState("");
    const [audience, setAudience] = useState("");
    const [format, setFormat] = useState<ComicFormat>("page");
    const [direction, setDirection] = useState<ComicDirection>("rtl");
    const [logline, setLogline] = useState("");
    const [renameTarget, setRenameTarget] = useState<ComicProject | null>(null);
    const [renameTitle, setRenameTitle] = useState("");

    const ordered = useMemo(() => [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [projects]);
    const totals = useMemo(() => projects.reduce((sum, project) => {
        const stats = comicStats(project);
        return { chapters: sum.chapters + stats.chapters, pages: sum.pages + stats.pages, panels: sum.panels + stats.panels };
    }, { chapters: 0, pages: 0, panels: 0 }), [projects]);

    const create = () => {
        if (!title.trim()) return void message.warning("先给漫画起个名字");
        const id = createProject({ title, genre, audience, format, direction, logline });
        setCreateOpen(false);
        setTitle(""); setGenre(""); setAudience(""); setLogline("");
        router.push(`/comic/${id}`);
    };

    const exportProject = (project: ComicProject) => {
        downloadFile(new Blob([serializeComicProject(project)], { type: "application/json" }), `${project.title || "漫画项目"}.json`);
        message.success("项目备份已导出");
    };

    const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            const project = parseComicProjectBackup(await file.text());
            importProject(project);
            message.success(`已导入「${project.title}」`);
        } catch (error) {
            message.error(errorMessage(error, "导入失败"));
        }
    };

    const deleteProject = async (project: ComicProject) => {
        const stats = comicStats(project);
        const accepted = await confirm({
            title: `删除「${project.title}」？`,
            description: "企划、章节、页格会一起删除，无法恢复。",
            confirmText: "删除项目",
            tone: "danger",
        });
        if (!accepted) return;
        deleteProjects([project.id]);
        message.success(`已删除「${project.title}」（${stats.pages} 页）`);
    };

    const saveRename = () => {
        if (!renameTarget) return;
        if (!renameTitle.trim()) return void message.warning("项目名称不能为空");
        updateProject(renameTarget.id, { title: renameTitle.trim() });
        setRenameTarget(null);
    };

    return (
        <main className="min-h-0 flex-1 overflow-y-auto bg-transparent text-foreground">
            <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                <PageHeader
                    eyebrow="创作工作台"
                    title="漫画工作台"
                    description="企划、剧本、页格到成书，按职业漫画流程推进的项目工作台；本批先做项目壳与企划/剧本，数据暂存本机浏览器。"
                    meta={
                        <>
                            <span className="chip chip-acid inline-flex items-center gap-1.5"><BookOpen className="size-3" />{projects.length} 个项目</span>
                            <span className="chip">{totals.chapters} 章</span>
                            <span className="chip">{totals.pages} 页</span>
                            <span className="chip">{totals.panels} 格</span>
                            <LocalSaveIndicator className="self-center" />
                        </>
                    }
                    actions={
                        <>
                            <Button href="/comic/library" icon={<Library className="size-4" />}>角色与场景库</Button>
                            <Button icon={<Upload className="size-4" />} onClick={() => importInputRef.current?.click()}>导入项目</Button>
                            <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>新建漫画</Button>
                        </>
                    }
                />

                {!hydrated ? <LoadingState label="正在加载漫画项目" /> : null}
                {hydrated && !ordered.length ? (
                    <EmptyState
                        title="还没有漫画项目"
                        description="新建后从企划开始：先定题材、受众和风格，再拆章节与页格。"
                        icon={<BookOpen className="size-6" />}
                        action={<Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>新建漫画</Button>}
                    />
                ) : null}

                {hydrated && ordered.length ? (
                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {ordered.map((project, index) => {
                            const stats = comicStats(project);
                            return (
                                <article key={project.id} role="link" tabIndex={0} onClick={() => router.push(`/comic/${project.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/comic/${project.id}`); } }} className="film-card-hover punk-card brackets enter-up group relative cursor-pointer overflow-hidden rounded-xl border border-border/70 bg-card/60" style={{ "--enter-index": Math.min(index, 12) } as CSSProperties}>
                                    <div className="relative h-28 overflow-hidden border-b border-border/60 bg-background/40">
                                        <span aria-hidden className="absolute font-mono font-bold tabular-nums" style={{ right: -6, top: -30, fontSize: 108, lineHeight: 1, color: "color-mix(in oklch, var(--foreground) 5%, transparent)" }}>{String(index + 1).padStart(2, "0")}</span>
                                        <div className="absolute left-4 top-4 grid size-10 place-items-center rounded-lg border border-border/70 bg-card/80 text-foreground/60"><BookOpen className="size-[18px]" /></div>
                                        <span className="chip chip-acid absolute bottom-3 left-4">{comicStageLabel(project.stage)}</span>
                                        <span className="chip absolute bottom-3 right-3">{project.format === "strip" ? "条漫" : "页漫"} · {project.direction === "rtl" ? "右→左" : "左→右"}</span>
                                    </div>
                                    <div className="p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{project.title}</h2>
                                            <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                                                <button type="button" aria-label={`重命名 ${project.title}`} className="grid size-7 place-items-center rounded-md text-muted-foreground/60 hover:bg-foreground/5 hover:text-foreground" onClick={(event) => { event.stopPropagation(); setRenameTarget(project); setRenameTitle(project.title); }}><Pencil className="size-3.5" /></button>
                                                <button type="button" aria-label={`导出 ${project.title}`} className="grid size-7 place-items-center rounded-md text-muted-foreground/60 hover:bg-foreground/5 hover:text-foreground" onClick={(event) => { event.stopPropagation(); exportProject(project); }}><Download className="size-3.5" /></button>
                                                <button type="button" aria-label={`删除 ${project.title}`} className="grid size-7 place-items-center rounded-md text-muted-foreground/60 hover:bg-hot/10 hover:text-hot" onClick={(event) => { event.stopPropagation(); void deleteProject(project); }}><X className="size-3.5" /></button>
                                            </div>
                                        </div>
                                        <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground/75">{project.logline || project.synopsis || "还没有写 logline / 梗概"}</p>
                                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                            {project.genre ? <span className="chip">{project.genre}</span> : null}
                                            {project.audience ? <span className="chip">{project.audience}</span> : null}
                                            <span className="chip">{stats.chapters} 章 · {stats.pages} 页 · {stats.panels} 格</span>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground/55">
                                            <span className="font-mono uppercase tracking-[0.14em]">{dayjs(project.updatedAt).format("MM-DD HH:mm")}</span>
                                            <span>打开工作台 →</span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                ) : null}
            </div>

            <input ref={importInputRef} hidden type="file" accept=".json,application/json" onChange={(event) => void onImportFile(event)} />

            <Modal title="新建漫画" open={createOpen} width={560} mask={{ closable: false }} onCancel={() => setCreateOpen(false)} onOk={create} okText="创建并进入" cancelText="取消">
                <div className="space-y-4 py-1">
                    <label className="block space-y-1.5 text-sm"><span>项目名称</span><Input autoFocus value={title} maxLength={100} placeholder="如：桂林两天" onChange={(event) => setTitle(event.target.value)} /></label>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1.5 text-sm"><span>题材 / 类型</span><Input value={genre} maxLength={100} placeholder="如：都市、悬疑、美食" onChange={(event) => setGenre(event.target.value)} /></label>
                        <label className="block space-y-1.5 text-sm"><span>目标读者</span><Input value={audience} maxLength={100} placeholder="如：大学生、通勤读者" onChange={(event) => setAudience(event.target.value)} /></label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1.5 text-sm"><span>成品形态</span><Select className="w-full" value={format} options={FORMAT_OPTIONS} onChange={setFormat} /></label>
                        <label className="block space-y-1.5 text-sm"><span>阅读方向</span><Select className="w-full" value={direction} options={DIRECTION_OPTIONS} onChange={setDirection} /></label>
                    </div>
                    <label className="block space-y-1.5 text-sm"><span>一句话 logline</span><Input value={logline} maxLength={300} placeholder="用一句话说清主角、目标与冲突" onChange={(event) => setLogline(event.target.value)} /></label>
                </div>
            </Modal>

            <Modal title="重命名漫画" open={Boolean(renameTarget)} width={420} mask={{ closable: false }} onCancel={() => setRenameTarget(null)} onOk={saveRename} okText="保存" cancelText="取消">
                <Input autoFocus value={renameTitle} maxLength={100} onChange={(event) => setRenameTitle(event.target.value)} onPressEnter={saveRename} />
            </Modal>
        </main>
    );
}
