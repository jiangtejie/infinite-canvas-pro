import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 表单字段标签壳：标签 + 控件，统一各页重复的 Field 写法。 */
export function Field({ label, children, className, dense = false, as = "div" }: {
    label: string;
    children: ReactNode;
    className?: string;
    dense?: boolean;
    as?: "div" | "label";
}) {
    const content = (
        <>
            <span className={cn("font-mono uppercase", dense ? "text-[9px] tracking-[0.14em] text-muted-foreground/50" : "text-[10px] tracking-[0.16em] text-muted-foreground/70")}>{label}</span>
            {children}
        </>
    );
    const containerClass = className ?? (dense ? "grid gap-1" : "grid gap-1.5");
    return as === "label" ? <label className={containerClass}>{content}</label> : <div className={containerClass}>{content}</div>;
}
