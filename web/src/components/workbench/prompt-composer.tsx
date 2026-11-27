"use client";

import { useState, type ReactNode } from "react";
import { Button, Input, Tag } from "antd";
import { BookOpen, ChevronDown, ClipboardPaste, FolderPlus, PanelLeft, SlidersHorizontal, Sparkles, Trash2, WandSparkles } from "lucide-react";

export function WorkbenchSection({ title, count, children, collapsible = false, defaultOpen = true }: { title: string; count?: number; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
            <div className="flex items-center gap-2 pb-2.5">
                {collapsible ? (
                    <button type="button" className="group/section flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left outline-none focus-visible:text-foreground" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                        <span className="font-mono text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase transition-colors group-hover/section:text-foreground">{title}</span>
                        {typeof count === "number" && count > 0 ? <Tag className="!m-0 !h-[17px] !min-w-[18px] !rounded-[3px] !border-border !bg-transparent !px-1 !text-[10px] !leading-[15px]">{count}</Tag> : null}
                        <ChevronDown className={`ml-auto size-3.5 text-muted-foreground/70 transition-[transform,color] duration-200 group-hover/section:text-foreground ${open ? "" : "-rotate-90"}`} aria-hidden />
                    </button>
                ) : (
                    <>
                        <span className="font-mono text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</span>
                        {typeof count === "number" && count > 0 ? <Tag className="!m-0 !h-[17px] !min-w-[18px] !rounded-[3px] !border-border !bg-transparent !px-1 !text-[10px] !leading-[15px]">{count}</Tag> : null}
                    </>
                )}
            </div>
            {(!collapsible || open) ? <div className="space-y-2.5">{children}</div> : null}
        </section>
    );
}

export function PromptQuickActions({ onPaste, onClear, onOpenPromptLibrary, onOpenAssetPicker, onOpenWorkflow }: {
    onPaste: () => void;
    onClear: () => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
    onOpenWorkflow?: () => void;
}) {
    return (
        <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
            <Button size="small" type="text" className="!h-7 !px-2 !text-[11px] !text-foreground/65 hover:!text-foreground" icon={<ClipboardPaste className="size-3.5" />} onClick={onPaste}>
                读取剪贴板
            </Button>
            <Button size="small" type="text" className="!h-7 !px-2 !text-[11px] !text-foreground/65 hover:!text-foreground" icon={<Trash2 className="size-3.5" />} onClick={onClear}>
                清空
            </Button>
            <Button size="small" type="text" className="!h-7 !px-2 !text-[11px] !text-foreground/65 hover:!text-foreground" icon={<BookOpen className="size-3.5" />} onClick={onOpenPromptLibrary}>
                提示词库
            </Button>
            <Button size="small" type="text" className="!h-7 !px-2 !text-[11px] !text-foreground/65 hover:!text-foreground" icon={<FolderPlus className="size-3.5" />} onClick={onOpenAssetPicker}>
                素材库
            </Button>
            {onOpenWorkflow ? (
                <Button size="small" type="text" className="!h-7 !px-2 !text-[11px] !text-foreground/65 hover:!text-foreground" icon={<WandSparkles className="size-3.5" />} onClick={onOpenWorkflow}>
                    工作流
                </Button>
            ) : null}
        </div>
    );
}

export function WorkbenchPromptSection({ prompt, placeholder, onPromptChange, onPastePrompt, onClearPrompt, onOpenPromptLibrary, onOpenAssetPicker, onOpenWorkflow }: {
    prompt: string;
    placeholder: string;
    onPromptChange: (value: string) => void;
    onPastePrompt: () => void;
    onClearPrompt: () => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
    onOpenWorkflow?: () => void;
}) {
    return (
        <WorkbenchSection title="提示词">
            <PromptQuickActions onPaste={onPastePrompt} onClear={onClearPrompt} onOpenPromptLibrary={onOpenPromptLibrary} onOpenAssetPicker={onOpenAssetPicker} onOpenWorkflow={onOpenWorkflow} />
            <Input.TextArea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                rows={5}
                placeholder={placeholder}
                className="!rounded-xl !border-border/60 !bg-muted/15 !px-3 !py-2.5 !text-[13px] !leading-6 transition-colors focus:!border-acid/45"
            />
        </WorkbenchSection>
    );
}

