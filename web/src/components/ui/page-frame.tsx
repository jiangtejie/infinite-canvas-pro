import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageFrame({ children, variant = "default", className }: { children: ReactNode; variant?: "default" | "workbench"; className?: string }) {
    if (variant === "workbench") {
        return <main className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-foreground", className)}>{children}</main>;
    }
    return (
        <main className={cn("h-full overflow-y-auto bg-transparent text-foreground", className)}>
            <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">{children}</div>
        </main>
    );
}
