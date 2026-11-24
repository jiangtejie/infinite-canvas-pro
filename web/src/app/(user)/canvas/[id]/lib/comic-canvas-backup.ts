import type { CanvasProject } from "../../stores/use-canvas-store";
import { CanvasNodeType } from "../../types";

type JsonRecord = Record<string, unknown>;

function invalid(reason: string): never {
    throw new Error(`不是有效的漫画画布备份：${reason}`);
}

function record(value: unknown, name: string): JsonRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${name}结构不正确`);
    return value as JsonRecord;
}

function text(value: unknown, name: string, allowEmpty = true): string {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) invalid(`${name}必须是文本`);
    return value;
}

function finite(value: unknown, name: string, positive = false): number {
    if (typeof value !== "number" || !Number.isFinite(value) || (positive && value <= 0)) invalid(`${name}数值不正确`);
    return value;
}

function nonnegative(value: unknown, name: string): number {
    const number = finite(value, name);
    if (number < 0) invalid(`${name}数值不正确`);
    return number;
}

function strings(value: unknown, name: string, unique = false): string[] {
    if (!Array.isArray(value)) invalid(`${name}必须是数组`);
    const items = value.map((item) => text(item, name, false));
    if (unique && new Set(items).size !== items.length) invalid(`${name}存在重复项`);
    return items;
}

function optionalRecord(value: unknown, name: string, allowNull = false) {
    if (value !== undefined && !(allowNull && value === null)) record(value, name);
}

function optionalText(value: JsonRecord, key: string, name: string, allowEmpty = true) {
    if (value[key] !== undefined) text(value[key], `${name} ${key}`, allowEmpty);
}

function optionalBoolean(value: JsonRecord, key: string, name: string) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") invalid(`${name} ${key}必须是布尔值`);
}

function oneOf(value: unknown, options: string[], name: string) {
    if (!options.includes(String(value))) invalid(`${name}不正确`);
}

function unitInterval(value: unknown, name: string, positive = false) {
    const number = finite(value, name, positive);
    if (number < 0 || number > 1) invalid(`${name}必须在 0 到 1 之间`);
}

function validateImage(value: unknown, name: string) {
    const image = record(value, name);
    text(image.url, `${name} URL`, false);
    optionalText(image, "storageKey", name);
    ["width", "height"].forEach((key) => {
        if (image[key] !== undefined) nonnegative(image[key], `${name} ${key}`);
    });
}

function validateSlotImage(value: unknown, name: string) {
    const image = record(value, name);
    text(image.id, `${name} ID`, false);
    text(image.url, `${name} URL`, false);
    optionalText(image, "storageKey", name);
    ["width", "height", "rating"].forEach((key) => {
        if (image[key] !== undefined) nonnegative(image[key], `${name} ${key}`);
    });
    optionalText(image, "label", name);
    optionalText(image, "createdAt", name);
}

function validateImageSlot(value: unknown, name: string) {
    const slot = record(value, name);
    if (!Array.isArray(slot.images) || !slot.images.length) invalid(`${name}图片数组缺失`);
    slot.images.forEach((image) => validateSlotImage(image, `${name}图片`));
    optionalText(slot, "activeImageId", name, false);
    optionalBoolean(slot, "locked", name);
}

function validateCharacterReference(value: unknown, name: string) {
    const reference = record(value, name);
    text(reference.id, `${name} ID`, false);
    finite(reference.revision, `${name}版本`);
    validateImageSlot(reference.slot, `${name}图槽`);
}

function validateCharacter(value: unknown) {
    const character = record(value, "角色");
    text(character.id, "角色 ID", false);
    text(character.name, "角色名称", false);
    strings(character.aliases, "角色别名");
    text(character.role, "角色定位");
    const visual = record(character.visualIdentity, "角色视觉");
    ["description", "ageRange", "bodyProportions", "face", "hairstyle", "skinTone", "signatureFeatures"].forEach((key) => text(visual[key], `角色视觉 ${key}`));
    const look = record(character.defaultLook, "角色默认造型");
    ["outfit", "palette", "fixedProps"].forEach((key) => text(look[key], `角色默认造型 ${key}`));
    const behavior = record(character.behavior, "角色行为");
    ["personality", "speechStyle", "expressionBaseline"].forEach((key) => text(behavior[key], `角色行为 ${key}`));
    const constraints = record(character.constraints, "角色约束");
    strings(constraints.mustKeep, "角色必须保留");
    strings(constraints.forbidden, "角色禁止项");
    text(character.notes, "角色备注");
    const references = record(character.references, "角色参考图");
    ["primary", "face", "fullBody"].forEach((key) => {
        if (references[key] !== undefined) validateCharacterReference(references[key], `角色${key}参考图`);
    });
    if (!Array.isArray(character.variants)) invalid("角色变体必须是数组");
    character.variants.forEach((value) => {
        const variant = record(value, "角色变体");
        text(variant.id, "角色变体 ID", false);
        text(variant.name, "角色变体名称", false);
        text(variant.description, "角色变体描述");
        if (variant.identityOverrides !== undefined) {
            const overrides = record(variant.identityOverrides, "角色变体外观覆盖");
            Object.values(overrides).forEach((item) => text(item, "角色变体外观覆盖"));
        }
        ["outfitOverride", "paletteOverride", "propChanges", "stateDescription"].forEach((key) => text(variant[key], `角色变体 ${key}`));
        if (variant.referenceImage !== undefined) validateCharacterReference(variant.referenceImage, "角色变体参考图");
        text(variant.createdAt, "角色变体创建时间");
        text(variant.updatedAt, "角色变体更新时间");
    });
    optionalText(character, "sourceLibraryCharacterId", "角色");
    optionalText(character, "sourceLibraryUpdatedAt", "角色");
}

function validateLocation(value: unknown) {
    const location = record(value, "场景");
    text(location.id, "场景 ID", false);
    text(location.name, "场景名称", false);
    text(location.description, "场景描述");
    text(location.atmosphere, "场景氛围");
    text(location.notes, "场景备注");
    if (location.image !== undefined) validateImageSlot(location.image, "场景图片");
    optionalText(location, "sourceLibraryLocationId", "场景");
    optionalText(location, "sourceLibraryUpdatedAt", "场景");
}

function validateGenerationContext(value: unknown) {
    const context = record(value, "生成上下文");
    text(context.inputSignature, "生成输入签名", false);
    text(context.compilerVersion, "生成编译器版本", false);
    text(context.prompt, "生成提示词");
    if (!Array.isArray(context.references)) invalid("生成参考必须是数组");
    context.references.forEach((value) => {
        const reference = record(value, "生成参考");
        text(reference.id, "生成参考 ID", false);
        text(reference.revision, "生成参考版本", false);
        oneOf(reference.role, ["character-primary", "character-face", "character-full-body", "character-variant", "location", "panel-anchor"], "生成参考类型");
        optionalText(reference, "imageKey", "生成参考", false);
    });
    strings(context.missingReferenceIds, "缺失参考图", true);
    optionalText(context, "model", "生成上下文");
    optionalText(context, "size", "生成上下文");
    text(context.createdAt, "生成时间", false);
}

function validatePanel(value: unknown) {
    const panel = record(value, "页格");
    text(panel.id, "页格 ID", false);
    text(panel.description, "页格描述");
    text(panel.dialogue, "页格对白");
    text(panel.caption, "页格旁白");
    text(panel.sfx, "页格拟声词");
    if (!Array.isArray(panel.characterBindings)) invalid("页格角色绑定必须是数组");
    panel.characterBindings.forEach((value) => {
        const binding = record(value, "页格角色绑定");
        text(binding.characterId, "页格角色绑定角色 ID", false);
        oneOf(binding.source, ["manual", "ai"], "页格角色绑定来源");
        text(binding.characterNameSnapshot, "页格角色绑定角色名");
        optionalText(binding, "variantId", "页格角色绑定", false);
        optionalText(binding, "variantNameSnapshot", "页格角色绑定");
    });
    if (panel.characterSuggestions !== undefined) {
        if (!Array.isArray(panel.characterSuggestions)) invalid("页格角色建议必须是数组");
        panel.characterSuggestions.forEach((value) => {
            const suggestion = record(value, "页格角色建议");
            text(suggestion.characterName, "页格角色建议名称", false);
            oneOf(suggestion.reason, ["unknown-character", "ambiguous-character", "unknown-variant", "variant-owner-mismatch"], "页格角色建议原因");
            optionalText(suggestion, "variantName", "页格角色建议");
        });
    }
    if (panel.layout !== undefined) {
        const layout = record(panel.layout, "页格布局");
        ["x", "y"].forEach((key) => unitInterval(layout[key], `页格布局 ${key}`));
        ["w", "h"].forEach((key) => unitInterval(layout[key], `页格布局 ${key}`, true));
    }
    if (panel.image !== undefined) {
        const image = record(panel.image, "页格图片");
        validateImage(image, "页格图片");
        if (image.generationContext !== undefined) validateGenerationContext(image.generationContext);
    }
    if (panel.imageError !== undefined) text(panel.imageError, "页格错误");
}

function validateCompositionContext(value: unknown) {
    const context = record(value, "合成上下文");
    ["stalePanelIds", "unrecordedPanelIds", "incompletePanelIds"].forEach((key) => strings(context[key], `合成上下文 ${key}`, true));
    optionalText(context, "confirmedAt", "合成上下文");
}

function validatePagePayload(value: unknown) {
    const page = record(value, "漫画页");
    text(page.chapterId, "章节 ID");
    text(page.title, "页面标题");
    text(page.summary, "页面摘要");
    text(page.reviewNotes, "审稿备注");
    if (!["draft", "pending", "approved", "changes"].includes(String(page.reviewStatus))) invalid("审稿状态不正确");
    if (!Array.isArray(page.panels)) invalid("页面页格必须是数组");
    page.panels.forEach(validatePanel);
    if (page.pageImage !== undefined) validateImage(page.pageImage, "成品页图片");
    if (page.compositionContext !== undefined) validateCompositionContext(page.compositionContext);
    if (page.pendingPanelTask !== undefined) {
        const task = record(page.pendingPanelTask, "待恢复任务");
        strings(task.panelIds, "待恢复页格", true);
        finite(task.startedAt, "任务开始时间");
    }
}

function validateLetter(value: unknown) {
    const letter = record(value, "贴字元素");
    text(letter.id, "贴字 ID", false);
    oneOf(letter.kind, ["speech", "thought", "caption", "sfx"], "贴字类型");
    text(letter.text, "贴字文本");
    unitInterval(letter.x, "贴字 x");
    unitInterval(letter.y, "贴字 y");
    unitInterval(letter.width, "贴字宽度", true);
    unitInterval(letter.fontSize, "贴字字号", true);
    oneOf(letter.align, ["left", "center", "right"], "贴字对齐");
    oneOf(letter.tail, ["none", "left", "right"], "贴字尾巴");
    if (letter.template !== undefined) oneOf(letter.template, ["oval", "rounded", "boxed", "cloud", "caption"], "贴字模板");
    if (letter.tailX !== undefined) unitInterval(letter.tailX, "贴字尾巴位置");
}

function validateExportPreset(value: unknown) {
    const preset = record(value, "导出预设");
    oneOf(preset.pageSize, ["fit", "a4", "b5"], "导出预设纸张");
    oneOf(String(preset.dpi), ["150", "300"], "导出预设精度");
    if (typeof preset.pageNumbers !== "boolean" || typeof preset.titlePage !== "boolean") invalid("导出预设布尔配置不正确");
    optionalText(preset, "titlePageText", "导出预设");
}

function validateSkill(value: unknown, name: string) {
    const skill = record(value, name);
    text(skill.id, `${name} ID`, false);
    text(skill.name, `${name}名称`, false);
    oneOf(skill.source, ["system", "user"], `${name}来源`);
}

function validateAssistantReference(value: unknown, name: string) {
    const reference = record(value, name);
    text(reference.id, `${name} ID`, false);
    oneOf(reference.type, Object.values(CanvasNodeType), `${name}类型`);
    text(reference.title, `${name}标题`);
    ["label", "dataUrl", "url", "storageKey", "mimeType", "text"].forEach((key) => optionalText(reference, key, name));
}

function validateAgentContent(value: unknown, name: string) {
    if (typeof value === "string") return;
    if (!Array.isArray(value)) invalid(`${name}格式不正确`);
    value.forEach((item) => {
        const part = record(item, name);
        if (part.type === "text") text(part.text, `${name}文本`);
        else if (part.type === "image_url") text(record(part.image_url, `${name}图片`).url, `${name}图片 URL`, false);
        else invalid(`${name}类型不正确`);
    });
}

function validateToolCall(value: unknown) {
    const call = record(value, "助手工具调用");
    text(call.id, "助手工具调用 ID", false);
    text(call.name, "助手工具调用名称", false);
    record(call.arguments, "助手工具调用参数");
    optionalText(call, "argumentsError", "助手工具调用");
}

function validateProtocolMessage(value: unknown) {
    const message = record(value, "助手协议消息");
    oneOf(message.role, ["user", "system", "assistant", "tool"], "助手协议消息角色");
    if (message.role === "user" || message.role === "system") {
        validateAgentContent(message.content, "助手协议消息内容");
        return;
    }
    if (message.role === "tool") {
        text(message.content, "助手工具消息内容");
        text(message.toolCallId, "助手工具消息调用 ID", false);
        text(message.name, "助手工具消息名称", false);
        return;
    }
    if (message.content !== undefined) {
        if (typeof message.content !== "string") invalid("助手协议消息内容不正确");
    }
    optionalText(message, "reasoningContent", "助手协议消息");
    if (message.responseItems !== undefined && !Array.isArray(message.responseItems)) invalid("助手协议响应项必须是数组");
    if (message.toolCalls !== undefined) {
        if (!Array.isArray(message.toolCalls)) invalid("助手协议工具调用必须是数组");
        message.toolCalls.forEach(validateToolCall);
    }
}

function validateAssistantMessage(value: unknown) {
    const message = record(value, "会话消息");
    text(message.id, "会话消息 ID", false);
    oneOf(message.role, ["user", "assistant"], "会话消息角色");
    text(message.text, "会话消息文本");
    if (message.status !== undefined) oneOf(message.status, ["thinking", "running", "waiting", "success", "error"], "会话消息状态");
    optionalText(message, "activity", "会话消息");
    if (message.references !== undefined) {
        if (!Array.isArray(message.references)) invalid("会话消息参考必须是数组");
        message.references.forEach((reference) => validateAssistantReference(reference, "会话消息参考"));
    }
    if (message.images !== undefined) {
        if (!Array.isArray(message.images)) invalid("会话消息图片必须是数组");
        message.images.forEach((value) => {
            const image = record(value, "会话消息图片");
            text(image.id, "会话消息图片 ID", false);
            text(image.dataUrl, "会话消息图片数据", false);
            text(image.prompt, "会话消息图片提示词");
            optionalText(image, "storageKey", "会话消息图片");
            if (image.source !== undefined) oneOf(image.source, ["asset", "library"], "会话消息图片来源");
        });
    }
    if (message.skills !== undefined) {
        if (!Array.isArray(message.skills)) invalid("会话消息技能必须是数组");
        message.skills.forEach((skill) => validateSkill(skill, "会话消息技能"));
    }
    optionalBoolean(message, "skillsSelected", "会话消息");
    if (message.batch !== undefined) {
        const batch = record(message.batch, "会话消息批次");
        ["total", "succeeded", "failed"].forEach((key) => {
            const count = finite(batch[key], `会话消息批次 ${key}`);
            if (count < 0 || !Number.isInteger(count)) invalid(`会话消息批次 ${key}必须是非负整数`);
        });
        if (typeof batch.rolledBack !== "boolean") invalid("会话消息批次回滚状态不正确");
        if (batch.nodeIds !== undefined) strings(batch.nodeIds, "会话消息批次节点", true);
    }
}

function validateAgentState(value: unknown) {
    const state = record(value, "会话助手状态");
    oneOf(state.phase, ["intake", "concept", "script", "breakdown", "references", "storyboard", "video", "audio", "review", "complete"], "会话助手阶段");
    optionalText(state, "brief", "会话助手状态");
    optionalText(state, "approvedPlan", "会话助手状态");
    if (state.targetDurationSeconds !== undefined) finite(state.targetDurationSeconds, "会话助手目标时长", true);
    ["approvedNodeIds", "referenceNodeIds", "pendingTaskIds", "completedTaskIds"].forEach((key) => strings(state[key], `会话助手状态 ${key}`, true));
}

function validateAssistantSession(value: unknown) {
    const session = record(value, "会话");
    text(session.id, "会话 ID", false);
    text(session.title, "会话标题");
    if (!Array.isArray(session.messages)) invalid("会话消息必须是数组");
    session.messages.forEach(validateAssistantMessage);
    validateAgentState(session.agentState);
    if (!Array.isArray(session.protocolMessages)) invalid("会话协议消息必须是数组");
    session.protocolMessages.forEach(validateProtocolMessage);
    optionalText(session, "jsonToolFallbackKey", "会话");
    if (session.jsonToolFallbackMode !== undefined) oneOf(session.jsonToolFallbackMode, ["structured-json", "prompt-json"], "会话 JSON 工具模式");
    if (session.activeSkills !== undefined) {
        if (!Array.isArray(session.activeSkills)) invalid("会话当前技能必须是数组");
        session.activeSkills.forEach((skill) => validateSkill(skill, "会话当前技能"));
    }
    optionalText(session, "contextCheckpoint", "会话");
    text(session.createdAt, "会话创建时间", false);
    text(session.updatedAt, "会话更新时间", false);
}

function validateAgentConfig(value: unknown) {
    const config = record(value, "助手配置");
    oneOf(config.textApiMode, ["chat", "responses"], "助手配置文本接口模式");
    ["textStreaming", "textReasoningEnabled", "confirmMediaGeneration"].forEach((key) => optionalBoolean(config, key, "助手配置"));
    if (typeof config.autoGenerateMedia !== "boolean") invalid("助手配置自动生成媒体状态不正确");
    ["imageQuality", "imageSize", "videoQuality", "videoSize"].forEach((key) => text(config[key], `助手配置 ${key}`));
}

function validateInsertAssetPayload(value: unknown) {
    const payload = record(value, "待处理素材");
    oneOf(payload.kind, ["text", "image", "video", "audio"], "待处理素材类型");
    text(payload.title, "待处理素材标题");
    optionalText(payload, "assetId", "待处理素材");
    if (payload.source !== undefined) oneOf(payload.source, ["asset", "library"], "待处理素材来源");
    if (payload.kind === "text") text(payload.content, "待处理文本内容");
    else if (payload.kind === "image") text(payload.dataUrl, "待处理图片数据", false);
    else text(payload.url, "待处理媒体 URL", false);
    if (payload.kind !== "text") {
        optionalText(payload, "storageKey", "待处理素材");
        optionalText(payload, "mimeType", "待处理素材");
        ["width", "height", "bytes"].forEach((key) => {
            if (payload[key] !== undefined) nonnegative(payload[key], `待处理素材 ${key}`);
        });
        if (payload.kind === "audio" && payload.durationMs !== undefined) finite(payload.durationMs, "待处理音频时长", true);
    }
}

function validatePendingAgentRequest(value: unknown) {
    const request = record(value, "待处理助手请求");
    text(request.prompt, "待处理助手请求提示词");
    if (!Array.isArray(request.assets)) invalid("待处理助手请求素材必须是数组");
    request.assets.forEach((value) => {
        const asset = record(value, "待处理助手请求素材");
        text(asset.nodeId, "待处理助手请求素材节点 ID", false);
        validateInsertAssetPayload(asset.payload);
        validateAssistantReference(asset.reference, "待处理助手请求素材参考");
    });
    if (!Array.isArray(request.skills)) invalid("待处理助手请求技能必须是数组");
    request.skills.forEach((skill) => validateSkill(skill, "待处理助手请求技能"));
}

export function serializeComicCanvasProject(project: CanvasProject) {
    return JSON.stringify({ app: "infinite-canvas-comic", version: 2, exportedAt: new Date().toISOString(), project }, null, 2);
}

export function parseComicCanvasProjectBackup(serialized: string): CanvasProject {
    let data: unknown;
    try {
        data = JSON.parse(serialized);
    } catch {
        invalid("JSON 无法解析");
    }
    const backup = record(data, "备份");
    if (backup.app !== "infinite-canvas-comic" || backup.version !== 2) invalid("应用标识或版本不正确");
    const project = record(backup.project, "项目");
    text(project.id, "项目 ID", false);
    text(project.title, "项目标题", false);
    text(project.createdAt, "创建时间", false);
    text(project.updatedAt, "更新时间", false);
    if (project.domain !== "comic") invalid("项目不是漫画画布");
    if (!Array.isArray(project.nodes) || !Array.isArray(project.connections) || !Array.isArray(project.chatSessions)) invalid("节点、连线或会话数组缺失");
    const sessionIds = new Set<string>();
    project.chatSessions.forEach((value) => {
        validateAssistantSession(value);
        const id = text(record(value, "会话").id, "会话 ID", false);
        if (sessionIds.has(id)) invalid("会话 ID 重复");
        sessionIds.add(id);
    });
    if (project.activeChatId !== null) {
        const activeChatId = text(project.activeChatId, "当前会话", false);
        if (!sessionIds.has(activeChatId)) invalid("当前会话不存在");
    }
    if (project.agentConfig !== null) validateAgentConfig(project.agentConfig);
    if (project.pendingAgentRequest !== undefined) validatePendingAgentRequest(project.pendingAgentRequest);
    if (typeof project.autoTitlePending !== "boolean" || typeof project.showImageInfo !== "boolean") invalid("项目布尔配置缺失");
    if (!["dots", "lines", "blank"].includes(String(project.backgroundMode))) invalid("画布背景不正确");
    const viewport = record(project.viewport, "视口");
    finite(viewport.x, "视口 x");
    finite(viewport.y, "视口 y");
    finite(viewport.k, "视口缩放", true);
    [project.sidePanel, project.agentPanel].forEach((value) => {
        const panel = record(value, "侧边面板");
        if (typeof panel.open !== "boolean") invalid("侧边面板状态不正确");
        finite(panel.width, "侧边面板宽度", true);
    });

    const nodeIds = new Set<string>();
    const nodeTypes = new Set<string>(Object.values(CanvasNodeType));
    project.nodes.forEach((value) => {
        const node = record(value, "节点");
        const id = text(node.id, "节点 ID", false);
        if (nodeIds.has(id)) invalid("节点 ID 重复");
        nodeIds.add(id);
        text(node.title, "节点标题");
        if (!nodeTypes.has(String(node.type))) invalid("节点类型不正确");
        const position = record(node.position, "节点位置");
        finite(position.x, "节点 x");
        finite(position.y, "节点 y");
        finite(node.width, "节点宽度", true);
        finite(node.height, "节点高度", true);
        optionalRecord(node.metadata, "节点元数据");
        if (node.metadata !== undefined) {
            const metadata = record(node.metadata, "节点元数据");
            ["naturalWidth", "naturalHeight", "bytes", "durationMs"].forEach((key) => {
                if (metadata[key] !== undefined) nonnegative(metadata[key], `媒体 ${key}`);
            });
        }
        if (node.type === CanvasNodeType.ComicPage) validatePagePayload(node.metadata && record(node.metadata, "节点元数据").comicPage);
    });

    const connectionIds = new Set<string>();
    project.connections.forEach((value) => {
        const connection = record(value, "连线");
        const id = text(connection.id, "连线 ID", false);
        if (connectionIds.has(id)) invalid("连线 ID 重复");
        connectionIds.add(id);
        const from = text(connection.fromNodeId, "连线起点", false);
        const to = text(connection.toNodeId, "连线终点", false);
        if (!nodeIds.has(from) || !nodeIds.has(to)) invalid("连线端点不存在");
        if (connection.kind !== undefined && !["composition", "sequence", "context", "derived"].includes(String(connection.kind))) invalid("连线类型不正确");
        optionalRecord(connection.data, "连线数据");
    });

    const comic = record(project.comic, "漫画元数据");
    const bookNodeId = text(comic.bookNodeId, "漫画册节点 ID", false);
    const book = project.nodes.find((value) => record(value, "节点").id === bookNodeId);
    if (!book || record(book, "节点").type !== CanvasNodeType.Comic) invalid("漫画册节点不存在");
    if (!["concept", "cast", "script", "layout", "review"].includes(String(comic.stage))) invalid("漫画阶段不正确");
    if (!["page", "strip"].includes(String(comic.format)) || !["rtl", "ltr"].includes(String(comic.direction))) invalid("漫画格式或方向不正确");
    if (!["draft", "completed"].includes(String(comic.status))) invalid("漫画状态不正确");
    ["genre", "audience", "logline", "synopsis", "styleGuide"].forEach((key) => text(comic[key], `漫画 ${key}`));
    if (comic.targetPages !== undefined) finite(comic.targetPages, "目标页数", true);
    if (!Array.isArray(comic.chapterOrder)) invalid("章节顺序必须是数组");
    const chapterIds = new Set<string>();
    comic.chapterOrder.forEach((value) => {
        const chapter = record(value, "章节");
        const id = text(chapter.id, "章节 ID", false);
        if (chapterIds.has(id)) invalid("章节 ID 重复");
        chapterIds.add(id);
        text(chapter.title, "章节标题");
        text(chapter.summary, "章节摘要");
    });
    const cast = record(comic.cast, "角色与场景");
    if (!Array.isArray(cast.characters) || !Array.isArray(cast.locations)) invalid("角色或场景数组缺失");
    cast.characters.forEach(validateCharacter);
    cast.locations.forEach(validateLocation);

    const metadata = record(book, "节点").metadata;
    const comicBook = record(metadata && record(metadata, "节点元数据").comicBook, "漫画册");
    strings(comicBook.pageNodeIds, "书页顺序", true);
    if (comicBook.coverNodeId !== undefined) text(comicBook.coverNodeId, "封面节点 ID", false);
    if (comicBook.format !== undefined) oneOf(comicBook.format, ["page", "strip"], "漫画册格式");
    if (comicBook.direction !== undefined) oneOf(comicBook.direction, ["rtl", "ltr"], "漫画册方向");
    if (comicBook.lettering !== undefined) {
        const lettering = record(comicBook.lettering, "贴字");
        Object.values(lettering).forEach((value) => {
            if (!Array.isArray(value)) invalid("贴字元素必须是数组");
            value.forEach(validateLetter);
        });
    }
    if (comicBook.exportPreset !== undefined) validateExportPreset(comicBook.exportPreset);
    return project as unknown as CanvasProject;
}
