import { nanoid } from "nanoid";

import type { FilmAssetSuggestion, FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import { filmAssetSuggestionKey, normalizeFilmAssetSuggestionName } from "@/lib/film/film-asset-suggestions";
import type { FilmAsset, FilmEpisode } from "@/lib/film/types";
import { NODE_DEFAULT_SIZE } from "../../constants";
import type { CanvasNodeData, Position } from "../../types";
import { CanvasNodeType } from "../../types";
import { createFilmAsset } from "./film-asset-factory";

export type FilmAssetProjectKind = Exclude<FilmAssetSuggestionKind, "costume">;

export type FilmScriptAssetProposalItem = FilmAssetSuggestion & {
    existingNodeId: string | null;
    mentionShotIds: string[];
};

export type FilmScriptAssetProposal = {
    items: FilmScriptAssetProposalItem[];
    totals: {
        assets: number;
        existing: number;
        mentions: number;
        byKind: Record<FilmAssetSuggestionKind, number>;
    };
};

const PROJECT_NODE_TYPES: Record<FilmAssetProjectKind, CanvasNodeType> = {
    character: CanvasNodeType.FilmCharacter,
    location: CanvasNodeType.FilmLocation,
    prop: CanvasNodeType.FilmProp,
};

export function isFilmAssetProjectKind(kind: FilmAssetSuggestionKind): kind is FilmAssetProjectKind {
    return kind !== "costume";
}

/** 资产提案只读现有专用节点和提案镜头文本；不创建节点、不写边。 */
export function buildFilmScriptAssetProposal(
    suggestions: FilmAssetSuggestion[],
    nodes: CanvasNodeData[],
    episodes: FilmEpisode[] = [],
): FilmScriptAssetProposal {
    const items = suggestions.map((suggestion) => {
        const key = suggestion.key || filmAssetSuggestionKey(suggestion.kind, suggestion.name);
        return {
            ...suggestion,
            key,
            existingNodeId: findFilmScriptAssetNode(nodes, suggestion)?.id ?? null,
            mentionShotIds: mentionShotIds(suggestion, episodes),
        };
    });
    const mentions = new Set(items.flatMap((item) => item.mentionShotIds));
    const byKind: Record<FilmAssetSuggestionKind, number> = { character: 0, location: 0, prop: 0, costume: 0 };
    items.forEach((item) => { byKind[item.kind] += 1; });
    return {
        items,
        totals: {
            assets: items.length,
            existing: items.filter((item) => item.existingNodeId).length,
            mentions: mentions.size,
            byKind,
        },
    };
}

/** 创建角色、场景或道具专用节点；服装和风格不进入项目一级节点。 */
export function createFilmScriptAssetNode(
    kind: FilmAssetProjectKind,
    suggestion: Pick<FilmAssetSuggestion, "name" | "aliases" | "description" | "visualPrompt">,
    position: Position,
    index = 1,
): CanvasNodeData {
    const type = PROJECT_NODE_TYPES[kind];
    const size = NODE_DEFAULT_SIZE[type];
    const asset: FilmAsset = {
        ...createFilmAsset(kind, index),
        name: suggestion.name,
        aliases: suggestion.aliases,
        description: suggestion.description,
        visualPrompt: suggestion.visualPrompt,
    };
    return {
        id: nanoid(),
        type,
        title: suggestion.name,
        position,
        width: size.width,
        height: size.height,
        metadata: {
            status: "idle",
            ...(kind === "character" ? { filmCharacter: { asset } } : kind === "location" ? { filmLocation: { asset } } : { filmProp: { asset } }),
        },
    };
}

/** 同类别、同名或同别名即视为已有资产；服装不在项目节点内匹配。 */
export function findFilmScriptAssetNode(nodes: CanvasNodeData[], suggestion: FilmAssetSuggestion): CanvasNodeData | undefined {
    const kind = suggestion.kind;
    if (!isFilmAssetProjectKind(kind)) return undefined;
    const suggestionNames = new Set([suggestion.name, ...suggestion.aliases].map(normalizeFilmAssetSuggestionName).filter(Boolean));
    if (!suggestionNames.size) return undefined;
    return nodes.find((node) => {
        const asset = projectAsset(node, kind);
        if (!asset) return false;
        return [asset.name, ...(asset.aliases || [])].map(normalizeFilmAssetSuggestionName).some((name) => suggestionNames.has(name));
    });
}

function projectAsset(node: CanvasNodeData, kind: FilmAssetProjectKind): FilmAsset | undefined {
    if (kind === "character") return node.type === CanvasNodeType.FilmCharacter ? node.metadata?.filmCharacter?.asset : undefined;
    if (kind === "location") return node.type === CanvasNodeType.FilmLocation ? node.metadata?.filmLocation?.asset : undefined;
    return node.type === CanvasNodeType.FilmProp ? node.metadata?.filmProp?.asset : undefined;
}

function mentionShotIds(suggestion: FilmAssetSuggestion, episodes: FilmEpisode[]) {
    const terms = [suggestion.name, ...suggestion.aliases].map(normalizeFilmAssetSuggestionName).filter(Boolean);
    if (!terms.length) return [];
    const matched: string[] = [];
    for (const episode of episodes) {
        for (const scene of episode.scenes) {
            const sceneText = normalizeFilmAssetSuggestionName([episode.title, scene.name, scene.location].filter(Boolean).join(" "));
            for (const shot of scene.shots) {
                const shotText = normalizeFilmAssetSuggestionName([shot.shotNo, shot.description, shot.dialogue, shot.prompt].filter(Boolean).join(" "));
                if (terms.some((term) => shotText.includes(term)) || (suggestion.kind === "location" && terms.some((term) => sceneText.includes(term)))) {
                    matched.push(shot.id);
                }
            }
        }
    }
    return [...new Set(matched)];
}
