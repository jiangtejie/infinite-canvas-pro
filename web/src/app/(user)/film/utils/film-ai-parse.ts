import { nanoid } from "nanoid";

import { isCanvasAgentContextLimitError, requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmEpisode, FilmScene } from "../types";
import { filmShotTypeCodeFromLabel } from "./film-shot-types";

export type FilmAiShotRow = {
    episode?: string;
    scene?: string;
    shotNo?: string;
    shotType?: string;
    cameraMovement?: string;
    description?: string;
    sound?: string;
    duration?: number | string;
};

export type FilmParsePacing = "fast" | "normal" | "slow";

export type FilmParseOptions = {
    pacing?: FilmParsePacing;
    targetDuration?: number;
};

const MAX_AI_SHOTS = 500;
const MAX_CHUNK_CHARS = 6000;
const MIN_CONTEXT_RETRY_CHARS = 1200;

const BASE_PROMPT = `你是一名专业的影视分镜师。把用户提供的剧本拆成可直接拍摄的分镜表。
只输出 JSON 数组，不要 Markdown、不要解释。
每个元素的字段：
- episode：集，例如"第1集"；
- scene：场，例如"1-1 乡村公路/大巴车"；
- shotNo：镜号，例如"01"；
- shotType：景别，只能从以下选择：大远景、远景、全景、中景、中近景、近景、特写、大特写；
- cameraMovement：运镜，例如：固定、缓慢横移、缓慢推进、微距推进、手持轻晃、跟拍、环绕、升降、拉远；
- description：画面内容，写清楚人物动作、环境、光线；
- sound：声音/台词，例如环境声、音效、角色台词；
- duration：时长，数字，单位为秒。
用户输入可能是普通剧本，也可能是已经排好的分镜表格（列：镜号/景别/运镜/画面内容/声音台词/时长）。
- 普通剧本：由你按镜头语言拆分，一个镜头只表达一个动作或信息点，不要合并镜头；
- 分镜表格：保留原有镜头顺序与内容，只做规范化与补全，不要合并或重新拆分；
- 所有字段统一使用中文，景别与运镜从上面给定的中文选项中选择。`;

const STRICT_RETRY_HINT = `\n【重要】上一次输出无法解析。这一次只输出一个 JSON 数组，第一个字符是 [，最后一个字符是 ]，不要 Markdown，不要任何解释。`;

export async function requestFilmAiStoryboard(config: AiConfig, script: string, options: FilmParseOptions = {}, onProgress?: (done: number, total: number) => void): Promise<FilmEpisode[]> {
    const chunks = splitScriptIntoChunks(script, MAX_CHUNK_CHARS);
    const merged: FilmEpisode[] = [];
    for (let index = 0; index < chunks.length; index++) {
        const episodes = await requestChunk(config, chunks[index], options, index, chunks.length);
        mergeFilmEpisodes(merged, episodes);
        onProgress?.(index + 1, chunks.length);
    }
    if (!merged.length) throw new Error("AI 没有拆出分镜，检查一下剧本内容");
    if (chunks.length > 1) renumberShots(merged);
    return merged;
}

async function requestChunk(config: AiConfig, chunk: string, options: FilmParseOptions, index: number, total: number): Promise<FilmEpisode[]> {
    const systemPrompt = buildSystemPrompt(options);
    const partHint = total > 1 ? `【这是剧本第 ${index + 1}/${total} 段，只拆这一段的镜头，保持整体风格与编号连续】\n` : "";
    const messages: Array<{ role: "user"; content: string }> = [{ role: "user", content: `${partHint}【剧本】\n${chunk}` }];
    try {
        return await requestOnce(config, systemPrompt, messages);
    } catch (error) {
        if (isCanvasAgentContextLimitError(error) && chunk.length > MIN_CONTEXT_RETRY_CHARS) {
            const [left, right] = splitChunkInHalf(chunk);
            const leftEpisodes = await requestChunk(config, left, options, index, total);
            const rightEpisodes = await requestChunk(config, right, options, index, total);
            mergeFilmEpisodes(leftEpisodes, rightEpisodes);
            return leftEpisodes;
        }
        if (!isCanvasAgentContextLimitError(error)) {
            try {
                return await requestOnce(config, `${systemPrompt}${STRICT_RETRY_HINT}`, messages);
            } catch {
                throw error;
            }
        }
        throw error;
    }
}

async function requestOnce(config: AiConfig, systemPrompt: string, messages: Array<{ role: "user"; content: string }>): Promise<FilmEpisode[]> {
    const turn = await requestCanvasAgentTurn({ config, systemPrompt, messages, tools: [], toolMode: "prompt-json" });
    const episodes = filmAiRowsToEpisodes(parseFilmAiShotRows(turn.content));
    if (!episodes.length) throw new Error("AI 返回的分镜为空");
    return episodes;
}

function buildSystemPrompt(options: FilmParseOptions) {
    const pacing = options.pacing === "fast"
        ? "快剪：平均每镜 2-3 秒，镜头更多、切换更快。"
        : options.pacing === "slow"
            ? "慢节奏：平均每镜 6-10 秒，允许长镜头和缓慢运镜。"
            : "常规：平均每镜 4-6 秒。";
    const duration = options.targetDuration ? `\n【时长目标】所有镜头 duration 相加尽量接近 ${options.targetDuration} 秒，允许 ±20% 误差。` : "";
    return `${BASE_PROMPT}\n【节奏要求】${pacing}${duration}`;
}

