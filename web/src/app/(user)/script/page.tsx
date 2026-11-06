"use client";

import { useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import Link from "next/link";
import { App, Button, Input, Modal, Select } from "antd";
import { ArrowUpRight, Download, FileUp, Plus, ScrollText, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { FilmAmbient } from "../film/components/film-ambient";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import type { ScriptFormat, ScriptProject } from "./types";
import { useScriptStore } from "./stores/use-script-store";
import { SCRIPT_FORMAT_OPTIONS, exportScriptText, scriptPageCount, scriptWordCount } from "./utils/script-project";
import { scriptProjectFromFile, scriptProjectFromText } from "./utils/script-import";

const formatLabel = (format: ScriptFormat) => SCRIPT_FORMAT_OPTIONS.find((item) => item.value === format)?.label || "电影";

export default function ScriptListPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const projects = useScriptStore((state) => state.projects);
    const hydrated = useScriptStore((state) => state.hydrated);
    const createProject = useScriptStore((state) => state.createProject);
    const importProject = useScriptStore((state) => state.importProject);
    const deleteProjects = useScriptStore((state) => state.deleteProjects);
    const importFileRef = useRef<HTMLInputElement>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [format, setFormat] = useState<ScriptFormat>("film");
    const [genre, setGenre] = useState("");
    const [logline, setLogline] = useState("");
    const [importOpen, setImportOpen] = useState(false);
    const [importTitle, setImportTitle] = useState("");
    const [importText, setImportText] = useState("");
    const [importFileName, setImportFileName] = useState("");
    const [importPreview, setImportPreview] = useState<ScriptProject | null>(null);
    const [importing, setImporting] = useState(false);
    const [deletingProject, setDeletingProject] = useState<ScriptProject | null>(null);

    const ordered = useMemo(() => [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [projects]);
    const totalScenes = projects.reduce((total, project) => total + project.scenes.length, 0);
    const totalWords = projects.reduce((total, project) => total + scriptWordCount(project), 0);

    const create = () => {
        if (!title.trim()) {
            message.warning("先给剧本起个名字");
            return;
        }
        const id = createProject({ title, format, genre, logline });
        setCreateOpen(false);
        setTitle("");
        setGenre("");
        setLogline("");
        router.push(`/script/${id}`);
    };

    const parseImport = (text: string, nextTitle: string) => {
        if (!text.trim()) {
            message.warning("先粘贴或导入一份剧本");
            return;
        }
        try {
            const project = scriptProjectFromText(text, nextTitle || "未命名剧本");
            setImportPreview(project);
            if (!nextTitle.trim()) setImportTitle(project.title);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本解析失败");
        }
    };

    const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setImporting(true);
        try {
            const project = await scriptProjectFromFile(file, importTitle);
            setImportPreview(project);
            setImportFileName(file.name);
            setImportTitle((current) => current || file.name.replace(/\.[^.]+$/, ""));
            message.success(`已解析 ${project.scenes.length} 场`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "文件解析失败");
        } finally {
            setImporting(false);
        }
    };

    const confirmImport = () => {
        if (!importPreview) return;
        importProject({ ...importPreview, title: importTitle.trim() || importPreview.title });
        const id = importPreview.id;
        setImportOpen(false);
        setImportPreview(null);
        setImportText("");
        setImportFileName("");
        message.success("剧本已导入");
        router.push(`/script/${id}`);
    };

    const exportProject = (project: ScriptProject) => {
        const blob = new Blob([exportScriptText(project)], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${project.title || "剧本"}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        message.success("剧本已导出");
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <div className="relative">
                        <FilmAmbient className="-inset-x-6 -top-10 h-[340px] opacity-80 sm:-inset-x-10" />
                        <div className="relative">
                    <PageHeader
                        eyebrow="SCRIPT / 剧本"
                        title="AI 剧本创作"
                        description="先写故事，再写剧本：用故事圣经、人物引擎、结构板和场景卡，把想法推进成可拍摄的舞台。"
                        meta={
                            <>
                                <span className="chip">{projects.length} 个剧本</span>
                                <span className="chip">{totalScenes} 场</span>
                                <span className="chip">{totalWords.toLocaleString()} 字</span>
                            </>
                        }
                        actions={
                            <>
                                <Button icon={<FileUp className="size-4" />} onClick={() => setImportOpen(true)}>导入剧本</Button>
                                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>新建剧本</Button>
                            </>
                        }
                    />
                        </div>
                    </div>

                    {!hydrated ? <LoadingState label="正在加载剧本" /> : null}

                    {hydrated && projects.length === 0 ? (
                        <EmptyState
                            title="还没有剧本"
                            description="从一句 logline 开始，先写故事，再把场次和人物推进成剧本。"
                            icon={<ScrollText className="size-6" />}
                            action={<Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>新建第一个剧本</Button>}
                        />
                    ) : null}

                    {hydrated && projects.length > 0 ? (
                        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {ordered.map((project, index) => (
                                <article key={project.id} style={{ "--enter-index": Math.min(index, 12) } as CSSProperties} className="punk-card enter-up group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                                    <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-acid/50 via-border/60 to-transparent" />
                                    <Link href={`/script/${project.id}`} className="flex flex-1 flex-col p-5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                                            <span className="chip">{formatLabel(project.format)}</span>
                                            {project.genre ? <span className="chip">{project.genre}</span> : null}
                                            <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground/30 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-acid" />
                                        </div>
                                        <h2 className="mt-4 line-clamp-1 text-base font-semibold text-foreground">{project.title}</h2>
                                        <p className="mt-1.5 line-clamp-2 min-h-10 text-[11px] leading-5 text-muted-foreground">
                                            {project.logline || project.synopsis || "还没有写 logline，点开先把一句话故事写下来。"}
                                        </p>
                                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-5 font-mono text-[10px] text-muted-foreground/60">
                                            <span>{project.scenes.length} 场</span>
                                            <span>{project.characters.length} 角色</span>
                                            <span>{scriptWordCount(project).toLocaleString()} 字</span>
                                            <span>约 {scriptPageCount(project)} 页</span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[9px] text-muted-foreground/50">
                                            <span className={project.status === "locked" ? "text-acid/80" : ""}>{project.status === "locked" ? "已锁定" : "草稿"}{project.filmProjectId ? " · 已转分镜" : ""}</span>
                                            <span>{dayjs(project.updatedAt).format("MM-DD HH:mm")}</span>
                                        </div>
                                    </Link>
                                    <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                                        <button type="button" aria-label="导出剧本" title="导出剧本" className="grid size-6 place-items-center rounded text-muted-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={(event) => { event.preventDefault(); exportProject(project); }}>
                                            <Download className="size-3" />
                                        </button>
                                        <button type="button" aria-label="删除剧本" title="删除剧本" className="grid size-6 place-items-center rounded text-muted-foreground/40 transition-colors hover:bg-hot/10 hover:text-hot" onClick={(event) => { event.preventDefault(); setDeletingProject(project); }}>
                                            <Trash2 className="size-3" />
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </section>
                    ) : null}
                </div>
            </main>

            <input ref={importFileRef} hidden type="file" accept=".txt,.md,.docx,.fountain,.fdx" onChange={(event) => void onImportFile(event)} />

            <Modal
                title="新建剧本"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={create}
                okText="开始写"
                cancelText="取消"
                destroyOnHidden
            >
                <div className="grid gap-3 py-1">
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">剧名</span>
                        <Input autoFocus value={title} placeholder="例如：东京不太热" onChange={(event) => setTitle(event.target.value)} onPressEnter={create} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1">
                            <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">类型</span>
                            <Select value={format} options={SCRIPT_FORMAT_OPTIONS} onChange={(value: ScriptFormat) => setFormat(value)} />
                        </label>
                        <label className="grid gap-1">
                            <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">题材（可选）</span>
                            <Input value={genre} placeholder="爱情 / 悬疑 / 科幻" onChange={(event) => setGenre(event.target.value)} />
                        </label>
                    </div>
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">一句话故事（可选）</span>
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={logline} placeholder="谁，想要什么，被什么阻止，失败会怎样。" onChange={(event) => setLogline(event.target.value)} />
                    </label>
                </div>
            </Modal>

            <Modal
                title="导入剧本"
                open={importOpen}
                onCancel={() => setImportOpen(false)}
                onOk={confirmImport}
                okText={importPreview ? "导入并打开" : "先解析"}
                okButtonProps={{ disabled: !importPreview }}
                cancelText="取消"
                width={760}
                destroyOnHidden
            >
                <div className="grid gap-3 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="small" icon={<FileUp className="size-3.5" />} loading={importing} onClick={() => importFileRef.current?.click()}>选择文件</Button>
                        <span className="text-[11px] text-muted-foreground/60">支持 txt / md / docx / fountain / fdx，也可以直接粘贴</span>
                        {importFileName ? <span className="chip">{importFileName}</span> : null}
                    </div>
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">剧名</span>
                        <Input value={importTitle} placeholder="导入后使用的剧名" onChange={(event) => setImportTitle(event.target.value)} />
                    </label>
                    <Input.TextArea autoSize={{ minRows: 8, maxRows: 16 }} value={importText} placeholder="粘贴剧本正文，点下方「解析预览」" onChange={(event) => { setImportText(event.target.value); setImportPreview(null); }} />
                    <div className="flex items-center gap-2">
                        <Button size="small" onClick={() => parseImport(importText, importTitle)}>解析预览</Button>
                        {importPreview ? <span className="text-[11px] text-acid">已识别 {importPreview.scenes.length} 场 · {importPreview.characters.length} 个角色</span> : null}
                    </div>
                    {importPreview ? (
                        <div className="thin-scrollbar grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-border/60 bg-background/30 p-2">
                            {importPreview.scenes.slice(0, 8).map((scene) => (
                                <div key={scene.id} className="flex items-center gap-2 text-[11px]">
                                    <span className="font-mono text-[9px] text-muted-foreground/50">{String(scene.no).padStart(2, "0")}</span>
                                    <span className="truncate text-foreground/80">{scene.interiorExterior} {scene.location} {scene.timeOfDay}</span>
                                </div>
                            ))}
                            {importPreview.scenes.length > 8 ? <span className="text-[10px] text-muted-foreground/50">还有 {importPreview.scenes.length - 8} 场…</span> : null}
                        </div>
                    ) : null}
                </div>
            </Modal>

            <Modal
                title="删除剧本"
                open={Boolean(deletingProject)}
                onCancel={() => setDeletingProject(null)}
                footer={null}
                width={420}
                centered
                destroyOnHidden
            >
                {deletingProject ? (
                    <div className="grid gap-4 pt-1">
                        <div className="flex items-start gap-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-hot/35 bg-hot/10 text-hot"><Trash2 className="size-5" /></span>
                            <div className="grid gap-1">
                                <h3 className="text-[15px] font-semibold leading-6 text-foreground">删除「{deletingProject.title}」？</h3>
                                <p className="text-[11px] leading-5 text-muted-foreground/80">故事、人物、场景卡和剧本正文会一起删除，无法恢复。</p>
                            </div>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-[10px] text-muted-foreground/70">
                            {deletingProject.scenes.length} 场 · {deletingProject.characters.length} 角色 · {scriptWordCount(deletingProject).toLocaleString()} 字
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button size="large" onClick={() => setDeletingProject(null)}>取消</Button>
                            <Button size="large" type="primary" danger onClick={() => { deleteProjects([deletingProject.id]); setDeletingProject(null); message.success("剧本已删除"); }}>删除剧本</Button>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
