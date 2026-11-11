"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import { Sparkles } from "lucide-react";

import { WorkbenchHeader, type WorkbenchLayout } from "@/components/workbench-header";

/** 侧边工作台面板的共用外壳：标题栏、滚动内容区与底部主操作。 */
export function WorkbenchSidePanel({ title, currentLayout, onLayoutChange, canGenerate, onGenerate, generateLabel, generateHint, children }: {
    title: string;
    currentLayout: WorkbenchLayout;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    canGenerate: boolean;
    onGenerate: () => void;
    generateLabel: string;
    generateHint?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="punk-panel flex min-h-[460px] flex-col overflow-hidden rounded-xl lg:min-h-0">
            <div className="shrink-0 overflow-hidden border-b border-border/70 px-4 py-3.5">
                <WorkbenchHeader title={title} currentLayout={currentLayout} onLayoutChange={onLayoutChange} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">{children}</div>
            <div className="shrink-0 border-t border-border/70 px-4 py-3.5">
                <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                    {generateLabel}
                </Button>
                {generateHint ? <div className="mt-1.5 flex justify-center text-[11px] text-muted-foreground/75">{generateHint}</div> : null}
            </div>
        </div>
    );
}
