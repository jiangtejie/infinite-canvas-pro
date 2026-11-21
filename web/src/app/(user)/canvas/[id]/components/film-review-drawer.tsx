"use client";

import { useMemo, type ReactNode } from "react";
import { Drawer } from "antd";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAnimaticIssue } from "@/app/(user)/film/utils/film-animatic";
import type { CanvasFilmMeta } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { CANVAS_Z } from "../lib/canvas-layer";
import { filmReviewIsStale, type FilmReviewReport } from "../lib/film-review";
import type { FilmStudioModel } from "../lib/film-studio-types";

const SOURCE_LABELS: Record<FilmAnimaticIssue["source"], string> = {
    duration: "时长",
    pacing: "节奏",
    coverage: "覆盖",
    continuity: "连续性",
    binding: "绑定",
    style: "风格",
    consistency: "AI 一致性",
    branch: "分支",
};

export function FilmReviewDrawer({ open, onClose, theme, model, report, film, onOpenShot }: {
    open: boolean;
    onClose: () => void;
    theme: CanvasTheme;
    model: FilmStudioModel;
    report: FilmReviewReport | null;
    film?: CanvasFilmMeta;
    onOpenShot: (shotId: string) => void;
}) {
    const shotIdByNo = useMemo(() => new Map(model.shots.flatMap((entry) => {
        const shotNo = entry.shot.metadata?.filmShot?.shotNo;
        return shotNo ? [[shotNo, entry.shot.id] as const] : [];
    })), [model.shots]);
    const openShotNo = (shotNo: string) => {
        const shotId = shotIdByNo.get(shotNo);
        if (shotId) onOpenShot(shotId);
    };
    const openIssue = (issue: FilmAnimaticIssue) => {
        if (issue.shotId) {
            onOpenShot(issue.shotId);
            return;
        }
        const shotId = issue.sceneId ? model.scenes.find((scene) => scene.id === issue.sceneId)?.shots[0]?.shot.id : undefined;
        if (shotId) onOpenShot(shotId);
    };
    const review = film?.consistencyReview;
    const reviewStale = filmReviewIsStale(review, report?.fingerprint);

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="min(520px, 96vw)"
            zIndex={CANVAS_Z.popover}
            title="就绪与一致性检查"
            styles={{ header: { background: theme.node.panel, color: theme.node.text }, body: { background: theme.node.panel, color: theme.node.text, paddingTop: 12 } }}
        >
            {report ? (
                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: "就绪", value: `${report.readiness.ready}/${report.readiness.checked}` },
                            { label: "缺参考", value: report.readiness.missing.length },
                            { label: "未锁定", value: report.readiness.unlocked.length },
                            { label: "问题", value: report.issues.length },
                        ].map((item) => (
                            <div key={item.label} className="rounded-lg border px-2 py-2 text-center" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                <div className="text-lg font-semibold tabular-nums" style={{ color: theme.node.text }}>{item.value}</div>
                                <div className="text-[10px]" style={{ color: theme.node.muted }}>{item.label}</div>
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
                    {reviewStale ? (
                        <div className="flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: canvasStatusColors.loading, color: theme.node.text }}>
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: canvasStatusColors.loading }} />
                            镜头、绑定或项目设置已变化，上次 AI 结论可能过期，建议重新检查。
                        </div>
                    ) : null}
                    {review?.summary ? <div className="rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{review.summary}</div> : null}
                    <Section theme={theme} title="缺参考">
                        {report.readiness.missing.length ? report.readiness.missing.map((item) => (
                            <button key={item.key} type="button" className="flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onClick={() => item.shotNos[0] && openShotNo(item.shotNos[0])}>
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
                            <button key={item.key} type="button" className="flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onClick={() => item.shotNos[0] && openShotNo(item.shotNos[0])}>
                                <span className="truncate" style={{ color: theme.node.text }}>{FILM_ASSET_KIND_LABELS[item.kind]} · {item.name}</span>
                                <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>{item.shotNos.length} 镜</span>
                            </button>
                        )) : <span className="text-xs" style={{ color: theme.node.muted }}>没有未锁定的资产参考</span>}
                    </Section>
                    <Section theme={theme} title="问题">
                        {report.issues.length ? report.issues.slice(0, 60).map((issue) => (
                            <button key={issue.id} type="button" className="flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left" style={{ borderColor: issue.level === "error" ? canvasStatusColors.error : theme.node.stroke, background: theme.node.fill }} onClick={() => openIssue(issue)}>
                                <span className="mt-0.5 size-1.5 shrink-0 rounded-full" style={{ background: issue.level === "error" ? canvasStatusColors.error : issue.level === "warning" ? canvasStatusColors.loading : theme.node.muted }} />
                                <span className="min-w-0">
                                    <span className="block text-xs" style={{ color: theme.node.text }}><span style={{ color: theme.node.muted }}>[{SOURCE_LABELS[issue.source]}] </span>{issue.message}</span>
                                    {issue.suggestion ? <span className="block text-[11px]" style={{ color: theme.node.muted }}>{issue.suggestion}</span> : null}
                                </span>
                            </button>
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
