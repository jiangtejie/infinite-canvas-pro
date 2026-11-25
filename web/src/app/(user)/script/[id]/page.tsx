"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { App, Button, Input, Modal } from "antd";
import type { ScriptProjectDocument } from "../types";

import { cn, errorMessage } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useDownloadFile } from "@/hooks/use-download-file";
import { publishScriptToFilm } from "@/services/script-film-publication";
import { snapshotScriptContent, exportScriptText } from "../utils/script-document";
import { useScriptStore } from "../stores/use-script-store";
import { useScriptDocument } from "./use-script-document";
import { ScriptStoryPanel } from "../components/script-story-panel";
import { ScriptCharactersPanel } from "../components/script-characters-panel";
import { ScriptStructurePanel } from "../components/script-structure-panel";
import { ScriptScenesPanel } from "../components/script-scenes-panel";
import { ScriptEditorPanel } from "../components/script-editor-panel";
import { ScriptVersionsModal } from "../components/script-versions-modal";
import { ScriptEpisodeSwitcher } from "../components/script-episode-switcher";
import { ScriptConflictModal } from "../components/script-conflict-modal";
import { ScriptWorkspaceHeader } from "../components/script-workspace-header";

const TABS = [
    { key: "story", label: "故事" },
    { key: "characters", label: "人物" },
    { key: "structure", label: "结构" },
    { key: "scenes", label: "分场" },
    { key: "editor", label: "剧本" },
] as const;
type WorkspaceTab = (typeof TABS)[number]["key"];

