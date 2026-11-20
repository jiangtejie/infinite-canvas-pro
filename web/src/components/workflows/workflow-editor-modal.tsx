"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Input, Modal, Select, Space, Switch } from "antd";
import { Globe2, Layers3, LockKeyhole, Plus, Trash2 } from "lucide-react";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";

import { createVariable, inferVariableOptions, normalizeVariable, parseVariableOptions } from "./creative-workflow-model";
import type { CreativeWorkflow, WorkflowGenerationConfig, WorkflowMode, WorkflowSeriesConfig, WorkflowVariable, WorkflowVariableType } from "./creative-workflow-types";

const variableTypeOptions: Array<{ value: WorkflowVariableType; label: string }> = [
    { value: "text", label: "短文本" },
    { value: "textarea", label: "长文本" },
    { value: "number", label: "数字" },
    { value: "select", label: "选项" },
    { value: "boolean", label: "开关" },
];

const workflowModeOptions: Array<{ value: WorkflowMode; label: string }> = [
    { value: "single_image", label: "单图生成" },
    { value: "multi_image_series", label: "多图生成" },
];

export function WorkflowEditorModal({
    open,
    workflow,
    modelConfig,
    theme,
    onChange,
    onCancel,
    onSave,
}: {
    open: boolean;
    workflow: CreativeWorkflow | null;
    modelConfig: AiConfig;
    theme: CanvasTheme;
    onChange: (workflow: CreativeWorkflow | null) => void;
    onCancel: () => void;
    onSave: (workflow: CreativeWorkflow) => void;
}) {
    if (!workflow) return null;
    const patch = (next: Partial<CreativeWorkflow>) => onChange({ ...workflow, ...next });
    const patchConfig = (next: Partial<WorkflowGenerationConfig>) => patch({ config: { ...workflow.config, ...next } });
    const patchSeriesConfig = (next: Partial<WorkflowSeriesConfig>) => patch({ seriesConfig: { ...workflow.seriesConfig, ...next } });
    const patchVariable = (id: string, next: Partial<WorkflowVariable>) => patch({ variables: workflow.variables.map((item) => (item.id === id ? normalizeVariable({ ...item, ...next }) : item)) });
    const removeVariable = (id: string) => patch({ variables: workflow.variables.filter((item) => item.id !== id) });

    return (
        <Modal title={workflow.createdAt ? "编辑工作流" : "新建工作流"} open={open} width={1080} onCancel={onCancel} onOk={() => onSave(workflow)} okText="保存" cancelText="取消" destroyOnHidden>
            <div className="grid max-h-[72vh] gap-4 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                    <section className="space-y-3 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">基础信息</div>
                            <div className="inline-flex rounded-md border border-border bg-transparent p-0.5">
                                <button type="button" title="个人工作流" className={`inline-flex size-8 items-center justify-center rounded transition ${workflow.scope !== "public" ? "border border-foreground text-foreground " : "text-muted-foreground hover:text-foreground"}`} onClick={() => patch({ scope: "private" })}>
                                    <LockKeyhole className="size-4" />
                                </button>
                                <button type="button" title="公开工作流" className={`inline-flex size-8 items-center justify-center rounded transition ${workflow.scope === "public" ? "border border-foreground text-foreground " : "text-muted-foreground hover:text-foreground"}`} onClick={() => patch({ scope: "public" })}>
                                    <Globe2 className="size-4" />
                                </button>
                            </div>
                        </div>
                        <Input value={workflow.name} placeholder="工作流名称" onChange={(event) => patch({ name: event.target.value })} />
                        <Input value={workflow.category} placeholder="分类，例如 电商海报" onChange={(event) => patch({ category: event.target.value })} />
                        <Select value={workflow.mode} options={workflowModeOptions} onChange={(mode) => patch({ mode })} />
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={workflow.description} placeholder="适用场景说明" onChange={(event) => patch({ description: event.target.value })} />
                    </section>
                    <section className="space-y-3 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">输入变量</span>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => patch({ variables: [...workflow.variables, createVariable()] })}>
                                添加变量
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {workflow.variables.map((variable) => (
                                <div key={variable.id} className="grid gap-2 rounded-md bg-muted p-2 dark:bg-background lg:grid-cols-[1fr_1fr_120px_auto]">
                                    <Input value={variable.key} placeholder="变量名 product_name" onChange={(event) => patchVariable(variable.id, { key: event.target.value })} />
                                    <Input value={variable.label} placeholder="显示名称" onChange={(event) => patchVariable(variable.id, { label: event.target.value })} />
                                    <Select
                                        value={variable.type}
                                        options={variableTypeOptions}
                                        onChange={(value) => {
                                            const inferredOptions = inferVariableOptions(variable);
                                            patchVariable(variable.id, { type: value, options: value === "select" && !variable.options.length ? inferredOptions : variable.options });
                                        }}
                                    />
                                    <div className="flex items-center gap-2">
                                        <Checkbox checked={variable.required} onChange={(event) => patchVariable(variable.id, { required: event.target.checked })}>
                                            必填
                                        </Checkbox>
                                        <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => removeVariable(variable.id)} />
                                    </div>
                                    <div className="lg:col-span-4">
                                        <VariableEditorValueControls variable={variable} onChange={(next) => patchVariable(variable.id, next)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="space-y-3 rounded-lg border border-border p-3">
                        <div className="text-sm font-medium">提示词模板</div>
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={workflow.config.systemPrompt} placeholder="系统提示词，可选" onChange={(event) => patchConfig({ systemPrompt: event.target.value })} />
                        <Input.TextArea autoSize={{ minRows: 7, maxRows: 14 }} value={workflow.config.promptTemplate} placeholder="用户提示词模板，使用 {{变量名}} 插入变量" onChange={(event) => patchConfig({ promptTemplate: event.target.value })} />
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={workflow.config.negativePrompt} placeholder="负面约束，可选" onChange={(event) => patchConfig({ negativePrompt: event.target.value })} />
                    </section>
                </div>
                <aside className="space-y-3 rounded-lg border border-border p-3">
                    <div className="text-sm font-medium">生成配置</div>
                    <ModelPicker config={modelConfig} fullWidth capability="image" value={workflow.config.imageModel || workflow.config.model} channelId={workflow.config.imageChannelId || modelConfig.imageChannelId} onChange={(value, channelId) => patchConfig({ imageModel: value, model: value, ...(channelId ? { imageChannelId: channelId } : {}) })} />
                    {workflow.mode === "multi_image_series" ? (
                        <div className="space-y-3 rounded-md bg-muted p-3 text-sm dark:bg-background">
                            <div className="flex items-center gap-2 font-medium">
                                <Layers3 className="size-4" />
                                多图提示词规划
                            </div>
                            <ModelPicker
                                config={modelConfig}
                                fullWidth
                                capability="text"
                                value={workflow.seriesConfig.promptModel || modelConfig.textModel || ""}
                                channelId={workflow.seriesConfig.promptChannelId || modelConfig.textChannelId}
                                placeholder="选择提示词文本模型"
                                onChange={(model, channelId) => patchSeriesConfig({ promptModel: model, promptChannelId: channelId || "" })}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <Space.Compact className="w-full">
                                    <span className="inline-flex h-8 shrink-0 items-center rounded-l-md border border-r-0 border-border bg-muted/50 px-2 text-xs text-muted-foreground">张数</span>
                                    <Input value={workflow.seriesConfig.targetCount} onChange={(event) => patchSeriesConfig({ targetCount: event.target.value })} />
                                </Space.Compact>
                                <Space.Compact className="w-full">
                                    <span className="inline-flex h-8 shrink-0 items-center rounded-l-md border border-r-0 border-border bg-muted/50 px-2 text-xs text-muted-foreground">并发</span>
                                    <Input value={workflow.seriesConfig.concurrency} onChange={(event) => patchSeriesConfig({ concurrency: event.target.value })} />
                                </Space.Compact>
                            </div>
                            <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={workflow.seriesConfig.promptInstruction} placeholder="系列拆分说明，例如：按封面、痛点、功能、场景、对比、总结拆成 6 张图。" onChange={(event) => patchSeriesConfig({ promptInstruction: event.target.value })} />
                            <ToggleRow label="先审核提示词" checked={workflow.seriesConfig.reviewRequired !== false} onChange={(checked) => patchSeriesConfig({ reviewRequired: checked })} />
                        </div>
                    ) : null}
                    <Select
                        className="w-full"
                        value={workflow.config.apiMode}
                        options={[
                            { value: "images", label: "Images API" },
                            { value: "responses", label: "Responses API" },
                            { value: "chat", label: "Chat Completions" },
                        ]}
                        onChange={(value) => patchConfig({ apiMode: value })}
                    />
                    <ImageSettingsPanel
                        config={{ ...defaultConfig, ...workflow.config, model: workflow.config.model || defaultConfig.model, imageModel: workflow.config.imageModel || workflow.config.model || defaultConfig.imageModel }}
                        onConfigChange={(key, value) => patchConfig({ [key]: value } as Partial<WorkflowGenerationConfig>)}
                        theme={theme}
                        showTitle={false}
                        className="space-y-4"
                        maxCount={10}
                        quickCount={6}
                    />
                    <div className="space-y-2 rounded-md bg-muted p-3 text-sm dark:bg-background">
                        <ToggleRow label="流式传输" checked={Boolean(workflow.config.streamImages)} onChange={(checked) => patchConfig({ streamImages: checked ? "1" : "" })} />
                        <ToggleRow label="返回 Base64" checked={Boolean(workflow.config.responseFormatB64Json)} onChange={(checked) => patchConfig({ responseFormatB64Json: checked ? "1" : "" })} />
                        <ToggleRow label="Codex CLI 兼容" checked={Boolean(workflow.config.codexCli)} onChange={(checked) => patchConfig({ codexCli: checked ? "1" : "" })} />
                        <Space.Compact className="w-full">
                            <span className="inline-flex h-8 shrink-0 items-center rounded-l-md border border-r-0 border-border bg-muted/50 px-3 text-xs text-muted-foreground">超时(秒)</span>
                            <Input value={workflow.config.timeout} onChange={(event) => patchConfig({ timeout: event.target.value })} />
                        </Space.Compact>
                    </div>
                </aside>
            </div>
        </Modal>
    );
}

export function WorkflowVariableInput({ variable, value, onChange }: { variable: WorkflowVariable; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block space-y-1.5 text-sm">
            <span className="flex items-center gap-1 font-medium">
                {variable.label || variable.key}
                {variable.required ? <span className="text-red-500">*</span> : null}
            </span>
            {variable.type === "textarea" ? (
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={value} placeholder={variable.placeholder || variable.defaultValue} onChange={(event) => onChange(event.target.value)} />
            ) : variable.type === "select" ? (
                <Select className="w-full" value={value || undefined} placeholder={variable.placeholder || "请选择"} options={variable.options.map((item) => ({ value: item, label: item }))} onChange={onChange} />
            ) : variable.type === "boolean" ? (
                <Switch checked={value === "true"} onChange={(checked) => onChange(String(checked))} />
            ) : (
                <Input type={variable.type === "number" ? "number" : "text"} value={value} placeholder={variable.placeholder || variable.defaultValue} onChange={(event) => onChange(event.target.value)} />
            )}
        </label>
    );
}

function VariableEditorValueControls({ variable, onChange }: { variable: WorkflowVariable; onChange: (next: Partial<WorkflowVariable>) => void }) {
    const optionText = variable.options.join(" / ");
    const [optionDraft, setOptionDraft] = useState(optionText);
    useEffect(() => {
        if (variable.type === "select") setOptionDraft(optionText);
    }, [optionText, variable.type]);

    if (variable.type === "boolean") {
        return (
            <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-xs text-muted-foreground">默认开关</span>
                <Switch size="small" checked={variable.defaultValue === "true"} onChange={(checked) => onChange({ defaultValue: String(checked) })} />
            </div>
        );
    }
    if (variable.type === "select") {
        return (
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
                <Input
                    value={optionDraft}
                    placeholder="选项，例如 自动 / 清冷私房 / 极简韩系"
                    onChange={(event) => {
                        const text = event.target.value;
                        setOptionDraft(text);
                        const options = parseVariableOptions(text);
                        onChange({ options, defaultValue: options.includes(variable.defaultValue) ? variable.defaultValue : options[0] || "" });
                    }}
                />
                <Select className="w-full" value={variable.defaultValue || undefined} placeholder="默认选项" options={variable.options.map((item) => ({ value: item, label: item }))} onChange={(value) => onChange({ defaultValue: value })} />
            </div>
        );
    }
    if (variable.type === "textarea") {
        return <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={variable.defaultValue} placeholder="默认长文本" onChange={(event) => onChange({ defaultValue: event.target.value })} />;
    }
    return <Input type={variable.type === "number" ? "number" : "text"} value={variable.defaultValue} placeholder={variable.type === "number" ? "默认数字" : "默认值"} onChange={(event) => onChange({ defaultValue: event.target.value })} />;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span>{label}</span>
            <Switch size="small" checked={checked} onChange={onChange} />
        </div>
    );
}
