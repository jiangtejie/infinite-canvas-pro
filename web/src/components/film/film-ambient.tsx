"use client";

import { PunkAura } from "@/components/ui/punk-aura";
import { cn } from "@/lib/utils";

/** 影视模块的环境层：CSS 朋克光场 + 扫描线 + 移动高光。内容需压在它上面。 */
export function FilmAmbient({ className }: { className?: string }) {
    return (
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
            <PunkAura className="punk-aura opacity-50" />
            <div className="film-beam absolute inset-0" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-acid/25 to-transparent" />
            <div className="absolute -right-24 top-[-20%] size-80 rounded-full bg-acid/[0.045] blur-3xl" />
            <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, color-mix(in oklch, var(--acid) 5%, transparent), transparent 60%)" }} />
        </div>
    );
}
