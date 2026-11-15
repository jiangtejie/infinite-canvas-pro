import { jsonrepair } from "jsonrepair";
import { nanoid } from "nanoid";

import { cleanAiJsonText } from "@/lib/ai-json";
import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import type { ComicCharacter, ComicPage, ComicProject } from "../types";
import { resolveComicCharacterSuggestion } from "./comic-character-binding";

type ComicConceptSuggestion = Pick<ComicProject, "genre" | "audience" | "logline" | "synopsis" | "styleGuide"> & { targetPages?: number };

const CONCEPT_PROMPT = `你是一名资深漫画编辑和原作。根据用户给的作品名和已有信息，补全漫画企划。
只输出一个 JSON 对象，不要 Markdown、不要解释，字段：
- genre：题材/类型，简短；
- audience：目标读者，具体一点；
- logline：一句话 logline，包含主角、目标与阻碍；
- synopsis：故事梗概，300-800 字，写清起承转合与主要人物关系；
- styleGuide：画风与表达指南，包含黑白/网点、线条、构图、表情基调和禁用元素；
- targetPages：可选，正整数，建议目标页数。
不要写不存在的设定事实；不确定的内容用概括表达。`;

const BREAKDOWN_PROMPT = `你是一名专业漫画分镜师。把用户给出的章节拆成可直接作画的页和格。
只输出一个 JSON 对象，不要 Markdown、不要解释，结构：
{"pages":[{"title":"第 N 页","summary":"本页叙事动作","panels":[{"description":"画面描述：景别、机位、角色动作、背景、关键道具","dialogue":"角色：台词；多句用换行","caption":"旁白/内心独白，可为空","sfx":"拟声词，可为空","characters":[{"name":"已登记角色名或别名","variant":"可选变体名"}]}]}]}
要求：
- 每页 2-6 格，页数按章节信息合理拆分；
- 只可视化已有叙事信息，不擅自增加关键剧情；
- 画面描述具体到构图和动作，对白保持角色口吻；
- characters 只能引用角色设定里已列出的姓名、别名和变体名，不要创造新角色或变体；
- 不确定出场角色时可以省略 characters；
- 不要写页格编号之外的解释。`;

export async function requestComicConcept(config: AiConfig, project: ComicProject, instruction = "", signal?: AbortSignal): Promise<ComicConceptSuggestion> {
    const content = [
        `作品名：${project.title}`,
        project.genre ? `已有题材：${project.genre}` : "",
        project.audience ? `已有目标读者：${project.audience}` : "",
        project.logline ? `已有 logline：${project.logline}` : "",
        project.synopsis ? `已有梗概：${project.synopsis}` : "",
        project.styleGuide ? `已有画风指南：${project.styleGuide}` : "",
        instruction ? `补充要求：${instruction}` : "",
    ].filter(Boolean).join("\n");
    const turn = await requestCanvasAgentTurn({ config, systemPrompt: CONCEPT_PROMPT, messages: [{ role: "user", content }], tools: [], toolMode: "prompt-json", signal });
    return parseComicConcept(turn.content);
}

export async function requestComicBreakdown(config: AiConfig, project: ComicProject, chapterTitle: string, chapterSummary: string, signal?: AbortSignal): Promise<ComicPage[]> {
    const cast = (project.characters || []).map((character) => `${character.name}｜${character.role || "未定角色"}｜外观：${character.visualIdentity.description || "未填"}｜性格：${character.behavior.personality || "未填"}｜服装：${character.defaultLook.outfit || "未填"}`).join("\n");
    const scenes = (project.locations || []).map((location) => `${location.name}｜${location.description || "未填空间结构"}｜气氛：${location.atmosphere || "未填"}`).join("\n");
    const content = [
        `作品名：${project.title}`,
        `题材：${project.genre || "未指定"}；目标读者：${project.audience || "未指定"}`,
        project.logline ? `logline：${project.logline}` : "",
        project.synopsis ? `故事梗概：${project.synopsis}` : "",
        project.styleGuide ? `画风指南：${project.styleGuide}` : "",
        cast ? `角色设定（必须遵循，不要新增未列出的主要角色）：\n${cast}` : "",
        scenes ? `场景设定（优先使用已有场景）：\n${scenes}` : "",
        `本次章节：${chapterTitle}`,
        chapterSummary ? `章节摘要：${chapterSummary}` : "章节摘要为空，请按作品梗概合理拆分。",
        `成品形态：${project.format === "strip" ? "条漫" : "页漫"}；阅读方向：${project.direction === "rtl" ? "右→左" : "左→右"}`,
    ].filter(Boolean).join("\n");
    const turn = await requestCanvasAgentTurn({ config, systemPrompt: BREAKDOWN_PROMPT, messages: [{ role: "user", content }], tools: [], toolMode: "prompt-json", signal });
    return parseComicBreakdown(turn.content, project.characters || []);
}

