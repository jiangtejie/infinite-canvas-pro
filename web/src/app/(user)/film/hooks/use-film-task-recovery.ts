"use client";

import { useEffect, useRef } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { pollCanvasImageTaskStatus } from "@/services/api/image";
import { resolveModelForCapability, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { FilmAsset, FilmAssetKind, FilmAssetTask, FilmImageRef, FilmProject, FilmShot, FilmShotTask } from "@/lib/film/types";
import { isFilmImageTaskDone, isFilmImageTaskFailed } from "../utils/film-image-task";
import { ensureCharacterProfile } from "../utils/film-character";
import { appendSlotImage, createFilmImageSlot } from "../utils/film-image-slot";
import { latestFilmAssetPatch, latestFilmShotPatch } from "../utils/film-live-project";
import { flattenFilmShots } from "../utils/parse-script";

import { withImageVersion, withVideoVersion } from "../utils/film-versions";
import { FilmVideoStoppedError, pollFilmVideoTask } from "../utils/film-video-task";

const RECOVERY_INTERVAL = 5000;
const TASK_MAX_AGE = 60 * 60 * 1000;
const MAX_POLL_ERRORS = 3;

type ActiveIds = { shotIds?: string[]; assetIds?: string[] };

/**
 * 刷新或重进项目后恢复进行中的生成任务：分镜图 / 分镜视频 / 角色与场景设定图。
 * 完成后按任务记录的回写目标写回结果，并清掉任务标识。
 */
export function useFilmTaskRecovery(
    project: FilmProject | undefined,
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void,
    activeIds: ActiveIds = {},
) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const projectRef = useRef(project);
    const activeRef = useRef(activeIds);
    const configRef = useRef(effectiveConfig);
    const pollingRef = useRef<Set<string>>(new Set());
    const errorCountRef = useRef<Map<string, number>>(new Map());
    const projectId = project?.id;
    const updateRef = useRef(onUpdate);
    useEffect(() => {
        projectRef.current = project;
    }, [project]);
    useEffect(() => {
        activeRef.current = activeIds;
    }, [activeIds]);
    useEffect(() => {
        configRef.current = effectiveConfig;
    }, [effectiveConfig]);
    useEffect(() => {
        updateRef.current = onUpdate;
    }, [onUpdate]);

    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;

        const patchShot = (shotId: string, updater: (shot: FilmShot) => Partial<FilmShot>) => {
            const patch = latestFilmShotPatch(projectRef.current?.id, shotId, updater);
            if (patch) updateRef.current(patch);
        };

        const patchAsset = (kind: FilmAssetKind, assetId: string, patch: Partial<FilmAsset>) => {
            const next = latestFilmAssetPatch(projectRef.current?.id, kind, assetId, () => patch);
            if (next) updateRef.current(next);
        };

        const pollImageTask = async (shot: FilmShot, pending: FilmShotTask) => {
            const task = await pollCanvasImageTaskStatus(pending.id);
            if (cancelled) return;
            if (isFilmImageTaskDone(task.status)) {
                const imageUrl = task.image_url || task.image_urls?.[0] || task.url || "";
                if (!imageUrl) throw new Error("任务完成但没有返回图片");
                patchShot(shot.id, (latestShot) => ({ ...withImageVersion(latestShot, imageUrl, task.storageKey || "", pending.generationContext), pendingTask: undefined }));
                message.success(`已恢复分镜图生成：${shot.shotNo}`);
                return;
            }
            if (isFilmImageTaskFailed(task.status)) {
                patchShot(shot.id, () => ({ errorMessage: task.error?.message || task.error_detail || "分镜图生成失败", pendingTask: undefined }));
                message.error(`分镜图生成失败：${shot.shotNo}`);
            }
        };

        const pollVideoTask = async (shot: FilmShot, pending: FilmShotTask) => {
            const model = resolveModelForCapability(configRef.current, configRef.current.videoModel, "video") || configRef.current.model;
            if (!model) return;
            const config = { ...configRef.current, model } as AiConfig;
            try {
                const result = await pollFilmVideoTask(config, pending);
                if (cancelled) return;
                patchShot(shot.id, (latestShot) => ({ ...withVideoVersion(latestShot, result.videoUrl, result.storageKey, pending.generationContext), pendingTask: undefined }));
                message.success(`已恢复分镜视频生成：${shot.shotNo}`);
            } catch (error) {
                if (error instanceof FilmVideoStoppedError) {
                    patchShot(shot.id, () => ({ pendingTask: undefined }));
                    return;
                }
                throw error;
            }
        };

        const pollAssetTask = async (kind: FilmAssetKind, asset: FilmAsset, pending: FilmAssetTask) => {
            const task = await pollCanvasImageTaskStatus(pending.id);
            if (cancelled) return;
            if (isFilmImageTaskDone(task.status)) {
                const imageUrl = task.image_url || task.image_urls?.[0] || task.url || "";
                if (!imageUrl) throw new Error("任务完成但没有返回图片");
                const storageKey = task.storageKey || "";
                const imageRef: FilmImageRef = { id: nanoid(), url: imageUrl, storageKey, source: "generated", createdAt: new Date().toISOString() };
                const patch: Partial<FilmAsset> = { pendingTask: undefined, errorMessage: "" };
                if (pending.target === "view") {
                    patch.views = appendSlotImage(asset.views || createFilmImageSlot(), { ...imageRef, label: pending.label || "视图" });
                } else if (pending.target === "part" && pending.partKey) {
                    const profile = ensureCharacterProfile(asset);
                    const key = pending.partKey;
                    patch.character = {
                        ...profile,
                        parts: { ...profile.parts, [key]: { ...profile.parts[key], slot: appendSlotImage(profile.parts[key].slot, imageRef) } },
                    };
                } else if (pending.target === "expression") {
                    const profile = ensureCharacterProfile(asset);
                    patch.character = { ...profile, expressions: appendSlotImage(profile.expressions, { ...imageRef, label: pending.label || "表情" }) };
                } else if (pending.target === "master" || pending.target === "card") {
                    const profile = ensureCharacterProfile(asset);
                    patch.character = { ...profile, master: appendSlotImage(profile.master, imageRef) };
                    patch.status = "ready";
                } else if (pending.target === "variant") {
                    const variants = asset.location?.variants || [];
                    patch.location = {
                        variants: variants.map((variant) => variant.id === pending.variantId
                            ? { ...variant, concept: appendSlotImage(variant.concept, imageRef) }
                            : variant),
                    };
                } else {
                    patch.concept = appendSlotImage(asset.concept, imageRef);
                    patch.status = "ready";
                }
                patchAsset(kind, asset.id, patch);
                message.success(pending.target === "card"
                    ? `已恢复「${asset.name}」角色卡所需的全身图，请重新生成角色卡`
                    : `已恢复「${asset.name}」的设定图生成`);
                return;
            }
            if (isFilmImageTaskFailed(task.status)) {
                const reason = task.error?.message || task.error_detail || "设定图生成失败";
                patchAsset(kind, asset.id, { ...(pending.target === "concept" || pending.target === "master" ? { status: "failed" as const } : {}), errorMessage: reason, pendingTask: undefined });
                message.error(`设定图生成失败：「${asset.name}」`);
            }
        };

        const poll = async () => {
            const current = projectRef.current;
            if (!current) return;
            const shotIds = activeRef.current.shotIds || [];
            const assetIds = activeRef.current.assetIds || [];

            const shotTargets = flattenFilmShots(current.episodes).filter((shot) => shot.pendingTask
                && !shotIds.includes(shot.id)
                && !pollingRef.current.has(shot.id));
            for (const shot of shotTargets) {
                const pending = shot.pendingTask!;
                if (Date.now() - pending.startedAt > TASK_MAX_AGE) {
                    patchShot(shot.id, () => ({ errorMessage: "生成任务已超时，请重新生成", pendingTask: undefined }));
                    message.warning(`${shot.shotNo} 的生成任务已超时`);
                    continue;
                }
                pollingRef.current.add(shot.id);
                try {
                    if (pending.kind === "image") await pollImageTask(shot, pending);
                    else await pollVideoTask(shot, pending);
                    errorCountRef.current.delete(shot.id);
                } catch {
                    const count = (errorCountRef.current.get(shot.id) || 0) + 1;
                    errorCountRef.current.set(shot.id, count);
                    if (count >= MAX_POLL_ERRORS) {
                        patchShot(shot.id, () => ({ errorMessage: "无法恢复该生成任务，请重新生成", pendingTask: undefined }));
                        message.warning(`${shot.shotNo} 的生成任务无法恢复，请重新生成`);
                        errorCountRef.current.delete(shot.id);
                    }
                } finally {
                    pollingRef.current.delete(shot.id);
                }
            }

            const assetTargets: Array<{ kind: FilmAssetKind; asset: FilmAsset }> = [
                ...(current.characters || []).map((asset) => ({ kind: "character" as const, asset })),
                ...(current.locations || []).map((asset) => ({ kind: "location" as const, asset })),
                ...(current.props || []).map((asset) => ({ kind: "prop" as const, asset })),
                ...(current.costumes || []).map((asset) => ({ kind: "costume" as const, asset })),
                ...(current.style ? [{ kind: "style" as const, asset: current.style }] : []),
            ].filter(({ asset }) => asset.pendingTask
                && !assetIds.includes(asset.id)
                && !pollingRef.current.has(asset.id));
            for (const { kind, asset } of assetTargets) {
                const pending = asset.pendingTask!;
                const key = `asset:${asset.id}`;
                if (Date.now() - pending.startedAt > TASK_MAX_AGE) {
                    patchAsset(kind, asset.id, { errorMessage: "生成任务已超时，请重新生成", pendingTask: undefined });
                    message.warning(`${asset.name} 的设定图任务已超时`);
                    continue;
                }
                pollingRef.current.add(asset.id);
                try {
                    await pollAssetTask(kind, asset, pending);
                    errorCountRef.current.delete(key);
                } catch {
                    const count = (errorCountRef.current.get(key) || 0) + 1;
                    errorCountRef.current.set(key, count);
                    if (count >= MAX_POLL_ERRORS) {
                        patchAsset(kind, asset.id, { status: "failed", errorMessage: "无法恢复该生成任务，请重新生成", pendingTask: undefined });
                        message.warning(`${asset.name} 的设定图任务无法恢复，请重新生成`);
                        errorCountRef.current.delete(key);
                    }
                } finally {
                    pollingRef.current.delete(asset.id);
                }
            }
        };

        void poll();
        const timer = window.setInterval(() => void poll(), RECOVERY_INTERVAL);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [message, projectId]);
}
