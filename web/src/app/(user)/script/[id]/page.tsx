"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { App, Button, Input, Modal } from "antd";
import { ArrowLeft, Check, Clapperboard, Download, History, Lock, PencilLine } from "lucide-react";

import { cn } from "@/lib/utils";
import { FilmAmbient } from "../../film/components/film-ambient";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import type { ScriptProject } from "../types";
import { useScriptStore } from "../stores/use-script-store";
import { createScriptDraft, exportScriptText, scriptPageCount, scriptWordCount } from "../utils/script-project";
import { buildFilmPlanFromDraft } from "../utils/script-handoff";
import { useFilmStore } from "../../film/stores/use-film-store";
import { ScriptStoryPanel } from "../components/script-story-panel";
import { ScriptCharactersPanel } from "../components/script-characters-panel";
import { ScriptStructurePanel } from "../components/script-structure-panel";
import { ScriptScenesPanel } from "../components/script-scenes-panel";
import { ScriptEditorPanel } from "../components/script-editor-panel";
import { ScriptVersionsModal } from "../components/script-versions-modal";

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
    const router = useRouter();
    const { message } = App.useApp();
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const hydrated = useScriptStore((state) => state.hydrated);
    const projects = useScriptStore((state) => state.projects);
    const updateProject = useScriptStore((state) => state.updateProject);
    const filmProjects = useFilmStore((state) => state.projects);
    const createFilmProject = useFilmStore((state) => state.createProject);
    const updateFilmProject = useFilmStore((state) => state.updateProject);
    const project = projects.find((item) => item.id === id);
    const [tab, setTab] = useState<WorkspaceTab>("story");
    const [selectedSceneId, setSelectedSceneId] = useState("");
    const [renameOpen, setRenameOpen] = useState(false);
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");

    useEffect(() => {
        if (!project) return;
        if (selectedSceneId && project.scenes.some((scene) => scene.id === selectedSceneId)) return;
        setSelectedSceneId(project.scenes[0]?.id || "");
    }, [project, selectedSceneId]);

    const words = useMemo(() => (project ? scriptWordCount(project) : 0), [project]);
    const pages = useMemo(() => (project ? scriptPageCount(project) : 0), [project]);
    const locked = (project?.status || "draft") === "locked";
    const lockedDraft = project?.lockedDraftId ? (project.drafts || []).find((draft) => draft.id === project.lockedDraftId) || null : null;

    const update = (patch: Partial<ScriptProject>) => {
        if (project) updateProject(project.id, patch);
    };

    const lockDraft = () => {
        if (!project) return;
        const draft = createScriptDraft(project, locked ? "锁定稿（更新）" : "锁定稿");
        updateProject(project.id, {
            drafts: [...(project.drafts || []), draft],
            status: "locked",
            lockedDraftId: draft.id,
        });
        message.success(locked ? "已更新锁定稿，可重新转分镜" : "已锁定当前稿，可以转 AI 影视分镜");
    };

    const handoffToFilm = () => {
        if (!project) return;
        const draft = lockedDraft || createScriptDraft(project, "锁定稿");
        const existing = project.filmProjectId ? filmProjects.find((item) => item.id === project.filmProjectId) : undefined;
        if (existing) {
            router.push(`/film/${existing.id}`);
            return;
        }
        const { scriptText, episodes, document } = buildFilmPlanFromDraft(draft);
        const shotCount = episodes.reduce((total, episode) => total + episode.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.shots.length, 0), 0);
        const filmProjectId = createFilmProject(`${project.title} · 分镜`);
        updateFilmProject(filmProjectId, {
            scriptText,
            episodes,
            scriptDocument: document,
            stage: "storyboard",
        });
        updateProject(project.id, {
            filmProjectId,
            drafts: lockedDraft ? (project.drafts || []) : [...(project.drafts || []), draft],
            lockedDraftId: lockedDraft ? project.lockedDraftId : draft.id,
            status: "locked",
        });
        message.success(`已生成 AI 影视分镜：${episodes.length} 集 / ${shotCount} 个分镜`);
        router.push(`/film/${filmProjectId}`);
    };

    const saveTitle = () => {
        if (!project) return;
        const title = titleDraft.trim();
        if (!title) return;
        update({ title });
        setRenameOpen(false);
    };

    const exportScript = () => {
        if (!project) return;
        const blob = new Blob([exportScriptText(project)], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${project.title || "剧本"}.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!hydrated) {
        return <div className="grid h-full place-items-center"><LoadingState label="正在加载剧本" /></div>;
    }

    if (!project) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState
                    title="剧本不存在"
                    description="可能已经被删除，或者链接不正确。"
                    action={<Link href="/script" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition hover:border-acid/60">返回剧本列表</Link>}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-foreground">
            <header className="relative shrink-0 overflow-hidden border-b border-border/70 bg-background/40">
                <FilmAmbient className="-top-24 h-44 opacity-60" />
                <div className="relative z-10 mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
                    <Link href="/script" aria-label="返回剧本列表" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                        <ArrowLeft className="size-4" />
                    </Link>
                    <div className="min-w-0">
                        <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">SCRIPT / PROJECT</p>
                        <div className="flex items-center gap-1">
                            <h1 className="max-w-48 truncate text-sm font-semibold tracking-tight text-foreground">{project.title}</h1>
                            <button type="button" aria-label="重命名剧本" className="grid size-6 place-items-center rounded text-muted-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={() => { setTitleDraft(project.title); setRenameOpen(true); }}>
                                <PencilLine className="size-3" />
                            </button>
                        </div>
                    </div>

                    <nav className="ml-2 hidden h-16 items-center gap-1 md:flex" aria-label="剧本工作流">
                        {TABS.map((item, index) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setTab(item.key)}
                                aria-current={tab === item.key ? "page" : undefined}
                                className={cn(
                                    "relative flex h-16 items-center gap-1.5 px-3 text-[13px] transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t-full after:transition-all after:duration-300",
                                    tab === item.key ? "font-medium text-foreground after:bg-acid after:shadow-[0_0_14px_var(--acid)]" : "text-muted-foreground after:bg-transparent hover:text-foreground",
                                )}
                            >
                                <span className={cn("font-mono text-[9px] tabular-nums", tab === item.key ? "text-acid/80" : "text-muted-foreground/35")}>{String(index + 1).padStart(2, "0")}</span>
                                {item.label}
                            </button>
                        ))}
                    </nav>

                    <div className="ml-auto flex items-center gap-2">
                        <span className="hidden font-mono text-[10px] text-muted-foreground/60 tabular-nums sm:inline">{project.scenes.length} 场 · {words.toLocaleString()} 字 · 约 {pages} 页</span>
                        <span className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground/70 uppercase sm:flex">
                            <Check className="size-3 text-acid" aria-hidden />
                            已自动保存
                        </span>
                        <span className={cn("chip hidden sm:inline-flex", locked ? "border-acid/40 text-acid" : "")}>{locked ? "已锁定" : "草稿"}</span>
                        {locked ? (
                            <>
                                {project.filmProjectId ? null : <Button size="small" type="text" className="hidden sm:inline-flex" onClick={lockDraft}>更新锁定稿</Button>}
                                <Button size="small" type="primary" icon={<Clapperboard className="size-3.5" />} onClick={handoffToFilm}>
                                    {project.filmProjectId ? "打开 AI 影视分镜" : "转 AI 影视分镜"}
                                </Button>
                            </>
                        ) : (
                            <Button size="small" icon={<Lock className="size-3.5" />} onClick={lockDraft}>锁定稿</Button>
                        )}
                        <Button size="small" icon={<History className="size-3.5" />} onClick={() => setVersionsOpen(true)}>版本</Button>
                        <Button size="small" icon={<Download className="size-3.5" />} onClick={exportScript}>导出</Button>
                    </div>
                </div>
                <div className="relative z-10 flex gap-1 overflow-x-auto border-t border-border/50 px-4 md:hidden">
                    {TABS.map((item) => (
                        <button key={item.key} type="button" onClick={() => setTab(item.key)} className={cn("relative shrink-0 px-3 py-2 text-xs", tab === item.key ? "text-acid" : "text-muted-foreground")}>
                            {item.label}
                        </button>
                    ))}
                </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto">
                <div key={tab} className="film-stage-enter mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
                    {tab === "story" ? <ScriptStoryPanel project={project} onUpdate={update} /> : null}
                    {tab === "characters" ? <ScriptCharactersPanel project={project} onUpdate={update} /> : null}
                    {tab === "structure" ? <ScriptStructurePanel project={project} onUpdate={update} /> : null}
                    {tab === "scenes" ? (
                        <ScriptScenesPanel
                            project={project}
                            onUpdate={update}
                            onOpenEditor={(sceneId) => {
                                setSelectedSceneId(sceneId);
                                setTab("editor");
                            }}
                        />
                    ) : null}
                    {tab === "editor" ? (
                        <ScriptEditorPanel
                            project={project}
                            selectedSceneId={selectedSceneId}
                            onSelectScene={setSelectedSceneId}
                            onUpdate={update}
                        />
                    ) : null}
                </div>
            </main>

            <Modal title="重命名剧本" open={renameOpen} onCancel={() => setRenameOpen(false)} onOk={saveTitle} okText="保存" cancelText="取消" destroyOnHidden>
                <Input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onPressEnter={saveTitle} />
            </Modal>

            <ScriptVersionsModal open={versionsOpen} project={project} onUpdate={update} onClose={() => setVersionsOpen(false)} />
        </div>
    );
}
