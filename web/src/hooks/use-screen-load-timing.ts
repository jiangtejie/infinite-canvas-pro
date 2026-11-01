"use client";

import { useEffect } from "react";

export type ScreenTiming = { screen: string; mountedMs: number; navigationMs: number; hardLoad: boolean };

const warned = new Set<string>();

/** 开发环境记录首屏挂载耗时，便于排查视频页、工作流页的加载卡顿。 */
export function useScreenLoadTiming(screen: string) {
    useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        const mountedMs = Math.round(performance.now());
        // 客户端路由切换时 performance.now() 是「文档打开至今」，不能当首屏耗时用。
        const hardLoad = mountedMs < 30000;
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const timing: ScreenTiming = { screen, mountedMs, navigationMs: Math.round(navigation?.duration || 0), hardLoad };
        const holder = window as unknown as { __screenTimings?: ScreenTiming[] };
        holder.__screenTimings = [...(holder.__screenTimings || []), timing];
        if (hardLoad && mountedMs > 2500 && !warned.has(screen)) {
            warned.add(screen);
            console.warn(`[首屏] ${screen} 挂载耗时 ${mountedMs}ms（导航 ${timing.navigationMs}ms）`);
        }
    }, [screen]);
}
