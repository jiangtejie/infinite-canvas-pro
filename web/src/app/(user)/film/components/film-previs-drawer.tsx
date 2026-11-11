"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Drawer, Input, InputNumber, Select } from "antd";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, Clock3, GitBranch, Info, Pause, Play, Sparkles, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { filmAspectCssRatio } from "@/lib/film/film-aspects";
import type { FilmProject } from "@/lib/film/types";
import { filmShotTypeLabel } from "../utils/film-shot-types";
import { buildFilmAnimatic, formatAnimaticDuration, type FilmAnimaticIssue } from "../utils/film-animatic";
import { branchTargetIndex, collectFilmBranches, shotBranchList } from "../utils/film-branch";
import { applyFilmBranchEffects, collectFilmVariableUsage, evaluateFilmBranchConditions, initialFilmVariables } from "../utils/film-interactive";
import type { FilmShotBranch } from "@/lib/film/types";
import { useFilmImageUrl } from "../hooks/use-film-image-url";

const LEVEL_STYLE: Record<FilmAnimaticIssue["level"], { label: string; className: string; icon: typeof XCircle }> = {
    error: { label: "严重", className: "border-red-500/40 text-red-500", icon: XCircle },
    warning: { label: "提醒", className: "border-amber-500/40 text-amber-500", icon: AlertTriangle },
    info: { label: "建议", className: "border-border text-muted-foreground", icon: Info },
};

