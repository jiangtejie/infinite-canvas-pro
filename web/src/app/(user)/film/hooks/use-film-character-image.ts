"use client";

import { useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import type { SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmCharacterPartKey, FilmImageRef, FilmProject } from "../types";
import { composeCharacterCard, type CharacterCardOptions } from "../utils/film-character-card";
import { normalizeFilmAspect } from "../utils/film-aspects";
import { CHARACTER_PART_DEFINITIONS, characterMasterImages, characterPartLabel, ensureCharacterProfile } from "../utils/film-character";
import { runImageTask } from "../utils/film-image-task";
import { compressFilmReference } from "../utils/film-image-compress";
import { resolveFilmStyleText } from "../utils/film-styles";
import { useModelConfig } from "@/hooks/use-model-config";

export type FilmCharacterGenerationKey = "" | `part:${FilmCharacterPartKey}` | "master" | "card";

const MAX_REFERENCES = 10;

export function useFilmCharacterImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const resolveModelConfig = useModelConfig();
    const [generatingKey, setGeneratingKey] = useState<FilmCharacterGenerationKey>("");
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
    const projectRef = useRef(project);
    projectRef.current = project;

    const patchCharacter = (characterId: string, updater: (asset: FilmAsset) => FilmAsset) => {
        const current = projectRef.current;
        if (!current) return;
        onUpdate({ characters: (current.characters || []).map((asset) => asset.id === characterId ? updater(asset) : asset) });
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

    const generatePart = async (characterId: string, partKey: FilmCharacterPartKey): Promise<boolean> => {
        const current = projectRef.current;
        if (!current || generatingKey) return false;
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

        setGeneratingKey(`part:${partKey}`);
        try {
            const { imageUrl, storageKey } = await runImageTask(config, prompt, references, `${characterId}-${partKey}`);
            const image: FilmImageRef = { id: nanoid(), url: imageUrl, storageKey, source: "generated", createdAt: new Date().toISOString() };
            patchCharacter(characterId, (item) => {
                const nextProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    character: {
                        ...nextProfile,
                        parts: {
                            ...nextProfile.parts,
                            [partKey]: { ...nextProfile.parts[partKey], images: [...nextProfile.parts[partKey].images, image].slice(-6) },
                        },
                    },
                };
            });
            message.success(`${characterPartLabel(partKey)}参考图已生成`);
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : `${characterPartLabel(partKey)}生成失败`);
            return false;
        } finally {
            setGeneratingKey("");
        }
    };

    const createMasterImage = async (current: FilmProject, asset: FilmAsset, config: SeedableImageConfig): Promise<FilmImageRef> => {
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
        const { imageUrl, storageKey } = await runImageTask(config, prompt, references, `${asset.id}-master`);
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

        setGeneratingKey("master");
        try {
            const image = await createMasterImage(current, asset, config);
            patchCharacter(characterId, (item) => {
                const nextProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    imageUrl: image.url,
                    storageKey: image.storageKey,
                    status: "ready",
                    character: { ...nextProfile, masterViews: [...nextProfile.masterViews, image].slice(-4) },
                };
            });
            message.success("全身合成图已生成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "全身合成失败");
        } finally {
            setGeneratingKey("");
        }
    };

    const generateCard = async (characterId: string, options?: CharacterCardOptions): Promise<boolean> => {
        const current = projectRef.current;
        if (!current || generatingKey) return false;
        const asset = current.characters?.find((item) => item.id === characterId);
        if (!asset) return false;
        const config = buildImageConfig(current);
        if (!config) return false;
        setGeneratingKey("card");
        try {
            const profile = ensureCharacterProfile(asset);
            let master = characterMasterImages(asset).slice(-1)[0];
            let nextProfile = profile;
            if (!master) {
                master = await createMasterImage(current, asset, config);
                nextProfile = { ...profile, masterViews: [...profile.masterViews, master].slice(-4) };
            }
            const cardAsset: FilmAsset = { ...asset, imageUrl: master.url, storageKey: master.storageKey, status: "ready", character: nextProfile };
            const { card, signature } = await composeCharacterCard(cardAsset, options);
            const cardMaster = master;
            patchCharacter(characterId, (item) => {
                const itemProfile = ensureCharacterProfile(item);
                return {
                    ...item,
                    imageUrl: cardMaster.url,
                    storageKey: cardMaster.storageKey,
                    status: "ready",
                    character: { ...itemProfile, masterViews: nextProfile.masterViews.length ? nextProfile.masterViews : itemProfile.masterViews, card, cardSignature: signature },
                };
            });
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "角色卡生成失败");
            return false;
        } finally {
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
        setBatchProgress({ done: 0, total: missing.length });
        let succeeded = 0;
        try {
            for (const [index, definition] of missing.entries()) {
                setBatchProgress({ done: index, total: missing.length });
                const ok = await generatePart(characterId, definition.key);
                if (ok) succeeded += 1;
                setBatchProgress({ done: index + 1, total: missing.length });
            }
        } finally {
            setBatchProgress(null);
        }
        message.success(`补齐完成：成功 ${succeeded}/${missing.length}`);
    };

    return { generatingKey, batchProgress, generatePart, generateMissingParts, generateMaster, generateCard };
}
