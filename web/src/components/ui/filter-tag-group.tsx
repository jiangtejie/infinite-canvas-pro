"use client";

import { Tag } from "antd";

import { cn } from "@/lib/utils";

type FilterTagOption = string | { value: string; label: string };

export function FilterTagGroup({ label, options, isSelected, onSelect, className, inline = false }: {
    label?: string;
    options: readonly FilterTagOption[];
    isSelected: (value: string) => boolean;
    onSelect: (value: string) => void;
    className?: string;
    inline?: boolean;
}) {
    const tags = options.map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const text = typeof option === "string" ? option : option.label;
        return (
            <Tag.CheckableTag
                key={value || "all"}
                checked={isSelected(value)}
                className={cn("prompt-filter-tag", isSelected(value) && "is-active")}
                onChange={() => onSelect(value)}
            >
                {text}
            </Tag.CheckableTag>
        );
    });

    if (inline) return <div className={cn("flex flex-wrap gap-2", className)}>{tags}</div>;

    return (
        <div className={cn("grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start", className)}>
            <div className="pt-2 text-xs font-medium text-muted-foreground">{label}</div>
            <div className="thin-scrollbar flex max-h-[112px] flex-wrap gap-2 overflow-y-auto pr-1">{tags}</div>
        </div>
    );
}
