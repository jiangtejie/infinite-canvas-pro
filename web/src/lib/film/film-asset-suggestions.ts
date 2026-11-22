import { cleanAiJsonText, extractAiJsonBlock } from "@/lib/ai-json";
import type { FilmAssetKind } from "./types";

export type FilmAssetSuggestionKind = Exclude<FilmAssetKind, "style">;

export type FilmAssetSuggestion = {
    key: string;
    kind: FilmAssetSuggestionKind;
    name: string;
    aliases: string[];
    description: string;
    visualPrompt: string;
};

export const FILM_ASSET_SUGGESTION_KINDS: FilmAssetSuggestionKind[] = ["character", "location", "prop", "costume"];

const KIND_ALIASES: Record<string, FilmAssetSuggestionKind> = {
    character: "character", "人物": "character", "角色": "character", "人": "character",
    location: "location", "场景": "location", "地点": "location", "环境": "location",
    prop: "prop", "道具": "prop", "物件": "prop",
    costume: "costume", "服装": "costume", "造型": "costume", "服饰": "costume",
};

const MAX_SUGGESTIONS = 80;

export function normalizeFilmAssetSuggestionName(value: string) {
    return (value || "").trim().toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function filmAssetSuggestionKey(kind: FilmAssetSuggestionKind, name: string) {
    return `${kind}:${normalizeFilmAssetSuggestionName(name)}`;
}

export function suggestionKindLabel(kind: FilmAssetSuggestionKind) {
    if (kind === "character") return "角色";
    if (kind === "location") return "场景";
    if (kind === "prop") return "道具";
    return "服装";
}

export function parseFilmAssetSuggestionRows(content: string): FilmAssetSuggestion[] {
    const text = cleanAiJsonText(content);
    const body = extractAiJsonBlock(text, "array") || text;
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error("AI 返回的资产不是有效 JSON");
    }
    if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        const nested = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
        if (nested) parsed = nested;
    }
    if (!Array.isArray(parsed)) throw new Error("AI 没有返回资产数组");
    const suggestions: FilmAssetSuggestion[] = [];
    for (const item of parsed.slice(0, MAX_SUGGESTIONS * 2)) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const kind = KIND_ALIASES[String(row.kind || "").trim().toLowerCase()];
        const name = String(row.name || "").trim();
        if (!kind || !name) continue;
        mergeFilmAssetSuggestions(suggestions, [{
            key: filmAssetSuggestionKey(kind, name),
            kind,
            name,
            aliases: normalizeAliases(row.aliases, name),
            description: String(row.description || "").trim().slice(0, 300),
            visualPrompt: String(row.visualPrompt || "").trim().slice(0, 300),
        }]);
    }
    return suggestions.slice(0, MAX_SUGGESTIONS);
}

export function mergeFilmAssetSuggestions(target: FilmAssetSuggestion[], source: FilmAssetSuggestion[]) {
    for (const suggestion of source) {
        if (!suggestion.name) continue;
        const key = suggestion.key || filmAssetSuggestionKey(suggestion.kind, suggestion.name);
        const existing = target.find((item) => item.key === key);
        if (!existing) {
            target.push({ ...suggestion, key, aliases: normalizeAliases(suggestion.aliases, suggestion.name) });
            continue;
        }
        normalizeAliases([...existing.aliases, ...suggestion.aliases], existing.name).forEach((alias) => {
            if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
        });
        if (!existing.description) existing.description = suggestion.description;
        if (!existing.visualPrompt) existing.visualPrompt = suggestion.visualPrompt;
    }
}

function normalizeAliases(value: unknown, name: string) {
    const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，/、]/) : [];
    const normalizedName = normalizeFilmAssetSuggestionName(name);
    const seen = new Set<string>();
    return raw
        .map((item) => String(item || "").trim())
        .filter((item) => {
            const key = normalizeFilmAssetSuggestionName(item);
            if (!key || key === normalizedName || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}