export default function ScriptProjectPage() {
    const params = useParams<{ id: string }>();
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id || "";
    const { message } = App.useApp();
    const router = useRouter();
    const confirm = useConfirm();
    const downloadFile = useDownloadFile();
    const { project, conflicts, loadState, syncState, episode, episodeId, sceneId, setSceneId, selectEpisode } = useScriptDocument(id);
    const [tab, setTab] = useState<WorkspaceTab>("story");
    const [renameOpen, setRenameOpen] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [conflictOpen, setConflictOpen] = useState(false);

    useEffect(() => { if (conflicts.length) setConflictOpen(true); }, [conflicts.length]);
    const run = async (action: () => Promise<unknown>) => {
        try { await action(); } catch (error) { message.error(errorMessage(error, "保存失败")); }
    };
    const update = (updater: (current: ScriptProjectDocument) => ScriptProjectDocument) => {
        if (project) void run(() => useScriptStore.getState().updateDocument(project.id, updater));
    };
    const addEpisode = async () => {
        if (!project) return;
        await run(async () => {
            await useScriptStore.getState().addEpisode(project.id);
            selectEpisode(useScriptStore.getState().documents[project.id].episodes.at(-1)!.id);
        });
    };
    const addScene = async () => {
        if (!project || !episodeId) return;
        await run(async () => {
            await useScriptStore.getState().addScene(project.id, episodeId);
            const next = useScriptStore.getState().documents[project.id].episodes.find((item) => item.id === episodeId)!;
            setSceneId(next.scenes.at(-1)!.id);
        });
    };
    const lock = async () => {
        if (!project || !episode) return;
        const scope = project.lockedVersionId ? "project" : "episode";
        const ok = await confirm({ title: scope === "project" ? "更新项目锁定稿" : `锁定「${episode.title}」`, description: scope === "project" ? "当前全部剧集会保存为新的项目锁定稿。" : "保存本集当前内容，后续可基于锁定稿发布到影视。", confirmText: "锁定", tone: "default" });
        if (!ok) return;
        await run(() => useScriptStore.getState().lockVersion(project.id, { scope, episodeId: scope === "episode" ? episode.id : undefined, label: scope === "project" ? "项目锁定稿" : `${episode.title}锁定稿` }));
    };

    const publish = async () => {
        if (!project) return;
        const episodeIds = project.episodes.filter((item) => project.lockedVersionId || (item.lockedVersionId && item.lockedVersionHash)).map((item) => item.id);
        if (!episodeIds.length) {
            message.warning("请先锁定要发布的剧集");
            return;
        }
        try {
            const publication = await publishScriptToFilm({ projectId: project.id, episodeIds });
            message.success("已发布到影视画布");
            router.push(`/canvas/${encodeURIComponent(publication.filmProjectId!)}`);
        } catch (error) {
            message.error(errorMessage(error, "发布失败"));
        }
    };

    if (loadState === "loading" || loadState === "idle") return <div className="grid h-full place-items-center"><LoadingState label="正在加载剧本" /></div>;
    if (!project || loadState === "missing" || loadState === "error") return (
        <div className="grid h-full place-items-center"><EmptyState title={loadState === "error" ? "剧本加载失败" : "剧本不存在"} description={loadState === "error" ? "本机缓存和云端都暂时无法读取，请稍后重试。" : "可能已经被删除，或者链接不正确。"} action={<Link href="/script" className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-xs">返回剧本列表</Link>} /></div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-foreground">
            <ScriptWorkspaceHeader project={project} syncState={syncState} onRename={() => { setTitleDraft(project.title); setRenameOpen(true); }} onVersions={() => setVersionsOpen(true)} onExport={() => downloadFile(new Blob([exportScriptText(snapshotScriptContent(project))], { type: "text/plain;charset=utf-8" }), `${project.title || "剧本"}.txt`)} onLock={() => void lock()} onPublish={() => void publish()} onResolve={() => setConflictOpen(true)} />
            <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/50 px-4 sm:px-6" aria-label="剧本工作流">
                {TABS.map((item, index) => <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-current={tab === item.key ? "page" : undefined} className={cn("relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs", tab === item.key ? "text-acid after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-acid" : "text-muted-foreground hover:text-foreground")}><span className="font-mono text-[8px] opacity-50">{String(index + 1).padStart(2, "0")}</span>{item.label}</button>)}
            </nav>
            {(tab === "scenes" || tab === "editor") && project.episodes.length ? <div className="shrink-0 border-b border-border/40 px-4 py-2 sm:px-6"><ScriptEpisodeSwitcher episodes={project.episodes} value={episodeId} onChange={selectEpisode} onAdd={addEpisode} /></div> : null}
            <main className="min-h-0 flex-1 overflow-y-auto"><div key={tab} className="film-stage-enter mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
                {tab === "story" ? <ScriptStoryPanel project={project} onUpdate={update} /> : null}
                {tab === "characters" ? <ScriptCharactersPanel project={project} onUpdate={update} /> : null}
                {tab === "structure" ? <ScriptStructurePanel project={project} onUpdate={update} /> : null}
                {tab === "scenes" && episode ? <ScriptScenesPanel project={project} episodeId={episode.id} onUpdateScene={(scene, patch) => void run(() => useScriptStore.getState().updateScene(project.id, episode.id, scene, patch))} onAddScene={addScene} onRemoveScene={(scene) => void run(() => useScriptStore.getState().removeScene(project.id, episode.id, scene))} onMoveScene={(scene, direction) => void run(() => useScriptStore.getState().moveScene(project.id, episode.id, scene, direction))} onOpenEditor={(scene) => { setSceneId(scene); setTab("editor"); }} /> : null}
                {tab === "editor" && episode ? <ScriptEditorPanel project={project} episodeId={episode.id} selectedSceneId={sceneId} onSelectScene={setSceneId} onUpdateScene={(scene, patch) => void run(() => useScriptStore.getState().updateScene(project.id, episode.id, scene, patch))} onAddScene={addScene} /> : null}
            </div></main>
            <Modal title="重命名剧本" open={renameOpen} onCancel={() => setRenameOpen(false)} onOk={() => { const title = titleDraft.trim(); if (!title) return; update((current) => ({ ...current, title })); setRenameOpen(false); }} okText="保存" cancelText="取消" destroyOnHidden><Input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onPressEnter={() => update((current) => ({ ...current, title: titleDraft.trim() || current.title }))} /></Modal>
            <ScriptVersionsModal open={versionsOpen} project={project} initialEpisodeId={episodeId} onClose={() => setVersionsOpen(false)} />
            <ScriptConflictModal open={conflictOpen} projectId={project.id} conflicts={conflicts} onClose={() => setConflictOpen(false)} />
        </div>
    );
}
