"use client";

import { Select } from "antd";

import { cn } from "@/lib/utils";
import type { AdminPromptCategory } from "@/services/api/admin";

export function PromptCategoryTabs({ categories, value, onChange }: { categories: AdminPromptCategory[]; value: string; onChange: (value: string) => void }) {
    const items = [{ category: "", name: "全部" }, ...categories];
    return (
        <>
            <div className="flex items-center gap-2 xl:hidden">
                <span className="shrink-0 text-xs text-muted-foreground">分类</span>
                <Select
                    aria-label="提示词分类"
                    value={value}
                    onChange={onChange}
                    options={items.map((item) => ({ label: item.name, value: item.category }))}
                    popupMatchSelectWidth={false}
                    className="w-full"
                />
            </div>
            <div role="group" aria-label="提示词分类" className="hidden flex-wrap items-center gap-1.5 xl:flex">
                {items.map((item) => {
                    const active = item.category === value;
                    return (
                        <button
                            key={item.category || "all"}
                            type="button"
                            aria-pressed={active}
                            title={item.name}
                            onClick={() => onChange(item.category)}
                            className={cn(
                                "max-w-[15rem] truncate rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                                active
                                    ? "border-acid/40 bg-acid/10 font-medium text-foreground"
                                    : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-foreground/5 hover:text-foreground",
                            )}
                        >
                            {item.name}
                        </button>
                    );
                })}
            </div>
        </>
    );
}
