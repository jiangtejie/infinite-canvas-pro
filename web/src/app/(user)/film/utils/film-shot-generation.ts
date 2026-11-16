import type { FilmAsset, FilmCharacterGenerationSnapshot, FilmGenerationContext, FilmGenerationReference, FilmImageRef, FilmMediaVersion, FilmProject, FilmShot, FilmShotCharacterBinding, FilmVideoMode } from "@/lib/film/types";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { CHARACTER_PART_DEFINITIONS, characterDetailImage, characterPackageImage, ensureCharacterProfile, filmCharacterSignature, findFilmCharacterState } from "./film-character";
import { formatFilmBindingContinuity, formatFilmContinuityPrompt } from "./film-continuity-sheet";
import { filmShotTypeLabel } from "./film-shot-types";
import { composeFilmVideoPrompt, createDefaultSegments, validateSegments } from "./film-video-segments";

export const FILM_GENERATION_COMPILER_VERSION = "film-shot-gen/1";
export const FILM_IMAGE_REFERENCE_LIMIT = 6;

export type FilmGenerationOptions = {
    medium: "image" | "video";
    maxReferences: number;
    previousShot?: FilmShot;
    anchorShot?: FilmShot;
    includeStoryboard?: boolean;
    videoMode?: FilmVideoMode;
};

function reference(id: string, role: FilmGenerationReference["role"], image: FilmImageRef, label: string, characterId?: string): FilmGenerationReference {
    return { id, role, revision: image.storageKey || image.id, characterId, label, image };
}

function mediaImageRef(source: { id: string; imageUrl?: string; storageKey?: string }): FilmImageRef | undefined {
    if (!source.imageUrl && !source.storageKey) return undefined;
    return { id: source.storageKey || source.imageUrl || source.id, url: source.imageUrl || "", storageKey: source.storageKey };
}

/** 图片与视频共用的单角色身份/状态/连续性文本；角色名只出现一次（在连续性行）。 */
function characterSnapshotText(asset: FilmAsset | undefined, binding: FilmShotCharacterBinding, previousBinding?: FilmShotCharacterBinding): string {
    const state = asset ? findFilmCharacterState(asset, binding.stateId) : undefined;
    const profile = asset ? ensureCharacterProfile(asset) : undefined;
    const identity = asset ? [asset.description, asset.visualPrompt, ...(profile ? CHARACTER_PART_DEFINITIONS.map((part) => profile.parts[part.key].prompt) : [])].filter(Boolean).join("；") : "";
    const stateText = state ? [state.description, state.outfit && `服装：${state.outfit}`, state.physicalCondition && `身体：${state.physicalCondition}`, state.heldProps.length && `持有：${state.heldProps.join("、")}`].filter(Boolean).join("；") : "";
    const setting = [identity, stateText].filter(Boolean).join("；");
    const continuityLine = formatFilmBindingContinuity(binding, previousBinding);
    return setting ? `${continuityLine} 设定：${setting}` : continuityLine;
}

/**
 * 唯一的镜头生成上下文编译器：纯函数，不读浏览器、不加载图片、不调用模型。
 * 为图片与视频编译同一份角色身份/状态/连续性文本、按配额与预算选择参考图、合成最终提示词并计算输入签名。
 */
