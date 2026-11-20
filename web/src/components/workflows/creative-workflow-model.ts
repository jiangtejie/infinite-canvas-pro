import { nanoid } from "nanoid";

import type { CanvasImageTask } from "@/services/api/image";
import type { CreativeWorkflowRecord } from "@/services/api/user-config";
import { defaultConfig, localChannelForActiveModel, normalizeLocalChannels, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import type { CreativeWorkflow, ImageHistoryLog, SeriesPromptDraft, WorkflowGenerationConfig, WorkflowMode, WorkflowRunResult, WorkflowSeriesConfig, WorkflowTask, WorkflowVariable, WorkflowVariableType } from "./creative-workflow-types";

const SERIES_DRAFT_STORE_PREFIX = "infinite-canvas:series-drafts:";

export function createBlankWorkflow(config: AiConfig, mode: WorkflowMode = "single_image"): CreativeWorkflow {
    const now = Date.now();
    const series = mode === "multi_image_series";
    return normalizeWorkflow({
        id: nanoid(),
        scope: "private",
        editable: true,
        name: series ? "多图系列生成" : "",
        category: series ? "多图创作" : "",
        description: series ? "根据主题生成一组连贯图片提示词，审核后批量生成图片。" : "",
        mode,
        variables: series ? [createVariable("topic", "主题", "textarea"), createVariable("style", "统一风格"), createVariable("platform", "发布平台")] : [createVariable("product_name", "产品名称"), createVariable("selling_points", "产品卖点", "textarea")],
        config: { ...createWorkflowConfig(config), ...(series ? { count: "1", promptTemplate: "围绕 {{topic}} 生成一组适合 {{platform}} 发布的连贯配图。\n统一风格：{{style}}\n要求：主题一致、画面重点各不相同、适合连续发布。" } : {}) },
        seriesConfig: createWorkflowSeriesConfig(config),
        createdAt: now,
        updatedAt: now,
    });
}

export function createStarterWorkflows(config: AiConfig) {
    return [createStarterWorkflow(config), createStarterSeriesWorkflow(config)];
}

function createStarterWorkflow(config: AiConfig): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        id: nanoid(),
        scope: "public",
        editable: true,
        name: "电商海报生成",
        category: "电商海报",
        description: "固定海报构图、商业摄影质感和营销文案结构，只替换产品与卖点。",
        mode: "single_image",
        variables: [createVariable("product_name", "产品名称"), createVariable("selling_points", "核心卖点", "textarea"), createVariable("campaign", "活动信息")],
        config: {
            ...createWorkflowConfig(config),
            promptTemplate: "为 {{product_name}} 生成一张高端电商海报。\n核心卖点：{{selling_points}}\n活动信息：{{campaign}}\n要求：主体清晰、构图高级、商品有强烈质感，画面适合社交媒体和电商首图。",
        },
        seriesConfig: createWorkflowSeriesConfig(config),
        createdAt: now,
        updatedAt: now,
    });
}

function createStarterSeriesWorkflow(config: AiConfig): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        id: nanoid(),
        scope: "public",
        editable: true,
        name: "小红书文章配图组",
        category: "多图创作",
        description: "根据文章主题和内容生成多张风格统一的封面、步骤、要点和总结配图。",
        mode: "multi_image_series",
        variables: [createVariable("article_topic", "文章主题"), createVariable("article_content", "文章内容", "textarea"), createVariable("visual_style", "视觉风格")],
        config: {
            ...createWorkflowConfig(config),
            count: "1",
            promptTemplate: "为小红书/公众号文章《{{article_topic}}》生成系列配图。\n文章内容：{{article_content}}\n视觉风格：{{visual_style}}\n要求：画面适合移动端阅读，主题连贯，每张图表达一个清晰信息点。",
        },
        seriesConfig: {
            ...createWorkflowSeriesConfig(config),
            targetCount: "6",
            promptInstruction: "拆成封面图、问题/痛点图、核心步骤图、细节说明图、对比/案例图和总结图；每张图都需要独立完整的图片提示词。",
            concurrency: "3",
        },
        createdAt: now,
        updatedAt: now,
    });
}

