"use client";

import { App } from "antd";
import { nanoid } from "nanoid";

import type { FilmImageRef, FilmProject, FilmShot, FilmShotCharacterBinding } from "@/lib/film/types";
import { useAssetStore } from "@/stores/use-asset-store";
import { ensureCharacterProfile } from "../utils/film-character";
import { appendSlotImage } from "../utils/film-image-slot";
import { latestFilmAsset, latestFilmAssetPatch } from "../utils/film-live-project";

export type FilmReflowSource = {
    url: string;
    storageKey?: string;
    prompt?: string;
};

/** 镜头成果回流：把当前图追加到造型 / 服装 / 场景 / 道具槽位，或加入我的素材。 */
export function useFilmShotReflow(project: FilmProject, shot: FilmShot, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);

    const toImageRef = (source: FilmReflowSource): FilmImageRef => ({
        id: nanoid(),
        url: source.url,
        storageKey: source.storageKey,
        source: "shot",
        label: `镜头 ${shot.shotNo}`,
        prompt: source.prompt,
        notes: `来源：${shot.shotNo}`,
        createdAt: new Date().toISOString(),
    });

    const setLook = (binding: FilmShotCharacterBinding, source: FilmReflowSource) => {
        const character = latestFilmAsset(project.id, "character", binding.characterId)?.asset;
        const state = character ? ensureCharacterProfile(character).states.find((item) => item.id === binding.stateId) : undefined;
        if (!character || !state) {
            message.warning("先给该角色绑定造型状态，再设为造型参考");
            return;
        }
        const patch = latestFilmAssetPatch(project.id, "character", character.id, (latest) => {
            const profile = ensureCharacterProfile(latest);
            return {
                character: {
                    ...profile,
                    states: profile.states.map((item) => item.id === state.id ? { ...item, look: appendSlotImage(item.look, toImageRef(source)) } : item),
                },
            };
        });
        if (!patch) return;
        onUpdate(patch);
        message.success(`已设为「${character.name} · ${state.name}」造型参考`);
    };

    const setCostume = (binding: FilmShotCharacterBinding, source: FilmReflowSource) => {
        const character = latestFilmAsset(project.id, "character", binding.characterId)?.asset;
        const costumeId = character ? ensureCharacterProfile(character).states.find((item) => item.id === binding.stateId)?.costumeId : undefined;
        const costume = costumeId ? latestFilmAsset(project.id, "costume", costumeId)?.asset : undefined;
        if (!costume) {
            message.warning("该造型还没有引用服装，先到角色工作台选择服装");
            return;
        }
        const patch = latestFilmAssetPatch(project.id, "costume", costume.id, (latest) => ({
            concept: appendSlotImage(latest.concept, toImageRef(source)),
        }));
        if (!patch) return;
        onUpdate(patch);
        message.success(`已设为服装「${costume.name}」参考`);
    };

    const setScene = (source: FilmReflowSource) => {
        const location = latestFilmAsset(project.id, "location", shot.locationId || "")?.asset;
        if (!location) {
            message.warning("该镜头还没有绑定场景");
            return;
        }
        const variant = shot.locationVariantId ? location.location?.variants.find((item) => item.id === shot.locationVariantId) : undefined;
        const patch = latestFilmAssetPatch(project.id, "location", location.id, (latest) => {
            if (!variant) return { concept: appendSlotImage(latest.concept, toImageRef(source)) };
            const variants = latest.location?.variants || [];
            return { location: { variants: variants.map((item) => item.id === variant.id ? { ...item, concept: appendSlotImage(item.concept, toImageRef(source)) } : item) } };
        });
        if (!patch) return;
        onUpdate(patch);
        message.success(variant ? `已设为场景变体「${location.name} · ${variant.name}」参考` : `已设为场景「${location.name}」参考`);
    };

    const setProp = (propId: string, source: FilmReflowSource) => {
        const prop = latestFilmAsset(project.id, "prop", propId)?.asset;
        if (!prop) {
            message.warning("道具已删除");
            return;
        }
        const patch = latestFilmAssetPatch(project.id, "prop", prop.id, (latest) => ({
            concept: appendSlotImage(latest.concept, toImageRef(source)),
        }));
        if (!patch) return;
        onUpdate(patch);
        message.success(`已设为道具「${prop.name}」参考`);
    };

    const addImageToAssets = (source: FilmReflowSource) => {
        addAsset({
            kind: "image",
            title: `${project.title} · ${shot.shotNo}`,
            coverUrl: source.url,
            tags: ["影视", shot.shotNo],
            source: "film",
            data: { dataUrl: source.url, storageKey: source.storageKey, width: 0, height: 0, bytes: 0, mimeType: "image/png" },
            metadata: { source: "film", projectId: project.id, shotId: shot.id, shotNo: shot.shotNo, prompt: source.prompt },
        });
        message.success("已加入我的素材");
    };

    const addVideoToAssets = (source: FilmReflowSource) => {
        addAsset({
            kind: "video",
            title: `${project.title} · ${shot.shotNo}`,
            coverUrl: "",
            tags: ["影视", shot.shotNo],
            source: "film",
            data: { url: source.url, storageKey: source.storageKey, width: 0, height: 0, bytes: 0, mimeType: "video/mp4" },
            metadata: { source: "film", projectId: project.id, shotId: shot.id, shotNo: shot.shotNo, prompt: source.prompt },
        });
        message.success("已加入我的素材");
    };

    return { setLook, setCostume, setScene, setProp, addImageToAssets, addVideoToAssets };
}
