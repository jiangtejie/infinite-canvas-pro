"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Plus, Sparkles, Trash2, X } from "lucide-react";
import { App, Button, Input } from "antd";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";
import type { ComicProject } from "../../types";
import { requestComicBreakdown } from "../../utils/comic-ai";
import { createComicChapter, createComicPage, createComicPanel, moveComicPanel, resetComicReviewStatus, updateComicChapter, updateComicPage, updateComicPanel } from "../../utils/comic-project";

export function ComicScriptStage({ project, onChange }: { project: ComicProject; onChange: (project: ComicProject) => void }) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const resolveModelConfig = useModelConfig();
    const [breaking, setBreaking] = useState(false);
    const [chapterId, setChapterId] = useState(project.chapters[0]?.id || "");
    const [pageId, setPageId] = useState(project.chapters[0]?.pages[0]?.id || "");
    const chapter = project.chapters.find((item) => item.id === chapterId) || project.chapters[0];
    const page = chapter?.pages.find((item) => item.id === pageId) || chapter?.pages[0];

    useEffect(() => {
        if (!chapter && project.chapters[0]) setChapterId(project.chapters[0].id);
        if (chapter && !chapter.pages.some((item) => item.id === pageId)) setPageId(chapter.pages[0]?.id || "");
    }, [chapter, project.chapters, pageId]);

    const panels = useMemo(() => page?.panels || [], [page]);

    const selectChapter = (id: string) => {
        const next = project.chapters.find((item) => item.id === id);
        setChapterId(id);
        setPageId(next?.pages[0]?.id || "");
    };

    const addChapter = () => {
        const next = createComicChapter(project.chapters.length + 1);
        onChange({ ...project, chapters: [...project.chapters, next] });
        setChapterId(next.id);
        setPageId(next.pages[0]?.id || "");
    };

    const addPage = () => {
        if (!chapter) return;
        const next = createComicPage(chapter.pages.length + 1);
        onChange(updateComicChapter(project, chapter.id, { pages: [...chapter.pages, next] }));
        setPageId(next.id);
    };

    const removeChapter = async () => {
        if (!chapter) return;
        const accepted = await confirm({ title: `删除「${chapter.title}」？`, description: `章节下的 ${chapter.pages.length} 页和页格会一起删除。`, confirmText: "删除章节", tone: "danger" });
        if (!accepted) return;
        const chapters = project.chapters.filter((item) => item.id !== chapter.id);
        onChange({ ...project, chapters });
        setChapterId(chapters[0]?.id || "");
        setPageId(chapters[0]?.pages[0]?.id || "");
    };

    const removePage = async () => {
        if (!chapter || !page) return;
        const accepted = await confirm({ title: `删除「${page.title}」？`, description: "这一页的页格会一起删除。", confirmText: "删除页面", tone: "danger" });
        if (!accepted) return;
        const pages = chapter.pages.filter((item) => item.id !== page.id);
        onChange(updateComicChapter(project, chapter.id, { pages }));
        setPageId(pages[0]?.id || "");
    };

    const patchPage = (patch: Partial<typeof page>) => {
        if (!chapter || !page) return;
        onChange(updateComicPage(project, chapter.id, page.id, { ...patch, pageImage: patch.panels ? undefined : page.pageImage, reviewStatus: resetComicReviewStatus(page.reviewStatus) }));
    };

    const patchPanel = (panelId: string, patch: Partial<Parameters<typeof updateComicPanel>[4]>) => {
        if (!chapter || !page) return;
        const next = updateComicPanel(project, chapter.id, page.id, panelId, patch);
        const nextPage = next.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
        onChange(updateComicPage(next, chapter.id, page.id, { pageImage: undefined, reviewStatus: resetComicReviewStatus(nextPage?.reviewStatus) }));
    };

    const addPanel = () => {
        if (!page) return;
        patchPage({ panels: [...page.panels, createComicPanel()] });
    };

    const removePanel = (panelId: string) => {
        if (!page) return;
        patchPage({ panels: page.panels.filter((panel) => panel.id !== panelId) });
    };

    const movePanel = (panelId: string, offset: number) => {
        if (!page) return;
        const next = moveComicPanel(page, panelId, offset);
        if (next !== page) patchPage({ panels: next.panels });
    };

    const breakChapterWithAi = async () => {
        if (!chapter || breaking) return;
        if (!chapter.summary.trim() && !project.synopsis.trim()) return void message.warning("先写章节摘要或故事梗概，AI 才知道要拆什么");
        const config = resolveModelConfig("text");
        if (!config) return;
        const approved = chapter.pages.filter((item) => item.reviewStatus === "approved").length;
        const accepted = await confirm({
            title: `用 AI 拆分「${chapter.title}」？`,
            description: `会重写这一章现有的 ${chapter.pages.length} 页和页格${approved ? `，其中 ${approved} 页已通过审稿、会重置为草稿` : ""}；建议先导出备份，生成后仍需人工审阅。`,
            confirmText: "开始拆分",
        });
        if (!accepted) return;
        setBreaking(true);
        try {
            const pages = await requestComicBreakdown(config, project, chapter.title, chapter.summary);
            onChange(updateComicChapter(project, chapter.id, { pages }));
            setPageId(pages[0]?.id || "");
            message.success(`已拆出 ${pages.length} 页 / ${pages.reduce((total, item) => total + item.panels.length, 0)} 格`);
        } catch (error) {
            message.error(errorMessage(error, "AI 拆页格失败"));
        } finally {
            setBreaking(false);
        }
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-muted-foreground">章节与页面</span>
                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={addChapter}>章节</Button>
                </div>
                <div className="space-y-2">
                    {project.chapters.map((item) => {
                        const selected = chapter?.id === item.id;
                        return (
                            <div key={item.id} className="rounded-lg border" style={{ borderColor: selected ? "var(--acid)" : "var(--border)" }}>
                                <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left" onClick={() => selectChapter(item.id)}>
                                    <FileText className="size-3.5 shrink-0 opacity-60" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                                    <span className="shrink-0 text-[10px] opacity-50">{item.pages.length} 页</span>
                                </button>
                                {selected ? (
                                    <div className="space-y-1 border-t border-border/60 p-1.5">
                                        {item.pages.map((pageItem) => (
                                            <button key={pageItem.id} type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${page?.id === pageItem.id ? "bg-acid/10 font-medium" : "hover:bg-foreground/5"}`} onClick={() => setPageId(pageItem.id)}>
                                                <span className="size-1.5 rounded-full bg-current opacity-40" />
                                                <span className="min-w-0 flex-1 truncate">{pageItem.title}</span>
                                                <span className="shrink-0 text-[10px] opacity-50">{pageItem.panels.length} 格</span>
                                            </button>
                                        ))}
                                        <Button size="small" type="text" className="!h-7 !w-full !justify-start !text-xs" icon={<Plus className="size-3" />} onClick={addPage}>添加页面</Button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
                {chapter ? <div className="flex justify-end border-t border-border/60 pt-2"><Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} onClick={() => void removeChapter()}>删除章节</Button></div> : null}
            </aside>

            <section className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-5">
                {!chapter || !page ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground"><FileText className="size-8 opacity-40" /><span>还没有页面</span><Button size="small" icon={<Plus className="size-3.5" />} onClick={addPage}>添加第一页</Button></div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="eyebrow">Script / 剧本</p>
                                <Input className="!mt-2 !max-w-md !text-lg !font-semibold" variant="borderless" value={page.title} maxLength={100} onChange={(event) => patchPage({ title: event.target.value })} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="chip">{chapter.title}</span>
                                <Button size="small" icon={<Sparkles className="size-3.5" />} loading={breaking} onClick={() => void breakChapterWithAi()}>AI 拆本章</Button>
                                <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => void removePage()}>删除页面</Button>
                            </div>
                        </div>
                        <label className="block space-y-2 text-sm"><span>本页梗概</span><Input.TextArea rows={2} value={page.summary} maxLength={2000} placeholder="这一页要完成的叙事动作、情绪转折或信息点" onChange={(event) => patchPage({ summary: event.target.value })} /></label>

                        <div className="flex items-center justify-between border-t border-border/60 pt-4">
                            <div><span className="text-sm font-semibold">页格</span><span className="ml-2 text-[11px] text-muted-foreground">{panels.length} 格</span></div>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={addPanel}>添加格</Button>
                        </div>

                        <div className="space-y-3">
                            {panels.map((panel, index) => (
                                <div key={panel.id} className="rounded-lg border border-border/60 bg-background/30 p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">Panel {String(index + 1).padStart(2, "0")}</span>
                                        <div className="flex items-center gap-0.5">
                                            <Button size="small" type="text" className="!h-7 !w-7 !p-0" disabled={index === 0} icon={<ArrowUp className="size-3.5" />} aria-label="格前移" onClick={() => movePanel(panel.id, -1)} />
                                            <Button size="small" type="text" className="!h-7 !w-7 !p-0" disabled={index === panels.length - 1} icon={<ArrowDown className="size-3.5" />} aria-label="格后移" onClick={() => movePanel(panel.id, 1)} />
                                            <Button size="small" type="text" danger className="!h-7 !w-7 !p-0" icon={<X className="size-3.5" />} aria-label="删除格" onClick={() => removePanel(panel.id)} />
                                        </div>
                                    </div>
                                    <div className="grid gap-3 lg:grid-cols-2">
                                        <label className="block space-y-1.5 text-xs"><span className="text-muted-foreground">画面描述 / 构图</span><Input.TextArea rows={3} value={panel.description} maxLength={2000} placeholder="景别、机位、角色动作、背景与关键道具" onChange={(event) => patchPanel(panel.id, { description: event.target.value })} /></label>
                                        <div className="grid gap-3">
                                            <label className="block space-y-1.5 text-xs"><span className="text-muted-foreground">对白</span><Input.TextArea rows={2} value={panel.dialogue} maxLength={2000} placeholder="角色：台词；多句换行" onChange={(event) => patchPanel(panel.id, { dialogue: event.target.value })} /></label>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <label className="block space-y-1.5 text-xs"><span className="text-muted-foreground">旁白</span><Input value={panel.caption} maxLength={1000} placeholder="旁白 / 内心独白" onChange={(event) => patchPanel(panel.id, { caption: event.target.value })} /></label>
                                                <label className="block space-y-1.5 text-xs"><span className="text-muted-foreground">拟声词</span><Input value={panel.sfx} maxLength={200} placeholder="如：哗啦、咚" onChange={(event) => patchPanel(panel.id, { sfx: event.target.value })} /></label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {!panels.length ? <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">这一页还没有格。<Button size="small" type="link" onClick={addPanel}>添加一格</Button></div> : null}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