export function createWorkflowConfig(config: AiConfig): WorkflowGenerationConfig {
    return {
        model: config.model || defaultConfig.model,
        imageModel: config.imageModel || config.model || defaultConfig.imageModel,
        imageChannelId: config.imageChannelId || "",
        quality: config.quality || defaultConfig.quality,
        size: config.size || defaultConfig.size,
        count: config.count || "1",
        apiMode: config.apiMode || "images",
        timeout: config.timeout || "600",
        streamImages: config.streamImages || "",
        streamPartialImages: config.streamPartialImages || "1",
        responseFormatB64Json: config.responseFormatB64Json || "",
        codexCli: config.codexCli || "",
        systemPrompt: config.systemPrompts.workflow || config.systemPrompt || "",
        promptTemplate: "",
        negativePrompt: "",
    };
}

export function createWorkflowSeriesConfig(config: AiConfig): WorkflowSeriesConfig {
    return {
        targetCount: "4",
        promptModel: config.textModel || config.model || defaultConfig.textModel,
        promptChannelId: config.textChannelId || "",
        promptInstruction: "围绕同一主题拆分成封面图、核心信息图、场景图和总结图；每张图需要画面重点不同但视觉风格一致。",
        reviewRequired: true,
        concurrency: "3",
    };
}

export function describeModelSelection(config: AiConfig, modelName: string, channelId: string) {
    const selectedModel = modelName || "未选择模型";
    if (config.channelMode === "local") {
        const channel = localChannelForActiveModel({ ...config, model: selectedModel, activeChannelId: channelId });
        return { channelName: channel?.name || "本地直连", modelName: selectedModel };
    }
    const channel =
        config.publicChannels.find((item) => item.id === channelId && item.models?.includes(selectedModel)) ||
        config.publicChannels.find((item) => item.models?.includes(selectedModel)) ||
        config.publicChannels.find((item) => item.id === channelId) ||
        config.publicChannels[0];
    return { channelName: channel?.name || "云端渠道", modelName: selectedModel };
}

export function createVariable(key = "", label = "", type: WorkflowVariableType = "text"): WorkflowVariable {
    return normalizeVariable({ id: nanoid(), key, label, type, required: true, defaultValue: "", options: [] });
}

export function normalizeAgentDraft(draft: Partial<CreativeWorkflow>, config: AiConfig, scope: "private" | "public"): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        id: nanoid(),
        scope: draft.scope === "public" ? "public" : scope,
        editable: true,
        name: draft.name || "AI 创建工作流",
        category: draft.category || "",
        description: draft.description || "",
        mode: draft.mode === "multi_image_series" ? "multi_image_series" : "single_image",
        variables: (draft.variables || []).map((variable) => ({ ...createVariable(), ...variable, id: variable.id || nanoid() })),
        config: { ...createWorkflowConfig(config), ...(draft.config || {}) },
        seriesConfig: { ...createWorkflowSeriesConfig(config), ...(draft.seriesConfig || {}) },
        createdAt: now,
        updatedAt: now,
    });
}

export function normalizeVariable(variable: WorkflowVariable): WorkflowVariable {
    const key = variable.key.replace(/[^\w.-]/g, "_");
    return { ...variable, key, label: variable.label || key, defaultValue: variable.defaultValue == null ? "" : String(variable.defaultValue), options: Array.isArray(variable.options) ? variable.options : parseVariableOptions(String(variable.options || "")) };
}

export function normalizeWorkflow(workflow: CreativeWorkflow): CreativeWorkflow {
    return {
        ...workflow,
        scope: workflow.scope === "public" ? "public" : "private",
        editable: workflow.editable !== false,
        mode: workflow.mode === "multi_image_series" ? "multi_image_series" : "single_image",
        variables: (workflow.variables || []).map(normalizeVariable),
        config: { ...createWorkflowConfig(defaultConfig), ...(workflow.config || {}) },
        seriesConfig: { ...createWorkflowSeriesConfig(defaultConfig), ...(workflow.seriesConfig || {}) },
        createdAt: workflow.createdAt || Date.now(),
        updatedAt: workflow.updatedAt || Date.now(),
    };
}

