import assert from "node:assert/strict";
import test from "node:test";

import type { ComicProject, ComicSlotImage } from "@/app/(user)/comic/types";
import { createComicCharacter, createComicCharacterVariant, createComicLocation } from "@/app/(user)/comic/utils/comic-project";
import { CanvasNodeType, type CanvasAgentConfig, type CanvasAssistantSession, type CanvasPendingAgentRequest } from "../../types";
import { buildComicCanvasProject, type ComicCanvasProjectContext } from "../../utils/comic-canvas-project";
import { applyComicProject } from "./comic-canvas-projection";
import { parseComicCanvasProjectBackup, serializeComicCanvasProject } from "./comic-canvas-backup";

const context: ComicCanvasProjectContext = {
    id: "comic-backup",
    now: "2026-11-24T00:00:00.000Z",
    viewport: { x: 0, y: 0, k: 1 },
    sidePanel: { open: false, width: 320 },
    agentPanel: { open: false, width: 464 },
};

function comicDocument() {
    const project: ComicProject = {
        id: context.id,
        title: "完整备份",
        status: "draft",
        stage: "layout",
        genre: "悬疑",
        audience: "青年",
        format: "strip",
        direction: "ltr",
        logline: "雨夜来信",
        synopsis: "主角追寻失踪者。",
        styleGuide: "冷色雨夜",
        chapters: [{ id: "chapter-1", title: "第一章", summary: "收到来信", pages: [{
            id: "page-1",
            title: "第一页",
            summary: "门口",
            reviewStatus: "pending",
            reviewNotes: "待确认",
            pendingPanelTask: { panelIds: ["panel-1"], startedAt: 123 },
            panels: [{ id: "panel-1", description: "门口特写", dialogue: "谁？", caption: "", sfx: "", characterBindings: [] }],
            pageImage: { url: "data:image/png;base64,AA==", storageKey: "image:page-1", width: 1080, height: 1920 },
        }] }],
        pageOrder: ["page-1"],
        characters: [],
        locations: [],
        createdAt: context.now,
        updatedAt: context.now,
    };
    const canvas = applyComicProject(buildComicCanvasProject(project.title, context), project);
    const character = createComicCharacter(1);
    character.id = "character-1";
    character.references.primary = { id: "primary-1", revision: 2, slot: { images: [{ id: "primary-image-1", url: "blob:portrait", storageKey: "image:portrait", rating: 3 }], activeImageId: "primary-image-1" } };
    const variant = createComicCharacterVariant(1);
    variant.id = "variant-1";
    variant.referenceImage = { id: "variant-reference-1", revision: 1, slot: { images: [{ id: "variant-image-1", url: "blob:uniform", storageKey: "image:uniform" }] } };
    character.variants = [variant];
    const location = createComicLocation(1);
    location.id = "location-1";
    location.image = { images: [{ id: "location-image-1", url: "blob:school", storageKey: "image:school", width: 1200, height: 800 }], activeImageId: "location-image-1", locked: true };
    canvas.comic!.cast = { characters: [character], locations: [location] };
    const page = canvas.nodes.find((node) => node.type === CanvasNodeType.ComicPage)!.metadata!.comicPage!;
    page.panels[0]!.characterBindings = [{ characterId: "character-1", variantId: "variant-1", source: "manual", characterNameSnapshot: character.name, variantNameSnapshot: variant.name }];
    page.panels[0]!.characterSuggestions = [{ characterName: "陌生人", reason: "unknown-character" }];
    page.panels[0]!.image = {
        url: "blob:panel",
        storageKey: "image:panel",
        generationContext: {
            inputSignature: "signature-1",
            compilerVersion: "1",
            prompt: "门口特写",
            references: [{ id: "primary-1", revision: "2", role: "character-primary" }],
            missingReferenceIds: [],
            model: "image-model",
            size: "1k",
            createdAt: context.now,
        },
    };
    page.compositionContext = { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [], confirmedAt: context.now };
    return {
        ...canvas,
        viewport: { x: 120, y: -80, k: 0.75 },
        sidePanel: { open: true, width: 360 },
        agentPanel: { open: true, width: 500 },
        nodes: canvas.nodes.map((node) => node.id === canvas.comic!.bookNodeId ? {
            ...node,
            metadata: {
                ...node.metadata,
                comicBook: {
                    ...node.metadata!.comicBook!,
                    coverNodeId: "page-1",
                    lettering: { "page-1": [{ id: "letter-1", kind: "speech" as const, text: "谁？", x: 0.2, y: 0.3, width: 0.4, fontSize: 0.04, align: "center" as const, tail: "none" as const }] },
                    exportPreset: { pageSize: "fit" as const, dpi: 300 as const, pageNumbers: true, titlePage: false },
                },
            },
        } : node),
    };
}

