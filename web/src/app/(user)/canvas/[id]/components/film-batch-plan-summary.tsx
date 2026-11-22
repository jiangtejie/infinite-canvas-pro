import type { FilmBatchPlan, FilmBatchSkipReason } from "../lib/film-batch-preflight";

const REASON_LABELS: Record<FilmBatchSkipReason, string> = {
    "missing-shot": "镜头不存在",
    "no-text": "缺画面描述或提示词",
    busy: "正在生成或停止中",
    "frames-missing-first": "首尾帧模式缺首帧",
    "compile-error": "上下文编译失败",
};

function shotNumbers(ids: string[]) {
    return ids.length > 6 ? `${ids.slice(0, 6).join("、")} 等 ${ids.length} 镜` : ids.join("、");
}

export function FilmBatchPlanSummary({ plan }: { plan: FilmBatchPlan }) {
    const groups = new Map<string, { message: string; shotNos: string[] }>();
    plan.skipped.forEach((skip) => {
        const key = `${skip.reason}|${skip.message}`;
        const group = groups.get(key);
        if (group) group.shotNos.push(skip.shotNo);
        else groups.set(key, { message: skip.message, shotNos: [skip.shotNo] });
    });
    return (
        <div className="flex flex-col gap-3">
            <div>
                将生成 <span className="font-semibold text-foreground">{plan.ready.length}</span> 镜{plan.kind === "image" ? "分镜图" : "视频"}，按镜头顺序逐个执行；单个失败不影响后续。
            </div>
            {plan.skipped.length ? (
                <div className="flex flex-col gap-1">
                    <div>将跳过 <span className="font-semibold text-foreground">{plan.skipped.length}</span> 镜：</div>
                    {[...groups.entries()].map(([key, group]) => (
                        <div key={key} className="text-muted-foreground">
                            {REASON_LABELS[key.split("|")[0] as FilmBatchSkipReason] || group.message}{key.includes("compile-error") ? `：${group.message}` : ""} · {shotNumbers(group.shotNos)}
                        </div>
                    ))}
                </div>
            ) : null}
            {plan.warnings ? (
                <div className="text-muted-foreground">
                    参考提醒 {plan.warningShots.length} 镜（{plan.warnings} 条），不会阻止生成；可在生成信息中查看缺失参考与预算省略。
                </div>
            ) : null}
            <div className="text-muted-foreground">跳过的镜头保持原状，可返回补充后再批量生成。</div>
        </div>
    );
}
