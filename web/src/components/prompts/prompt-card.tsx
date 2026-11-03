"use client";

import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Tag } from "antd";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptCard({
    item,
    onOpen,
    onCopy,
    actionLabel = "复制",
    actionIcon = <Copy className="size-3.5" />,
    actionType = "text",
    extraAction,
}: {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    actionLabel?: string;
    actionIcon?: ReactNode;
    actionType?: "text" | "primary";
    extraAction?: ReactNode;
}) {
    return (
        <article className="punk-card group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
            <button type="button" className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-muted/50 text-left" onClick={onOpen} aria-label={`查看 ${item.title}`}>
                <img loading="lazy" decoding="async" src={item.coverUrl} alt={item.title} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="absolute left-2.5 top-2.5 inline-flex h-5 max-w-[70%] items-center truncate rounded-[3px] border border-white/15 bg-black/55 px-1.5 font-mono text-[10px] tracking-[0.1em] text-white/85 uppercase backdrop-blur">
                    {item.category || "未分类"}
                </span>
                <span className="absolute bottom-2.5 right-2.5 font-mono text-[10px] tracking-[0.1em] text-white/70 tabular-nums">{formatPromptDate(item.updatedAt)}</span>
            </button>
            <div className="flex flex-1 flex-col gap-3 p-4">
                <button type="button" className="cursor-pointer text-left" onClick={onOpen}>
                    <h2 className="line-clamp-1 text-sm font-medium text-foreground">{item.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.prompt}</p>
                </button>
                <div className="flex flex-wrap gap-1.5">
                    {item.tags.slice(0, 3).map((tag) => (
                        <Tag key={tag} className="!m-0 !rounded-[3px] !text-[10px]">
                            {tag}
                        </Tag>
                    ))}
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/70 uppercase">{item.tags[0] || "PROMPT"}</span>
                    <div className="flex shrink-0 items-center gap-1">
                        {extraAction}
                        <Button type={actionType} size="small" icon={actionIcon} onClick={onCopy}>
                            {actionLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </article>
    );
}
