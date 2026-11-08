import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmProject, FilmStructureBeat, FilmStructurePlan, FilmStructureScene } from "@/lib/film/types";
import { scriptTextHash } from "@/lib/film/film-script-import";

const MAX_STRUCTURE_SCENES = 200;
const MAX_INPUT_CHARS = 18000;

export const FILM_STRUCTURE_SYSTEM_PROMPT = `你是影视项目的前期策划与结构编剧。只分析叙事结构，不写景别、运镜、光线等画面语言。
输出一个 JSON 数组，不要 Markdown、不要解释。每个元素对应一场戏：
{"episode":"第1集","sceneNo":1,"sceneName":"1-1 街道","purpose":"这场戏在故事里的功能，一句话","beats":[{"type":"信息|冲突|转折|情绪|悬念","summary":"发生了什么","infoPoint":"观众必须获得的信息","emotion":"情绪走向"}],"coverage":["建立镜头","人物反应","细节插入"],"characters":["阿青"],"estimatedDuration":45}
要求：
1. 按剧本原有集/场顺序，不要合并或新增场次；没有场名时用“序号+地点”命名。
2. 每场 2-5 个 beats，覆盖该场的信息点、冲突、转折和情绪变化。
3. coverage 只写叙事上需要的镜头类型（建立镜头/人物反应/细节插入/关系镜头/过渡镜头），不要写景别。
4. estimatedDuration 是该场预计成片秒数；所有场相加尽量接近目标时长。
5. 只输出 JSON 数组，第一个字符是 [，最后一个字符是 ]。`;

const SCENE_PROMPT_SUFFIX = `\n【单场重生成】只重建用户指定的这一场，保持原来的集/场名与顺序；输出 JSON 数组只包含这一场（1 个元素）。`;

export async function requestFilmStructurePlan(config: AiConfig, project: FilmProject): Promise<FilmStructurePlan> {
    const input = buildFilmStructureInput(project);
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: FILM_STRUCTURE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: input }],
        tools: [],
        toolMode: "prompt-json",
    });
    return parseFilmStructurePlan(turn.content, project);
}

/** 把项目压缩成结构代理能消化的输入：优先用已解析的场次，否则截取剧本原文。 */
export function buildFilmStructureInput(project: FilmProject) {
    const scenes: Array<Record<string, unknown>> = [];
    for (const episode of project.episodes || []) {
        for (const scene of episode.scenes || []) {
            scenes.push({
                episode: episode.title,
                scene: scene.name,
                location: scene.location,
                time: scene.time,
                mood: scene.mood,
                excerpts: scene.shots.map((shot) => [shot.description, shot.dialogue].filter(Boolean).join(" / ")).filter(Boolean).slice(0, 12),
            });
        }
    }
    const base = {
        title: project.title,
        targetDuration: project.targetDuration || undefined,
        scenes: scenes.length ? scenes : undefined,
        script: scenes.length ? undefined : (project.scriptText || "").slice(0, MAX_INPUT_CHARS),
    };
    let serialized = JSON.stringify(base);
    if (serialized.length > MAX_INPUT_CHARS && scenes.length) {
        const trimmed: Array<Record<string, unknown>> = [];
        for (const scene of scenes) {
            const next = JSON.stringify({ ...base, scenes: [...trimmed, scene] });
            if (next.length > MAX_INPUT_CHARS) break;
            trimmed.push(scene);
        }
        serialized = JSON.stringify({ ...base, scenes: trimmed, note: "剧本过长，只提供前面的场次，结构计划需覆盖这些场次" });
    }
    return serialized;
}

export function parseFilmStructurePlan(content: string, project: FilmProject): FilmStructurePlan {
    const scenes = parseFilmStructureScenes(content);
    if (!scenes.length) throw new Error("AI 没有生成有效的结构计划");
    const hashSource = project.scriptHash || project.scriptText || JSON.stringify(project.episodes || []);
    return {
        scriptHash: scriptTextHash(hashSource),
        scenes,
        createdAt: new Date().toISOString(),
    };
}

