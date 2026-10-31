"use client";

import type { ReactNode } from "react";

export function ReferenceStripShell({ compact = false, className = "", children }: {
    compact?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={`hover-scrollbar hover-scrollbar-hint flex w-full min-w-0 max-w-full touch-pan-x gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed border-border p-2 overscroll-x-contain ${compact ? "min-h-14" : "min-h-24 pb-3"} ${className}`}
            onWheel={(event) => {
                if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                event.preventDefault();
                event.currentTarget.scrollLeft += event.deltaY;
            }}
        >
            {children}
        </div>
    );
}
