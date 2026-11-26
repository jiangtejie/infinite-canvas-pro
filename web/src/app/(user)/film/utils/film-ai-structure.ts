import { cleanAiJsonText, extractAiJsonBlock } from "@/lib/ai-json";
import { scriptTextHash } from "@/lib/film/film-script-import";
import type { FilmStructureBeat, FilmStructurePlan, FilmStructureScene } from "@/lib/film/types";
import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import { splitFilmScriptIntoChunks } from "./film-ai-chunks";
import type { FilmParseOptions } from "./film-ai-parse";

const MAX_STRUCTURE_CHARS = 12000;

const STRUCTURE_PROMPT = `你是影视结构分析师。把剧本整理成拍摄前的场次结构计划，不写镜头、不写画面描述。
只输出 JSON 对象：{"scenes":[...]}，不要 Markdown、不要解释。
每个场次：
- episodeTitle：集标题，沿用剧本写法，例如"第1集"；
- sceneNo：场内序号，数字；
- sceneName：场次标题，尽量沿用剧本里的场名/场号，例如"1-1 咖啡馆"；
- purpose：这场戏的叙事目的，一句话；
- beats：信息点数组，每项 {"type":"建立/推进/转折/揭示/收束","summary":"这场戏发生什么","infoPoint":"观众获得的信息","emotion":"情绪变化"}；
- coverage：需要的镜头覆盖类型数组，从 建立/反应/细节/关系/过渡 中选；
- characters：本场出场人物；
- estimatedDuration：本场预估秒数，数字。
规则：不合并场次，不新增剧本没有的场次；场名不确定时保留剧本原文。`;

type StructureAiScene = {
    episodeTitle?: string;
    sceneNo?: number | string;
    sceneName?: string;
    purpose?: string;
    beats?: Array<{ type?: string; summary?: string; infoPoint?: string; emotion?: string }>;
    coverage?: string[];
    characters?: string[];
    estimatedDuration?: number | string;
};

function structureNumber(value: unknown, fallback = 0) {
    const number = typeof value === "number" ? value : Number(String(value ?? "").match(/\d+(?:\.\d+)?/)?.[0] ?? Number.NaN);
    return Number.isFinite(number) ? number : fallback;
}

function structureScene(raw: StructureAiScene, index: number): FilmStructureScene {
    const beats: FilmStructureBeat[] = (raw.beats ?? [])
        .filter((beat) => beat && (beat.summary || beat.infoPoint))
        .map((beat) => ({
            type: (beat.type || "推进").trim(),
            summary: (beat.summary || "").trim(),
            ...(beat.infoPoint ? { infoPoint: beat.infoPoint.trim() } : {}),
            ...(beat.emotion ? { emotion: beat.emotion.trim() } : {}),
        }));
    const sceneName = (raw.sceneName || "").trim();
    return {
        episodeTitle: (raw.episodeTitle || "第 1 集").trim(),
        sceneNo: structureNumber(raw.sceneNo || sceneName.match(/^(\d+)/)?.[1], index + 1),
        sceneName,
        purpose: (raw.purpose || "").trim(),
        beats,
        coverage: (raw.coverage ?? []).map((item) => item.trim()).filter(Boolean),
        characters: (raw.characters ?? []).map((item) => item.trim()).filter(Boolean),
        estimatedDuration: Math.max(0, Math.round(structureNumber(raw.estimatedDuration))),
    };
}

function parseStructureResponse(content: string): FilmStructureScene[] {
    const text = cleanAiJsonText(content);
    const body = extractAiJsonBlock(text, "object") || text;
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error("AI 返回的结构计划不是有效 JSON");
    }
    const rows = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { scenes?: unknown }).scenes)
            ? (parsed as { scenes: unknown[] }).scenes
            : null;
    if (!rows) throw new Error("AI 没有返回场次结构");
    return rows
        .filter((row): row is StructureAiScene => Boolean(row) && typeof row === "object")
        .map((row, index) => structureScene(row, index))
        .filter((scene) => scene.sceneName);
}

/** 结构阶段：只拆集/场/节拍，为后续逐场分镜提供稳定上下文。 */
export async function requestFilmAiStructure(
    config: AiConfig,
    script: string,
    options: FilmParseOptions = {},
    onProgress?: (done: number, total: number) => void,
): Promise<FilmStructurePlan> {
    const chunks = splitFilmScriptIntoChunks(script, MAX_STRUCTURE_CHARS);
    const scenes: FilmStructureScene[] = [];
    const seen = new Set<string>();
    const durationHint = options.targetDuration ? `\n【全片目标时长】约 ${options.targetDuration} 秒，为各场分配预估时长。` : "";
    for (let index = 0; index < chunks.length; index++) {
        options.signal?.throwIfAborted();
        const partHint = chunks.length > 1 ? `【这是剧本第 ${index + 1}/${chunks.length} 段，只整理这一段出现的场次】\n` : "";
        const turn = await requestCanvasAgentTurn({
            config,
            systemPrompt: `${STRUCTURE_PROMPT}${durationHint}`,
            messages: [{ role: "user", content: `${partHint}【剧本】\n${chunks[index]}` }],
            tools: [],
            toolMode: "prompt-json",
            signal: options.signal,
        });
        parseStructureResponse(turn.content).forEach((scene) => {
            const key = `${scene.episodeTitle}::${scene.sceneName}`;
            if (seen.has(key)) return;
            seen.add(key);
            scenes.push(scene);
        });
        onProgress?.(index + 1, chunks.length);
    }
    if (!scenes.length) throw new Error("AI 没有拆出有效的场次结构");
    return { scriptHash: scriptTextHash(script), scenes, createdAt: new Date().toISOString(), model: config.model };
}

const SCENE_HEADING = /^第\s*[0-9零一二三四五六七八九十百]+\s*[集场]|^EP(?:ISODE)?\s*\d+|^场景\s*\d+|^\d{1,2}[-－]\d{1,2}\s/;

/** 从完整剧本里截出单场正文；找不到标题时退回整篇，由模型按场次计划自行限定。 */
export function scriptSceneExcerpt(script: string, scene: FilmStructureScene) {
    const lines = script.split(/\r?\n/);
    const tokens = scene.sceneName.split(/[\s·]+/).map((token) => token.trim()).filter((token) => token.length >= 2);
    let start = -1;
    if (tokens.length) {
        start = lines.findIndex((line) => SCENE_HEADING.test(line.trim()) && tokens.some((token) => line.includes(token)));
        if (start < 0) start = lines.findIndex((line) => tokens.some((token) => line.includes(token)));
    }
    if (start < 0 && scene.sceneNo > 0) {
        start = lines.findIndex((line) => new RegExp(`^\\s*${scene.sceneNo}[-－]`).test(line));
    }
    if (start < 0) return script;
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index++) {
        if (SCENE_HEADING.test(lines[index].trim())) {
            end = index;
            break;
        }
    }
    return lines.slice(start, end).join("\n").trim() || script;
}

/** 把结构计划压缩为 AI 检查/拆镜可读的场次上下文。 */
export function structurePlanPromptContext(plan?: FilmStructurePlan) {
    if (!plan?.scenes.length) return "";
    return JSON.stringify(plan.scenes.map((scene) => ({
        episode: scene.episodeTitle,
        scene: scene.sceneName,
        purpose: scene.purpose,
        beats: scene.beats.map((beat) => beat.summary),
        coverage: scene.coverage,
        duration: scene.estimatedDuration,
    })));
}
