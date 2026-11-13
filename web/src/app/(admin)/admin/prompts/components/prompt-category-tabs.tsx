"use client";

import { cn } from "@/lib/utils";
import type { AdminPromptCategory } from "@/services/api/admin";

export function PromptCategoryTabs({ categories, value, onChange }: { categories: AdminPromptCategory[]; value: string; onChange: (value: string) => void }) {
    const items = [{ category: "", name: "全部" }, ...categories];
    return (
        <div className="hide-scrollbar flex items-center gap-1 overflow-x-auto">
            {items.map((item) => {
                const active = item.category === value;
                return (
                    <button
                        key={item.category || "all"}
                        type="button"
                        onClick={() => onChange(item.category)}
                        className={cn(
                            "shrink-0 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                            active ? "bg-acid/10 font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                        )}
                    >
                        {item.name}
                    </button>
                );
            })}
        </div>
    );
}
