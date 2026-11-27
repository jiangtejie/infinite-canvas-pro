"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import Link from "next/link";
import { App, Button, Input, Modal, Select } from "antd";
import { ArrowUpRight, Download, FileUp, Plus, ScrollText, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { FilmAmbient } from "@/components/film/film-ambient";
import { LocalSaveIndicator } from "@/components/film/local-save-indicator";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useDownloadFile } from "@/hooks/use-download-file";
import { useUserStore } from "@/stores/use-user-store";
import type { ScriptFormat, ScriptProjectDocument, ScriptProjectSummary } from "./types";
import { hydrateScriptIndex, loadScriptProject, useScriptStore } from "./stores/use-script-store";
import { SCRIPT_FORMAT_OPTIONS } from "./utils/script-project";
import { exportScriptText } from "./utils/script-document";
import { scriptProjectFromFile, scriptProjectFromText } from "./utils/script-import";
import { errorMessage } from "@/lib/utils";

const formatLabel = (format: ScriptFormat) => SCRIPT_FORMAT_OPTIONS.find((item) => item.value === format)?.label || "电影";

export default function ScriptListPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const confirm = useConfirm();
    const downloadFile = useDownloadFile();
    const summaries = useScriptStore((state) => state.summaries);
    const userId = useUserStore((state) => state.user?.id || "");
    const importFileRef = useRef<HTMLInputElement>(null);
    const [ready, setReady] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [format, setFormat] = useState<ScriptFormat>("film");
    const [genre, setGenre] = useState("");
    const [logline, setLogline] = useState("");
    const [importOpen, setImportOpen] = useState(false);
    const [importTitle, setImportTitle] = useState("");
    const [importText, setImportText] = useState("");
    const [, setImportFileName] = useState("");
    const [importPreview, setImportPreview] = useState<ScriptProjectDocument | null>(null);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        setReady(false);
        void hydrateScriptIndex(userId || "guest").finally(() => setReady(true));
    }, [userId]);
    const ordered = useMemo(() => [...summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [summaries]);
    const totalScenes = summaries.reduce((total, project) => total + project.sceneCount, 0);
    const totalWords = summaries.reduce((total, project) => total + project.wordCount, 0);

    const create = async () => {
        if (!title.trim()) return message.warning("先给剧本起个名字");
        const id = await useScriptStore.getState().createProject({ title, format, genre, logline });
        setCreateOpen(false); setTitle(""); setGenre(""); setLogline(""); router.push(`/script/${id}`);
    };
    const parseImport = (text: string, nextTitle: string) => {
        if (!text.trim()) return message.warning("先粘贴或导入一份剧本");
        try { const project = scriptProjectFromText(text, nextTitle || "未命名剧本"); setImportPreview(project); if (!nextTitle.trim()) setImportTitle(project.title); }
        catch (error) { message.error(errorMessage(error, "剧本解析失败")); }
    };
    const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        setImporting(true);
        try { const project = await scriptProjectFromFile(file, importTitle); setImportPreview(project); setImportFileName(file.name); setImportTitle((current) => current || file.name.replace(/\.[^.]+$/, "")); message.success(`已解析 ${project.episodes.reduce((total, episode) => total + episode.scenes.length, 0)} 场`); }
        catch (error) { message.error(errorMessage(error, "文件解析失败")); } finally { setImporting(false); }
    };
    const confirmImport = async () => {
        if (!importPreview) return;
        const id = await useScriptStore.getState().importProject({ ...importPreview, title: importTitle.trim() || importPreview.title });
        setImportOpen(false); setImportPreview(null); setImportText(""); setImportFileName(""); router.push(`/script/${id}`);
    };
    const exportProject = async (project: ScriptProjectSummary) => {
        await loadScriptProject(project.id);
        const document = useScriptStore.getState().documents[project.id];
        if (!document) return message.error("剧本尚未加载");
        downloadFile(new Blob([exportScriptText(document)], { type: "text/plain;charset=utf-8" }), `${project.title || "剧本"}.txt`);
    };
    const removeProject = (project: ScriptProjectSummary) => {
        void confirm({ title: `删除「${project.title}」？`, description: "故事、人物、场次和全部版本会一起删除。", confirmText: "删除剧本", tone: "danger" }).then(async (ok) => {
            if (!ok) return;
            try { await useScriptStore.getState().deleteProjects([project.id]); message.success("剧本已删除"); } catch { message.error("删除未同步，已保留本机记录等待重试"); }
        });
    };
    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent"><div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                <div className="relative"><FilmAmbient className="-inset-x-6 -top-10 h-[340px] opacity-80 sm:-inset-x-10" /><div className="relative"><PageHeader eyebrow="创作工作台" title="剧本创作" description="用故事圣经、人物、结构和分场推进想法；本机自动保存，登录后同步到账号。" meta={<><span className="chip">{summaries.length} 个剧本</span><span className="chip">{totalScenes} 场</span><span className="chip">{totalWords.toLocaleString()} 字</span><LocalSaveIndicator className="self-center" /></>} actions={<><Button icon={<FileUp className="size-4" />} onClick={() => setImportOpen(true)}>导入剧本</Button><Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>新建剧本</Button></>} /></div></div>
                {!ready ? <LoadingState label="正在加载剧本" /> : null}
                {ready && !summaries.length ? <EmptyState title="还没有剧本" description="从一句 logline 开始，先写故事，再把场次和人物推进成剧本。" icon={<ScrollText className="size-6" />} action={<Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>新建第一个剧本</Button>} /> : null}
                {ready && summaries.length ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ordered.map((project, index) => <article key={project.id} style={{ "--enter-index": Math.min(index, 12) } as CSSProperties} className="film-card-hover punk-card enter-up group relative flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card">
                    <Link href={`/script/${project.id}`} className="flex flex-1 flex-col p-5"><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground/50">{String(index + 1).padStart(2, "0")}</span><span className="chip">{formatLabel(project.format)}</span>{project.genre ? <span className="chip">{project.genre}</span> : null}<ArrowUpRight className="ml-auto size-3.5 text-muted-foreground/30 group-hover:text-acid" /></div><h2 className="mt-3.5 line-clamp-1 text-[17px] font-semibold">{project.title}</h2><p className="mt-1.5 line-clamp-2 min-h-10 text-[11px] leading-5 text-muted-foreground">{project.logline || "还没有写 logline，点开先把一句话故事写下来。"}</p><div className="mt-auto flex flex-wrap gap-x-3 pt-5 font-mono text-[10px] text-muted-foreground/60"><span>{project.episodeCount} 集</span><span>{project.sceneCount} 场</span><span>{project.characterCount} 角色</span><span>{project.wordCount.toLocaleString()} 字</span></div><div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[9px] text-muted-foreground/50"><span className={project.lockedEpisodeCount ? "text-acid/80" : ""}>已锁定 {project.lockedEpisodeCount} 集{project.publicationStale ? " · 发布已过期" : ""}</span><span>{dayjs(project.updatedAt).format("MM-DD HH:mm")}</span></div></Link>
                    <div className="absolute right-3 top-3 flex items-center gap-0.5 rounded-md bg-background/70 backdrop-blur-sm"><button type="button" aria-label="导出剧本" className="grid size-6 place-items-center rounded text-muted-foreground/50 hover:text-foreground" onClick={() => void exportProject(project)}><Download className="size-3" /></button><button type="button" aria-label="删除剧本" className="grid size-6 place-items-center rounded text-muted-foreground/50 hover:text-hot" onClick={() => removeProject(project)}><Trash2 className="size-3" /></button></div>
                </article>)}</section> : null}
            </div></main>
            <input ref={importFileRef} hidden type="file" accept=".txt,.md,.docx,.fountain,.fdx" onChange={(event) => void onImportFile(event)} />
            <Modal title="新建剧本" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => void create()} okText="开始写" cancelText="取消" destroyOnHidden><div className="grid gap-3 py-1"><label className="grid gap-1"><span className="text-[10px] text-muted-foreground">剧名</span><Input autoFocus value={title} placeholder="例如：东京不太热" onChange={(event) => setTitle(event.target.value)} onPressEnter={() => void create()} /></label><div className="grid grid-cols-2 gap-2"><label className="grid gap-1"><span className="text-[10px] text-muted-foreground">类型</span><Select value={format} options={SCRIPT_FORMAT_OPTIONS} onChange={setFormat} /></label><label className="grid gap-1"><span className="text-[10px] text-muted-foreground">题材</span><Input value={genre} onChange={(event) => setGenre(event.target.value)} /></label></div><label className="grid gap-1"><span className="text-[10px] text-muted-foreground">一句话故事</span><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={logline} onChange={(event) => setLogline(event.target.value)} /></label></div></Modal>
            <Modal title="导入剧本" open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => void confirmImport()} okText={importPreview ? "导入并打开" : "先解析"} okButtonProps={{ disabled: !importPreview }} cancelText="取消" width={760} destroyOnHidden><div className="grid gap-3 py-1"><Button size="small" icon={<FileUp className="size-3.5" />} loading={importing} onClick={() => importFileRef.current?.click()}>选择文件</Button><label className="grid gap-1"><span className="text-[10px] text-muted-foreground">剧名</span><Input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} /></label><Input.TextArea autoSize={{ minRows: 8, maxRows: 16 }} value={importText} onChange={(event) => { setImportText(event.target.value); setImportPreview(null); }} /><Button size="small" onClick={() => parseImport(importText, importTitle)}>解析预览</Button>{importPreview ? <div className="grid max-h-40 gap-1 overflow-y-auto text-[11px]">{importPreview.episodes.map((episode) => <div key={episode.id}><span className="text-acid/80">{episode.title}</span><span className="ml-2 text-muted-foreground">{episode.scenes.length} 场</span></div>)}</div> : null}</div></Modal>
        </div>
    );
}

