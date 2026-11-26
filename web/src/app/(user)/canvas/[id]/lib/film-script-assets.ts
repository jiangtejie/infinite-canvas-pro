import { nanoid } from "nanoid";

import type { FilmAssetSuggestion, FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import { filmAssetSuggestionKey, normalizeFilmAssetSuggestionName, suggestionKindLabel } from "@/lib/film/film-asset-suggestions";
import type { FilmAsset, FilmAssetKind, FilmEpisode } from "@/lib/film/types";
import { NODE_DEFAULT_SIZE } from "../../constants";
import type { CanvasNodeData, Position } from "../../types";
import { CanvasNodeType } from "../../types";
import { createFilmAsset, importFilmAsset } from "./film-asset-factory";
import { filmMentionIncludes, filmMentionTerms, normalizeFilmMentionText } from "./film-mentions";

export type FilmAssetProjectKind = Exclude<FilmAssetSuggestionKind, "costume">;
export type FilmAssetMatch = "canvas" | "library" | "new";
export type FilmAssetLibrary = Record<FilmAssetKind, FilmAsset[]>;

const CROSS_KINDS: FilmAssetSuggestionKind[] = ["character", "location", "prop", "costume"];
export type FilmScriptAssetProposalItem = FilmAssetSuggestion & {
    existingNodeId: string | null;
    mentionShotIds: string[];
    mentionEvidence?: string[];
    match: FilmAssetMatch;
    libraryAsset?: FilmAsset;
    categoryConflict?: string;
};

export type FilmScriptAssetProposal = {
    items: FilmScriptAssetProposalItem[];
    totals: {
        assets: number;
        existing: number;
        library: number;
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

/** 资产提案只读现有专用节点、母版库与提案镜头文本；不创建节点、不写边。 */
export function buildFilmScriptAssetProposal(
    suggestions: FilmAssetSuggestion[],
    nodes: CanvasNodeData[],
    episodes: FilmEpisode[] = [],
    library?: FilmAssetLibrary,
): FilmScriptAssetProposal {
    const items = suggestions.map((suggestion) => {
        const key = suggestion.key || filmAssetSuggestionKey(suggestion.kind, suggestion.name);
        const nameSet = assetNameSet(suggestion);
        const canvasNode = findFilmScriptAssetNode(nodes, suggestion);
        const libraryAsset = canvasNode || suggestion.forceNew ? undefined : findLibraryAsset(library, suggestion.kind, nameSet);
        const mentions = mentionShots(suggestion, episodes);
        return {
            ...suggestion,
            key,
            existingNodeId: canvasNode?.id ?? null,
            mentionShotIds: mentions.ids,
            ...(mentions.evidence.length ? { mentionEvidence: mentions.evidence } : {}),
            match: canvasNode ? "canvas" as const : libraryAsset ? "library" as const : "new" as const,
            ...(libraryAsset ? { libraryAsset } : {}),
            categoryConflict: canvasNode || libraryAsset ? undefined : crossCategoryConflict(nodes, library, suggestion.kind, nameSet),
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
            library: items.filter((item) => item.match === "library").length,
            mentions: mentions.size,
            byKind,
        },
    };
}

function assetNameSet(asset: Pick<FilmAssetSuggestion, "name" | "aliases">) {
    return new Set([asset.name, ...asset.aliases].map(normalizeFilmAssetSuggestionName).filter(Boolean));
}

function matchesName(asset: Pick<FilmAsset, "name" | "aliases">, names: Set<string>) {
    return assetNameSet(asset).size > 0 && [...assetNameSet(asset)].some((name) => names.has(name));
}

function findLibraryAsset(library: FilmAssetLibrary | undefined, kind: FilmAssetSuggestionKind, names: Set<string>) {
    if (!library || !names.size) return undefined;
    return (library[kind] || []).find((entry) => matchesName(entry, names));
}

/** 同名已存在于其他类别时提示，避免服装/道具等被静默拆成两条资产。 */
function crossCategoryConflict(nodes: CanvasNodeData[], library: FilmAssetLibrary | undefined, kind: FilmAssetSuggestionKind, names: Set<string>) {
    if (!names.size) return undefined;
    for (const otherKind of CROSS_KINDS) {
        if (otherKind === kind) continue;
        const libraryEntry = findLibraryAsset(library, otherKind, names);
        if (libraryEntry) return `同名「${libraryEntry.name}」已存在于${suggestionKindLabel(otherKind)}母版库，请确认是否新建${suggestionKindLabel(kind)}。`;
        if (otherKind === "costume") continue;
        const canvasConflict = nodes.flatMap((node) => {
            const asset = projectAsset(node, otherKind);
            return asset && matchesName(asset, names) ? [asset] : [];
        })[0];
        if (canvasConflict) return `同名「${canvasConflict.name}」已存在于画布${suggestionKindLabel(otherKind)}，请确认是否新建${suggestionKindLabel(kind)}。`;
    }
    return undefined;
}

/** 创建角色、场景或道具专用节点；服装和风格不进入项目一级节点。 */
export function createFilmScriptAssetNode(
    kind: FilmAssetProjectKind,
    suggestion: Pick<FilmAssetSuggestion, "name" | "aliases" | "description" | "visualPrompt">,
    position: Position,
    index = 1,
): CanvasNodeData {
    const asset: FilmAsset = {
        ...createFilmAsset(kind, index),
        name: suggestion.name,
        aliases: suggestion.aliases,
        description: suggestion.description,
        visualPrompt: suggestion.visualPrompt,
    };
    return filmAssetNode(kind, asset, position);
}

/** 母版库命中：导入副本并复用参考图、造型状态与场景变体。 */
export function createFilmScriptAssetNodeFromLibrary(
    kind: FilmAssetProjectKind,
    suggestion: Pick<FilmAssetSuggestion, "name" | "aliases" | "description" | "visualPrompt">,
    libraryAsset: FilmAsset,
    position: Position,
): CanvasNodeData {
    const imported = importFilmAsset([], libraryAsset)[0];
    const asset: FilmAsset = {
        ...imported,
        name: suggestion.name || imported.name,
        aliases: [...new Set([...(imported.aliases || []), ...suggestion.aliases].filter(Boolean))],
        description: imported.description || suggestion.description,
        visualPrompt: imported.visualPrompt || suggestion.visualPrompt,
        updatedAt: new Date().toISOString(),
    };
    return filmAssetNode(kind, asset, position);
}

function filmAssetNode(kind: FilmAssetProjectKind, asset: FilmAsset, position: Position): CanvasNodeData {
    const type = PROJECT_NODE_TYPES[kind];
    const size = NODE_DEFAULT_SIZE[type];
    return {
        id: nanoid(),
        type,
        title: asset.name,
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

function mentionShots(suggestion: FilmAssetSuggestion, episodes: FilmEpisode[]) {
    const terms = filmMentionTerms(suggestion.name, suggestion.aliases);
    if (!terms.length) return { ids: [] as string[], evidence: [] as string[] };
    const ids: string[] = [];
    const evidence: string[] = [];
    for (const episode of episodes) {
        for (const scene of episode.scenes) {
            const sceneText = normalizeFilmMentionText([episode.title, scene.name, scene.location].filter(Boolean).join(" "));
            for (const shot of scene.shots) {
                const shotText = normalizeFilmMentionText([shot.shotNo, shot.description, shot.dialogue, shot.prompt].filter(Boolean).join(" "));
                const shotTerm = terms.find((term) => filmMentionIncludes(shotText, term));
                const sceneTerm = suggestion.kind === "location" ? terms.find((term) => filmMentionIncludes(sceneText, term)) : undefined;
                const term = shotTerm ?? sceneTerm;
                if (!term) continue;
                ids.push(shot.id);
                evidence.push(`${shot.shotNo || "镜头"} · ${term}${shotTerm ? "" : "（场名）"}`);
            }
        }
    }
    return { ids: [...new Set(ids)], evidence: [...new Set(evidence)].slice(0, 4) };
}
