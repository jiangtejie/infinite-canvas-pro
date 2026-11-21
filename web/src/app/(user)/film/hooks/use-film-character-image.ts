"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import type { CanvasImageTask, SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmAssetTask, FilmCharacterPartKey, FilmImageRef, FilmProject } from "@/lib/film/types";
import { composeCharacterCard, type CharacterCardOptions } from "../utils/film-character-card";
import { normalizeFilmAspect } from "@/lib/film/film-aspects";
import { CHARACTER_PART_DEFINITIONS, characterMasterImages, characterPartLabel, ensureCharacterProfile } from "../utils/film-character";
import { activeSlotImage, appendSlotImage } from "../utils/film-image-slot";
import { latestFilmAsset, latestFilmAssetPatch, latestFilmProject } from "../utils/film-live-project";
import { runImageTask, stopFilmImageTask } from "../utils/film-image-task";
import { compressFilmReference } from "../utils/film-image-compress";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";

export type FilmCharacterGenerationKey = "" | `part:${FilmCharacterPartKey}` | "master" | "card" | "expression";

const MAX_REFERENCES = 10;

export function useFilmCharacterImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const resolveModelConfig = useModelConfig();
    const [generatingKey, setGeneratingKey] = useState<FilmCharacterGenerationKey>("");
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
    const projectRef = useRef(project);
    useEffect(() => {
        projectRef.current = project;
    }, [project]);
    const stopRequestedRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const taskRef = useRef<FilmAssetTask | null>(null);

    const patchCharacter = (characterId: string, updater: (asset: FilmAsset) => FilmAsset) => {
        const patch = latestFilmAssetPatch(projectRef.current?.id, "character", characterId, (asset) => updater(asset));
        if (patch) onUpdate(patch);
    };

    const markPending = (characterId: string, pending: FilmAssetTask | undefined) => {
        patchCharacter(characterId, (item) => ({ ...item, pendingTask: pending, errorMessage: pending ? "" : item.errorMessage }));
    };

    const cancelServerTask = () => {
        const task = taskRef.current;
        if (!task) return;
        const model = effectiveConfig.imageModel || effectiveConfig.model;
        void stopFilmImageTask({ ...effectiveConfig, model } as AiConfig, task.id).then((cancelled) => {
            if (!cancelled) message.warning("取消服务端任务失败，模型侧任务可能仍在运行");
        });
    };

    const startImageTask = (characterId: string, target: Pick<FilmAssetTask, "target" | "label" | "partKey">, resetStop = true) => {
        if (resetStop) stopRequestedRef.current = false;
        const controller = new AbortController();
        controllerRef.current = controller;
        return {
            signal: controller.signal,
            onTask: (task: CanvasImageTask) => {
                const pending: FilmAssetTask = { kind: "image", id: task.id, startedAt: Date.now(), ...target };
                taskRef.current = pending;
                markPending(characterId, pending);
            },
            finish: () => {
                controllerRef.current = null;
                taskRef.current = null;
                setGeneratingKey("");
            },
        };
    };

    const buildImageConfig = (current: FilmProject) => {
        const config = resolveModelConfig("image");
        return config ? { ...config, count: "1", size: normalizeFilmAspect(current.aspect) } as SeedableImageConfig : null;
    };

    const resolveReferences = async (refs: FilmImageRef[]): Promise<ReferenceImage[]> => {
        const references: ReferenceImage[] = [];
        for (const ref of refs.slice(0, MAX_REFERENCES)) {
            if (!ref.url && !ref.storageKey) continue;
            try {
                const dataUrl = await imageToDataUrl({ url: ref.url, storageKey: ref.storageKey });
                if (dataUrl) {
                    const compressed = await compressFilmReference(dataUrl);
                    references.push({ id: ref.id, name: `${ref.id}.jpg`, type: compressed.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png", dataUrl: compressed, storageKey: ref.storageKey });
                }
            } catch {
                // 单张参考图读取失败时跳过
            }
        }
        return references;
    };

    const makeImageRef = (imageUrl: string, storageKey: string, prompt: string, config: SeedableImageConfig, label?: string): FilmImageRef => ({
        id: nanoid(),
        url: imageUrl,
        storageKey,
        source: "generated",
        label,
        prompt,
        model: config.model,
        createdAt: new Date().toISOString(),
    });

    const generatePart = async (characterId: string, partKey: FilmCharacterPartKey, options: { inBatch?: boolean } = {}): Promise<boolean> => {
        const current = projectRef.current;
        if (!current || generatingKey) return false;
        if (options.inBatch && stopRequestedRef.current) return false;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return false;
        const profile = ensureCharacterProfile(asset);
        const part = profile.parts[partKey];
        if (part.slot.locked) {
            message.warning("该部位已锁定，先解锁再生成");
            return false;
        }
        const config = buildImageConfig(current);
        if (!config) return false;

        const refs: FilmImageRef[] = [];
        const faceActive = activeSlotImage(profile.parts.face.slot);
        if (partKey !== "face" && faceActive) refs.push(faceActive);
        refs.push(...characterMasterImages(asset).slice(-2));
        refs.push(...part.slot.images.slice(-2));
        const references = await resolveReferences(refs);

        const styleText = resolveFilmStyleText(current);
        const prompt = [
            partKey === "face"
                ? `角色 ${asset.name} 的面部三视图：正脸、侧脸、半侧脸并排，白色背景，突出妆容与五官。`
                : `角色 ${asset.name} 的${characterPartLabel(partKey)}设定图：${part.prompt.trim() || "服装、造型与细节参考"}。`,
            asset.description?.trim() ? `角色设定：${asset.description.trim()}` : "",
            asset.visualPrompt?.trim() ? `补充描述：${asset.visualPrompt.trim()}` : "",
            styleText ? `视觉风格：${styleText}` : "",
            partKey !== "face" ? "保持与该角色的脸型、发型与整体气质一致，白色背景，统一光照。" : "",
        ].filter(Boolean).join("\n\n");

        const task = startImageTask(characterId, { target: "part", label: characterPartLabel(partKey), partKey }, !options.inBatch);
        setGeneratingKey(`part:${partKey}`);
        try {
            const { imageUrl, storageKey } = await runImageTask(config, prompt, references, `${characterId}-${partKey}`, { signal: task.signal, onTask: task.onTask });
            patchCharacter(characterId, (item) => {
                const nextProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    pendingTask: undefined,
                    character: {
                        ...nextProfile,
                        parts: {
                            ...nextProfile.parts,
                            [partKey]: { ...nextProfile.parts[partKey], slot: appendSlotImage(nextProfile.parts[partKey].slot, makeImageRef(imageUrl, storageKey, prompt, config)) },
                        },
                    },
                };
            });
            if (stopRequestedRef.current) message.info("停止时任务已生成完成，结果已保留");
            else message.success(`${characterPartLabel(partKey)}参考图已生成`);
            return true;
        } catch (error) {
            markPending(characterId, undefined);
            if (stopRequestedRef.current) message.info("已停止生成，未完成的任务已取消");
            else message.error(error instanceof Error ? error.message : `${characterPartLabel(partKey)}生成失败`);
            return false;
        } finally {
            task.finish();
        }
    };

    const createMasterImage = async (current: FilmProject, asset: FilmAsset, config: SeedableImageConfig, handlers: { signal?: AbortSignal; onTask?: (task: CanvasImageTask) => void } = {}): Promise<FilmImageRef> => {
        const profile = ensureCharacterProfile(asset);
        const refs = [
            activeSlotImage(profile.parts.face.slot),
            activeSlotImage(profile.master),
            activeSlotImage(profile.parts.hair.slot),
            activeSlotImage(profile.parts.upper.slot),
            activeSlotImage(profile.parts.lower.slot),
            activeSlotImage(profile.parts.limbs.slot),
            ...profile.propIds.map((propId) => activeSlotImage((current.props || []).find((item) => item.id === propId)?.concept)),
        ].filter((image): image is FilmImageRef => Boolean(image));
        const references = await resolveReferences(refs);
        const styleText = resolveFilmStyleText(current);
        const prompt = [
            `角色 ${asset.name} 的全身三视图：正面、侧面、背面并排站在同一画面，白色背景，统一光照与比例。`,
            asset.description?.trim() ? `角色设定：${asset.description.trim()}` : "",
            asset.visualPrompt?.trim() ? `补充描述：${asset.visualPrompt.trim()}` : "",
            styleText ? `视觉风格：${styleText}` : "",
            "严格保持与参考图中的脸、发型、服装、腿型与鞋子一致。",
        ].filter(Boolean).join("\n\n");
        const { imageUrl, storageKey } = await runImageTask(config, prompt, references, `${asset.id}-master`, handlers);
        return makeImageRef(imageUrl, storageKey, prompt, config);
    };

    const generateMaster = async (characterId: string) => {
        const current = projectRef.current;
        if (!current || generatingKey) return;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return;
        const profile = ensureCharacterProfile(asset);
        if (profile.master.locked) {
            message.warning("全身合成图已锁定，先解锁再生成");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;

        const task = startImageTask(characterId, { target: "master" });
        setGeneratingKey("master");
        try {
            const image = await createMasterImage(current, asset, config, { signal: task.signal, onTask: task.onTask });
            patchCharacter(characterId, (item) => {
                const nextProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    pendingTask: undefined,
                    status: "ready",
                    errorMessage: "",
                    character: { ...nextProfile, master: appendSlotImage(nextProfile.master, image) },
                };
            });
            if (stopRequestedRef.current) message.info("停止时任务已生成完成，结果已保留");
            else message.success("全身合成图已生成");
        } catch (error) {
            markPending(characterId, undefined);
            if (stopRequestedRef.current) message.info("已停止生成，未完成的任务已取消");
            else message.error(errorMessage(error, "全身合成失败"));
        } finally {
            task.finish();
        }
    };

    const generateCard = async (characterId: string, options?: CharacterCardOptions): Promise<boolean> => {
        const current = projectRef.current;
        if (!current || generatingKey) return false;
        const asset = latestFilmAsset(current.id, "character", characterId)?.asset;
        if (!asset) return false;
        if (ensureCharacterProfile(asset).card.locked) {
            message.warning("角色卡已锁定，先解锁再生成");
            return false;
        }
        const config = buildImageConfig(current);
        if (!config) return false;
        stopRequestedRef.current = false;
        setGeneratingKey("card");
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            let master = activeSlotImage(ensureCharacterProfile(asset).master);
            let cardAsset = asset;
            if (!master) {
                master = await createMasterImage(current, asset, config, {
                    signal: controller.signal,
                    onTask: (task) => {
                        const pending: FilmAssetTask = { kind: "image", id: task.id, startedAt: Date.now(), target: "card" };
                        taskRef.current = pending;
                        markPending(characterId, pending);
                    },
                });
                // 先把全身图落库，避免下一步本地拼合被中断时丢掉刚生成的图
                const generatedMaster = master;
                patchCharacter(characterId, (item) => {
                    const itemProfile = ensureCharacterProfile(item);
                    return {
                        ...item,
                        pendingTask: undefined,
                        status: "ready",
                        errorMessage: "",
                        character: { ...itemProfile, master: appendSlotImage(itemProfile.master, generatedMaster) },
                    };
                });
                controllerRef.current = null;
                taskRef.current = null;
                const latest = latestFilmAsset(current.id, "character", characterId)?.asset || asset;
                const latestProfile = ensureCharacterProfile(latest);
                cardAsset = { ...latest, character: { ...latestProfile, master: appendSlotImage(latestProfile.master, generatedMaster) } };
            }
            if (stopRequestedRef.current) {
                markPending(characterId, undefined);
                message.info("已停止生成角色卡");
                return false;
            }
            const latestProject = latestFilmProject(current.id) || current;
            const { card, signature } = await composeCharacterCard(cardAsset, latestProject.props || [], latestProject.costumes || [], options);
            if (stopRequestedRef.current) {
                markPending(characterId, undefined);
                message.info("已停止生成角色卡");
                return false;
            }
            patchCharacter(characterId, (item) => {
                const itemProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    pendingTask: undefined,
                    status: "ready",
                    errorMessage: "",
                    character: { ...itemProfile, card: appendSlotImage(itemProfile.card, card), cardSignature: signature },
                };
            });
            return true;
        } catch (error) {
            markPending(characterId, undefined);
            if (stopRequestedRef.current) message.info("已停止生成，未完成的任务已取消");
            else message.error(errorMessage(error, "角色卡生成失败"));
            return false;
        } finally {
            controllerRef.current = null;
            taskRef.current = null;
            setGeneratingKey("");
        }
    };

    const generateExpression = async (characterId: string, label: string, prompt?: string): Promise<boolean> => {
        const current = projectRef.current;
        if (!current || generatingKey) return false;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return false;
        const profile = ensureCharacterProfile(asset);
        if (profile.expressions.locked) {
            message.warning("表情集已锁定，先解锁再生成");
            return false;
        }
        const expressionLabel = label.trim();
        if (!expressionLabel) {
            message.warning("先填写表情名，例如「喜」「怒」「哀」「惊」");
            return false;
        }
        const config = buildImageConfig(current);
        if (!config) return false;
        const refs = [
            activeSlotImage(profile.parts.face.slot),
            activeSlotImage(profile.master),
            activeSlotImage(profile.card),
        ].filter((image): image is FilmImageRef => Boolean(image));
        const references = await resolveReferences(refs);
        const styleText = resolveFilmStyleText(current);
        const expressionPrompt = [
            prompt?.trim() || `角色 ${asset.name} 的表情特写：${expressionLabel}。面部近景，保持五官、发型与整体气质一致。`,
            asset.description?.trim() ? `角色设定：${asset.description.trim()}` : "",
            styleText ? `视觉风格：${styleText}` : "",
        ].filter(Boolean).join("\n\n");

        const task = startImageTask(characterId, { target: "expression", label: expressionLabel });
        setGeneratingKey("expression");
        try {
            const { imageUrl, storageKey } = await runImageTask(config, expressionPrompt, references, `${characterId}-expression`, { signal: task.signal, onTask: task.onTask });
            patchCharacter(characterId, (item) => {
                const nextProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    pendingTask: undefined,
                    character: { ...nextProfile, expressions: appendSlotImage(nextProfile.expressions, makeImageRef(imageUrl, storageKey, expressionPrompt, config, expressionLabel)) },
                };
            });
            if (stopRequestedRef.current) message.info("停止时任务已生成完成，结果已保留");
            else message.success(`表情「${expressionLabel}」已生成`);
            return true;
        } catch (error) {
            markPending(characterId, undefined);
            if (stopRequestedRef.current) message.info("已停止生成，未完成的任务已取消");
            else message.error(errorMessage(error, "表情生成失败"));
            return false;
        } finally {
            task.finish();
        }
    };

    const generateMissingParts = async (characterId: string) => {
        const current = projectRef.current;
        if (!current || generatingKey || batchProgress) return;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return;
        const profile = ensureCharacterProfile(asset);
        const missing = CHARACTER_PART_DEFINITIONS.filter((definition) => !profile.parts[definition.key].slot.images.length && !profile.parts[definition.key].slot.locked);
        if (!missing.length) {
            message.info("所有部位都已经有参考图了");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;
        stopRequestedRef.current = false;
        setBatchProgress({ done: 0, total: missing.length });
        let succeeded = 0;
        let processed = 0;
        try {
            for (const [index, definition] of missing.entries()) {
                if (stopRequestedRef.current) break;
                setBatchProgress({ done: index, total: missing.length });
                const ok = await generatePart(characterId, definition.key, { inBatch: true });
                processed = index + 1;
                if (ok) succeeded += 1;
                setBatchProgress({ done: processed, total: missing.length });
            }
        } finally {
            setBatchProgress(null);
        }
        if (stopRequestedRef.current) message.info(`已停止补齐：成功 ${succeeded}/${processed} 个`);
        else message.success(`补齐完成：成功 ${succeeded}/${missing.length}`);
    };

    /** 停止角色部位 / 全身合成 / 角色卡 / 表情生成：中断本地等待并尽力取消账号渠道上的远端任务。 */
    const stopCharacterImage = () => {
        if (!generatingKey && !batchProgress) {
            message.info("当前没有正在生成的设定图");
            return;
        }
        stopRequestedRef.current = true;
        controllerRef.current?.abort();
        cancelServerTask();
        message.info("正在停止生成…");
    };

    return { generatingKey, batchProgress, generatePart, generateMissingParts, generateMaster, generateCard, generateExpression, stopCharacterImage };
}
