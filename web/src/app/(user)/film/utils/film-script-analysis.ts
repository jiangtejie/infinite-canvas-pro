import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import { nanoid } from "nanoid";
import type { FilmAsset, FilmProject, FilmScriptAnalysis, FilmScriptCharacterAnalysis, FilmScriptRelationshipAnalysis, FilmScriptSceneAnalysis, FilmScriptSceneRelationship } from "@/lib/film/types";
import type { FilmScriptDocument } from "@/lib/film/film-script-import";

export type FilmScriptAnalysisIssue = {
    level: "warning" | "info";
    message: string;
};

export type FilmSceneSemanticPayload = {
    summary: string;
    mood: string;
    props: string[];
    productionNotes: string[];
    characters: Array<{ name: string; aliases?: string[]; role?: string; description?: string }>;
    relationships: Array<{ from: string; to: string; type: string; direction?: string; strength?: number; note?: string; event?: string }>;
    beats: Array<{ type: string; summary: string }>;
};

export type FilmSceneSemanticEntry = {
    sceneIndex: number;
    episode: string;
    heading: string;
    payload: FilmSceneSemanticPayload;
};

const SYSTEM_PROMPT = `你是一名影视策划/剧本分析师。用户会给出一个场次的全文和已知角色列表。
请输出该场次的结构化语义分析，只输出 JSON 对象，不要 Markdown、不要解释，字段：
{
  "summary": "本场剧情摘要，一句话",
  "mood": "情绪氛围",
  "props": ["关键道具"],
  "productionNotes": ["制作提示：场景/道具/特效/群演/选角等"],
  "characters": [{"name":"角色名","aliases":["别名"],"role":"主角/配角/群演","description":"人物特征"}],
  "relationships": [{"from":"角色A","to":"角色B","type":"关系类型","direction":"bilateral|from-to|to-from","strength":1-5,"note":"关系说明","event":"本场关系变化事件"}],
  "beats": [{"type":"目标|冲突|转折|高潮|信息","summary":"情节节拍"}]
}
规则：
1. 角色名使用剧本里的规范名字，别名放 aliases；
2. 只写本场明确出现或明确提到的角色和关系；
3. 关系有变化时才写 event，没有就留空；
4. characters 必须覆盖本场有对白或动作的角色。`;

export function flattenFilmScriptScenes(document: FilmScriptDocument) {
    return document.episodes.flatMap((episode) => episode.scenes.map((scene) => ({ episode: episode.title, scene })));
}

export function buildSceneSemanticPrompt(document: FilmScriptDocument) {
    const scenes = flattenFilmScriptScenes(document);
    return scenes.map((entry, index) => {
        const blocks = entry.scene.blocks.map((block) => {
            if (block.type === "dialogue") return `${block.character}${block.parenthetical ? `（${block.parenthetical}）` : ""}：${block.text}`;
            return block.text;
        }).join("\n");
        const previous = scenes[index - 1];
        return {
            sceneIndex: index,
            episode: entry.episode,
            heading: entry.scene.heading,
            context: previous ? `上一场：${previous.scene.heading}` : "",
            knownCharacters: document.episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.characters)),
            text: blocks,
        };
    });
}

export function sceneSemanticPayloadFromAnalysis(analysis: FilmScriptAnalysis, scene: FilmScriptSceneAnalysis): FilmSceneSemanticPayload {
    const characters = new Map(analysis.characters.map((character) => [normalizeEntityKey(character.name), character]));
    return {
        summary: scene.summary,
        mood: scene.mood,
        props: scene.props,
        productionNotes: scene.productionNotes,
        characters: scene.characters.map((name) => {
            const character = characters.get(normalizeEntityKey(name));
            return { name, aliases: character?.aliases || [], role: character?.role || "", description: character?.description || "" };
        }),
        relationships: scene.relationships.map((relationship) => ({ ...relationship })),
        beats: scene.beats,
    };
}

/** 用场次 hash 找出上一版分析里可以直接复用的场次。 */
export function collectReusableScenePayloads(document: FilmScriptDocument, previousAnalysis?: FilmScriptAnalysis | null) {
    const reusable = new Map<number, FilmSceneSemanticPayload>();
    if (!previousAnalysis) return reusable;
    const previousByHash = new Map(previousAnalysis.scenes.filter((scene) => scene.sourceHash).map((scene) => [scene.sourceHash, scene]));
    flattenFilmScriptScenes(document).forEach(({ scene }, index) => {
        const previousScene = scene.hash ? previousByHash.get(scene.hash) : undefined;
        if (previousScene) reusable.set(index, sceneSemanticPayloadFromAnalysis(previousAnalysis, previousScene));
    });
    return reusable;
}

