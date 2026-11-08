"use client";

import { useState, type ReactNode } from "react";
import { Button, Input, Tag } from "antd";
import { BookOpen, ChevronDown, ClipboardPaste, FolderPlus, PanelLeft, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";

export function WorkbenchSection({ title, count, children, collapsible = false, defaultOpen = true }: { title: string; count?: number; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
            <div className="flex items-center gap-2 pb-2.5">
                {collapsible ? (
                    <button type="button" className="group/section flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left outline-none focus-visible:text-foreground" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                        <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase transition-colors group-hover/section:text-foreground">{title}</span>
                        {typeof count === "number" && count > 0 ? <Tag className="!m-0 !h-[17px] !min-w-[18px] !rounded-[3px] !border-border !bg-transparent !px-1 !text-[10px] !leading-[15px]">{count}</Tag> : null}
                        <ChevronDown className={`ml-auto size-3.5 text-muted-foreground/70 transition-[transform,color] duration-200 group-hover/section:text-foreground ${open ? "" : "-rotate-90"}`} aria-hidden />
                    </button>
                ) : (
                    <>
                        <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</span>
                        {typeof count === "number" && count > 0 ? <Tag className="!m-0 !h-[17px] !min-w-[18px] !rounded-[3px] !border-border !bg-transparent !px-1 !text-[10px] !leading-[15px]">{count}</Tag> : null}
                    </>
                )}
            </div>
            {(!collapsible || open) ? <div className="space-y-2.5">{children}</div> : null}
        </section>
    );
}

export function PromptQuickActions({ onPaste, onClear, onOpenPromptLibrary, onOpenAssetPicker }: {
    onPaste: () => void;
    onClear: () => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            <Button size="small" className="!text-[11px]" icon={<ClipboardPaste className="size-3.5" />} onClick={onPaste}>
                读取剪贴板
            </Button>
            <Button size="small" className="!text-[11px]" icon={<Trash2 className="size-3.5" />} onClick={onClear}>
                清空
            </Button>
            <Button size="small" className="!text-[11px]" icon={<BookOpen className="size-3.5" />} onClick={onOpenPromptLibrary}>
                提示词库
            </Button>
            <Button size="small" className="!text-[11px]" icon={<FolderPlus className="size-3.5" />} onClick={onOpenAssetPicker}>
                素材库
            </Button>
        </div>
    );
}

export function WorkbenchPromptSection({ prompt, placeholder, onPromptChange, onPastePrompt, onClearPrompt, onOpenPromptLibrary, onOpenAssetPicker }: {
    prompt: string;
    placeholder: string;
    onPromptChange: (value: string) => void;
    onPastePrompt: () => void;
    onClearPrompt: () => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
}) {
    return (
        <WorkbenchSection title="提示词">
            <PromptQuickActions onPaste={onPastePrompt} onClear={onClearPrompt} onOpenPromptLibrary={onOpenPromptLibrary} onOpenAssetPicker={onOpenAssetPicker} />
            <Input.TextArea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                rows={5}
                placeholder={placeholder}
                className="!rounded-lg !border-border/70 !bg-background/60 !text-[13px] !leading-6"
            />
        </WorkbenchSection>
    );
}

export function BottomPromptComposer({ prompt, placeholder, onPromptChange, canGenerate, pendingCount, settingsOpen, onToggleSettings, onClearPrompt, onOpenPromptLibrary, onOpenAssetPicker, onSwitchToSide, onGenerate, hint, children }: {
    prompt: string;
    placeholder: string;
    onPromptChange: (value: string) => void;
    canGenerate: boolean;
    pendingCount: number;
    settingsOpen: boolean;
    onToggleSettings: () => void;
    onClearPrompt: () => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
    onSwitchToSide: () => void;
    onGenerate: () => void;
    hint?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-5 sm:bottom-[calc(1.75rem+env(safe-area-inset-bottom))] sm:px-10 lg:px-16">
            <div className="glass-panel pointer-events-auto w-full max-w-5xl rounded-xl border border-border bg-background/95 p-4 backdrop-blur-xl dark:bg-card/95">
                <div className="flex flex-col gap-3">
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                        <Input.TextArea
                            value={prompt}
                            onChange={(event) => onPromptChange(event.target.value)}
                            placeholder={placeholder}
                            autoSize={{ minRows: 2, maxRows: 4 }}
                            className="!rounded-lg !border-border/70 !bg-background/60 !text-[13px] !leading-6"
                            onPressEnter={(event) => {
                                if (!event.shiftKey && canGenerate) onGenerate();
                            }}
                        />
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                            <Button title="清空输入" aria-label="清空输入" icon={<Trash2 className="size-4" />} onClick={onClearPrompt} />
                            <Button title="提示词库" aria-label="提示词库" icon={<BookOpen className="size-4" />} onClick={onOpenPromptLibrary} />
                            <Button title="我的素材" aria-label="我的素材" icon={<FolderPlus className="size-4" />} onClick={onOpenAssetPicker} />
                            <Button
                                title="参数配置"
                                aria-label="参数配置"
                                className={`lg:hidden ${settingsOpen ? "!border-acid/40 !bg-acid/10 !text-acid" : ""}`}
                                icon={<SlidersHorizontal className="size-4" />}
                                onClick={onToggleSettings}
                            />
                            <Button title="切换到侧边工作台" aria-label="切换到侧边工作台" icon={<PanelLeft className="size-4" />} onClick={onSwitchToSide} />
                            <Button type="primary" className="h-9 rounded-lg px-4 font-medium lg:!hidden" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                                {pendingCount ? `${pendingCount} 生成中` : "开始创作"}
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
