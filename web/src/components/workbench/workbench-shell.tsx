import type { ReactNode } from "react";

import type { WorkbenchLayout } from "@/components/workbench-header";

/** 底部布局时结果区需要给底部创作栏留出空间。 */
export const WORKBENCH_BOTTOM_RESULTS_CLASS = "min-h-[360px] flex-1 pb-40 lg:pb-44";

/**
 * 生图 / 视频工作台共用的页面壳：只负责侧边・底部两种布局下创作区与结果区的排布，
 * 具体面板与结果区由各页适配层以插槽传入。
 */
export function WorkbenchShell({ layout, panel, results }: { layout: WorkbenchLayout; panel: ReactNode; results: ReactNode }) {
    return (
        <main className={`${layout === "side" ? "grid grid-cols-1 lg:grid-cols-[minmax(300px,376px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]" : "relative flex flex-col"} min-h-0 flex-1 gap-4 overflow-y-auto p-3 lg:overflow-hidden lg:p-4`}>
            {layout === "side" ? (
                <>
                    {panel}
                    {results}
                </>
            ) : (
                <>
                    {results}
                    {panel}
                </>
            )}
        </main>
    );
}
