"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Select } from "antd";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmContinuitySheet, FilmShot } from "../types";
import { FILM_CONTINUITY_FIELDS, FILM_CONTINUITY_GROUPS } from "../utils/film-continuity-sheet";

type FilmContinuityNotebookProps = {
    episodeTitle: string;
    sheets: Array<{ shot: FilmShot; sheet?: FilmContinuitySheet }>;
    onJumpToShot: (shotId: string) => void;
};

function hasSheetDetail(sheet?: FilmContinuitySheet) {
    return Boolean(sheet) && FILM_CONTINUITY_FIELDS.some((field) => sheet![field.key].trim());
}

export function FilmContinuityNotebook({ episodeTitle, sheets, onJumpToShot }: FilmContinuityNotebookProps) {
    const [page, setPage] = useState(0);
    const safePage = Math.min(Math.max(0, page), Math.max(0, sheets.length - 1));
    const current = sheets[safePage];
    const sheet = current?.sheet;
    const shot = current?.shot;
    const check = shot?.continuityCheck || "";

    useEffect(() => {
        setPage((value) => Math.min(value, Math.max(0, sheets.length - 1)));
    }, [sheets.length]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === "ArrowLeft") setPage((value) => Math.max(0, value - 1));
            if (event.key === "ArrowRight") setPage((value) => Math.min(sheets.length - 1, value + 1));
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [sheets.length]);

    const stats = useMemo(() => {
        let passed = 0;
        let failed = 0;
        let unchecked = 0;
        let minimal = 0;
        for (const item of sheets) {
            const itemCheck = item.shot.continuityCheck || "";
            if (itemCheck.startsWith("通过")) passed += 1;
            else if (itemCheck) failed += 1;
            else unchecked += 1;
            if (!hasSheetDetail(item.sheet)) minimal += 1;
        }
        return { passed, failed, unchecked, minimal };
    }, [sheets]);

    if (!shot) {
        return <p className="py-10 text-center text-xs text-muted-foreground">这一集还没有场记内容，先点「AI 场记分析」。</p>;
    }

    return (
        <div className="flex h-[72vh] min-h-[520px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">{episodeTitle}</span>
                <span className="chip">{sheets.length} 镜场记</span>
                <span className="chip">{stats.passed} 通过</span>
                <span className={cn("chip", stats.failed ? "border-hot/40 text-hot" : "")}>{stats.failed} 不通过</span>
                <span className="chip">{stats.unchecked} 未校验</span>
                {stats.minimal ? <span className="chip border-hot/30 text-hot/80">{stats.minimal} 镜仅校验</span> : null}
                <div className="ml-auto flex items-center gap-1">
                    <Button size="small" type="text" icon={<ChevronLeft className="size-3.5" />} disabled={safePage <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                        上一镜
                    </Button>
                    <span className="min-w-16 text-center font-mono text-[10px] text-muted-foreground/70 tabular-nums">{safePage + 1} / {sheets.length}</span>
                    <Button size="small" type="text" disabled={safePage >= sheets.length - 1} onClick={() => setPage((value) => Math.min(sheets.length - 1, value + 1))}>
                        下一镜
                        <ChevronRight className="size-3.5" />
                    </Button>
                </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-[var(--card)] shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                <div aria-hidden className="absolute inset-y-0 left-0 w-10 border-r border-border/60 bg-background/50">
                    <div className="flex h-full flex-col items-center justify-evenly py-6">
                        {Array.from({ length: 9 }).map((_, index) => <span key={index} className="size-1.5 rounded-full border border-border/70 bg-background" />)}
                    </div>
                </div>
                <span aria-hidden className="absolute inset-y-4 left-14 w-px bg-hot/35" />
                <div
                    className="thin-scrollbar h-full overflow-y-auto py-5"
                    style={{ paddingLeft: 88, paddingRight: 24, backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, color-mix(in srgb, var(--border) 28%, transparent) 28px)" }}
                >
                    <div className="flex flex-wrap items-start gap-2 border-b border-border/50 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="grid size-9 place-items-center rounded-full border border-acid/40 bg-acid/10 font-mono text-[11px] font-semibold text-acid">{shot.shotNo}</span>
                            <div className="min-w-0">
                                <p className="text-[11px] text-muted-foreground/70">{sheet ? `${sheet.version} · ` : ""}{shot.shotType || "—"} · {shot.cameraMovement || "固定"} · {shot.duration}s</p>
                                <p className="line-clamp-2 text-sm font-medium leading-6 text-foreground">{shot.description || "未填写描述"}</p>
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-1.5">
                            {check ? (
                                <span className={cn("chip", check.startsWith("通过") ? "border-acid/40 text-acid" : "border-hot/40 text-hot")}>{check.startsWith("通过") ? "通过" : "不通过"}</span>
                            ) : (
                                <span className="chip">未校验</span>
                            )}
                            <Button size="small" type="text" icon={<ExternalLink className="size-3.5" />} onClick={() => onJumpToShot(shot.id)}>跳到镜头</Button>
                        </div>
                    </div>

                    {check ? (
                        <div className={cn("mt-3 rounded-lg border px-3 py-2", check.startsWith("通过") ? "border-acid/30 bg-acid/[0.05]" : "border-hot/30 bg-hot/[0.05]")}>
                            <span className={cn("font-mono text-[9px] tracking-[0.16em] uppercase", check.startsWith("通过") ? "text-acid/80" : "text-hot/80")}>校验结果</span>
                            <p className={cn("mt-1 break-words text-xs leading-6", check.startsWith("通过") ? "text-acid/90" : "text-hot")}>{check}</p>
                        </div>
                    ) : null}

                    {sheet && hasSheetDetail(sheet) ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {FILM_CONTINUITY_GROUPS.map((group) => {
                                const fields = group.fields.filter((field) => sheet[field.key].trim());
                                if (!fields.length) return null;
                                return (
                                    <section key={group.title} className="min-w-0 rounded-lg border border-border/50 bg-background/45 p-3">
                                        <h4 className="mb-2 font-mono text-[9px] tracking-[0.16em] text-acid/80 uppercase">{group.title}</h4>
                                        <div className="grid gap-2">
                                            {fields.map((field) => (
                                                <div key={field.key} className="grid min-w-0 gap-0.5">
                                                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{field.label}</span>
                                                    <p className="break-words text-xs leading-6 text-foreground/80">{sheet[field.key]}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="mt-4 grid gap-1 rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-5 text-center">
                            <p className="text-xs text-muted-foreground/80">{!sheet ? "该镜头还没有场记交接单。" : check ? "该镜头只有校验结果，还没有场记详情。" : "该镜头还没有场记内容。"}</p>
                            <p className="text-[11px] leading-5 text-muted-foreground/60">可以回到剧情页重新点「AI 场记分析」生成完整交接单，或在分镜详情里手动编辑。</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-muted-foreground/60">每镜一页 · 共 {sheets.length} 页</span>
                <div className="flex items-center gap-2">
                    <Select
                        size="small"
                        className="w-40"
                        value={shot.id}
                        options={sheets.map((item) => ({ value: item.shot.id, label: `${item.shot.shotNo} · ${truncate(item.shot.description, 12)}` }))}
                        onChange={(shodId: string) => setPage(Math.max(0, sheets.findIndex((item) => item.shot.id === shodId)))}
                    />
                    <Button size="small" disabled={safePage <= 0} onClick={() => setPage(0)}>首页</Button>
                    <Button size="small" disabled={safePage >= sheets.length - 1} onClick={() => setPage(sheets.length - 1)}>末页</Button>
                </div>
            </div>
        </div>
    );
}

function truncate(value: string, max: number) {
    const text = (value || "").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
