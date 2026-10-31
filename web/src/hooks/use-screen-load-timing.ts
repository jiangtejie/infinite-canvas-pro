"use client";

import { useEffect } from "react";

export type ScreenTiming = { screen: string; mountedMs: number; navigationMs: number };

/** 开发环境记录首屏挂载耗时，便于排查视频页、工作流页的加载卡顿。 */
export function useScreenLoadTiming(screen: string) {
    useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const timing: ScreenTiming = {
            screen,
            mountedMs: Math.round(performance.now()),
            navigationMs: Math.round(navigation?.duration || 0),
        };
        const holder = window as unknown as { __screenTimings?: ScreenTiming[] };
        holder.__screenTimings = [...(holder.__screenTimings || []), timing];
        if (timing.mountedMs > 2500) console.warn(`[首屏] ${screen} 挂载耗时 ${timing.mountedMs}ms（导航 ${timing.navigationMs}ms）`);
    }, [screen]);
}
