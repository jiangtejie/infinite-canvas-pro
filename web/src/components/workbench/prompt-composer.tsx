"use client";

import type { ReactNode } from "react";
import { Button, Input, Tag } from "antd";
import { BookOpen, ClipboardPaste, FolderPlus, PanelLeft, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";

export function WorkbenchSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
    return (
        <section className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-sm font-medium">{title}</span>
                {typeof count === "number" ? <Tag className="m-0 text-xs">{count}</Tag> : null}
            </div>
            <div className="space-y-2 border-t border-border p-3">{children}</div>
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
        <div className="flex flex-wrap gap-1">
            <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPaste}>
                读取剪贴板
            </Button>
            <Button size="small" icon={<Trash2 className="size-3.5" />} onClick={onClear}>
                清空
            </Button>
            <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={onOpenPromptLibrary}>
                提示词库
            </Button>
            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={onOpenAssetPicker}>
                我的素材
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
            <Input.TextArea value={prompt} onChange={(event) => onPromptChange(event.target.value)} rows={6} placeholder={placeholder} />
        </WorkbenchSection>
    );
}

export function BottomPromptComposer({ prompt, placeholder, onPromptChange, canGenerate, pendingCount, settingsOpen, onToggleSettings, onClearPrompt, onOpenPromptLibrary, onOpenAssetPicker, onSwitchToSide, onGenerate, children }: {
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
    children?: ReactNode;
}) {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-5 sm:bottom-[calc(1.75rem+env(safe-area-inset-bottom))] sm:px-10 lg:px-16">
            <div className="pointer-events-auto w-full max-w-5xl rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-xl dark:bg-card/95">
                <div className="flex flex-col gap-3">
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                        <Input.TextArea
                            value={prompt}
                            onChange={(event) => onPromptChange(event.target.value)}
                            placeholder={placeholder}
                            autoSize={{ minRows: 2, maxRows: 4 }}
                            className="rounded-lg"
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
                                className={`lg:hidden ${settingsOpen ? "!border-sky-500/30 !bg-sky-500/10 !text-sky-500" : ""}`}
                                icon={<SlidersHorizontal className="size-4" />}
                                onClick={onToggleSettings}
                            />
                            <Button title="切换到侧边工作台" aria-label="切换到侧边工作台" icon={<PanelLeft className="size-4" />} onClick={onSwitchToSide} />
                            <Button type="primary" className="h-9 rounded-xl px-4 font-medium lg:!hidden" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                                {pendingCount ? `${pendingCount} 生成中` : "开始创作"}
                            </Button>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
