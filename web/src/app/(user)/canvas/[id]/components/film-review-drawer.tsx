"use client";

import { type ReactNode } from "react";
import { Drawer } from "antd";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { CanvasFilmMeta } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmReviewIssue, FilmReviewReport } from "../lib/film-review";
import type { FilmDirectorBoardModel } from "../lib/film-studio-types";

const SOURCE_LABELS: Record<FilmReviewIssue["source"], string> = {
    duration: "时长",
    pacing: "节奏",
    coverage: "覆盖",
    binding: "绑定",
    style: "风格",
    consistency: "AI 一致性",
};

export function FilmReviewDrawer({ open, onClose, theme, model, report, film, onOpenShot }: {
    open: boolean;
    onClose: () => void;
    theme: CanvasTheme;
    model: FilmDirectorBoardModel;
    report: FilmReviewReport | null;
    film?: CanvasFilmMeta;
    onOpenShot: (shotId: string) => void;
}) {
    const openShotIds = (shotIds: string[]) => {
        const shotId = shotIds[0];
        if (shotId) {
            onClose();
            onOpenShot(shotId);
        }
    };
    const openContext = (nodeId?: string) => {
        if (!nodeId) return false;
        onClose();
        model.onLocateAsset(nodeId);
        return true;
    };
    const openIssue = (issue: FilmReviewIssue) => {
        if (issue.targetReview) {
            if (model.consistencyReviewing || !report?.shotCount) return;
            model.onRunConsistencyReview();
            return;
        }
        if (openContext(issue.targetContextNodeId)) return;
        if (issue.targetShotId) {
            onClose();
            onOpenShot(issue.targetShotId);
            return;
        }
        if (issue.targetNodeId) {
            onClose();
            model.onSceneChange(issue.targetNodeId);
        }
    };
    const review = film?.consistencyReview;

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="min(760px, 96vw)"
            zIndex={CANVAS_Z.popover}
            title="就绪与一致性检查"
            styles={{ header: { background: theme.node.panel, color: theme.node.text }, body: { background: theme.node.panel, color: theme.node.text, paddingTop: 12 } }}
        >
            {report ? (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        {[
                            { label: "就绪", value: `${report.readiness.ready}/${report.readiness.checked}` },
                            { label: "缺参考", value: report.readiness.missing.length },
                            { label: "未锁定", value: report.readiness.unlocked.length },
                            { label: "问题", value: report.issues.length },
                        ].map((item) => (
                            <div key={item.label} className="flex items-baseline gap-1.5">
                                <span className="text-base font-semibold tabular-nums" style={{ color: theme.node.text }}>{item.value}</span>
                                <span className="text-[10px]" style={{ color: theme.node.muted }}>{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionSoft, color: theme.node.text }} disabled={model.consistencyReviewing || !report.shotCount} onClick={model.onRunConsistencyReview}>
                            <RefreshCw className={`size-3.5 ${model.consistencyReviewing ? "animate-spin" : ""}`} />
                            {model.consistencyReviewing ? "AI 检查中…" : "AI 一致性检查"}
                        </button>
                        {review ? (
                            <span className="inline-flex items-center gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                上次 {new Date(review.reviewedAt).toLocaleString("zh-CN", { hour12: false })}
                                <button type="button" className="underline underline-offset-2" onClick={model.onClearConsistencyReview}>清除结果</button>
                            </span>
                        ) : null}
                    </div>
                    {review?.summary ? <div className="rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{review.summary}</div> : null}
                    <Section theme={theme} title="缺参考">
                        {report.readiness.missing.length ? report.readiness.missing.map((item) => (
                            <button key={item.key} type="button" className="flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onClick={() => { if (!openContext(item.contextNodeId)) openShotIds(item.shotIds); }}>
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: canvasStatusColors.loading }} />
                                <span className="min-w-0">
                                    <span className="block text-xs" style={{ color: theme.node.text }}>{FILM_ASSET_KIND_LABELS[item.kind]} · {item.name}</span>
                                    <span className="block text-[11px]" style={{ color: theme.node.muted }}>{item.reason} · 镜头 {item.shotNos.join("、")}</span>
                                </span>
                            </button>
                        )) : <span className="inline-flex items-center gap-1 text-xs" style={{ color: canvasStatusColors.success }}><CheckCircle2 className="size-3.5" />绑定资产都有可用参考</span>}
                    </Section>
                    <Section theme={theme} title="未锁定">
                        {report.readiness.unlocked.length ? report.readiness.unlocked.map((item) => (
                            <button key={item.key} type="button" className="flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onClick={() => openShotIds(item.shotIds)}>
                                <span className="truncate" style={{ color: theme.node.text }}>{FILM_ASSET_KIND_LABELS[item.kind]} · {item.name}</span>
                                <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>{item.shotNos.length} 镜</span>
                            </button>
                        )) : <span className="text-xs" style={{ color: theme.node.muted }}>没有未锁定的资产参考</span>}
                    </Section>
                    <Section theme={theme} title="问题">
                        {report.issues.length ? groupIssues(report.issues).map(([source, issues]) => (
                            <div key={source} className="flex flex-col gap-1">
                                <span className="text-[10px] font-medium" style={{ color: theme.node.muted }}>{SOURCE_LABELS[source]} · {issues.length}</span>
                                {issues.map((issue) => (
                                    <button key={issue.id} type="button" className="flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left" style={{ borderColor: issue.level === "error" ? canvasStatusColors.error : theme.node.stroke, background: theme.node.fill }} onClick={() => openIssue(issue)}>
                                        <span className="mt-0.5 size-1.5 shrink-0 rounded-full" style={{ background: issue.level === "error" ? canvasStatusColors.error : issue.level === "warning" ? canvasStatusColors.loading : theme.node.muted }} />
                                        <span className="min-w-0">
                                            <span className="block text-xs" style={{ color: theme.node.text }}>{issue.message}</span>
                                            {issue.suggestion ? <span className="block text-[11px]" style={{ color: theme.node.muted }}>{issue.suggestion}</span> : null}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )) : <span className="inline-flex items-center gap-1 text-xs" style={{ color: canvasStatusColors.success }}><CheckCircle2 className="size-3.5" />没有发现覆盖、连续性、风格或绑定问题</span>}
                    </Section>
                </div>
            ) : null}
        </Drawer>
    );
}

function Section({ theme, title, children }: { theme: CanvasTheme; title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: theme.node.stroke }}>
            <span className="text-[11px] tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
            {children}
        </section>
    );
}

function groupIssues(issues: FilmReviewIssue[]) {
    const groups = new Map<FilmReviewIssue["source"], FilmReviewIssue[]>();
    issues.slice(0, 60).forEach((issue) => {
        const group = groups.get(issue.source);
        if (group) group.push(issue);
        else groups.set(issue.source, [issue]);
    });
    return [...groups.entries()];
}
