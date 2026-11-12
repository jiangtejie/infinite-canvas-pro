"use client";

import { Button, Modal } from "antd";
import { CheckCircle2, ShieldCheck, XCircle, AlertTriangle, Info } from "lucide-react";

import type { FilmConsistencyIssue, FilmConsistencyReview } from "@/lib/film/types";

const CATEGORY_LABEL: Record<FilmConsistencyIssue["category"], string> = {
    structure: "结构覆盖",
    continuity: "连续性",
    style: "风格漂移",
    binding: "绑定",
};

const LEVEL_STYLE: Record<FilmConsistencyIssue["level"], { icon: typeof XCircle; className: string }> = {
    error: { icon: XCircle, className: "text-hot" },
    warning: { icon: AlertTriangle, className: "text-amber-500" },
    info: { icon: Info, className: "text-muted-foreground" },
};

export function FilmConsistencyReviewModal({ open, review, reviewing, onClose, onReview, onJumpToShot }: { open: boolean; review?: FilmConsistencyReview; reviewing: boolean; onClose: () => void; onReview: () => void; onJumpToShot: (shotId: string) => void }) {
    const issues = review?.issues || [];
    return (
        <Modal
            title={
                <span className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-acid" />
                    一致性检查
                </span>
            }
            open={open}
            onCancel={onClose}
            width={820}
            footer={[
                <Button key="close" onClick={onClose}>关闭</Button>,
                <Button key="review" type="primary" loading={reviewing} onClick={onReview}>{review ? "重新检查" : "开始检查"}</Button>,
            ]}
        >
            {!review ? (
                <div className="grid place-items-center gap-2 py-12 text-center">
                    <div className="grid size-12 place-items-center rounded-xl border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70"><ShieldCheck className="size-5" /></div>
                    <p className="text-sm font-medium text-foreground">检查结构覆盖、连续性与风格漂移</p>
                    <p className="max-w-md text-xs leading-6 text-muted-foreground">一致性代理会对照结构计划和导演风格，指出具体哪场哪镜有问题；结果同时会合并进预演问题列表。</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {review.summary ? <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[11px] leading-5 text-foreground/80">{review.summary}</p> : null}
                    {!issues.length ? (
                        <div className="flex items-center gap-2 rounded-lg border border-acid/30 bg-acid/[0.04] px-3 py-3 text-xs text-acid"><CheckCircle2 className="size-4" />没有发现结构、连续性或风格问题。</div>
                    ) : (
                        <div className="grid gap-2">
                            {issues.map((issue) => {
                                const tone = LEVEL_STYLE[issue.level];
                                const Icon = tone.icon;
                                return (
                                    <button
                                        key={issue.id}
                                        type="button"
                                        disabled={!issue.shotId}
                                        onClick={() => { if (issue.shotId) { onJumpToShot(issue.shotId); onClose(); } }}
                                        className={"flex w-full items-start gap-2 rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-left transition-colors " + (issue.shotId ? "hover:border-acid/40" : "cursor-default")}
                                    >
                                        <Icon className={"mt-0.5 size-3.5 shrink-0 " + tone.className} />
                                        <span className="min-w-0 flex-1">
                                            <span className="mb-1 flex items-center gap-2 font-mono text-[9px] tracking-wide text-muted-foreground/60 uppercase">
                                                <span>{CATEGORY_LABEL[issue.category]}</span>
                                                {issue.shotId ? <span>可跳转镜头</span> : null}
                                            </span>
                                            <span className="block text-[11px] leading-5 text-foreground/85">{issue.message}</span>
                                            {issue.suggestion ? <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground/70">{issue.suggestion}</span> : null}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
