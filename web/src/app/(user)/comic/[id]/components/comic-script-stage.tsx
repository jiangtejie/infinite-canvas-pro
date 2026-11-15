"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Plus, Sparkles, Trash2, X } from "lucide-react";
import { App, Button, Input, Select } from "antd";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";
import type { ComicPanel, ComicPanelCharacterBinding, ComicProject } from "../../types";
import { requestComicBreakdown } from "../../utils/comic-ai";
import { removeComicPanelCharacterBinding, setComicPanelCharacterBindings, suggestLegacyPanelBindings } from "../../utils/comic-character-binding";
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
        const invalidatesComposition = Boolean(patch.panels) || patch.summary !== undefined;
        onChange(updateComicPage(project, chapter.id, page.id, {
            ...patch,
            pageImage: invalidatesComposition ? undefined : page.pageImage,
            compositionContext: invalidatesComposition ? undefined : page.compositionContext,
            reviewStatus: resetComicReviewStatus(page.reviewStatus),
        }));
    };

    const patchPanel = (panelId: string, patch: Partial<Parameters<typeof updateComicPanel>[4]>) => {
        if (!chapter || !page) return;
        const next = updateComicPanel(project, chapter.id, page.id, panelId, patch);
        const nextPage = next.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
        onChange(updateComicPage(next, chapter.id, page.id, { pageImage: undefined, compositionContext: undefined, reviewStatus: resetComicReviewStatus(nextPage?.reviewStatus) }));
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

    const commitBindings = (panel: ComicPanel, bindings: Array<{ characterId: string; variantId?: string }>) => {
        if (!chapter || !page) return;
        onChange(setComicPanelCharacterBindings(project, chapter.id, page.id, panel.id, bindings));
    };

    const removeBinding = (panel: ComicPanel, characterId: string) => {
        if (!chapter || !page) return;
        onChange(removeComicPanelCharacterBinding(project, chapter.id, page.id, panel.id, characterId));
    };

    const dismissSuggestion = (panel: ComicPanel, index: number) => {
        patchPanel(panel.id, { characterSuggestions: (panel.characterSuggestions || []).filter((_, itemIndex) => itemIndex !== index) });
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
                                    <PanelCastEditor project={project} panel={panel} onCommit={(bindings) => commitBindings(panel, bindings)} onRemove={(characterId) => removeBinding(panel, characterId)} onDismissSuggestion={(index) => dismissSuggestion(panel, index)} />
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

function PanelCastEditor({ project, panel, onCommit, onRemove, onDismissSuggestion }: {
    project: ComicProject;
    panel: ComicPanel;
    onCommit: (bindings: Array<{ characterId: string; variantId?: string }>) => void;
    onRemove: (characterId: string) => void;
    onDismissSuggestion: (index: number) => void;
}) {
    const { message, modal } = App.useApp();
    const bindings = panel.characterBindings;
    const unusedCharacters = project.characters.filter((character) => !bindings.some((binding) => binding.characterId === character.id));
    const toInput = (items: ComicPanelCharacterBinding[]) => items.map((binding) => ({ characterId: binding.characterId, variantId: binding.variantId }));
    const suggestFromText = () => {
        const suggestions = suggestLegacyPanelBindings(panel, project.characters);
        if (!suggestions.length) return message.info("文字里没有找到唯一匹配的已登记角色");
        modal.confirm({
            title: "按当前文字建议绑定角色？",
            content: `识别到：${suggestions.map((item) => item.characterNameSnapshot).join("、")}。只会添加唯一精确匹配，不会自动选择变体。`,
            okText: "添加绑定",
            onOk: () => onCommit([...toInput(bindings), ...suggestions.map((item) => ({ characterId: item.characterId }))]),
        });
    };
    return (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">出场角色</span>
                <div className="flex flex-wrap items-center gap-2">
                    {project.characters.length ? <Button type="text" size="small" className="!h-7 !px-2 !text-[11px]" onClick={suggestFromText}>从文字建议</Button> : null}
                    <Select
                        size="small"
                        className="!min-w-[180px]"
                        placeholder={project.characters.length ? "添加出场角色" : "先在设定里添加角色"}
                        value={undefined}
                        options={unusedCharacters.map((character) => ({ value: character.id, label: character.role ? `${character.name} · ${character.role}` : character.name }))}
                        disabled={!unusedCharacters.length}
                        onChange={(characterId: string) => onCommit([...toInput(bindings), { characterId }])}
                    />
                </div>
            </div>
            {bindings.map((binding, index) => {
                const character = project.characters.find((item) => item.id === binding.characterId);
                const variants = character?.variants || [];
                const characterOptions: Array<{ value: string; label: string; disabled?: boolean }> = project.characters
                    .filter((item) => item.id === binding.characterId || !bindings.some((other) => other.characterId === item.id))
                    .map((item) => ({ value: item.id, label: item.role ? `${item.name} · ${item.role}` : item.name }));
                if (!character) characterOptions.push({ value: binding.characterId, label: `${binding.characterNameSnapshot || "已删除角色"}（已删除）`, disabled: true });
                const variantOptions: Array<{ value: string; label: string; disabled?: boolean }> = variants.map((variant) => ({ value: variant.id, label: variant.name }));
                if (binding.variantId && !variants.some((variant) => variant.id === binding.variantId)) {
                    variantOptions.push({ value: binding.variantId, label: `${binding.variantNameSnapshot || binding.variantId}（已失效）`, disabled: true });
                }
                return (
                    <div key={`${binding.characterId}-${binding.variantId || "base"}`} className="flex flex-wrap items-center gap-2">
                        <Select
                            size="small"
                            className="!min-w-[160px]"
                            value={binding.characterId}
                            options={characterOptions}
                            onChange={(characterId: string) => onCommit(bindings.map((item, itemIndex) => itemIndex === index ? { characterId } : { characterId: item.characterId, variantId: item.variantId }))}
                        />
                        <Select
                            size="small"
                            allowClear
                            className="!min-w-[130px]"
                            placeholder="基础造型"
                            value={binding.variantId}
                            options={variantOptions}
                            disabled={!character}
                            onChange={(variantId?: string) => onCommit(bindings.map((item, itemIndex) => itemIndex === index ? { characterId: item.characterId, variantId } : { characterId: item.characterId, variantId: item.variantId }))}
                        />
                        <Button type="text" size="small" danger className="!h-7 !px-2 !text-xs" onClick={() => onRemove(binding.characterId)}>移除</Button>
                    </div>
                );
            })}
            {(panel.characterSuggestions || []).map((suggestion, index) => (
                <div key={`${suggestion.characterName}-${suggestion.variantName || ""}-${index}`} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/70 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <span>待处理：{suggestion.characterName}{suggestion.variantName ? ` · ${suggestion.variantName}` : ""}</span>
                    <span className="opacity-70">{suggestionReason(suggestion.reason)}</span>
                    <Button type="text" size="small" className="!h-6 !px-1.5 !text-[11px]" onClick={() => onDismissSuggestion(index)}>忽略</Button>
                </div>
            ))}
        </div>
    );
}

function suggestionReason(reason: "unknown-character" | "ambiguous-character" | "unknown-variant" | "variant-owner-mismatch") {
    if (reason === "ambiguous-character") return "名称有歧义，请手动选择角色";
    if (reason === "unknown-variant") return "变体不存在，请手动选择";
    if (reason === "variant-owner-mismatch") return "变体不属于该角色";
    return "角色未登记，请手动选择";
}