function assistantState() {
    const session: CanvasAssistantSession = {
        id: "session-1",
        title: "漫画助手",
        messages: [{
            id: "message-1",
            role: "user",
            text: "补一张门口图",
            references: [{ id: "page-1", type: CanvasNodeType.ComicPage, title: "第一页", label: "页面" }],
            images: [{ id: "chat-image-1", dataUrl: "data:image/png;base64,AA==", storageKey: "image:chat", prompt: "门口", source: "library" }],
            skills: [{ id: "skill-1", name: "漫画", source: "system" }],
            skillsSelected: true,
            batch: { total: 1, succeeded: 1, failed: 0, rolledBack: false, nodeIds: ["page-1"] },
        }, { id: "message-2", role: "assistant", text: "完成", status: "success", activity: "已生成" }],
        agentState: {
            phase: "references",
            brief: "雨夜门口",
            targetDurationSeconds: 30,
            approvedPlan: "先做页面",
            approvedNodeIds: ["page-1"],
            referenceNodeIds: [],
            pendingTaskIds: [],
            completedTaskIds: ["page-1"],
        },
        protocolMessages: [
            { role: "user", content: [{ type: "text", text: "补图" }, { type: "image_url", image_url: { url: "blob:reference" } }] },
            { role: "assistant", content: "完成", reasoningContent: "检查页面", responseItems: [{ type: "message" }], toolCalls: [{ id: "call-1", name: "create_node", arguments: { type: "ComicPage" }, argumentsError: "无" }] },
            { role: "tool", content: "成功", toolCallId: "call-1", name: "create_node" },
        ],
        jsonToolFallbackKey: "fallback-1",
        jsonToolFallbackMode: "prompt-json",
        activeSkills: [{ id: "skill-1", name: "漫画", source: "system" }],
        contextCheckpoint: "检查点",
        createdAt: context.now,
        updatedAt: context.now,
    };
    const agentConfig: CanvasAgentConfig = {
        textApiMode: "responses",
        textStreaming: true,
        textReasoningEnabled: false,
        autoGenerateMedia: true,
        confirmMediaGeneration: true,
        imageQuality: "high",
        imageSize: "1k",
        videoQuality: "hd",
        videoSize: "1280x720",
    };
    const pendingAgentRequest: CanvasPendingAgentRequest = {
        prompt: "继续处理",
        assets: [{
            nodeId: "page-1",
            payload: { kind: "image", dataUrl: "data:image/png;base64,AA==", title: "待处理图片", storageKey: "image:pending", width: 100, height: 200, bytes: 300, mimeType: "image/png", source: "library" },
            reference: { id: "page-1", type: CanvasNodeType.ComicPage, title: "第一页", storageKey: "image:page-1" },
        }],
        skills: [{ id: "skill-1", name: "漫画", source: "user" }],
    };
    return { session, agentConfig, pendingAgentRequest };
}

test("comic canvas backup round trips book-level state and pending work", () => {
    const canvas = comicDocument();
    const restored = parseComicCanvasProjectBackup(serializeComicCanvasProject(canvas));
    assert.deepEqual(restored, JSON.parse(JSON.stringify(canvas)));
});

