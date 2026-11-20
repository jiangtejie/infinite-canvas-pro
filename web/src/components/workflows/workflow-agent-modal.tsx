"use client";

import { useRef } from "react";
import { Button, Input, Modal, Tag } from "antd";
import { Globe2, LockKeyhole, Sparkles, Trash2 } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { EmptyState } from "@/components/ui/state-panel";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import type { CreativeWorkflow } from "./creative-workflow-types";

export function WorkflowAgentModal({
    open,
    onClose,
    effectiveConfig,
    openConfigDialog,
    agentPrompt,
    onPromptChange,
    agentScope,
    onScopeChange,
    agentModel,
    agentChannelId,
    onModelChange,
    agentModelInfo,
    agentReferences,
    onAddReferences,
    onRemoveReference,
    onOpenAssetPicker,
    agentLoading,
    onGenerate,
    agentDraft,
    agentWarnings,
    onApplyDraft,
}: {
    open: boolean;
    onClose: () => void;
    effectiveConfig: AiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean, continueAction?: () => void) => void;
    agentPrompt: string;
    onPromptChange: (value: string) => void;
    agentScope: "private" | "public";
    onScopeChange: (scope: "private" | "public") => void;
    agentModel: string;
    agentChannelId: string;
    onModelChange: (model: string, channelId: string) => void;
    agentModelInfo: { channelName: string; modelName: string };
    agentReferences: ReferenceImage[];
    onAddReferences: (files?: FileList | null) => Promise<void>;
    onRemoveReference: (id: string) => Promise<void>;
    onOpenAssetPicker: () => void;
    agentLoading: boolean;
    onGenerate: () => Promise<void>;
    agentDraft: CreativeWorkflow | null;
    agentWarnings: string[];
    onApplyDraft: () => void;
}) {
    const referenceInputRef = useRef<HTMLInputElement>(null);
    const modelPicker = () => (
        <ModelPicker
            config={effectiveConfig}
            fullWidth
            capability="text"
            value={agentModel}
            channelId={agentChannelId}
            placeholder="选择 Agent 文本模型"
            onChange={(model, channelId) => onModelChange(model, channelId || "")}
            onMissingConfig={() => openConfigDialog(true)}
        />
    );

    return (
        <Modal title="AI 创建工作流" open={open} width={980} onCancel={onClose} footer={null} destroyOnHidden>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">描述你要沉淀的创作流程</div>
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="hidden min-w-[220px] max-w-[360px] sm:block">{modelPicker()}</div>
                            <div className="hidden min-w-0 max-w-[220px] truncate rounded-md border border-border px-2 py-1 text-xs text-muted-foreground lg:block" title={`${agentModelInfo.channelName} · ${agentModelInfo.modelName}`}>
                                {agentModelInfo.channelName}
                            </div>
                            <div className="inline-flex rounded-md border border-border p-0.5">
                                <button type="button" title="个人工作流" className={`inline-flex size-8 items-center justify-center rounded ${agentScope === "private" ? "border border-foreground text-foreground " : "text-muted-foreground"}`} onClick={() => onScopeChange("private")}>
                                    <LockKeyhole className="size-4" />
                                </button>
                                <button type="button" title="公开工作流" className={`inline-flex size-8 items-center justify-center rounded ${agentScope === "public" ? "border border-foreground text-foreground " : "text-muted-foreground"}`} onClick={() => onScopeChange("public")}>
                                    <Globe2 className="size-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="sm:hidden">{modelPicker()}</div>
                    <Input.TextArea value={agentPrompt} autoSize={{ minRows: 14, maxRows: 22 }} placeholder="例如：创建一个电商海报工作流，只需要输入产品名称、核心卖点、活动信息，固定商业摄影质感和营销文案结构。" onChange={(event) => onPromptChange(event.target.value)} />
                    <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-medium">参考图</div>
                                <div className="mt-1 text-xs text-muted-foreground">可上传样例图，作为创建工作流的视觉参考。</div>
                            </div>
                            <div className="flex gap-2">
                                <Button size="small" onClick={onOpenAssetPicker}>
                                    我的素材
                                </Button>
                                <Button size="small" onClick={() => referenceInputRef.current?.click()}>
                                    上传
                                </Button>
                            </div>
                        </div>
                        <input
                            ref={referenceInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                                const input = event.currentTarget;
                                void onAddReferences(input.files).finally(() => {
                                    input.value = "";
                                });
                            }}
                        />
                        {agentReferences.length ? (
                            <div className="mt-3 grid grid-cols-5 gap-2">
                                {agentReferences.map((image) => (
                                    <div key={image.id} className="group relative overflow-hidden rounded-md border border-border">
                                        <img loading="lazy" decoding="async" src={image.dataUrl} alt={image.name} className="aspect-square w-full object-cover" />
                                        <button
                                            type="button"
                                            className="absolute right-1 top-1 grid size-6 place-items-center rounded bg-black/65 text-white opacity-0 transition group-hover:opacity-100"
                                            onClick={() => void onRemoveReference(image.id)}
                                            aria-label="删除参考图"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <Button block type="primary" loading={agentLoading} icon={<Sparkles className="size-4" />} onClick={() => void onGenerate()}>
                        生成工作流草稿
                    </Button>
                </div>
                <aside className="space-y-3 rounded-lg border border-border p-3">
                    <div className="text-sm font-medium">草稿预览</div>
                    {agentDraft ? (
                        <>
                            <div>
                                <div className="text-base font-semibold">{agentDraft.name}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    <Tag className="m-0">{agentDraft.category || "未分类"}</Tag>
                                    <Tag className="m-0">{agentDraft.variables.length} 个变量</Tag>
                                    <Tag className="m-0">{agentDraft.scope === "public" ? "公开" : "个人"}</Tag>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{agentDraft.description || "暂无描述"}</p>
                            <div className="max-h-60 overflow-y-auto rounded-md bg-muted p-3 text-xs dark:bg-background">
                                <div className="whitespace-pre-wrap">{agentDraft.config.promptTemplate}</div>
                            </div>
                            {agentWarnings.length ? (
                                <div className="space-y-1 text-xs text-amber-600 dark:text-amber-300">
                                    {agentWarnings.map((item) => (
                                        <div key={item}>{item}</div>
                                    ))}
                                </div>
                            ) : null}
                            <Button block type="primary" onClick={onApplyDraft}>
                                应用到编辑器
                            </Button>
                        </>
                    ) : (
                        <EmptyState className="py-8" title="暂无草稿" description="生成后在这里预览草稿。" />
                    )}
                </aside>
            </div>
        </Modal>
    );
}
