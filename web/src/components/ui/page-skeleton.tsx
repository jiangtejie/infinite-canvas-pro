import { cn } from "@/lib/utils";

export function WorkbenchSkeleton({ label = "正在加载工作台...", className }: { label?: string; className?: string }) {
    return (
        <div aria-busy className={cn("flex h-full gap-3 p-4", className)}>
            <div className="hidden w-[320px] shrink-0 space-y-3 lg:block">
                <div className="h-8 w-32 rounded-md bg-muted motion-safe:animate-pulse" />
                <div className="h-40 rounded-lg bg-muted motion-safe:animate-pulse" />
                <div className="h-32 rounded-lg bg-muted motion-safe:animate-pulse" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
                <div className="h-8 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="h-56 rounded-lg bg-muted motion-safe:animate-pulse" />
                    ))}
                </div>
            </div>
            <span className="sr-only" aria-live="polite">{label}</span>
        </div>
    );
}
