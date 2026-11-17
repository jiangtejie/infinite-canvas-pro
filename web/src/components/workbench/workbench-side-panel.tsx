"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import { Sparkles } from "lucide-react";

import { WorkbenchHeader, type WorkbenchLayout } from "@/components/workbench-header";

/** 侧边工作台面板的共用外壳：标题栏、滚动内容区与底部主操作。 */
export function WorkbenchSidePanel({ title, currentLayout, onLayoutChange, canGenerate, onGenerate, generateLabel, generateHint, pendingCount = 0, children }: {
    title: string;
    currentLayout: WorkbenchLayout;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    canGenerate: boolean;
    onGenerate: () => void;
    generateLabel: string;
    generateHint?: ReactNode;
    pendingCount?: number;
    children: ReactNode;
}) {
    return (
        <div className="punk-panel flex min-h-[460px] flex-col overflow-hidden rounded-2xl lg:min-h-0">
            <div className="shrink-0 overflow-hidden border-b border-border/60 px-5 py-4">
                <WorkbenchHeader title={title} currentLayout={currentLayout} onLayoutChange={onLayoutChange} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">{children}</div>
            <div className="shrink-0 border-t border-border/60 px-5 py-4">
                {pendingCount ? (
                    <div className="mb-3 flex justify-center" role="status" aria-live="polite">
                        <span className="inline-flex items-center gap-2 rounded-full border border-acid/25 bg-acid/[0.07] px-3 py-1 text-[11px] text-foreground/80">
                            <span className="size-1.5 rounded-full bg-acid shadow-[0_0_8px_var(--acid)]" aria-hidden />
                            {pendingCount} 个任务生成中
                        </span>
                    </div>
                ) : null}
                <Button type="primary" size="large" block className="!h-11 !rounded-xl !font-medium" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                    {generateLabel}
                </Button>
                {generateHint ? <div className="mt-2 flex justify-center text-[11px] text-muted-foreground/75">{generateHint}</div> : null}
            </div>
        </div>
    );
}
