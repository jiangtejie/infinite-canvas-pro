"use client";

import Link from "next/link";
import { Button } from "antd";
import { ArrowLeft, Clapperboard, Download, History, Lock, PencilLine, RefreshCw } from "lucide-react";

import { FilmAmbient } from "@/components/film/film-ambient";
import { LocalSaveIndicator } from "@/components/film/local-save-indicator";
import type { ScriptProjectDocument, ScriptSyncState } from "../types";
import { scriptPageCount, scriptWordCount } from "../utils/script-project";
import { isPublicationStale } from "../utils/script-publication";

const SYNC_LABEL: Record<ScriptSyncState, string> = { local: "本机已保存", syncing: "同步中", synced: "已同步", conflict: "有冲突", error: "等待同步" };

type ScriptWorkspaceHeaderProps = {
    project: ScriptProjectDocument;
    syncState: ScriptSyncState;
    onRename: () => void;
    onVersions: () => void;
    onExport: () => void;
    onLock: () => void;
    onPublish: () => void;
    onResolve: () => void;
};

export function ScriptWorkspaceHeader({ project, syncState, onRename, onVersions, onExport, onLock, onPublish, onResolve }: ScriptWorkspaceHeaderProps) {
    const sceneCount = project.episodes.reduce((total, episode) => total + episode.scenes.length, 0);
    const lockedCount = project.lockedVersionId ? project.episodes.length : project.episodes.filter((episode) => episode.lockedVersionId).length;
    const stale = project.publications.some((publication) => publication.status !== "failed" && isPublicationStale(project, publication.episodeIds, publication.sourceHash));
    const published = project.publications.filter((publication) => publication.status === "published" && publication.filmProjectId).at(-1);
    const publishing = project.publications.some((publication) => publication.status === "publishing");
    return (
        <header className="relative shrink-0 overflow-hidden border-b border-border/70 bg-background/40">
            <FilmAmbient className="-top-24 h-44 opacity-60" />
            <div className="relative z-10 mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
                <Link href="/script" aria-label="返回剧本创作" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"><ArrowLeft className="size-4" /></Link>
                <div className="min-w-0">
                    <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">剧本工作台</p>
                    <div className="flex items-center gap-1"><h1 className="max-w-56 truncate text-[15px] font-semibold text-foreground">{project.title}</h1><button type="button" aria-label="重命名剧本" className="grid size-6 place-items-center rounded text-muted-foreground/40 hover:text-foreground" onClick={onRename}><PencilLine className="size-3" /></button></div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <span className="hidden font-mono text-[10px] text-muted-foreground/60 sm:inline">{sceneCount} 场 · {scriptWordCount(project).toLocaleString()} 字 · 约 {scriptPageCount(project)} 页</span>
                    <LocalSaveIndicator compact />
                    <button type="button" onClick={syncState === "conflict" ? onResolve : undefined} className="chip" title={SYNC_LABEL[syncState]}><span className={syncState === "syncing" ? "animate-spin" : ""}>{syncState === "syncing" ? <RefreshCw className="size-2.5" /> : null}</span>{SYNC_LABEL[syncState]}</button>
                    <Button size="small" icon={<Lock className="size-3.5" />} onClick={onLock}>{lockedCount ? `已锁定 ${lockedCount} 集` : "锁定本集"}{stale ? <span className="ml-1 size-1.5 rounded-full bg-amber-500" title="影视来源已过期" /> : null}</Button>
                    {published?.filmProjectId ? <Link href={`/canvas/${encodeURIComponent(published.filmProjectId)}`}><Button size="small" icon={<Clapperboard className="size-3.5" />}>打开影视</Button></Link> : <Button size="small" type="primary" icon={<Clapperboard className="size-3.5" />} onClick={onPublish}>{publishing ? "继续发布" : "发布影视"}</Button>}
                    <Button size="small" icon={<History className="size-3.5" />} onClick={onVersions}>版本</Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={onExport}>导出</Button>
                </div>
            </div>
        </header>
    );
}