export function BottomPromptComposer({ prompt, placeholder, onPromptChange, canGenerate, pendingCount, generateLabel, settingsOpen, onToggleSettings, onClearPrompt, onOpenPromptLibrary, onOpenAssetPicker, onPasteClipboard, onOpenWorkflow, onSwitchToSide, onGenerate, hint, children }: {
    prompt: string;
    placeholder: string;
    onPromptChange: (value: string) => void;
    canGenerate: boolean;
    pendingCount: number;
    generateLabel?: string;
    settingsOpen: boolean;
    onToggleSettings: () => void;
    onClearPrompt: () => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
    onPasteClipboard?: () => void;
    onOpenWorkflow?: () => void;
    onSwitchToSide: () => void;
    onGenerate: () => void;
    hint?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-5 sm:bottom-[calc(1.75rem+env(safe-area-inset-bottom))] sm:px-10 lg:px-16">
            <div className="glass-panel pointer-events-auto w-full max-w-5xl rounded-2xl border border-border/70 bg-background/95 p-4 backdrop-blur-xl dark:bg-card/95">
                <div className="flex flex-col gap-3">
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                        <Input.TextArea
                            value={prompt}
                            onChange={(event) => onPromptChange(event.target.value)}
                            placeholder={placeholder}
                            autoSize={{ minRows: 2, maxRows: 4 }}
                            className="!rounded-xl !border-border/60 !bg-muted/15 !px-3 !py-2.5 !text-[13px] !leading-6 transition-colors focus:!border-acid/45"
                            onPressEnter={(event) => {
                                if (!event.shiftKey && canGenerate) onGenerate();
                            }}
                        />
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
                            <Button type="text" className="!text-foreground/65 hover:!text-foreground" title="清空输入" aria-label="清空输入" icon={<Trash2 className="size-4" />} onClick={onClearPrompt} />
                            {onPasteClipboard ? <Button type="text" className="!text-foreground/65 hover:!text-foreground" title="读取剪贴板文本或图片" aria-label="读取剪贴板文本或图片" icon={<ClipboardPaste className="size-4" />} onClick={onPasteClipboard} /> : null}
                            <Button type="text" className="!text-foreground/65 hover:!text-foreground" title="提示词库" aria-label="提示词库" icon={<BookOpen className="size-4" />} onClick={onOpenPromptLibrary} />
                            <Button type="text" className="!text-foreground/65 hover:!text-foreground" title="我的素材" aria-label="我的素材" icon={<FolderPlus className="size-4" />} onClick={onOpenAssetPicker} />
                            {onOpenWorkflow ? <Button type="text" className="!text-foreground/65 hover:!text-foreground" title="创作工作流" aria-label="创作工作流" icon={<WandSparkles className="size-4" />} onClick={onOpenWorkflow} /> : null}
                            <Button
                                type="text"
                                title="参数配置"
                                aria-label="参数配置"
                                className={`lg:hidden ${settingsOpen ? "!bg-acid/10 !text-acid" : "!text-foreground/65 hover:!text-foreground"}`}
                                icon={<SlidersHorizontal className="size-4" />}
                                onClick={onToggleSettings}
                            />
                            <Button type="text" className="!text-foreground/65 hover:!text-foreground" title="切换到侧边工作台" aria-label="切换到侧边工作台" icon={<PanelLeft className="size-4" />} onClick={onSwitchToSide} />
                            <Button type="primary" className="h-9 rounded-lg px-4 font-medium lg:!hidden" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                                {generateLabel ?? (pendingCount ? `${pendingCount} 生成中` : "开始创作")}
                            </Button>
                        </div>
                    </div>
                    {children}
                    {hint ? <div className="flex justify-end text-[10px] text-muted-foreground/70">{hint}</div> : null}
                </div>
            </div>
        </div>
    );
}