test("comic canvas backup round trips nested assistant state", () => {
    const { session, agentConfig, pendingAgentRequest } = assistantState();
    const canvas = { ...comicDocument(), chatSessions: [session], activeChatId: session.id, agentConfig, pendingAgentRequest };
    const restored = parseComicCanvasProjectBackup(serializeComicCanvasProject(canvas));
    assert.deepEqual(restored, JSON.parse(JSON.stringify(canvas)));
});

test("comic canvas backup rejects malformed session messages", () => {
    const emptySession = comicDocument();
    emptySession.chatSessions = [{} as CanvasAssistantSession];
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(emptySession)), /会话/);

    const { session } = assistantState();
    const invalidMessage = { ...comicDocument(), chatSessions: [session], activeChatId: session.id };
    invalidMessage.chatSessions[0]!.messages[0]!.text = 42 as unknown as string;
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidMessage)), /消息/);
});

test("comic canvas backup rejects dangling active sessions", () => {
    const canvas = { ...comicDocument(), activeChatId: "missing-session" };
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(canvas)), /当前会话/);
});

test("comic canvas backup rejects malformed agent configuration", () => {
    const { agentConfig } = assistantState();
    const canvas = { ...comicDocument(), agentConfig: { ...agentConfig, imageQuality: 42 as unknown as string } };
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(canvas)), /助手配置/);
});

test("comic canvas backup rejects malformed pending agent assets", () => {
    const { pendingAgentRequest } = assistantState();
    const canvas = { ...comicDocument(), pendingAgentRequest };
    Reflect.deleteProperty(canvas.pendingAgentRequest.assets[0]!.payload, "title");
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(canvas)), /待处理素材标题/);
});

test("comic canvas backup rejects derived project-only data", () => {
    const derived = { app: "infinite-canvas-comic", version: 1, project: { title: "旧备份", chapters: [] } };
    assert.throws(() => parseComicCanvasProjectBackup(JSON.stringify(derived)), /不是有效的漫画画布备份/);
});

test("comic canvas backup rejects duplicate nodes and dangling connections", () => {
    const canvas = comicDocument();
    const duplicate = { ...canvas, nodes: [...canvas.nodes, canvas.nodes[0]!] };
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(duplicate)), /节点 ID 重复/);
    const dangling = { ...canvas, connections: [{ id: "edge-1", fromNodeId: "missing", toNodeId: "page-1" }] };
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(dangling)), /连线端点不存在/);
});

test("comic canvas backup rejects a missing book node", () => {
    const canvas = comicDocument();
    const broken = { ...canvas, comic: { ...canvas.comic!, bookNodeId: "missing-book" } };
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(broken)), /漫画册节点不存在/);
});

test("comic canvas backup keeps intentional missing page slots", () => {
    const canvas = comicDocument();
    const withMissing = {
        ...canvas,
        nodes: canvas.nodes.map((node) => node.type === CanvasNodeType.Comic ? {
            ...node,
            metadata: { ...node.metadata, comicBook: { ...node.metadata!.comicBook!, pageNodeIds: ["page-1", "lost-page"] } },
        } : node),
    };
    const restored = parseComicCanvasProjectBackup(serializeComicCanvasProject(withMissing));
    assert.deepEqual(restored.nodes.find((node) => node.type === CanvasNodeType.Comic)?.metadata?.comicBook?.pageNodeIds, ["page-1", "lost-page"]);
});

test("comic canvas backup keeps zero-sized media payloads", () => {
    const { pendingAgentRequest } = assistantState();
    const canvas = { ...comicDocument(), pendingAgentRequest };
    const page = canvas.nodes.find((node) => node.type === CanvasNodeType.ComicPage)!.metadata!.comicPage!;
    page.pageImage!.width = 0;
    page.pageImage!.height = 0;
    const character = canvas.comic!.cast.characters[0]!;
    character.references.primary!.slot.images[0]!.width = 0;
    character.references.primary!.slot.images[0]!.height = 0;
    canvas.comic!.cast.locations[0]!.image!.images[0]!.width = 0;
    canvas.comic!.cast.locations[0]!.image!.images[0]!.height = 0;
    const payload = canvas.pendingAgentRequest.assets[0]!.payload;
    if (payload.kind === "image") {
        payload.width = 0;
        payload.height = 0;
        payload.bytes = 0;
    }
    const restored = parseComicCanvasProjectBackup(serializeComicCanvasProject(canvas));
    assert.deepEqual(restored, JSON.parse(JSON.stringify(canvas)));
});

