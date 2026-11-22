import { nanoid } from "nanoid";

import type { FilmAssetSuggestion, FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import { filmAssetSuggestionKey, normalizeFilmAssetSuggestionName } from "@/lib/film/film-asset-suggestions";
import type { FilmAsset } from "@/lib/film/types";
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { NODE_DEFAULT_SIZE } from "../../constants";
import type { CanvasConnection, CanvasNodeData } from "../../types";
import { CanvasNodeType } from "../../types";
import { addFilmShotBinding } from "./film-shot-bindings";
import { selectFilmShotEntries } from "./film-selectors";

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

export type FilmScriptAssetApplyResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    createdNodes: CanvasNodeData[];
    createdCount: number;
    boundCount: number;
};

const ASSET_COLUMN_GAP = 80;
const ASSET_ROW_GAP = 36;

export function buildFilmScriptAssetProposal(
    suggestions: FilmAssetSuggestion[],
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
): FilmScriptAssetProposal {
    const sceneTextById = sceneTexts(nodes);
    const shotEntries = selectFilmShotEntries(nodes, connections);
    const items = suggestions.map((suggestion) => {
        const key = suggestion.key || filmAssetSuggestionKey(suggestion.kind, suggestion.name);
        return {
            ...suggestion,
            key,
            existingNodeId: findExistingAssetNode(nodes, suggestion)?.id ?? null,
            mentionShotIds: mentionShotIds(suggestion, shotEntries, sceneTextById),
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

export function applyFilmScriptAssetProposal(
    scriptNode: CanvasNodeData,
    items: FilmScriptAssetProposalItem[],
    options: { bindToShots: boolean },
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
): FilmScriptAssetApplyResult {
    const size = NODE_DEFAULT_SIZE[CanvasNodeType.FilmAsset];
    const kindCounts = new Map<FilmAssetSuggestionKind, number>();
    nodes.forEach((node) => {
        const kind = node.metadata?.filmAsset?.kind;
        if (node.type === CanvasNodeType.FilmAsset && kind && kind !== "style") kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    });
    const createdNodes: CanvasNodeData[] = [];
    const nodeIdByKey = new Map<string, string>();
    let cursorY = scriptNode.position.y;
    for (const item of items) {
        if (item.existingNodeId) {
            nodeIdByKey.set(item.key, item.existingNodeId);
            continue;
        }
        const count = (kindCounts.get(item.kind) ?? 0) + 1;
        kindCounts.set(item.kind, count);
        const asset: FilmAsset = {
            ...createFilmAsset(item.kind, count),
            name: item.name,
            aliases: item.aliases,
            description: item.description,
            visualPrompt: item.visualPrompt,
        };
        const node: CanvasNodeData = {
            id: nanoid(),
            type: CanvasNodeType.FilmAsset,
            title: item.name,
            position: { x: scriptNode.position.x - ASSET_COLUMN_GAP - size.width, y: cursorY },
            width: size.width,
            height: size.height,
            metadata: { status: "idle", filmAsset: { kind: item.kind, asset } },
        };
        createdNodes.push(node);
        nodeIdByKey.set(item.key, node.id);
        cursorY += size.height + ASSET_ROW_GAP;
    }

    const nextNodes = createdNodes.length ? [...nodes, ...createdNodes] : nodes;
    let nextConnections = connections;
    let boundCount = 0;
    if (options.bindToShots) {
        for (const item of items) {
            if (item.kind === "costume") continue;
            const nodeId = nodeIdByKey.get(item.key);
            if (!nodeId) continue;
            for (const shotId of item.mentionShotIds) {
                const result = addFilmShotBinding(nextNodes, nextConnections, shotId, nodeId, { source: "ai" });
                if ("error" in result) continue;
                nextConnections = result.connections;
                boundCount += 1;
            }
        }
    }

    return {
        nodes: nextNodes,
        connections: nextConnections,
        createdNodes,
        createdCount: createdNodes.length,
        boundCount,
    };
}

function findExistingAssetNode(nodes: CanvasNodeData[], suggestion: FilmAssetSuggestion) {
    const suggestionNames = new Set([suggestion.name, ...suggestion.aliases].map(normalizeFilmAssetSuggestionName).filter(Boolean));
    return nodes.find((node) => {
        const payload = node.metadata?.filmAsset;
        if (node.type !== CanvasNodeType.FilmAsset || payload?.kind !== suggestion.kind) return false;
        const assetNames = [payload.asset.name, ...(payload.asset.aliases || [])].map(normalizeFilmAssetSuggestionName).filter(Boolean);
        return assetNames.some((name) => suggestionNames.has(name));
    });
}

function sceneTexts(nodes: CanvasNodeData[]) {
    const texts = new Map<string, string>();
    nodes.forEach((node) => {
        if (node.type !== CanvasNodeType.Scene) return;
        const meta = node.metadata?.filmScene;
        if (!meta) return;
        texts.set(node.id, normalizeFilmAssetSuggestionName([meta.episodeTitle, meta.name, meta.location, meta.notes].filter(Boolean).join(" ")));
    });
    return texts;
}

function mentionShotIds(
    suggestion: FilmAssetSuggestion,
    shotEntries: ReturnType<typeof selectFilmShotEntries>,
    sceneTextById: Map<string, string>,
) {
    const terms = [suggestion.name, ...suggestion.aliases].map(normalizeFilmAssetSuggestionName).filter(Boolean);
    if (!terms.length) return [];
    const matched = new Set<string>();
    for (const entry of shotEntries) {
        const shotText = normalizeFilmAssetSuggestionName([
            entry.shot.title,
            entry.shot.metadata?.filmShot?.description,
            entry.shot.metadata?.filmShot?.dialogue,
            entry.shot.metadata?.filmShot?.prompt,
        ].filter(Boolean).join(" "));
        const sceneText = sceneTextById.get(entry.sceneId) || "";
        if (terms.some((term) => shotText.includes(term)) || (suggestion.kind === "location" && terms.some((term) => sceneText.includes(term)))) {
            matched.add(entry.shot.id);
        }
    }
    return shotEntries.filter((entry) => matched.has(entry.shot.id)).map((entry) => entry.shot.id);
}