export async function requestFilmScriptAnalysis(config: AiConfig, document: FilmScriptDocument, onProgress?: (done: number, total: number) => void, previousAnalysis?: FilmScriptAnalysis | null): Promise<{ analysis: FilmScriptAnalysis; issues: FilmScriptAnalysisIssue[]; reusedScenes: number }> {
    const scenes = buildSceneSemanticPrompt(document);
    const reusable = collectReusableScenePayloads(document, previousAnalysis);
    const entries: FilmSceneSemanticEntry[] = [];
    for (const [index, scene] of scenes.entries()) {
        const cached = reusable.get(index);
        if (cached) {
            entries.push({ sceneIndex: index, episode: scene.episode, heading: scene.heading, payload: cached });
            onProgress?.(index + 1, scenes.length);
            continue;
        }
        const turn = await requestCanvasAgentTurn({
            config,
            systemPrompt: SYSTEM_PROMPT,
            messages: [{ role: "user", content: JSON.stringify(scene) }],
            tools: [],
            toolMode: "prompt-json",
        });
        const payload = parseSceneSemanticPayload(turn.content);
        entries.push({ sceneIndex: index, episode: scene.episode, heading: scene.heading, payload });
        onProgress?.(index + 1, scenes.length);
    }
    const analysis = mergeFilmSceneSemantics(document, entries);
    return { analysis, issues: validateFilmScriptAnalysis(analysis), reusedScenes: reusable.size };
}

export function parseSceneSemanticPayload(content: string): FilmSceneSemanticPayload {
    const text = (content || "").trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const body = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error("AI 返回的场次分析不是有效 JSON");
    }
    if (!parsed || typeof parsed !== "object") throw new Error("AI 没有返回场次分析结果");
    const record = parsed as Record<string, unknown>;
    return {
        summary: toStringValue(record.summary),
        mood: toStringValue(record.mood),
        props: stringArray(record.props),
        productionNotes: stringArray(record.productionNotes),
        characters: Array.isArray(record.characters)
            ? record.characters.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").map((item) => ({
                name: toStringValue(item.name),
                aliases: stringArray(item.aliases),
                role: toStringValue(item.role),
                description: toStringValue(item.description),
            })).filter((item) => item.name)
            : [],
        relationships: Array.isArray(record.relationships)
            ? record.relationships.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").map((item) => ({
                from: toStringValue(item.from),
                to: toStringValue(item.to),
                type: toStringValue(item.type) || "关系",
                direction: normalizeDirection(toStringValue(item.direction)),
                strength: clampStrength(Number(item.strength)),
                note: toStringValue(item.note),
                event: toStringValue(item.event),
            })).filter((item) => item.from && item.to)
            : [],
        beats: Array.isArray(record.beats)
            ? record.beats.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").map((item) => ({
                type: toStringValue(item.type) || "信息",
                summary: toStringValue(item.summary),
            })).filter((item) => item.summary)
            : [],
    };
}

export function mergeFilmSceneSemantics(document: FilmScriptDocument, entries: FilmSceneSemanticEntry[]): FilmScriptAnalysis {
    const characters = new Map<string, FilmScriptCharacterAnalysis>();
    const relationships = new Map<string, FilmScriptRelationshipAnalysis>();
    const scenes: FilmScriptSceneAnalysis[] = [];

    const ensureCharacter = (name: string, patch?: Partial<FilmScriptCharacterAnalysis>) => {
        const key = normalizeEntityKey(name);
        if (!key) return;
        const current = characters.get(key) || { name: name.trim(), aliases: [], role: "", description: "" };
        characters.set(key, {
            ...current,
            role: patch?.role || current.role,
            description: patch?.description || current.description,
            aliases: [...new Set([...current.aliases, ...(patch?.aliases || [])].map((alias) => alias.trim()).filter((alias) => alias && normalizeEntityKey(alias) !== key))],
        });
    };

    for (const entry of entries) {
        const payload = entry.payload;
        for (const character of payload.characters) ensureCharacter(character.name, { role: character.role, description: character.description, aliases: character.aliases });
        for (const name of flattenFilmScriptScenes(document)[entry.sceneIndex]?.scene.characters || []) ensureCharacter(name);
        const sourceScene = flattenFilmScriptScenes(document)[entry.sceneIndex]?.scene;
        const sceneCharacters = [...new Set([...payload.characters.map((character) => character.name), ...(sourceScene?.characters || [])])];
        const sceneRelationships: FilmScriptSceneRelationship[] = payload.relationships.map((relationship) => ({
            from: relationship.from,
            to: relationship.to,
            type: relationship.type,
            direction: normalizeDirection(relationship.direction || ""),
            strength: clampStrength(relationship.strength ?? 3),
            note: relationship.note || "",
            event: relationship.event || "",
        }));
        scenes.push({
            sceneIndex: entry.sceneIndex,
            episode: entry.episode,
            heading: entry.heading,
            sourceHash: sourceScene?.hash || "",
            characters: sceneCharacters,
            summary: payload.summary,
            mood: payload.mood,
            props: payload.props,
            productionNotes: payload.productionNotes,
            beats: payload.beats,
            relationships: sceneRelationships,
        });
        for (const relationship of sceneRelationships) {
            const fromKey = normalizeEntityKey(relationship.from);
            const toKey = normalizeEntityKey(relationship.to);
            if (!fromKey || !toKey || fromKey === toKey) continue;
            ensureCharacter(relationship.from);
            ensureCharacter(relationship.to);
            const key = `${fromKey}->${toKey}|${relationship.type}`;
            const current = relationships.get(key);
            if (current) {
                current.sceneRange = { start: Math.min(current.sceneRange.start, entry.sceneIndex), end: Math.max(current.sceneRange.end, entry.sceneIndex) };
                current.strength = Math.max(current.strength, relationship.strength);
                if (relationship.event) current.evolution.push({ sceneIndex: entry.sceneIndex, event: relationship.event, typeBefore: current.type, typeAfter: relationship.type });
                continue;
            }
            relationships.set(key, {
                from: relationship.from,
                to: relationship.to,
                type: relationship.type,
                direction: relationship.direction,
                strength: relationship.strength,
                sceneRange: { start: entry.sceneIndex, end: entry.sceneIndex },
                evolution: relationship.event ? [{ sceneIndex: entry.sceneIndex, event: relationship.event, typeBefore: "", typeAfter: relationship.type }] : [],
                note: relationship.note,
            });
        }
    }

    return {
        schemaVersion: 1,
        parserVersion: document.parserVersion,
        scriptHash: document.scriptHash,
        characters: [...characters.values()],
        relationships: [...relationships.values()],
        scenes,
    };
}