export function parseFilmAiShotRows(content: string): FilmAiShotRow[] {
    const text = (content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const body = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error("AI 返回的分镜不是有效 JSON");
    }
    if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        const nested = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
        if (nested) parsed = nested;
    }
    if (!Array.isArray(parsed)) throw new Error("AI 没有返回分镜数组");
    return parsed.filter((item): item is FilmAiShotRow => Boolean(item) && typeof item === "object").slice(0, MAX_AI_SHOTS);
}

export function filmAiRowsToEpisodes(rows: FilmAiShotRow[]): FilmEpisode[] {
    const episodes: FilmEpisode[] = [];
    const episodeMap = new Map<string, FilmEpisode>();
    const sceneMap = new Map<string, FilmScene>();
    let count = 0;

    for (const row of rows) {
        if (count >= MAX_AI_SHOTS) break;
        if (!row || (!row.description && !row.sound)) continue;
        const episodeTitle = (row.episode || "").trim() || "第 1 集";
        const sceneName = (row.scene || "").trim() || "场景 1";
        let episode = episodeMap.get(episodeTitle);
        if (!episode) {
            episode = { id: nanoid(), title: episodeTitle, scenes: [] };
            episodes.push(episode);
            episodeMap.set(episodeTitle, episode);
        }
        const sceneKey = `${episodeTitle}::${sceneName}`;
        let scene = sceneMap.get(sceneKey);
        if (!scene) {
            scene = { id: nanoid(), name: sceneName, location: "", time: "", mood: "", shots: [] };
            episode.scenes.push(scene);
            sceneMap.set(sceneKey, scene);
        }
        const shotIndex = scene.shots.length + 1;
        const fallbackNo = `${episodes.length}-${episode.scenes.length}-${String(shotIndex).padStart(2, "0")}`;
        scene.shots.push({
            id: nanoid(),
            shotNo: (row.shotNo || "").trim() || fallbackNo,
            shotType: filmShotTypeCodeFromLabel(row.shotType),
            cameraMovement: (row.cameraMovement || "").trim(),
            duration: parseDuration(row.duration),
            description: (row.description || "").trim(),
            dialogue: (row.sound || "").trim(),
            audio: "",
            prompt: "",
            status: "idle",
        });
        count += 1;
    }

    return episodes;
}

/** 长剧本按集/场标题切块，块内尽量保留完整场次。 */
export function splitScriptIntoChunks(script: string, maxChars = MAX_CHUNK_CHARS): string[] {
    const lines = (script || "").split(/\r?\n/).map((line) => line.trimEnd());
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
        if (/^第\s*[0-9零一二三四五六七八九十百]+\s*[集场]|^EP(?:ISODE)?\s*\d+|^场景\s*\d+|^\d{1,2}[-－]\d{1,2}\s/.test(line.trim()) && current.length) {
            blocks.push(current.join("\n"));
            current = [line];
        } else {
            current.push(line);
        }
    }
    if (current.length) blocks.push(current.join("\n"));

    const chunks: string[] = [];
    let buffer = "";
    for (const block of blocks) {
        if (block.length > maxChars) {
            if (buffer) {
                chunks.push(buffer);
                buffer = "";
            }
            const subLines = block.split(/\r?\n/);
            let piece = "";
            for (const line of subLines) {
                if ((piece + "\n" + line).length > maxChars) {
                    if (piece) chunks.push(piece);
                    piece = line;
                } else {
                    piece = piece ? `${piece}\n${line}` : line;
                }
            }
            if (piece) chunks.push(piece);
            continue;
        }
        if ((buffer + "\n\n" + block).length > maxChars) {
            if (buffer) chunks.push(buffer);
            buffer = block;
        } else {
            buffer = buffer ? `${buffer}\n\n${block}` : block;
        }
    }
    if (buffer) chunks.push(buffer);
    return chunks.length ? chunks : [script];
}

export function mergeFilmEpisodes(target: FilmEpisode[], source: FilmEpisode[]) {
    for (const episode of source) {
        const existingEpisode = target.find((item) => item.title === episode.title);
        if (!existingEpisode) {
            target.push(episode);
            continue;
        }
        for (const scene of episode.scenes) {
            const existingScene = existingEpisode.scenes.find((item) => item.name === scene.name);
            if (!existingScene) {
                existingEpisode.scenes.push(scene);
                continue;
            }
            existingScene.shots.push(...scene.shots);
        }
    }
}

function splitChunkInHalf(chunk: string): [string, string] {
    const lines = chunk.split(/\r?\n/);
    let accumulated = 0;
    let index = 0;
    for (; index < lines.length; index++) {
        accumulated += lines[index].length + 1;
        if (accumulated >= chunk.length / 2) {
            index += 1;
            break;
        }
    }
    if (index <= 0 || index >= lines.length) {
        const middle = Math.floor(chunk.length / 2);
        return [chunk.slice(0, middle), chunk.slice(middle)];
    }
    return [lines.slice(0, index).join("\n"), lines.slice(index).join("\n")];
}

function renumberShots(episodes: FilmEpisode[]) {
    episodes.forEach((episode, episodeIndex) => {
        episode.scenes.forEach((scene, sceneIndex) => {
            scene.shots.forEach((shot, shotIndex) => {
                shot.shotNo = `${episodeIndex + 1}-${sceneIndex + 1}-${String(shotIndex + 1).padStart(2, "0")}`;
            });
        });
    });
}

function parseDuration(value?: number | string) {
    const seconds = typeof value === "number"
        ? value
        : Number((value || "").match(/\d+(?:\.\d+)?/)?.[0] || Number.NaN);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 5;
}