export function buildFilmShotGenerationContext(project: FilmProject, shot: FilmShot, options: FilmGenerationOptions): FilmGenerationContext {
    const { medium, maxReferences, previousShot, anchorShot, includeStoryboard, videoMode } = options;
    const characters = project.characters || [];
    const locations = project.locations || [];
    const frames = medium === "video" && videoMode === "frames";
    const warnings: string[] = [];

    const snapshots: FilmCharacterGenerationSnapshot[] = [];
    const packageRefs: FilmGenerationReference[] = [];
    const stateRefs: FilmGenerationReference[] = [];
    const detailRefs: FilmGenerationReference[] = [];

    for (const binding of shot.characterBindings) {
        const asset = characters.find((item) => item.id === binding.characterId);
        const state = asset ? findFilmCharacterState(asset, binding.stateId) : undefined;
        const previousBinding = previousShot?.characterBindings.find((item) => item.characterId === binding.characterId);
        snapshots.push({
            characterId: binding.characterId,
            characterName: asset?.name || binding.characterNameSnapshot,
            characterSignature: asset ? filmCharacterSignature(asset) : "",
            stateId: state?.id,
            stateName: state?.name || binding.stateNameSnapshot,
            prompt: characterSnapshotText(asset, binding, previousBinding),
            references: [],
        });
        if (!asset) {
            warnings.push(`角色「${binding.characterNameSnapshot}」已删除，仅保留镜头连续性描述`);
            continue;
        }
        if (frames) continue;
        const packageImage = characterPackageImage(asset);
        if (packageImage) packageRefs.push(reference(`package-${asset.id}`, "character-package", packageImage, `${asset.name} 身份包`, asset.id));
        else warnings.push(`角色「${asset.name}」缺少身份参考图（角色卡或全身图）`);
        if (state?.referenceImage) stateRefs.push(reference(`state-${asset.id}`, "character-state", state.referenceImage, `${asset.name} · ${state.name}`, asset.id));
        const detailImage = characterDetailImage(asset, shot);
        if (detailImage) detailRefs.push(reference(`detail-${asset.id}`, "character-detail", detailImage, `${asset.name} 细节`, asset.id));
    }

    const locationAsset = shot.locationId ? locations.find((item) => item.id === shot.locationId) : undefined;
    const locationText = locationAsset ? `场景：${locationAsset.name}${locationAsset.description ? `（${locationAsset.description}）` : ""}` : "";

    let references: FilmGenerationReference[];
    if (frames) {
        references = [];
        if (shot.firstFrame && (shot.firstFrame.url || shot.firstFrame.storageKey)) {
            references.push(reference(`${shot.id}-first`, "first-frame", { id: shot.firstFrame.versionId || shot.firstFrame.storageKey || shot.firstFrame.url, url: shot.firstFrame.url, storageKey: shot.firstFrame.storageKey }, "首帧"));
        }
        if (shot.lastFrame && (shot.lastFrame.url || shot.lastFrame.storageKey)) {
            references.push(reference(`${shot.id}-last`, "last-frame", { id: shot.lastFrame.versionId || shot.lastFrame.storageKey || shot.lastFrame.url, url: shot.lastFrame.url, storageKey: shot.lastFrame.storageKey }, "尾帧"));
        }
    } else {
        if (packageRefs.length > maxReferences) {
            throw new Error(`本镜绑定 ${packageRefs.length} 个角色，超出参考图上限 ${maxReferences}，请减少出场角色或更换支持更多参考图的模型`);
        }
        const secondary: FilmGenerationReference[] = [...stateRefs, ...detailRefs];
        if (locationAsset) {
            const locationImage = mediaImageRef(locationAsset);
            if (locationImage) secondary.push(reference(`location-${locationAsset.id}`, "location", locationImage, locationAsset.name));
        }
        if (medium === "image" && previousShot) {
            const image = mediaImageRef(previousShot);
            if (image) secondary.push(reference(`previous-${previousShot.id}`, "previous-shot", image, `上一镜 ${previousShot.shotNo}`));
        }
        if (medium === "image" && anchorShot) {
            const image = mediaImageRef(anchorShot);
            if (image) secondary.push(reference(`anchor-${anchorShot.id}`, "anchor-shot", image, `锚点 ${anchorShot.shotNo}`));
        }
        if (includeStoryboard) {
            const image = mediaImageRef(shot);
            if (image) secondary.push(reference(`storyboard-${shot.id}`, "storyboard", image, `分镜图 ${shot.shotNo}`));
        }
        const remaining = maxReferences - packageRefs.length;
        const dropped = secondary.slice(remaining);
        if (dropped.length) warnings.push(`参考图预算不足，已省略：${dropped.map((ref) => ref.label).join("、")}`);
        references = [...packageRefs, ...secondary.slice(0, remaining)];
    }
    for (const snapshot of snapshots) snapshot.references = references.filter((ref) => ref.characterId === snapshot.characterId);

    const characterBlock = [...snapshots.map((snapshot) => snapshot.prompt), locationText].filter(Boolean).join("\n");
    const characterContextText = characterBlock ? `【角色与场景】\n${characterBlock}` : "";
    const styleText = resolveFilmStyleText(project);
    const continuityText = shot.continuity ? formatFilmContinuityPrompt(shot.continuity) : "";

    let prompt: string;
    if (medium === "video") {
        const segments = shot.videoSegments?.length ? shot.videoSegments : createDefaultSegments(shot.duration);
        const validation = validateSegments(segments, shot.duration);
        if (validation) throw new Error(validation);
        const composed = composeFilmVideoPrompt({
            segments,
            shotTypeLabel: filmShotTypeLabel(shot.shotType),
            cameraMovement: shot.cameraMovement || "",
            description: shot.description || "",
            videoPrompt: shot.videoPrompt || "",
            styleText,
            performance: shot.performance,
            soundDesign: shot.soundDesign,
            mode: frames ? "frames" : "reference",
            hasFirstFrame: frames && Boolean(shot.firstFrame),
            hints: "",
        });
        prompt = [continuityText, characterContextText, composed].filter(Boolean).join("\n\n");
    } else {
        const promptText = (shot.prompt || shot.description).trim();
        const styleLine = styleText ? `${promptText}\n\n视觉风格：${styleText}` : promptText;
        const previousInstruction = references.some((ref) => ref.role === "previous-shot") ? "参考图中的上一镜画面用于衔接本镜，保持人物位置、道具状态和环境光线一致。" : "";
        const anchorInstruction = references.some((ref) => ref.role === "anchor-shot") ? "与参考图中的锚点帧保持相同的色调、光线、材质与画风，角色和场景设定不要改变。" : "";
        prompt = [continuityText, styleLine, characterContextText, previousInstruction, anchorInstruction].filter(Boolean).join("\n\n");
    }

    const inputSignature = JSON.stringify({
        compilerVersion: FILM_GENERATION_COMPILER_VERSION,
        medium,
        prompt,
        characters: snapshots.map((snapshot) => ({ characterId: snapshot.characterId, characterSignature: snapshot.characterSignature, stateId: snapshot.stateId || "" })),
        references: references.map((ref) => ({ id: ref.id, role: ref.role, revision: ref.revision, characterId: ref.characterId || "" })),
        previousShotId: previousShot?.id || "",
        anchorShotId: anchorShot?.id || "",
        ...(medium === "video" ? { videoMode: videoMode || "reference", duration: shot.duration, negativePrompt: shot.negativePrompt || "" } : {}),
    });

    return {
        inputSignature,
        compilerVersion: FILM_GENERATION_COMPILER_VERSION,
        prompt,
        characters: snapshots,
        references,
        missingReferenceIds: [],
        warnings,
        previousShotId: previousShot?.id,
        anchorShotId: anchorShot?.id,
        createdAt: new Date().toISOString(),
    };
}

export type FilmMediaContextState = "unrecorded" | "stale" | "incomplete" | "current";

/** 按版本自身的生成上下文派生当前性：不持久化额外 stale 标记，旧版本不被当前镜头状态覆盖。 */
export function resolveFilmMediaContextState(version: FilmMediaVersion, currentSignature: string): FilmMediaContextState {
    const context = version.generationContext;
    if (!context) return "unrecorded";
    if (context.inputSignature !== currentSignature) return "stale";
    if (context.missingReferenceIds.length) return "incomplete";
    return "current";
}