export function createDefaultInputValues(workflow: CreativeWorkflow) {
    return Object.fromEntries(workflow.variables.map((variable) => [variable.key, variable.defaultValue || (variable.type === "boolean" ? "false" : "")]));
}

export function renderPromptTemplate(template: string, values: Record<string, string>) {
    return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key: string) => values[key] || "");
}

export function renderWorkflowPrompt(workflow: CreativeWorkflow, values: Record<string, string>) {
    const formattedValues = Object.fromEntries(workflow.variables.map((variable) => [variable.key, formatWorkflowVariableValue(variable, values[variable.key])]));
    const prompt = renderPromptTemplate(workflow.config.promptTemplate, formattedValues).trim();
    const negativePrompt = workflow.config.negativePrompt.trim();
    return negativePrompt ? `${prompt}\n\n避免：${negativePrompt}` : prompt;
}

export function formatWorkflowVariableValue(variable: WorkflowVariable, value: string | undefined) {
    const raw = value ?? variable.defaultValue ?? "";
    if (variable.type !== "boolean") return raw;
    return raw === "true" ? "开启" : "关闭";
}

export function parseVariableOptions(text: string) {
    return text
        .split(/[\/\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function buildSeriesPromptDraftRequest(workflow: CreativeWorkflow, basePrompt: string, count: number, values: Record<string, string>) {
    const variables = Object.entries(values)
        .filter(([, value]) => String(value).trim())
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");
    return [
        "你是多图创作策划助手。请基于工作流信息，为同一主题生成一组互相连贯但画面重点不同的图片生成提示词。",
        "必须只返回 JSON，不要 Markdown。JSON 结构为：{\"items\":[{\"title\":\"第1张标题\",\"prompt\":\"完整图片提示词\"}]}。",
        `目标张数：${count}`,
        `工作流名称：${workflow.name}`,
        `工作流分类：${workflow.category || "未分类"}`,
        `工作流描述：${workflow.description || "无"}`,
        workflow.seriesConfig.promptInstruction ? `系列拆分规则：${workflow.seriesConfig.promptInstruction}` : "",
        variables ? `用户输入变量：\n${variables}` : "",
        `基础提示词：\n${basePrompt}`,
        "要求：每条 prompt 必须可以独立用于图片生成；保持统一主题、统一风格和连续叙事；避免重复构图；不要包含解释文字。",
    ]
        .filter(Boolean)
        .join("\n\n");
}

export function parseSeriesPromptDrafts(content: string, count: number, fallbackPrompt: string): SeriesPromptDraft[] {
    const jsonText = extractJSONText(content);
    if (jsonText) {
        try {
            const payload = JSON.parse(jsonText) as { items?: Array<{ title?: string; prompt?: string }> } | Array<{ title?: string; prompt?: string }>;
            const items = Array.isArray(payload) ? payload : payload.items || [];
            const drafts = items
                .map((item, index) => ({ id: nanoid(), title: item.title?.trim() || `第 ${index + 1} 张`, prompt: item.prompt?.trim() || "", status: "draft" as const }))
                .filter((item) => item.prompt);
            if (drafts.length) return drafts.slice(0, count);
        } catch {
            // Fall back to line parsing below.
        }
    }
    const lines = content
        .split(/\n+/)
        .map((line) => line.replace(/^[-*\d.、\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, count);
    if (lines.length) {
        return lines.map((line, index) => ({ id: nanoid(), title: `第 ${index + 1} 张`, prompt: line, status: "draft" as const }));
    }
    return Array.from({ length: count }, (_, index) => ({ id: nanoid(), title: `第 ${index + 1} 张`, prompt: `${fallbackPrompt}\n\n系列图片：第 ${index + 1} 张，画面重点与其他图片保持差异。`, status: "draft" as const }));
}

export function extractJSONText(content: string) {
    const trimmed = content.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) return trimmed.slice(objectStart, objectEnd + 1);
    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) return trimmed.slice(arrayStart, arrayEnd + 1);
    return "";
}

/** 草稿只持久化可恢复字段：id/标题/提示词；运行状态与结果引用不落盘。 */
export type PersistedSeriesDraft = Pick<SeriesPromptDraft, "id" | "title" | "prompt">;

export function serializeSeriesDraft(draft: SeriesPromptDraft): PersistedSeriesDraft {
    return { id: draft.id, title: draft.title, prompt: draft.prompt };
}

export function seriesDraftStorageKey(workflowId: string, ownerId: string) {
    return `${SERIES_DRAFT_STORE_PREFIX}${ownerId}:${workflowId}`;
}

export function normalizeSeriesDraft(draft: Partial<SeriesPromptDraft>): SeriesPromptDraft {
    return {
        id: draft.id || nanoid(),
        title: draft.title || "未命名",
        prompt: draft.prompt || "",
        // 运行中/结果状态不持久化，恢复后统一回到待审核草稿。
        status: "draft",
        resultIds: [],
    };
}

export function inferVariableOptions(variable: WorkflowVariable) {
    return parseVariableOptions([variable.defaultValue, variable.placeholder, variable.options.join("/")].filter(Boolean).join("/"));
}

export function isFinishedCanvasImageTask(task: CanvasImageTask) {
    return Boolean(task.image_url || task.url || task.image_urls?.length) || ["completed", "complete", "done", "succeeded", "success"].includes((task.status || "").toLowerCase());
}

export function isFailedCanvasImageTask(task: CanvasImageTask) {
    return ["failed", "fail", "error", "cancelled", "canceled"].includes((task.status || "").toLowerCase());
}

/** 已存任务对应的图片记录：优先使用后端同步后的 storage，保证刷新恢复后还能下载/展示。 */
export function workflowTaskImagesFromCanvasTask(task: CanvasImageTask, durationMs: number): ImageHistoryLog["images"] {
    const storages = task.imageStorage || [];
    const urls = (task.image_urls?.length ? task.image_urls : [task.image_url || task.url || ""]).filter(Boolean);
    return urls.map((url, index) => {
        const stored = storages[index] || undefined;
        return {
            id: `${task.id}:${index}`,
            dataUrl: stored?.url || url,
            storageKey: stored?.storageKey || (index === 0 ? task.storageKey || "" : ""),
            durationMs,
            width: stored?.width || (index === 0 ? task.width || 0 : 0),
            height: stored?.height || (index === 0 ? task.height || 0 : 0),
            bytes: stored?.bytes || (index === 0 ? task.bytes || 0 : 0),
            mimeType: stored?.mimeType || task.mimeType || "image/png",
        };
    });
}

export function workflowResultsFromStoredLog(log: ImageHistoryLog): WorkflowRunResult[] {
    return log.images.map((image, index) => ({
        id: image.id || `${log.id}:${index}`,
        workflowId: log.workflowId || "",
        workflowName: log.workflowName || "工作流任务",
        prompt: log.prompt,
        imageUrl: image.dataUrl,
        storageKey: image.storageKey,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
        mimeType: image.mimeType,
        durationMs: log.durationMs || 0,
        createdAt: log.createdAt,
    }));
}

const WORKFLOW_IMAGE_TASK_PREFIX = "client_workflow_image_task_";

/** 模板不在本地时的临时重试上下文：只带 id 与日志快照配置，不写回工作流列表。 */
export function workflowForRetry(task: WorkflowTask): CreativeWorkflow | null {
    const workflowId = (task.workflowId || "").trim();
    if (!workflowId) return null;
    return {
        id: workflowId,
        scope: "private",
        editable: false,
        mode: "single_image",
        name: task.workflowName?.trim() || "工作流任务",
        category: "",
        description: "",
        variables: [],
        config: task.config,
        seriesConfig: { targetCount: "1", promptModel: "", promptChannelId: "", promptInstruction: "", reviewRequired: false, concurrency: "1" },
        createdAt: task.startedAt,
        updatedAt: Date.now(),
    };
}

/** 从服务端任务 id 还原父任务 id（创建时把 client_workflow_image_task_<父id>_<序号> 作为服务端任务 id）。 */
export function workflowTaskParentId(task?: CanvasImageTask) {
    const id = task?.id || "";
    if (!id.startsWith(WORKFLOW_IMAGE_TASK_PREFIX)) return "";
    const match = id.slice(WORKFLOW_IMAGE_TASK_PREFIX.length).match(/^(.+)_(\d+)$/);
    return match ? match[1] : "";
}

export function workflowTaskParentIndex(task?: CanvasImageTask) {
    const id = task?.id || "";
    const match = id.slice(WORKFLOW_IMAGE_TASK_PREFIX.length).match(/^(.+)_(\d+)$/);
    return match ? Number(match[2]) : 0;
}

/** 把恢复出的多张图片日志按父任务聚合成一张任务卡，和同会话提交展示一致。 */
export function workflowTaskFromStoredLogs(parentTaskId: string, logs: ImageHistoryLog[]): WorkflowTask {
    const first = logs[0];
    const inputs = Object.fromEntries(
        Object.entries(first.workflowInputs || {})
            .filter(([key]) => key !== "seriesTitle" && key !== "seriesIndex")
            .map(([key, value]) => [key, String(value ?? "")]),
    );
    const seriesTitle = logs.map((log) => log.workflowInputs?.seriesTitle).find((value): value is string => typeof value === "string");
    const seriesIndex = logs.map((log) => log.workflowInputs?.seriesIndex).find((value): value is number => typeof value === "number");
    const completedImages = logs.filter((log) => log.status === "成功").flatMap((log) => workflowResultsFromStoredLog(log));
    const failedCount = logs.filter((log) => log.status === "失败").length;
    return {
        id: parentTaskId,
        status: "running",
        workflowId: first.workflowId || "",
        workflowName: first.workflowName?.trim() || "工作流任务",
        prompt: first.prompt,
        inputs,
        references: first.references || [],
        model: first.model,
        apiMode: first.config?.apiMode || "images",
        config: first.config,
        count: logs.length,
        startedAt: Math.min(...logs.map((log) => log.createdAt)),
        images: completedImages,
        failedCount: failedCount || undefined,
        seriesTitle,
        seriesIndex,
    };
}

export function isWorkflowBackedLog(log: ImageHistoryLog) {
    return Boolean(log.workflowId) || log.task?.source === "workflow";
}

export function workflowToRecord(workflow: CreativeWorkflow): CreativeWorkflowRecord<CreativeWorkflow> {
    return {
        id: workflow.id,
        ownerUserId: workflow.ownerUserId,
        scope: workflow.scope === "public" ? "public" : "private",
        name: workflow.name,
        category: workflow.category,
        description: workflow.description,
        data: workflow,
        createdAt: new Date(workflow.createdAt).toISOString(),
        updatedAt: new Date(workflow.updatedAt).toISOString(),
        lastRunAt: workflow.lastRunAt ? new Date(workflow.lastRunAt).toISOString() : undefined,
        editable: workflow.editable !== false,
    };
}

export function recordToWorkflow(record: CreativeWorkflowRecord<CreativeWorkflow>): CreativeWorkflow {
    const data = record.data || ({} as CreativeWorkflow);
    return normalizeWorkflow({
        ...data,
        id: record.id || data.id,
        ownerUserId: record.ownerUserId,
        scope: record.scope === "public" ? "public" : "private",
        editable: record.editable,
        name: record.name || data.name || "",
        category: record.category || data.category || "",
        description: record.description || data.description || "",
        createdAt: record.createdAt ? Date.parse(record.createdAt) : data.createdAt,
        updatedAt: record.updatedAt ? Date.parse(record.updatedAt) : data.updatedAt,
        lastRunAt: record.lastRunAt ? Date.parse(record.lastRunAt) : data.lastRunAt,
    });
}

export function resolveWorkflowRuntime(workflow: CreativeWorkflow, baseConfig: AiConfig) {
    const workflowModel = workflow.config.imageModel || workflow.config.model;
    const fallbackModel = baseConfig.imageModel || baseConfig.model;
    const fallbackChannelId = resolveWorkflowImageChannelId(baseConfig, fallbackModel, baseConfig.imageChannelId, baseConfig.activeChannelId);
    if (!workflowModel) return { model: fallbackModel, apiMode: baseConfig.apiMode, channelId: fallbackChannelId };
    if (baseConfig.channelMode === "remote" && workflowModel !== fallbackModel && (!baseConfig.models.length || !baseConfig.models.includes(workflowModel))) {
        return { model: fallbackModel, apiMode: baseConfig.apiMode, channelId: fallbackChannelId };
    }
    return { model: workflowModel, apiMode: workflow.config.apiMode || baseConfig.apiMode, channelId: resolveWorkflowImageChannelId(baseConfig, workflowModel, workflow.config.imageChannelId, baseConfig.imageChannelId, baseConfig.activeChannelId) };
}

function resolveWorkflowImageChannelId(config: AiConfig, model: string, ...preferredIds: Array<string | undefined>) {
    const channels = config.channelMode === "remote"
        ? config.publicChannels.map((channel) => ({ id: channel.id || "", models: channel.models || [] }))
        : normalizeLocalChannels(config).map((channel) => ({ id: channel.id, models: channel.models }));
    for (const id of preferredIds) {
        const channelId = (id || "").trim();
        if (channelId && channels.some((channel) => channel.id === channelId && channel.models.includes(model))) return channelId;
    }
    return channels.find((channel) => channel.models.includes(model))?.id || "";
}

export function buildRunConfig(baseConfig: AiConfig, workflowConfig: WorkflowGenerationConfig, runtime: { model: string; apiMode: AiConfig["apiMode"]; channelId: string }): AiConfig {
    return {
        ...baseConfig,
        ...workflowConfig,
        model: runtime.model,
        imageModel: runtime.model,
        imageChannelId: runtime.channelId,
        activeChannelId: runtime.channelId,
        apiMode: runtime.apiMode,
        systemPrompt: workflowConfig.systemPrompt || baseConfig.systemPrompts.workflow || baseConfig.systemPrompt,
        count: workflowConfig.count || "1",
    };
}

export function buildImageHistoryLog({
    id,
    workflow,
    prompt,
    config,
    model,
    images,
    durationMs,
    inputs,
    references,
    categoryIds,
    seriesTitle,
    seriesIndex,
    status = "成功",
    task,
    lastPolledAt,
}: {
    id?: string;
    workflow: CreativeWorkflow;
    prompt: string;
    config: ImageHistoryLog["config"];
    model: string;
    images: ImageHistoryLog["images"];
    durationMs: number;
    inputs: Record<string, unknown>;
    references: ReferenceImage[];
    categoryIds: string[];
    seriesTitle?: string;
    seriesIndex?: number;
    status?: ImageHistoryLog["status"];
    task?: CanvasImageTask;
    lastPolledAt?: number;
}): ImageHistoryLog {
    return {
        id: id || nanoid(),
        createdAt: Date.now(),
        title: seriesTitle ? `${workflow.name} · ${seriesTitle}` : workflow.name,
        prompt,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        model,
        config,
        references,
        durationMs,
        successCount: status === "成功" ? images.length : 0,
        failCount: status === "失败" ? 1 : 0,
        imageCount: status === "生成中" ? 0 : images.length,
        size: config.size,
        quality: config.quality,
        status,
        images,
        thumbnails: images.map((image) => image.dataUrl),
        errors: [],
        categoryIds,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowInputs: { ...inputs, ...(seriesTitle ? { seriesTitle, seriesIndex } : {}) },
        task,
        lastPolledAt,
    };
}

export function serializeHistoryLog(log: ImageHistoryLog): ImageHistoryLog {
    return {
        ...log,
        images: log.images.map((image) => ({ ...image, dataUrl: image.dataUrl?.startsWith("http") ? image.dataUrl : "" })),
        thumbnails: log.images.map((image) => (image.dataUrl?.startsWith("http") ? image.dataUrl : "")),
    };
}

export function isDisposableReferenceFile(reference: ReferenceImage) {
    const item = reference as ReferenceImage & { temporary?: boolean; source?: string };
    return item.temporary === true || item.source === "upload" || item.source === "clipboard";
}

export function referenceUsedByWorkflowTask(reference: ReferenceImage, tasks: WorkflowTask[]) {
    if (!reference.storageKey) return false;
    return tasks.some((task) => task.references.some((item) => item.storageKey === reference.storageKey));
}

export function formatDate(value: number) {
    return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
