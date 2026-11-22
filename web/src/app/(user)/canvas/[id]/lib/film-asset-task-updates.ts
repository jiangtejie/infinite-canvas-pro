import type { CanvasImageTask } from "@/services/api/image";
import type { FilmAsset, FilmAssetTask, FilmImageRef } from "@/lib/film/types";
import { ensureCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { appendSlotImage, createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { canvasImageTaskURLs, canvasTaskCompleted, canvasTaskFailed } from "./canvas-task-helpers";

export function selectFilmAssetImageTaskTargets(nodes: CanvasNodeData[]) {
    return nodes.filter((node) =>
        node.type === CanvasNodeType.FilmAsset
        && node.metadata?.filmAsset?.asset.pendingTask?.kind === "image");
}

export function applyFilmAssetImageTaskUpdate(nodes: CanvasNodeData[], nodeId: string, task: CanvasImageTask): CanvasNodeData[] {
    const url = canvasImageTaskURLs(task)[0] || "";
    const completed = canvasTaskCompleted(task.status) || Boolean(url);
    const failed = canvasTaskFailed(task.status) || (completed && !url);
    if (!completed && !failed) return nodes;
    return nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const payload = node.metadata?.filmAsset;
        const pending = payload?.asset.pendingTask;
        if (!payload || !pending || pending.kind !== "image") return node;
        if (failed) return withAsset(node, payload, failedAsset(payload.asset, task.error?.message || "资产参考图生成失败"));
        const image = generatedImage(task, url, pending);
        const asset = applyPendingTarget(payload.asset, pending, image);
        return withAsset(node, payload, asset ? { ...asset, pendingTask: undefined, status: "ready", errorMessage: undefined } : failedAsset(payload.asset, "资产回写槽位已不存在"));
    });
}

function withAsset(node: CanvasNodeData, payload: NonNullable<CanvasNodeData["metadata"]>["filmAsset"], asset: FilmAsset): CanvasNodeData {
    if (!payload) return node;
    return { ...node, metadata: { ...node.metadata, filmAsset: { ...payload, asset } } };
}

function failedAsset(asset: FilmAsset, errorMessage: string): FilmAsset {
    return { ...asset, pendingTask: undefined, status: "failed", errorMessage };
}

function generatedImage(task: CanvasImageTask, url: string, pending: FilmAssetTask): FilmImageRef {
    return {
        id: crypto.randomUUID(),
        url,
        storageKey: task.storageKey,
        source: "generated",
        prompt: task.prompt || pending.prompt,
        model: task.model || pending.model,
        label: pending.label,
        templateId: pending.templateId,
        templateVersion: pending.templateVersion,
        createdAt: new Date().toISOString(),
    };
}

function applyPendingTarget(asset: FilmAsset, pending: FilmAssetTask, image: FilmImageRef): FilmAsset | null {
    if (pending.target === "board") {
        const profile = ensureCharacterProfile(asset);
        return {
            ...asset,
            referenceTemplateId: pending.templateId || asset.referenceTemplateId,
            character: { ...profile, board: appendSlotImage(profile.board, image) },
        };
    }
    if (pending.target === "concept") {
        return { ...asset, concept: appendSlotImage(asset.concept, image) };
    }
    if (pending.target === "view") {
        return { ...asset, views: appendSlotImage(asset.views ?? createFilmImageSlot(), image) };
    }
    const variants = asset.location?.variants;
    if (!pending.variantId || !variants?.some((variant) => variant.id === pending.variantId)) return null;
    return {
        ...asset,
        location: {
            ...asset.location,
            variants: variants.map((variant) => variant.id === pending.variantId
                ? { ...variant, concept: appendSlotImage(variant.concept, image) }
                : variant),
        },
    };
}
