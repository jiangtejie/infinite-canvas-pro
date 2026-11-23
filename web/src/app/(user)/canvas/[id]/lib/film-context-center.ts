import type { FilmAsset } from "@/lib/film/types";
import { characterPackageImage } from "@/app/(user)/film/utils/film-character";
import { activeSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import type { CanvasConnection, CanvasNodeData } from "../../types";
import { filmContextAsset } from "./film-node-patch";
import { filmContextRoleOfNode } from "./film-node-kind";
import { selectFilmShotEntries } from "./film-selectors";

export type FilmContextCenterRole = "character" | "location" | "prop" | "style";

export type FilmContextShotReference = { id: string; shotNo: string; sceneLabel: string };

export type FilmContextCostumeReference = { stateId: string; stateName: string; costumeId: string };

export type FilmContextCard = {
    nodeId: string;
    role: FilmContextCenterRole;
    asset: FilmAsset;
    name: string;
    description: string;
    ready: boolean;
    productionReady: boolean;
    productionBlocked: boolean;
    productionBlockedReason: string;
    pending: boolean;
    sourceLibraryAssetId?: string;
    usedShots: FilmContextShotReference[];
    usedScenes: string[];
    impactedShots: FilmContextShotReference[];
    missingRefs: string[];
    costumeRefs: FilmContextCostumeReference[];
};

export type FilmContextCenterIssue = { level: "error" | "warning"; message: string };

export type FilmContextCenterView = {
    groups: Record<FilmContextCenterRole, FilmContextCard[]>;
    issues: FilmContextCenterIssue[];
    totals: { assets: number; ready: number; missing: number; unused: number };
};

const ROLES: FilmContextCenterRole[] = ["character", "location", "prop", "style"];

export const EMPTY_FILM_CONTEXT_CENTER: FilmContextCenterView = {
    groups: { character: [], location: [], prop: [], style: [] },
    issues: [],
    totals: { assets: 0, ready: 0, missing: 0, unused: 0 },
};

function roleOf(node: CanvasNodeData): FilmContextCenterRole | null {
    const role = filmContextRoleOfNode(node);
    return role && role !== "beat" ? role : null;
}

/** 角色看参考板，其余上下文看概念图。 */
function filmContextAssetReady(role: FilmContextCenterRole, asset: FilmAsset): boolean {
    return role === "character" ? Boolean(characterPackageImage(asset)) : Boolean(activeSlotImage(asset.concept));
}

function missingReferenceLabel(role: FilmContextCenterRole) {
    if (role === "character") return "缺少角色参考板";
    if (role === "style") return "缺少风格参考图";
    return "缺少概念图";
}

type ContextUsage = { shotIds: Set<string>; staleStates: Set<string>; staleVariants: Set<string>; stateIds: Set<string>; locationVariants: Map<string, Set<string>>; locationBaseUsed: boolean };

function missingCostumeRefs(asset: FilmAsset, costumes: FilmAsset[], stateIds: Set<string>): string[] {
    return (asset.character?.states || []).flatMap((state) => {
        if (!state.costumeId || !stateIds.has(state.id)) return [];
        const costume = costumes.find((item) => item.id === state.costumeId);
        if (!costume) return [`造型「${state.name}」引用的服装已删除`];
        return activeSlotImage(costume.concept) ? [] : [`造型「${state.name}」的服装缺少概念图`];
    });
}

/** 上下文中心：角色/场景/道具/风格的项目副本、参考就绪与 context 边引用关系。 */
export function selectFilmContextCenter(nodes: CanvasNodeData[], connections: CanvasConnection[], costumes: FilmAsset[] = [], entries = selectFilmShotEntries(nodes, connections)): FilmContextCenterView {
    const entryByShotId = new Map(entries.map((entry) => [entry.shot.id, entry]));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const shotRef = (entry: (typeof entries)[number]): FilmContextShotReference => ({
        id: entry.shot.id,
        shotNo: entry.shot.metadata?.filmShot?.shotNo || entry.shot.title || entry.shot.id,
        sceneLabel: entry.sceneLabel,
    });

    const usage = new Map<string, ContextUsage>();
    for (const edge of connections) {
        if (edge.kind !== "context") continue;
        const source = nodeById.get(edge.fromNodeId);
        const role = source ? roleOf(source) : null;
        if (!source || !role || role !== edge.data.role || !entryByShotId.has(edge.toNodeId)) continue;
        const asset = filmContextAsset(source)!;
        const current = usage.get(source.id) || { shotIds: new Set<string>(), staleStates: new Set<string>(), staleVariants: new Set<string>(), stateIds: new Set<string>(), locationVariants: new Map<string, Set<string>>(), locationBaseUsed: false };
        current.shotIds.add(edge.toNodeId);
        if (role === "character" && edge.data.stateId) {
            current.stateIds.add(edge.data.stateId);
            if (!asset.character?.states.some((state) => state.id === edge.data.stateId)) current.staleStates.add(edge.toNodeId);
        }
        if (role === "location") {
            if (!edge.data.variantId) current.locationBaseUsed = true;
            else {
                if (!asset.location?.variants.some((variant) => variant.id === edge.data.variantId)) current.staleVariants.add(edge.toNodeId);
                current.locationVariants.set(edge.data.variantId, (current.locationVariants.get(edge.data.variantId) || new Set<string>()).add(edge.toNodeId));
            }
        }
        usage.set(source.id, current);
    }

    const groups: Record<FilmContextCenterRole, FilmContextCard[]> = { character: [], location: [], prop: [], style: [] };
    nodes.forEach((node) => {
        const role = roleOf(node);
        const asset = role ? filmContextAsset(node) : undefined;
        if (!role || !asset) return;
        const current = usage.get(node.id);
        const usedEntries = current ? entries.filter((entry) => current.shotIds.has(entry.shot.id)) : [];
        const usedShots = usedEntries.map(shotRef);
        const baseReady = filmContextAssetReady(role, asset);
        const baseRequired = role !== "location" || !current?.locationVariants.size || current.locationBaseUsed;
        const variantMissingRefs = role === "location"
            ? [...(current?.locationVariants || [])].flatMap(([variantId, shotIds]) => {
                const variant = asset.location?.variants.find((item) => item.id === variantId);
                if (!variant || activeSlotImage(variant.concept)) return [];
                return entries.filter((entry) => shotIds.has(entry.shot.id)).map((entry) => `镜头 ${shotRef(entry).shotNo} 引用的场景变体缺少概念图`);
            })
            : [];
        const staleVariantRefs = role === "location"
            ? entries.filter((entry) => current?.staleVariants.has(entry.shot.id)).map((entry) => `镜头 ${shotRef(entry).shotNo} 引用的场景变体已失效`)
            : [];
        const costumeMissingRefs = role === "character" ? missingCostumeRefs(asset, costumes, current?.stateIds || new Set<string>()) : [];
        const variantIssues = [...variantMissingRefs, ...staleVariantRefs];
        const productionBlocked = role === "location" && variantIssues.length > 0;
        const productionBlockedReason = productionBlocked
            ? [baseRequired && !baseReady ? missingReferenceLabel(role) : "", ...variantIssues].filter(Boolean).join("；")
            : "";
        const productionReady = productionBlocked
            ? false
            : role === "location" && current?.locationVariants.size && !current.locationBaseUsed
                ? true
                : baseReady;
        const missingRefs = [...new Set([
            baseRequired && !baseReady ? missingReferenceLabel(role) : "",
            ...variantMissingRefs,
            ...costumeMissingRefs,
            ...entries.filter((entry) => current?.staleStates.has(entry.shot.id)).map((entry) => `镜头 ${shotRef(entry).shotNo} 引用的造型状态已失效`),
            ...staleVariantRefs,
        ].filter(Boolean))];
        groups[role].push({
            nodeId: node.id,
            role,
            asset,
            name: asset.name || node.title,
            description: asset.description || "",
            ready: !missingRefs.length,
            productionReady,
            productionBlocked,
            productionBlockedReason,
            pending: Boolean(asset.pendingTask),
            sourceLibraryAssetId: asset.sourceLibraryAssetId,
            usedShots,
            usedScenes: [...new Map(usedEntries.map((entry) => [entry.sceneId, entry.sceneLabel])).values()],
            impactedShots: role === "style" ? entries.map(shotRef) : usedShots,
            missingRefs,
            costumeRefs: role === "character"
                ? (asset.character?.states || []).flatMap((state) => state.costumeId ? [{ stateId: state.id, stateName: state.name, costumeId: state.costumeId }] : [])
                : [],
        });
    });
    ROLES.forEach((role) => groups[role].sort((left, right) => left.name.localeCompare(right.name)));

    const issues: FilmContextCenterIssue[] = [];
    if (groups.style.length > 1) {
        issues.push({ level: "error", message: `项目有 ${groups.style.length} 个风格圣经节点，只保留一个：${groups.style.map((card) => card.name).join("、")}` });
    } else if (!groups.style.length) {
        issues.push({ level: "warning", message: "项目缺少风格圣经，生成与检查不会带入统一风格" });
    }

    const cards = ROLES.flatMap((role) => groups[role]);
    return {
        groups,
        issues,
        totals: {
            assets: cards.length,
            ready: cards.filter((card) => card.ready).length,
            missing: cards.filter((card) => !card.ready).length,
            unused: cards.filter((card) => !card.impactedShots.length).length,
        },
    };
}
