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
            <span
                key={value || "all"}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected(value)}
                className="inline-flex"
                onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelect(value);
                }}
            >
                <Tag.CheckableTag
                    checked={isSelected(value)}
                    className={cn("prompt-filter-tag", isSelected(value) && "is-active")}
                    onChange={() => onSelect(value)}
                >
                    {text}
                </Tag.CheckableTag>
            </span>
        );
    });

    if (inline) return <div className={cn("flex flex-wrap items-center gap-2", className)}>{tags}</div>;

    return (
        <div className={cn("grid gap-2 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start", className)}>
            <div className="pt-1.5 font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground/80 uppercase">{label}</div>
            <div className="hide-scrollbar flex flex-wrap gap-2 pr-1 sm:max-h-[112px] sm:overflow-y-auto">{tags}</div>
        </div>
    );
}