export function parseComicConcept(content: string): ComicConceptSuggestion {
    const value = parseJson(content);
    if (!record(value)) throw new Error("AI 返回的企划格式不正确");
    const suggestion: ComicConceptSuggestion = {
        genre: text(value.genre, 100),
        audience: text(value.audience, 100),
        logline: text(value.logline, 300),
        synopsis: text(value.synopsis, 8000),
        styleGuide: text(value.styleGuide, 5000),
    };
    const targetPages = typeof value.targetPages === "number" ? Math.round(value.targetPages) : undefined;
    if (targetPages && targetPages > 0 && targetPages <= 2000) suggestion.targetPages = targetPages;
    if (!suggestion.logline || !suggestion.synopsis) throw new Error("AI 没有给出完整的 logline 或梗概");
    return suggestion;
}

export function parseComicBreakdown(content: string, projectCharacters: ComicCharacter[] = []): ComicPage[] {
    const value = parseJson(content);
    if (!record(value) || !Array.isArray(value.pages) || !value.pages.length) throw new Error("AI 返回的页格格式不正确");
    if (value.pages.length > 80) throw new Error("AI 返回页数过多，请缩小章节范围");
    return value.pages.map((rawPage, index) => {
        if (!record(rawPage) || !Array.isArray(rawPage.panels) || !rawPage.panels.length) throw new Error(`第 ${index + 1} 页缺少页格`);
        if (rawPage.panels.length > 12) throw new Error(`第 ${index + 1} 页页格过多`);
        return {
            id: nanoid(),
            title: text(rawPage.title, 100) || `第 ${index + 1} 页`,
            summary: text(rawPage.summary, 2000),
            reviewStatus: "draft" as const,
            reviewNotes: "",
            panels: rawPage.panels.map((rawPanel) => {
                if (!record(rawPanel)) throw new Error(`第 ${index + 1} 页存在无效页格`);
                const characterBindings: ComicPage["panels"][number]["characterBindings"] = [];
                const characterSuggestions: ComicPage["panels"][number]["characterSuggestions"] = [];
                const rawCharacters = Array.isArray(rawPanel.characters) ? rawPanel.characters : [];
                for (const rawCharacter of rawCharacters) {
                    if (!record(rawCharacter)) continue;
                    const name = text(rawCharacter.name, 100);
                    if (!name) continue;
                    const resolved = resolveComicCharacterSuggestion(projectCharacters, name, text(rawCharacter.variant, 100));
                    if (resolved.binding) {
                        const duplicate = characterBindings.some((binding) => binding.characterId === resolved.binding!.characterId && binding.variantId === resolved.binding!.variantId);
                        if (!duplicate) characterBindings.push(resolved.binding);
                    }
                    if (resolved.suggestion) characterSuggestions.push(resolved.suggestion);
                }
                return {
                    id: nanoid(),
                    description: text(rawPanel.description, 2000),
                    dialogue: text(rawPanel.dialogue, 2000),
                    caption: text(rawPanel.caption, 1000),
                    sfx: text(rawPanel.sfx, 200),
                    characterBindings,
                    characterSuggestions,
                };
            }),
        };
    });
}

function parseJson(content: string) {
    return JSON.parse(jsonrepair(cleanAiJsonText(content)));
}

function record(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
