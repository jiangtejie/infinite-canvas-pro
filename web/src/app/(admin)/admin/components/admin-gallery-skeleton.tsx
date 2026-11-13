import { cn } from "@/lib/utils";

export function AdminGallerySkeleton({ count = 8, className }: { count?: number; className?: string }) {
    return (
        <div aria-busy className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="h-64 rounded-xl border border-border/70 bg-card motion-safe:animate-pulse" />
            ))}
        </div>
    );
}
