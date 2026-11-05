"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Spin } from "antd";
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ScriptProject, ScriptScene } from "../types";
import { useScriptAi } from "../hooks/use-script-ai";
import type { ScriptSceneDiagnosis } from "../utils/script-ai";

type ScriptAiDiagnosisModalProps = {
    open: boolean;
    project: ScriptProject;
    scene: ScriptScene | null;
    onClose: () => void;
};

const SEVERITY_STYLE: Record<string, { label: string; className: string }> = {
    high: { label: "硬伤", className: "border-hot/35 text-hot" },
    medium: { label: "建议", className: "border-amber-400/30 text-amber-300" },
    low: { label: "可选", className: "border-border/70 text-muted-foreground" },
};

export function ScriptAiDiagnosisModal({ open, project, scene, onClose }: ScriptAiDiagnosisModalProps) {
    const { diagnosing, diagnoseScene } = useScriptAi();
    const [diagnosis, setDiagnosis] = useState<ScriptSceneDiagnosis | null>(null);
    const [attempted, setAttempted] = useState(false);

    useEffect(() => {
        if (!open || !scene) return;
        let cancelled = false;
        setDiagnosis(null);
        setAttempted(false);
        void (async () => {
            const result = await diagnoseScene(project, scene);
            if (cancelled) return;
            setAttempted(true);
            if (result) setDiagnosis(result);
        })();
        return () => { cancelled = true; };
    }, [open, scene?.id]);

    const run = async () => {
        if (!scene) return;
        setAttempted(false);
        const result = await diagnoseScene(project, scene);
        setAttempted(true);
        if (result) setDiagnosis(result);
    };

    return (
        <Modal title={scene ? `AI 场景诊断 · ${scene.no} 场` : "AI 场景诊断"} open={open} onCancel={onClose} footer={null} width={680} destroyOnHidden>
            <div className="grid gap-3 py-1">
                {!diagnosis ? (
                    <div className="grid place-items-center gap-3 py-12 text-center">
                        {diagnosing || !attempted ? (
                            <>
                                <Spin />
                                <p className="text-[11px] text-muted-foreground">正在读这场戏的目标、冲突和对白…</p>
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="size-5 text-muted-foreground/50" />
                                <p className="text-[11px] text-muted-foreground">暂时没有拿到诊断结果。</p>
                                <Button size="small" onClick={() => void run()}>重新诊断</Button>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                            <span className="grid size-12 shrink-0 place-items-center rounded-full border border-acid/35 bg-acid/10 font-mono text-sm font-semibold text-acid">{diagnosis.score}</span>
                            <div className="min-w-0">
                                <p className="text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">场次成立度</p>
                                <p className="mt-1 text-xs leading-5 text-foreground/85">{diagnosis.summary || "AI 没有给出总结。"}</p>
                            </div>
                        </div>
                        {diagnosis.issues.length ? (
                            <div className="grid gap-2">
                                {diagnosis.issues.map((issue, index) => {
                                    const style = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.low;
                                    return (
                                        <div key={`${issue.title}-${index}`} className="grid gap-1.5 rounded-lg border border-border/60 bg-card/40 p-3">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className={cn("chip", style.className)}>{style.label}</span>
                                                <span className="text-xs font-medium text-foreground/90">{issue.title}</span>
                                            </div>
                                            {issue.detail ? <p className="text-[11px] leading-5 text-muted-foreground/80">问题：{issue.detail}</p> : null}
                                            {issue.suggestion ? <p className="rounded-md bg-acid/[0.05] px-2 py-1.5 text-[11px] leading-5 text-acid/90">改法：{issue.suggestion}</p> : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 rounded-lg border border-acid/25 bg-acid/[0.04] p-3 text-[11px] leading-5 text-acid/90">
                                <CheckCircle2 className="size-4 shrink-0" />
                                这场戏的目标、冲突和转折是成立的，可以继续写对白。
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="font-mono text-[9px] text-muted-foreground/50">诊断只针对这一场，不自动修改正文。</span>
                            <div className="flex gap-2">
                                <Button icon={<RefreshCw className="size-3.5" />} loading={diagnosing} onClick={() => void run()}>重新诊断</Button>
                                <Button type="primary" icon={<Sparkles className="size-3.5" />} onClick={onClose}>知道了</Button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