export function validateFilmScriptAnalysis(analysis: FilmScriptAnalysis): FilmScriptAnalysisIssue[] {
    const issues: FilmScriptAnalysisIssue[] = [];
    const characterKeys = new Set(analysis.characters.map((character) => normalizeEntityKey(character.name)));
    const aliasOwner = new Map<string, string>();
    for (const character of analysis.characters) {
        for (const alias of character.aliases) {
            const key = normalizeEntityKey(alias);
            if (!key || characterKeys.has(key)) continue;
            const owner = aliasOwner.get(key);
            if (owner && owner !== character.name) {
                issues.push({ level: "warning", message: `别名「${alias}」同时属于「${owner}」和「${character.name}」` });
            } else {
                aliasOwner.set(key, character.name);
            }
        }
    }
    for (const relationship of analysis.relationships) {
        if (!characterKeys.has(normalizeEntityKey(relationship.from))) {
            issues.push({ level: "warning", message: `关系「${relationship.from} → ${relationship.to}」的起点不在角色表里` });
        }
        if (!characterKeys.has(normalizeEntityKey(relationship.to))) {
            issues.push({ level: "warning", message: `关系「${relationship.from} → ${relationship.to}」的终点不在角色表里` });
        }
    }
    for (const scene of analysis.scenes) {
        if (!scene.summary.trim()) issues.push({ level: "info", message: `场次「${scene.heading}」没有摘要` });
    }
    return issues;
}

/** 把语义分析里的角色/场景地点合并进项目资产，同名跳过。 */
export function buildScriptAnalysisAssets(project: FilmProject, analysis: FilmScriptAnalysis, locationNames: string[]) {
    const createdAt = new Date().toISOString();
    const characters = [...project.characters];
    const existingCharacters = new Set(project.characters.map((asset) => normalizeEntityKey(asset.name)));
    for (const character of analysis.characters) {
        const key = normalizeEntityKey(character.name);
        if (!key || existingCharacters.has(key)) continue;
        existingCharacters.add(key);
        characters.push({
            id: nanoid(),
            name: character.name,
            description: [character.role, character.description].filter(Boolean).join("："),
            visualPrompt: "",
            status: "idle",
            createdAt,
        } satisfies FilmAsset);
    }
    const locations = [...project.locations];
    const existingLocations = new Set(project.locations.map((asset) => normalizeEntityKey(asset.name)));
    for (const name of locationNames) {
        const key = normalizeEntityKey(name);
        if (!key || existingLocations.has(key)) continue;
        existingLocations.add(key);
        locations.push({ id: nanoid(), name: name.trim(), description: "由剧本解析生成", visualPrompt: "", status: "idle", createdAt } satisfies FilmAsset);
    }
    return { characters, locations };
}

export function normalizeEntityKey(value: string) {
    return value.trim().toLowerCase().replace(/[\s·._-]+/g, "");
}

function normalizeDirection(value: string): FilmScriptRelationshipAnalysis["direction"] {
    return value === "from-to" || value === "to-from" ? value : "bilateral";
}

function clampStrength(value: number) {
    if (!Number.isFinite(value)) return 3;
    return Math.max(1, Math.min(5, Math.round(value)));
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.map((item) => toStringValue(item)).filter(Boolean) : [];
}

function toStringValue(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return "";
    return String(value).trim();
}
