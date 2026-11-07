"use client";

import { useRef, useState } from "react";
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
import { runImageTask, stopFilmImageTask } from "../utils/film-image-task";
import { compressFilmReference } from "../utils/film-image-compress";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { useModelConfig } from "@/hooks/use-model-config";

export type FilmCharacterGenerationKey = "" | `part:${FilmCharacterPartKey}` | "master" | "card";

const MAX_REFERENCES = 10;

export function useFilmCharacterImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const resolveModelConfig = useModelConfig();
    const [generatingKey, setGeneratingKey] = useState<FilmCharacterGenerationKey>("");
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
    const projectRef = useRef(project);
    projectRef.current = project;
    const stopRequestedRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const taskRef = useRef<FilmAssetTask | null>(null);

    const patchCharacter = (characterId: string, updater: (asset: FilmAsset) => FilmAsset) => {
        const current = projectRef.current;
        if (!current) return;
        onUpdate({ characters: (current.characters || []).map((asset) => asset.id === characterId ? updater(asset) : asset) });
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

    const generatePart = async (characterId: string, partKey: FilmCharacterPartKey, options: { inBatch?: boolean } = {}): Promise<boolean> => {
        const current = projectRef.current;
        if (!current || generatingKey) return false;
        if (options.inBatch && stopRequestedRef.current) return false;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return false;
        const profile = ensureCharacterProfile(asset);
        const part = profile.parts[partKey];
        if (part.locked) {
            message.warning("该部位已锁定，先解锁再生成");
            return false;
        }
        const config = buildImageConfig(current);
        if (!config) return false;

        const refs: FilmImageRef[] = [];
        if (partKey !== "face") refs.push(...profile.parts.face.images.slice(0, 3));
        refs.push(...characterMasterImages(asset).slice(0, 2));
        refs.push(...part.images.slice(-2));
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
            const image: FilmImageRef = { id: nanoid(), url: imageUrl, storageKey, source: "generated", createdAt: new Date().toISOString() };
            patchCharacter(characterId, (item) => {
                const nextProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    pendingTask: undefined,
                    character: {
                        ...nextProfile,
                        parts: {
                            ...nextProfile.parts,
                            [partKey]: { ...nextProfile.parts[partKey], images: [...nextProfile.parts[partKey].images, image].slice(-6) },
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
            ...profile.parts.face.images.slice(0, 2),
            ...profile.masterViews.slice(0, 1),
            ...profile.parts.hair.images.slice(0, 1),
            ...profile.parts.upper.images.slice(0, 1),
            ...profile.parts.lower.images.slice(0, 1),
            ...profile.parts.limbs.images.slice(0, 1),
            ...profile.props.flatMap((prop) => prop.images.slice(0, 1)),
        ];
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
        return { id: nanoid(), url: imageUrl, storageKey, source: "generated", createdAt: new Date().toISOString() };
    };

    const generateMaster = async (characterId: string) => {
        const current = projectRef.current;
        if (!current || generatingKey) return;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return;
        const profile = ensureCharacterProfile(asset);
        if (profile.masterLocked) {
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
                    imageUrl: image.url,
                    storageKey: image.storageKey,
                    status: "ready",
                    errorMessage: "",
                    character: { ...nextProfile, masterViews: [...nextProfile.masterViews, image].slice(-4) },
                };
            });
            if (stopRequestedRef.current) message.info("停止时任务已生成完成，结果已保留");
            else message.success("全身合成图已生成");
        } catch (error) {
            markPending(characterId, undefined);
            if (stopRequestedRef.current) message.info("已停止生成，未完成的任务已取消");
            else message.error(error instanceof Error ? error.message : "全身合成失败");
        } finally {
            task.finish();
        }
    };

    const generateCard = async (characterId: string, options?: CharacterCardOptions): Promise<boolean> => {
        const current = projectRef.current;
        if (!current || generatingKey) return false;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return false;
        const config = buildImageConfig(current);
        if (!config) return false;
        stopRequestedRef.current = false;
        setGeneratingKey("card");
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            let master = characterMasterImages(asset).slice(-1)[0];
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
                        imageUrl: generatedMaster.url,
                        storageKey: generatedMaster.storageKey,
                        status: "ready",
                        errorMessage: "",
                        character: { ...itemProfile, masterViews: [...itemProfile.masterViews, generatedMaster].slice(-4) },
                    };
                });
                controllerRef.current = null;
                taskRef.current = null;
            }
            if (stopRequestedRef.current) {
                markPending(characterId, undefined);
                message.info("已停止生成角色卡");
                return false;
            }
            const cardMaster: FilmImageRef = master;
            const latestAsset = projectRef.current?.characters?.find((item) => item.id === characterId) || asset;
            const cardAsset: FilmAsset = { ...latestAsset, imageUrl: cardMaster.url, storageKey: cardMaster.storageKey, status: "ready", character: ensureCharacterProfile(latestAsset) };
            const { card, signature } = await composeCharacterCard(cardAsset, options);
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
                    imageUrl: cardMaster.url,
                    storageKey: cardMaster.storageKey,
                    status: "ready",
                    errorMessage: "",
                    character: { ...itemProfile, card, cardSignature: signature },
                };
            });
            return true;
        } catch (error) {
            markPending(characterId, undefined);
            if (stopRequestedRef.current) message.info("已停止生成，未完成的任务已取消");
            else message.error(error instanceof Error ? error.message : "角色卡生成失败");
            return false;
        } finally {
            controllerRef.current = null;
            taskRef.current = null;
            setGeneratingKey("");
        }
    };

    const generateMissingParts = async (characterId: string) => {
        const current = projectRef.current;
        if (!current || generatingKey || batchProgress) return;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return;
        const profile = ensureCharacterProfile(asset);
        const missing = CHARACTER_PART_DEFINITIONS.filter((definition) => !profile.parts[definition.key].images.length && !profile.parts[definition.key].locked);
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

    /** 停止角色部位 / 全身合成 / 角色卡生成：中断本地等待并尽力取消账号渠道上的远端任务。 */
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

    return { generatingKey, batchProgress, generatePart, generateMissingParts, generateMaster, generateCard, stopCharacterImage };
}
