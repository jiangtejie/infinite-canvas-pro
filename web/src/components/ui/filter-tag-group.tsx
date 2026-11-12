"use client";

import { useState } from "react";
import { Tag } from "antd";

import { cn } from "@/lib/utils";

type FilterTagOption = string | { value: string; label: string };

export function FilterTagGroup({ label, options, isSelected, onSelect, className, inline = false, collapsible = false, collapsedCount = 14 }: {
    label?: string;
    options: readonly FilterTagOption[];
    isSelected: (value: string) => boolean;
    onSelect: (value: string) => void;
    className?: string;
    inline?: boolean;
    /** 标签很多时默认只展示前 collapsedCount 个，其余收进「展开全部」。 */
    collapsible?: boolean;
    collapsedCount?: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const optionValue = (option: FilterTagOption) => (typeof option === "string" ? option : option.value);
    // 折叠时额外保留选中项：否则生效中的筛选会随标签一起被藏起来，界面上看不出还在过滤。
    const visibleOptions = collapsible && !expanded ? options.filter((option, index) => index < collapsedCount || isSelected(optionValue(option))) : options;
    const hiddenCount = options.length - visibleOptions.length;

    const tags = visibleOptions.map((option) => {
        const value = optionValue(option);
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

    const toggle = collapsible && (hiddenCount > 0 || expanded) ? (
        <button
            type="button"
            aria-expanded={expanded}
            className="cursor-pointer self-center text-[12px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            onClick={() => setExpanded((value) => !value)}
        >
            {expanded ? "收起" : `展开更多 +${hiddenCount}`}
        </button>
    ) : null;

    if (inline) {
        return (
            <div className={cn("flex flex-wrap items-center gap-2", className)}>
                {tags}
                {toggle}
            </div>
        );
    }

    return (
        <div className={cn("grid gap-2 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start", className)}>
            <div className="pt-1.5 font-mono text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase">{label}</div>
            <div className="flex flex-col gap-1.5">
                <div className="hide-scrollbar flex flex-wrap gap-2 pr-1 sm:max-h-[112px] sm:overflow-y-auto">{tags}</div>
                {toggle}
            </div>
        </div>
    );
}