export function parseFilmStructureScenes(content: string): FilmStructureScene[] {
    const text = (content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    let parsed: unknown;
    try {
        parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
    } catch {
        throw new Error("AI 返回的结构计划不是有效 JSON");
    }
    if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        const nested = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
        if (nested) parsed = nested;
    }
    if (!Array.isArray(parsed)) throw new Error("AI 没有返回结构计划数组");
    const scenes: FilmStructureScene[] = [];
    for (const item of parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object").slice(0, MAX_STRUCTURE_SCENES)) {
        const sceneName = String(item.sceneName || item.scene || "").trim();
        if (!sceneName) continue;
        const rawBeats = Array.isArray(item.beats) ? item.beats : [];
        const beats: FilmStructureBeat[] = rawBeats
            .filter((beat): beat is Record<string, unknown> => Boolean(beat) && typeof beat === "object")
            .map((beat) => ({
                type: String(beat.type || "信息").trim() || "信息",
                summary: String(beat.summary || "").trim(),
                infoPoint: String(beat.infoPoint || "").trim() || undefined,
                emotion: String(beat.emotion || "").trim() || undefined,
            }))
            .filter((beat) => beat.summary);
        if (!beats.length) continue;
        scenes.push({
            episodeTitle: String(item.episode || "第 1 集").trim() || "第 1 集",
            sceneNo: Number(item.sceneNo) || scenes.length + 1,
            sceneName,
            purpose: String(item.purpose || "").trim(),
            beats,
            coverage: Array.isArray(item.coverage) ? item.coverage.map((value) => String(value).trim()).filter(Boolean) : [],
            characters: Array.isArray(item.characters) ? item.characters.map((value) => String(value).trim()).filter(Boolean) : [],
            estimatedDuration: Math.max(3, Math.min(900, Number(item.estimatedDuration) || 0)),
        });
    }
    return scenes;
}

/** 单场重生成：只调用结构代理重写这一场，其他场保持原样。 */
export async function requestFilmStructureScenePlan(config: AiConfig, project: FilmProject, plan: FilmStructurePlan, index: number): Promise<FilmStructureScene> {
    const scene = plan.scenes[index];
    if (!scene) throw new Error("没有找到要重生成的场次");
    const excerpts = (project.episodes || [])
        .flatMap((episode) => episode.scenes.map((item) => ({ episode: episode.title, scene: item })))
        .filter((entry) => entry.scene.name === scene.sceneName || entry.scene.name.includes(scene.sceneName) || scene.sceneName.includes(entry.scene.name))
        .flatMap((entry) => entry.scene.shots.map((shot) => [shot.description, shot.dialogue].filter(Boolean).join(" / ")))
        .filter(Boolean)
        .slice(0, 12);
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: FILM_STRUCTURE_SYSTEM_PROMPT + SCENE_PROMPT_SUFFIX,
        messages: [{
            role: "user",
            content: JSON.stringify({
                title: project.title,
                targetDuration: project.targetDuration || undefined,
                scene: {
                    episode: scene.episodeTitle,
                    scene: scene.sceneName,
                    current: {
                        purpose: scene.purpose,
                        beats: scene.beats,
                        coverage: scene.coverage,
                        characters: scene.characters,
                        estimatedDuration: scene.estimatedDuration,
                    },
                },
                excerpts,
            }),
        }],
        tools: [],
        toolMode: "prompt-json",
    });
    const [next] = parseFilmStructureScenes(turn.content);
    if (!next) throw new Error("AI 没有返回这一场的结构计划");
    return {
        ...next,
        episodeTitle: next.episodeTitle || scene.episodeTitle,
        sceneName: next.sceneName || scene.sceneName,
    };
}

/** 传给视觉代理的压缩上下文。 */
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
