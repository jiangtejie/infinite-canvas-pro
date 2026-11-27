"use client";

import type { ReactNode, Ref } from "react";
import { Input, type InputRef } from "antd";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/** 列表页统一的搜索框：44px 卡片 + 图标 + 无边框输入，右侧可放计数、快捷键提示或提交按钮。 */
export function SearchField({ value, onChange, placeholder, trailing, inputRef, onEnter, className, ariaLabel }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    trailing?: ReactNode;
    inputRef?: Ref<InputRef>;
    onEnter?: () => void;
    className?: string;
    ariaLabel?: string;
}) {
    return (
        <div className={cn("flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-card/70 px-3.5 backdrop-blur-xl transition-colors focus-within:border-acid/50 lg:max-w-md", className)}>
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
                ref={inputRef}
                variant="borderless"
                allowClear
                aria-label={ariaLabel || placeholder}
                className="!bg-transparent"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                onPressEnter={onEnter}
            />
            {trailing}
        </div>
    );
}