export function FilmPrevisDrawer({ open, project, onClose, onJumpToShot }: { open: boolean; project: FilmProject; onClose: () => void; onJumpToShot: (shotId: string) => void }) {
    const animatic = buildFilmAnimatic(project);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(2);
    const [sideTab, setSideTab] = useState<"issues" | "style" | "variables">("issues");
    const [interactive, setInteractive] = useState(false);
    const [choiceOpen, setChoiceOpen] = useState(false);
    const [variables, setVariables] = useState<Record<string, string>>(() => initialFilmVariables(project));
    const branchEdges = collectFilmBranches(project);
    const interactiveVariables = project.interactiveVariables || [];
    const variableUsage = useMemo(() => collectFilmVariableUsage(project), [project]);
    const timelineRef = useRef<HTMLDivElement>(null);
    const current = animatic.shots[Math.min(index, Math.max(0, animatic.shots.length - 1))] || null;
    const imageSrc = useFilmImageUrl(current?.shot.imageUrl, current?.shot.storageKey);
    const style = animatic.styleReport.style;

    useEffect(() => {
        if (!open) return;
        setIndex(0);
        setPlaying(false);
        setSideTab("issues");
        setInteractive(false);
        setChoiceOpen(false);
        setVariables(initialFilmVariables(project));
    }, [open, project]);

    useEffect(() => {
        if (!playing || !animatic.shots.length) return;
        const item = animatic.shots[index];
        if (!item) return;
        const timer = window.setTimeout(() => {
            if (interactive && shotBranchList(item.shot).some((branch) => evaluateFilmBranchConditions(branch, variables))) {
                setPlaying(false);
                setChoiceOpen(true);
                return;
            }
            if (index >= animatic.shots.length - 1) {
                setPlaying(false);
                return;
            }
            setIndex(index + 1);
        }, Math.max(300, (item.duration || 3) * 1000 / speed));
        return () => window.clearTimeout(timer);
    }, [animatic.shots, index, interactive, playing, speed, variables]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            if (event.key === " ") {
                event.preventDefault();
                setPlaying((value) => !value);
            } else if (event.key === "ArrowLeft") {
                setIndex((value) => Math.max(0, value - 1));
            } else if (event.key === "ArrowRight") {
                setIndex((value) => Math.min(animatic.shots.length - 1, value + 1));
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [animatic.shots.length, open]);

    useEffect(() => {
        if (!open) return;
        const nodes = timelineRef.current?.querySelectorAll<HTMLElement>("[data-previs-shot]");
        nodes?.[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, [index, open]);

    const seek = (next: number) => {
        if (!animatic.shots.length) return;
        setIndex(Math.max(0, Math.min(animatic.shots.length - 1, next)));
    };

    const jump = (shotId?: string) => {
        if (!shotId) return;
        onJumpToShot(shotId);
        onClose();
    };

    const skipBranch = () => {
        setChoiceOpen(false);
        if (index + 1 < animatic.shots.length) {
            setIndex(index + 1);
            setPlaying(true);
        }
    };

    const chooseBranch = (branch: FilmShotBranch) => {
        const target = branchTargetIndex(animatic.shots, branch.nextShotId);
        setChoiceOpen(false);
        if (target < 0) return;
        setVariables((current) => applyFilmBranchEffects(branch, current));
        setIndex(target);
        setPlaying(true);
    };
    const branchOptions = current
        ? shotBranchList(current.shot)
            .filter((branch) => evaluateFilmBranchConditions(branch, variables))
            .map((branch) => ({ branch, targetIndex: branchTargetIndex(animatic.shots, branch.nextShotId) }))
        : [];

    const issueCounts = animatic.issues.reduce((counts, issue) => {
        counts[issue.level] += 1;
        return counts;
    }, { error: 0, warning: 0, info: 0 });

    const issueRuleIds = new Set(animatic.styleReport.issues.map((issue) => issue.ruleId));

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement="right"
            size="min(1180px, 96vw)"
            destroyOnHidden
            title={
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-lg border border-acid/30 bg-acid/[0.06] text-acid"><Clapperboard className="size-4" /></span>
                    <span className="min-w-0">
                        <span className="block font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">PREVIS / 预演</span>
                        <span className="block truncate text-sm font-semibold text-foreground">{project.title}</span>
                    </span>
                </div>
            }
            styles={{ body: { padding: 0, overflow: "hidden" } }}
        >
            <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-2.5">
                    <span className="chip">{animatic.metrics.shotCount} 镜</span>
                    <span className="chip">{animatic.metrics.sceneCount} 场</span>
                    <span className="chip normal-case">总长 {formatAnimaticDuration(animatic.totalDuration)}</span>
                    {animatic.targetDuration ? <span className="chip normal-case">目标 {formatAnimaticDuration(animatic.targetDuration)}</span> : null}
                    {animatic.durationDelta !== undefined ? (
                        <span className={cn("chip normal-case", Math.abs(animatic.durationDelta) > (animatic.targetDuration || 1) * 0.2 ? "border-amber-500/40 text-amber-500" : "border-acid/30 text-acid")}>
                            {animatic.durationDelta >= 0 ? "+" : ""}{Math.round(animatic.durationDelta)}s
                        </span>
                    ) : null}
                    {style ? <span className="chip border-acid/30 text-acid">风格 {animatic.styleReport.score}%</span> : <span className="chip">未选择导演风格</span>}
                    {branchEdges.length ? (
                        <button type="button" onClick={() => { setInteractive((value) => !value); setChoiceOpen(false); }} aria-pressed={interactive} className={cn("chip normal-case cursor-pointer transition-colors", interactive ? "border-acid/40 bg-acid/10 text-acid" : "hover:border-acid/40 hover:text-foreground")}>
                            <GitBranch className="size-3" />互动分支 {branchEdges.length}
                        </button>
                    ) : null}
                    <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground/60 sm:flex">
                        <Clock3 className="size-3" />
                        空格播放 / ← → 切换镜头
                    </span>
                </div>

                <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="flex min-h-0 flex-col">
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
                            {!animatic.shots.length ? (
                                <div className="grid place-items-center rounded-xl border border-dashed border-border/70 px-6 py-16 text-center">
                                    <div className="grid size-12 place-items-center rounded-xl border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70"><Clapperboard className="size-5" /></div>
                                    <p className="mt-4 text-sm font-medium text-foreground">还没有分镜可以预演</p>
                                    <p className="mt-1.5 text-xs leading-6 text-muted-foreground">先在剧本页从剧本解析出镜头，或手动添加分镜。</p>
                                </div>
                            ) : (
                                <>
                                    <div className="relative mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-border/70 bg-muted/40" style={{ aspectRatio: filmAspectCssRatio(project.aspect), maxHeight: "42vh" }}>
                                        {imageSrc ? <img src={imageSrc} alt={current ? "镜头 " + current.shot.shotNo : "分镜"} className="h-full w-full object-cover" /> : (
                                            <div className="grid h-full place-items-center gap-2 text-center text-xs text-muted-foreground">
                                                <div className="grid size-10 place-items-center rounded-lg border border-border/70 bg-background/60"><Clapperboard className="size-4 opacity-60" /></div>
                                                <span>该镜头还没有分镜图</span>
                                            </div>
                                        )}
                                        {current ? (
                                            <>
                                                <div className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] tracking-wide text-white backdrop-blur">
                                                    {current.episodeTitle} / {current.sceneName} / 镜头 {current.shot.shotNo}
                                                </div>
                                                <div className="absolute right-2 top-2 flex gap-1">
                                                    <span className="rounded-md bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">{filmShotTypeLabel(current.shot.shotType)}</span>
                                                    {current.shot.cameraMovement ? <span className="rounded-md bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">{current.shot.cameraMovement}</span> : null}
                                                    <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] text-white backdrop-blur">{formatAnimaticDuration(current.duration)}</span>
                                                </div>
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-10 text-white">
                                                    <p className="line-clamp-2 text-[13px] leading-5">{current.shot.description || current.shot.prompt || "还没有画面描述"}</p>
                                                    {current.shot.dialogue ? <p className="mt-1 line-clamp-1 text-[11px] text-white/75">台词：{current.shot.dialogue}</p> : null}
                                                    {current.shot.audio ? <p className="mt-0.5 line-clamp-1 text-[11px] text-white/60">声音：{current.shot.audio}</p> : null}
                                                </div>
                                            </>
                                        ) : null}
                                        {choiceOpen && branchOptions.length ? (
                                            <div className="absolute inset-0 z-20 grid place-items-end bg-black/45 p-3">
                                                <div className="w-full rounded-lg border border-acid/40 bg-background/95 p-3 text-foreground shadow-xl backdrop-blur">
                                                    <p className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] text-acid uppercase"><GitBranch className="size-3" />互动分支 · 选择走向</p>
                                                    <div className="mt-2 grid gap-1.5">
                                                        {branchOptions.map((option, index) => (
                                                            <div key={index} className="flex flex-wrap items-center gap-2">
                                                                <Button size="small" type="primary" disabled={option.targetIndex < 0} onClick={() => chooseBranch(option.branch)}>
                                                                    {option.branch.label || "继续"}
                                                                </Button>
                                                                {option.branch.condition ? <span className="text-[10px] text-muted-foreground/70">{option.branch.condition}</span> : null}
                                                                {option.targetIndex < 0 ? <span className="text-[10px] text-amber-500">目标镜头不存在</span> : null}
                                                            </div>
                                                        ))}
                                                        <div><Button size="small" onClick={skipBranch}>跳过分支</Button></div>
                                                        {(project.interactiveVariables || []).length ? <p className="text-[9px] leading-4 text-muted-foreground/60">变量：{(project.interactiveVariables || []).map((variable) => variable.name + "=" + (variables[variable.id] ?? variable.initialValue ?? "")).join(" · ")}</p> : null}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="mx-auto mt-3 flex w-full max-w-[760px] flex-wrap items-center gap-2">
                                        <div className="flex items-center gap-1">
                                            <Button size="small" icon={<ChevronLeft className="size-4" />} disabled={index <= 0} onClick={() => seek(index - 1)} aria-label="上一镜" />
                                            <Button size="small" type="primary" className="!w-[76px]" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => { if (!animatic.shots.length) return; if (!playing && index >= animatic.shots.length - 1) setIndex(0); setPlaying((value) => !value); }}>
                                                {playing ? "暂停" : "播放"}
                                            </Button>
                                            <Button size="small" icon={<ChevronRight className="size-4" />} disabled={index >= animatic.shots.length - 1} onClick={() => seek(index + 1)} aria-label="下一镜" />
                                        </div>
                                        <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/40 p-0.5">
                                            {[1, 2, 4].map((value) => (
                                                <button key={value} type="button" onClick={() => setSpeed(value)} aria-pressed={speed === value} className={cn("rounded px-2 py-1 font-mono text-[10px] transition-colors", speed === value ? "bg-acid/12 text-acid" : "text-muted-foreground hover:text-foreground")}>{value}x</button>
                                            ))}
                                        </div>
                                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                                            {formatAnimaticDuration(current ? current.start : 0)} / {formatAnimaticDuration(animatic.totalDuration)}
                                        </span>
                                        {animatic.metrics.longestScene ? <span className="ml-auto hidden text-[10px] text-muted-foreground/60 sm:inline">最长场：{animatic.metrics.longestScene.name} · {formatAnimaticDuration(animatic.metrics.longestScene.duration)}</span> : null}
                                    </div>

                                    <div ref={timelineRef} className="mt-4 flex gap-3 overflow-x-auto pb-1">
                                        {animatic.scenes.map((scene) => (
                                            <div key={scene.id} className="shrink-0">
                                                <div className="mb-1 truncate font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60 uppercase">{scene.episodeTitle} / {scene.name}</div>
                                                <div className="flex gap-1">
                                                    {scene.shots.map((item) => {
                                                        const active = item.index === index;
                                                        return (
                                                            <button
                                                                key={item.shot.id}
                                                                type="button"
                                                                data-previs-shot
                                                                onClick={() => { setIndex(item.index); setPlaying(false); }}
                                                                title={"镜头 " + item.shot.shotNo + " · " + formatAnimaticDuration(item.duration)}
                                                                className={cn("group relative h-10 overflow-hidden rounded-md border text-left transition-colors", active ? "border-acid bg-acid/10" : "border-border/60 bg-muted/40 hover:border-acid/40")}
                                                                style={{ width: Math.max(30, Math.min(150, Math.round(item.duration * 8))) }}
                                                            >
                                                                <span className="absolute inset-0 grid place-items-center font-mono text-[9px] tabular-nums text-foreground/70">{item.shot.shotNo}</span>
                                                                <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-acid/25" style={{ transform: "scaleX(" + Math.min(1, item.duration / 6) + ")", transformOrigin: "left" }} />
                                                                {shotBranchList(item.shot).length ? <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-acid" title={"分支：" + (shotBranchList(item.shot)[0]?.label || "未命名")} /> : null}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <aside className="thin-scrollbar min-h-0 overflow-y-auto border-t border-border/70 lg:border-l lg:border-t-0">
                        <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
                            {([{ key: "issues", label: "预演问题" }, { key: "style", label: "风格检查" }, ...(interactiveVariables.length ? [{ key: "variables", label: "变量 " + interactiveVariables.length }] : [])] as Array<{ key: "issues" | "style" | "variables"; label: string }>).map((item) => (
                                <button key={item.key} type="button" onClick={() => setSideTab(item.key)} aria-pressed={sideTab === item.key} className={cn("rounded-md px-2.5 py-1 text-[11px] transition-colors", sideTab === item.key ? "bg-foreground/8 font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                    {item.label}
                                </button>
                            ))}
                            <span className="ml-auto flex items-center gap-1 font-mono text-[9px] text-muted-foreground/60">
                                {issueCounts.error ? <span className="text-red-500">{issueCounts.error} 严重</span> : null}
                                {issueCounts.warning ? <span className="text-amber-500">{issueCounts.warning} 提醒</span> : null}
                                {issueCounts.info ? <span>{issueCounts.info} 建议</span> : null}
                            </span>
                        </div>

                        {sideTab === "issues" ? (
                            <div className="grid gap-2 p-3">
                                {!animatic.issues.length ? (
                                    <div className="flex items-center gap-2 rounded-lg border border-acid/30 bg-acid/[0.04] px-3 py-2.5 text-xs text-acid">
                                        <CheckCircle2 className="size-4 shrink-0" />
                                        预演检查通过，没有发现时长、覆盖、连续性或风格问题。
                                    </div>
                                ) : (
                                    animatic.issues.map((issue) => {
                                        const tone = LEVEL_STYLE[issue.level];
                                        const Icon = tone.icon;
                                        return (
                                            <button
                                                key={issue.id}
                                                type="button"
                                                onClick={() => jump(issue.shotId)}
                                                disabled={!issue.shotId}
                                                className={cn("flex w-full items-start gap-2 rounded-lg border bg-card/50 px-3 py-2 text-left transition-colors", issue.shotId ? "hover:border-acid/40 hover:bg-card" : "cursor-default", tone.className)}
                                            >
                                                <Icon className="mt-0.5 size-3.5 shrink-0" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[11px] leading-5 text-foreground/85">{issue.message}</span>
                                                    {issue.suggestion ? <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground/70">{issue.suggestion}</span> : null}
                                                    <span className="mt-1 flex items-center gap-2 font-mono text-[9px] tracking-wide text-muted-foreground/50 uppercase">
                                                        <span>{tone.label}</span>
                                                        {issue.shotId ? <span>点击跳到镜头</span> : null}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        ) : sideTab === "style" ? (
                            <div className="grid gap-3 p-3">
                                {style ? (
                                    <>
                                        <div className="rounded-lg border border-border/70 bg-card/50 p-3">
                                            <div className="flex items-center gap-2">
                                                <span className="grid size-8 place-items-center rounded-lg border border-acid/30 bg-acid/[0.06] text-acid"><Sparkles className="size-4" /></span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-semibold text-foreground">{style.name}</p>
                                                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{style.tagline}</p>
                                                </div>
                                                <span className="ml-auto font-mono text-lg font-semibold tabular-nums text-acid">{animatic.styleReport.score}%</span>
                                            </div>
                                            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                                                <span>平均镜头 {animatic.styleReport.metrics.averageDuration.toFixed(1)}s</span>
                                                <span>关键词覆盖 {Math.round(animatic.styleReport.metrics.keywordRatio * 100)}%</span>
                                                <span>运镜覆盖 {Math.round(animatic.styleReport.metrics.movementRatio * 100)}%</span>
                                                <span>规则 {animatic.styleReport.passed}/{animatic.styleReport.total} 通过</span>
                                            </div>
                                        </div>

                                        <div className="grid gap-1.5">
                                            {style.rules.map((rule) => {
                                                const failed = issueRuleIds.has(rule.id);
                                                return (
                                                    <div key={rule.id} className="flex items-start gap-2 rounded-md border border-border/50 bg-background/30 px-2.5 py-2 text-[11px]">
                                                        {failed ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-acid" />}
                                                        <span className="min-w-0 flex-1 leading-5 text-foreground/80">{rule.label}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                                            <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">景别分布</p>
                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                                {Object.entries(animatic.styleReport.metrics.shotTypeRatio).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                                                    <span key={type} className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{filmShotTypeLabel(type)} × {count}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-xs leading-6 text-muted-foreground">
                                        项目还没有选择导演风格。
                                        <br />在「项目设置」里选择一个风格后，这里会显示风格执行度与规则检查。
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid gap-2 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">运行时变量</span>
                                    <Button size="small" type="text" className="!ml-auto !h-6 !px-1.5 !text-[10px]" onClick={() => setVariables(initialFilmVariables(project))}>重置为初始值</Button>
                                </div>
                                <p className="text-[10px] leading-4 text-muted-foreground/60">修改只影响本次预演，不会写回项目；初始值在分支面板里配置。</p>
                                {variableUsage.map((usage) => {
                                    const variable = usage.variable;
                                    const value = variables[variable.id] ?? variable.initialValue;
                                    return (
                                        <div key={variable.id} className="grid gap-1.5 rounded-lg border border-border/60 bg-card/50 p-2.5">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[11px] font-medium text-foreground/85">{variable.name}</span>
                                                <span className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">{variable.type}</span>
                                                <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">初始 {variable.initialValue || "空"}</span>
                                            </div>
                                            {variable.type === "boolean" ? (
                                                <Select size="small" value={value === "true" ? "true" : "false"} options={[{ value: "true", label: "true" }, { value: "false", label: "false" }]} onChange={(next) => setVariables((current) => ({ ...current, [variable.id]: next }))} />
                                            ) : variable.type === "number" ? (
                                                <InputNumber size="small" className="w-full" value={Number(value) || 0} onChange={(next) => setVariables((current) => ({ ...current, [variable.id]: String(next ?? 0) }))} />
                                            ) : (
                                                <Input size="small" value={value} onChange={(event) => setVariables((current) => ({ ...current, [variable.id]: event.target.value }))} />
                                            )}
                                            <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground/60">
                                                <span>条件 {usage.conditionCount}</span>
                                                <span>·</span>
                                                <span>效果 {usage.effectCount}</span>
                                                {usage.shots.map((shot) => (
                                                    <button key={shot.shotId} type="button" onClick={() => jump(shot.shotId)} className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[9px] text-foreground/75 transition-colors hover:bg-acid/15 hover:text-acid" title={"分支：" + shot.branchLabel}>镜头 {shot.shotNo}</button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </Drawer>
    );
}
