"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, FileText, MessageSquareWarning } from "lucide-react";
import { Button, Input, Segmented } from "antd";

import type { ComicPage, ComicProject, ComicReviewStatus } from "../types";
import { comicPageIssues, comicPageReviewStatus, comicReviewProgress, updateComicPage } from "../utils/comic-project";
import { ComicImage } from "./comic-image";

const STATUS_OPTIONS: { value: "all" | ComicReviewStatus; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "draft", label: "草稿" },
    { value: "pending", label: "待审" },
    { value: "changes", label: "需修改" },
    { value: "approved", label: "已通过" },
];

const STATUS_STYLE: Record<ComicReviewStatus, { label: string; color: string }> = {
    draft: { label: "草稿", color: "var(--muted-foreground)" },
    pending: { label: "待审", color: "#f59e0b" },
    changes: { label: "需修改", color: "var(--destructive)" },
    approved: { label: "已通过", color: "#22c55e" },
};

export function ComicReviewStage({ project, onChange }: { project: ComicProject; onChange: (project: ComicProject) => void }) {
    const pages = useMemo(() => project.chapters.flatMap((chapter) => chapter.pages.map((page) => ({ chapter, page }))), [project.chapters]);
    const progress = comicReviewProgress(project);
    const [filter, setFilter] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");
    const [selectedKey, setSelectedKey] = useState(pages[0] ? `${pages[0].chapter.id}:${pages[0].page.id}` : "");
    const filtered = pages.filter((item) => filter === "all" || comicPageReviewStatus(item.page) === filter);
    const selected = filtered.find((item) => `${item.chapter.id}:${item.page.id}` === selectedKey) || filtered[0];

    useEffect(() => {
        if (selected) return;
        if (filtered[0]) setSelectedKey(`${filtered[0].chapter.id}:${filtered[0].page.id}`);
    }, [filtered, selected]);

    const setStatus = (page: ComicPage, chapterId: string, reviewStatus: ComicReviewStatus) => {
        onChange(updateComicPage(project, chapterId, page.id, { reviewStatus }));
    };

    const issues = selected ? comicPageIssues(selected.page) : [];
    const errorCount = issues.filter((issue) => issue.level === "error").length;
    const warningCount = issues.length - errorCount;

    return (
        <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-4">
                {[
                    { label: "总页数", value: progress.total, hint: "全部章节" },
                    { label: "待审", value: progress.pending, hint: "等待编辑确认" },
                    { label: "需修改", value: progress.changes, hint: "退回修改" },
                    { label: "已通过", value: progress.approved, hint: progress.total ? `${Math.round(progress.approved / progress.total * 100)}% 覆盖` : "暂无页面" },
                ].map((item) => <div key={item.label} className="rounded-xl border border-border/70 bg-card/40 px-4 py-3"><div className="flex items-baseline justify-between gap-2"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">{item.label}</span><span className="font-mono text-2xl font-semibold tabular-nums">{item.value}</span></div><p className="mt-1 text-[10px] text-muted-foreground/60">{item.hint}</p></div>)}
            </section>

            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-center justify-between px-1"><span className="text-[11px] font-medium text-muted-foreground">页面审稿</span><span className="text-[10px] text-muted-foreground/60">{filtered.length} / {pages.length}</span></div>
                    <Segmented size="small" block value={filter} options={STATUS_OPTIONS} onChange={(value) => setFilter(value)} />
                    <div className="space-y-1.5">
                        {filtered.map(({ chapter, page }) => {
                            const status = comicPageReviewStatus(page);
                            const count = comicPageIssues(page).length;
                            const active = selected?.page.id === page.id;
                            return (
                                <button key={page.id} type="button" className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${active ? "border-acid/50 bg-acid/10" : "border-transparent hover:bg-foreground/5"}`} onClick={() => setSelectedKey(`${chapter.id}:${page.id}`)}>
                                    {page.pageImage ? <span className="h-10 w-8 shrink-0 overflow-hidden rounded-sm border border-border/70 bg-white"><ComicImage image={page.pageImage} className="size-full object-cover" /></span> : <FileText className="size-3.5 shrink-0 opacity-55" />}
                                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{page.title}</span><span className="block truncate text-[10px] text-muted-foreground/60">{chapter.title}{count ? ` · ${count} 个问题` : ""}{page.pageImage ? " · 已合成" : ""}</span></span>
                                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px]" style={{ color: STATUS_STYLE[status].color, background: `color-mix(in oklch, ${STATUS_STYLE[status].color} 12%, transparent)` }}>{STATUS_STYLE[status].label}</span>
                                </button>
                            );
                        })}
                        {!filtered.length ? <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">没有符合筛选的页面。</p> : null}
                    </div>
                </aside>

                <section className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-5">
                    {selected ? (
                        <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="eyebrow">Review / 审稿</p>
                                    <h2 className="mt-1 text-lg font-semibold tracking-tight">{selected.page.title}</h2>
                                    <p className="mt-1 text-[11px] text-muted-foreground">{selected.chapter.title} · {selected.page.panels.length} 格 · {STATUS_STYLE[comicPageReviewStatus(selected.page)].label}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button size="small" onClick={() => setStatus(selected.page, selected.chapter.id, "pending")}>提交审稿</Button>
                                    <Button size="small" onClick={() => setStatus(selected.page, selected.chapter.id, "changes")}>退回修改</Button>
                                    <Button size="small" type="primary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => setStatus(selected.page, selected.chapter.id, "approved")}>通过</Button>
                                </div>
                            </div>

                            {selected.page.pageImage ? <div className="rounded-lg border border-border/60 bg-white p-2"><div className="mb-1.5 flex items-center justify-between px-1 text-[10px] text-muted-foreground"><span>成品页预览</span><span>页格拼合</span></div><ComicImage image={selected.page.pageImage} className="mx-auto max-h-[420px] max-w-full object-contain" /></div> : null}

                            <div className="grid gap-3 lg:grid-cols-2">
                                <div className="rounded-lg border border-border/60 bg-background/30 p-3 text-xs leading-5">
                                    <div className="mb-1 font-medium text-muted-foreground">本页梗概</div>
                                    <p className="m-0 whitespace-pre-wrap">{selected.page.summary || "未填写"}</p>
                                    <div className="mt-3 text-[11px] text-muted-foreground/60">阅读方向 / 成品形态已在企划中设定。</div>
                                </div>
                                <div className="space-y-2 rounded-lg border border-border/60 bg-background/30 p-3">
                                    <div className="flex items-center justify-between text-xs"><span className="font-medium text-muted-foreground">自动检查</span><span className="text-[10px]">{errorCount} 错误 · {warningCount} 提醒</span></div>
                                    {issues.length ? issues.map((issue, index) => <div key={index} className="flex items-start gap-1.5 text-[11px] leading-5"><MessageSquareWarning className={`mt-0.5 size-3 shrink-0 ${issue.level === "error" ? "text-red-500" : "text-amber-500"}`} /><span>{issue.message}</span></div>) : <div className="flex items-center gap-1.5 text-[11px] text-emerald-600"><CheckCircle2 className="size-3.5" />没有自动检查问题</div>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">页格检查</span><span className="text-[10px] text-muted-foreground/60">只读；回到剧本页修改</span></div>
                                <div className="grid gap-2 lg:grid-cols-2">
                                    {selected.page.panels.map((panel, index) => (
                                        <div key={panel.id} className="rounded-lg border border-border/60 bg-background/30 p-3 text-xs">
                                            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60"><span>PANEL {String(index + 1).padStart(2, "0")}</span><span className={panel.description.trim() ? "" : "text-red-500"}>{panel.description.trim() ? "有画面描述" : "缺画面描述"}</span></div>
                                            <p className="mt-1 line-clamp-2 leading-5">{panel.description || "—"}</p>
                                            {panel.dialogue ? <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">对白：{panel.dialogue}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <label className="block space-y-2 text-xs"><span className="text-muted-foreground">审稿备注</span><Input.TextArea rows={3} value={selected.page.reviewNotes || ""} maxLength={3000} placeholder="编辑意见、连续性提醒、需要作者确认的点" onChange={(event) => onChange(updateComicPage(project, selected.chapter.id, selected.page.id, { reviewNotes: event.target.value }))} /></label>

                            {progress.total > 0 && progress.approved < progress.total ? <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-amber-700"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />还有 {progress.total - progress.approved} 页未通过审稿；建议全部通过后再做排版导出。</div> : null}
                        </>
                    ) : <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground"><FileText className="size-8 opacity-40" /><span>还没有页面，先去剧本里添加章节和页面。</span></div>}
                </section>
            </div>
        </div>
    );
}
