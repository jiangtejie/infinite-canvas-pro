import { isCanvasAgentContextLimitError, requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import { mergeFilmAssetSuggestions, parseFilmAssetSuggestionRows, type FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import { splitScriptIntoChunks } from "./film-ai-parse";

const MAX_CHUNK_CHARS = 5000;
const MIN_CONTEXT_RETRY_CHARS = 1200;

const ASSET_PROMPT = `你是影视项目的制片统筹与美术指导。通读剧本，列出需要在拍摄前制作的资产。
只输出 JSON 数组，不要 Markdown、不要解释。
每个元素的字段：
- kind：character / location / prop / costume 四选一；
- name：资产名；人物用姓名，场景用地点名，道具/服装用剧本里能指认的名字；
- aliases：剧本中出现过的其他叫法，字符串数组，没有则 []；
- description：身份、用途、外观与剧情作用，中文，80 字以内；
- visualPrompt：可直接用于生图的外形、材质与颜色描述，中文，60 字以内；不写镜头、构图、光线和故事。
规则：
- 只提取需要跨镜头保持一致的主要角色、实际拍摄地点、剧情关键道具和标志性服装；路人、背景家具、一次性道具不提取；
- 同一资产只出现一次，把不同叫法合并进 aliases；
- 不要输出场次标题、镜头、情绪或抽象概念；
- 不确定的资产不要编造。`;

const STRICT_RETRY_HINT = `\n【重要】上一次输出无法解析。这一次只输出一个 JSON 数组，第一个字符是 [，最后一个字符是 ]，不要 Markdown，不要任何解释。`;

export async function requestFilmAiAssetExtraction(
    config: AiConfig,
    script: string,
    onProgress?: (done: number, total: number) => void,
): Promise<FilmAssetSuggestion[]> {
    const chunks = splitScriptIntoChunks(script, MAX_CHUNK_CHARS);
    const merged: FilmAssetSuggestion[] = [];
    for (let index = 0; index < chunks.length; index++) {
        const suggestions = await requestChunk(config, chunks[index], index, chunks.length);
        mergeFilmAssetSuggestions(merged, suggestions);
        onProgress?.(index + 1, chunks.length);
    }
    if (!merged.length) throw new Error("AI 没有提取出需要制作的资产");
    return merged;
}

async function requestChunk(config: AiConfig, chunk: string, index: number, total: number): Promise<FilmAssetSuggestion[]> {
    try {
        return await requestOnce(config, ASSET_PROMPT, chunk, index, total);
    } catch (error) {
        if (isCanvasAgentContextLimitError(error) && chunk.length > MIN_CONTEXT_RETRY_CHARS) {
            const [left, right] = splitTextInHalf(chunk);
            const suggestions = await requestChunk(config, left, index, total);
            mergeFilmAssetSuggestions(suggestions, await requestChunk(config, right, index, total));
            return suggestions;
        }
        if (!isCanvasAgentContextLimitError(error)) {
            try {
                return await requestOnce(config, `${ASSET_PROMPT}${STRICT_RETRY_HINT}`, chunk, index, total);
            } catch {
                throw error;
            }
        }
        throw error;
    }
}

async function requestOnce(config: AiConfig, systemPrompt: string, chunk: string, index: number, total: number) {
    const partHint = total > 1 ? `【这是剧本第 ${index + 1}/${total} 段，只提取这一段出现的资产；跨段的同一资产用同一名称】\n` : "";
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt,
        messages: [{ role: "user", content: `${partHint}【剧本】\n${chunk}` }],
        tools: [],
        toolMode: "prompt-json",
    });
    return parseFilmAssetSuggestionRows(turn.content);
}

function splitTextInHalf(text: string): [string, string] {
    const lines = text.split(/\r?\n/);
    let accumulated = 0;
    let index = 0;
    for (; index < lines.length; index++) {
        accumulated += lines[index].length + 1;
        if (accumulated >= text.length / 2) {
            index += 1;
            break;
        }
    }
    if (index <= 0 || index >= lines.length) {
        const middle = Math.floor(text.length / 2);
        return [text.slice(0, middle), text.slice(middle)];
    }
    return [lines.slice(0, index).join("\n"), lines.slice(index).join("\n")];
}
