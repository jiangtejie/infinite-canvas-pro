"use client";

import { useState } from "react";
import { Button } from "antd";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";

/** 生图卡片用的紧凑提示词块：默认两行，复制/展开仅占一行小图标。 */
export function ImagePromptBlock({ prompt, onCopyPrompt }: { prompt: string; onCopyPrompt: (text: string) => void | Promise<void> }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="rounded-lg bg-muted/60 px-2.5 py-2 text-xs">
            <p className={`whitespace-pre-wrap break-words text-foreground/80 ${expanded ? "" : "line-clamp-2"}`}>{prompt}</p>
            <div className="mt-1 flex justify-end gap-0.5">
                <Button size="small" type="text" title="复制提示词" aria-label="复制提示词" className="!h-5 !px-1 !text-[10px]" icon={<Copy className="size-3" />} onClick={() => void onCopyPrompt(prompt)} />
                <Button size="small" type="text" title={expanded ? "收起" : "展开"} aria-label={expanded ? "收起" : "展开"} className="!h-5 !px-1 !text-[10px]" icon={expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} onClick={() => setExpanded((value) => !value)} />
            </div>
        </div>
    );
}

/** 生图卡片用的一行元信息：日期 · 模型 · 接口 · 尺寸 · 质量 · 耗时。 */
export function ImageMetaLine({ items, title }: { items: Array<string | undefined | null | false>; title?: string }) {
    const visible = items.filter((item): item is string => Boolean(item));
    if (!visible.length) return null;
    return (
        <div title={title || visible.join(" · ")} className="line-clamp-2 break-words text-[10px] leading-4 text-muted-foreground">
            {visible.join(" · ")}
        </div>
    );
}
