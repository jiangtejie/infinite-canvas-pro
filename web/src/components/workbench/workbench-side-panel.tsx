"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import { Sparkles } from "lucide-react";

import { WorkbenchHeader, type WorkbenchLayout } from "@/components/workbench-header";
import { PunkAura } from "@/components/ui/punk-aura";

/** 侧边工作台面板的共用外壳：标题栏、滚动内容区与底部主操作。 */
export function WorkbenchSidePanel({ title, currentLayout, onLayoutChange, canGenerate, onGenerate, generateLabel, children }: {
    title: string;
    currentLayout: WorkbenchLayout;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    canGenerate: boolean;
    onGenerate: () => void;
    generateLabel: string;
    children: ReactNode;
}) {
    return (
        <div className="punk-panel flex min-h-[420px] flex-col overflow-hidden rounded-xl lg:min-h-0">
            <div className="relative shrink-0 overflow-hidden border-b border-border/70 px-4 py-3">
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><PunkAura className="punk-aura opacity-60" /></div>
                <div className="relative"><WorkbenchHeader title={title} currentLayout={currentLayout} onLayoutChange={onLayoutChange} /></div>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>
            <div className="shrink-0 border-t border-border/70 px-4 py-3">
                <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                    {generateLabel}
                </Button>
            </div>
        </div>
    );
}