test("comic canvas backup validates media metadata dimensions and bytes", () => {
    const canvas = comicDocument();
    const media = {
        ...canvas.nodes[0]!,
        id: "media-1",
        type: CanvasNodeType.Image,
        metadata: { content: "blob:media", naturalWidth: -1, naturalHeight: 10, bytes: -1 },
    };
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject({ ...canvas, nodes: [...canvas.nodes, media] })), /媒体/);
});

test("comic canvas backup rejects malformed panel bindings and suggestions", () => {
    const invalidBinding = comicDocument();
    invalidBinding.nodes.find((node) => node.type === CanvasNodeType.ComicPage)!.metadata!.comicPage!.panels[0]!.characterBindings[0]!.source = "unknown" as "manual";
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidBinding)), /页格角色绑定/);

    const invalidSuggestion = comicDocument();
    invalidSuggestion.nodes.find((node) => node.type === CanvasNodeType.ComicPage)!.metadata!.comicPage!.panels[0]!.characterSuggestions![0]!.reason = "unknown" as "unknown-character";
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidSuggestion)), /页格角色建议/);
});

test("comic canvas backup rejects malformed image and generation payloads", () => {
    const invalidImage = comicDocument();
    const panel = invalidImage.nodes.find((node) => node.type === CanvasNodeType.ComicPage)!.metadata!.comicPage!.panels[0]!;
    panel.image!.width = "wide" as unknown as number;
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidImage)), /图片/);

    const invalidContext = comicDocument();
    invalidContext.nodes.find((node) => node.type === CanvasNodeType.ComicPage)!.metadata!.comicPage!.panels[0]!.image!.generationContext!.references[0]!.role = "unknown" as "character-primary";
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidContext)), /生成参考/);

    const invalidComposition = comicDocument();
    invalidComposition.nodes.find((node) => node.type === CanvasNodeType.ComicPage)!.metadata!.comicPage!.compositionContext!.stalePanelIds = [42] as unknown as string[];
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidComposition)), /合成上下文/);
});

test("comic canvas backup rejects malformed cast references and image slots", () => {
    const invalidCharacter = comicDocument();
    Reflect.deleteProperty(invalidCharacter.comic!.cast.characters[0]!.visualIdentity, "ageRange");
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidCharacter)), /角色视觉/);

    const invalidVariant = comicDocument();
    invalidVariant.comic!.cast.characters[0]!.variants[0]!.referenceImage!.slot.images[0] = { id: "broken" } as ComicSlotImage;
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidVariant)), /参考图/);

    const invalidLocation = comicDocument();
    invalidLocation.comic!.cast.locations[0]!.image!.images[0]!.rating = "high" as unknown as number;
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidLocation)), /场景图片/);
});

test("comic canvas backup rejects malformed lettering and export settings", () => {
    const invalidLetter = comicDocument();
    invalidLetter.nodes.find((node) => node.type === CanvasNodeType.Comic)!.metadata!.comicBook!.lettering!["page-1"]![0]!.x = "left" as unknown as number;
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidLetter)), /贴字/);

    const invalidPreset = comicDocument();
    invalidPreset.nodes.find((node) => node.type === CanvasNodeType.Comic)!.metadata!.comicBook!.exportPreset!.pageNumbers = "yes" as unknown as boolean;
    assert.throws(() => parseComicCanvasProjectBackup(serializeComicCanvasProject(invalidPreset)), /导出预设/);
});
