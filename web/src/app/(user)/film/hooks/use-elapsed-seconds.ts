"use client";

import { useEffect, useState } from "react";

/** 生成计时：active 为 true 时按秒自增，结束后归零。 */
export function useElapsedSeconds(active: boolean) {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        if (!active) {
            setSeconds(0);
            return;
        }
        const startedAt = Date.now();
        setSeconds(0);
        const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [active]);
    return seconds;
}
