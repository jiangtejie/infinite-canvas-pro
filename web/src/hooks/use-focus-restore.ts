"use client";

import { useEffect } from "react";

/** 打开浮层时记录当前焦点，关闭时还回去；元素已卸载则忽略。 */
export function useFocusRestore(active = true) {
    useEffect(() => {
        if (!active) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return () => {
            if (previous?.isConnected) previous.focus({ preventScroll: true });
        };
    }, [active]);
}
