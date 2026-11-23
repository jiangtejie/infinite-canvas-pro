import type { FilmAsset, FilmCharacterGenerationSnapshot, FilmGenerationContext, FilmGenerationReference, FilmImageRef, FilmMediaVersion, FilmShot, FilmShotCharacterBinding, FilmVideoMode } from "@/lib/film/types";
import { directorStyleFor } from "@/lib/film/director-styles";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { characterPackageImage, filmAssetSignature, filmCharacterSignature, findFilmCharacterState } from "./film-character";
import { formatFilmBindingContinuity } from "./film-binding-continuity";
import { activeSlotImage } from "./film-image-slot";
import { buildFilmShotPrompt } from "./film-shot-prompt";
import { createDefaultSegments, validateSegments } from "./film-video-segments";

export const FILM_GENERATION_COMPILER_VERSION = "film-shot-gen/6";
export const FILM_IMAGE_REFERENCE_LIMIT = 6;

export type FilmGenerationOptions = {
    medium: "image" | "video";
    maxReferences: number;
    previousShot?: FilmShot;
    anchorShot?: FilmShot;
    includeStoryboard?: boolean;
    videoMode?: FilmVideoMode;
    sceneContext?: {
        episodeTitle: string;
        name: string;
        location: string;
        time: string;
        mood: string;
        notes?: string;
    };
};

function reference(id: string, role: FilmGenerationReference["role"], image: FilmImageRef, label: string, characterId?: string): FilmGenerationReference {
    return { id, role, revision: image.storageKey || image.id, characterId, label, image };
}

function mediaImageRef(source: { id: string; imageUrl?: string; storageKey?: string }): FilmImageRef | undefined {
    if (!source.imageUrl && !source.storageKey) return undefined;
    return { id: source.storageKey || source.imageUrl || source.id, url: source.imageUrl || "", storageKey: source.storageKey };
}

/** 图片与视频共用的单角色身份/状态/连续性文本；角色名只出现一次（在连续性行）。 */
function characterSnapshotText(project: Pick<FilmGenerationProjectContext, "costumes" | "props">, asset: FilmAsset | undefined, binding: FilmShotCharacterBinding, previousBinding?: FilmShotCharacterBinding): string {
    const state = asset ? findFilmCharacterState(asset, binding.stateId) : undefined;
    const identity = asset ? [asset.description, asset.visualPrompt].filter(Boolean).join("；") : "";
    const costume = state?.costumeId ? project.costumes?.find((item) => item.id === state.costumeId) : undefined;
    const heldProps = (state?.heldPropIds || []).map((id) => project.props?.find((item) => item.id === id)?.name || "").filter(Boolean);
    const stateText = state ? [state.description, costume && `服装：${costume.name}`, state.condition && `身体：${state.condition}`, heldProps.length && `持有：${heldProps.join("、")}`].filter(Boolean).join("；") : "";
    const setting = [identity, stateText].filter(Boolean).join("；");
    const continuityLine = formatFilmBindingContinuity(binding, previousBinding);
    return setting ? `${continuityLine} 设定：${setting}` : continuityLine;
}

export type FilmGenerationProjectContext = {
    characters?: FilmAsset[];
    locations?: FilmAsset[];
    props?: FilmAsset[];
    costumes?: FilmAsset[];
    style?: FilmAsset;
    visualStyle?: string;
    stylePreset?: string;
    directorStyleId?: string;
};

/**
 * 唯一的镜头生成上下文编译器：纯函数，不读浏览器、不加载图片、不调用模型。
 * 为图片与视频编译同一份角色身份/状态/连续性文本、按配额与预算选择参考图、合成最终提示词并计算输入签名。
 */
export function buildFilmShotGenerationContext(project: FilmGenerationProjectContext, shot: FilmShot, options: FilmGenerationOptions): FilmGenerationContext {
    const { medium, maxReferences, previousShot, anchorShot, includeStoryboard, videoMode, sceneContext } = options;
    const characters = project.characters || [];
    const locations = project.locations || [];
    const props = project.props || [];
    const costumes = project.costumes || [];
    const frames = medium === "video" && videoMode === "frames";
    const warnings: string[] = [];
    const seenImages = new Set<string>();
    const pushUnique = (list: FilmGenerationReference[], ref: FilmGenerationReference) => {
        const key = ref.image.storageKey || ref.image.id || ref.image.url;
        if (!key || seenImages.has(key)) return;
        seenImages.add(key);
        list.push(ref);
    };

    const snapshots: FilmCharacterGenerationSnapshot[] = [];
    const packageRefs: FilmGenerationReference[] = [];
    const costumeRefs: FilmGenerationReference[] = [];
    const stateRefs: FilmGenerationReference[] = [];

    for (const binding of shot.characterBindings) {
        const asset = characters.find((item) => item.id === binding.characterId);
        const state = asset ? findFilmCharacterState(asset, binding.stateId) : undefined;
        const previousBinding = previousShot?.characterBindings.find((item) => item.characterId === binding.characterId);
        snapshots.push({
            characterId: binding.characterId,
            characterName: asset?.name || binding.characterNameSnapshot,
            characterSignature: asset ? filmCharacterSignature(asset, { costumes, props }) : "",
            stateId: state?.id,
            stateName: state?.name || binding.stateNameSnapshot,
            prompt: characterSnapshotText(project, asset, binding, previousBinding),
            references: [],
        });
        if (!asset) {
            warnings.push(`角色「${binding.characterNameSnapshot}」已删除，仅保留镜头连续性描述`);
            continue;
        }
        if (frames) continue;
        const packageImage = characterPackageImage(asset);
        if (packageImage) pushUnique(packageRefs, reference(`package-${asset.id}`, "character-package", packageImage, `${asset.name} 参考板`, asset.id));
        else warnings.push(`角色「${asset.name}」缺少角色参考板`);

        const costume = state?.costumeId ? costumes.find((item) => item.id === state.costumeId) : undefined;
        if (state?.costumeId && !costume) warnings.push(`角色「${asset.name}」引用的服装已删除`);
        const costumeImage = activeSlotImage(costume?.concept);
        if (costume && costumeImage) pushUnique(costumeRefs, reference(`costume-${costume.id}`, "costume", costumeImage, `${asset.name} · ${costume.name}`, asset.id));

        const lookImage = activeSlotImage(state?.look);
        if (lookImage) pushUnique(stateRefs, reference(`state-${asset.id}`, "character-state", lookImage, `${asset.name} · ${state?.name || ""}`, asset.id));
    }

    const propRefs: FilmGenerationReference[] = [];
    for (const binding of shot.propBindings || []) {
        const prop = props.find((item) => item.id === binding.propId);
        if (!prop) {
            warnings.push(`道具「${binding.propNameSnapshot}」已删除`);
            continue;
        }
        const propImage = activeSlotImage(prop.concept);
        if (propImage) pushUnique(propRefs, reference(`prop-${prop.id}`, "prop", propImage, prop.name));
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
        const secondary: FilmGenerationReference[] = [...costumeRefs, ...stateRefs, ...propRefs];
        if (locationAsset) {
            const variant = shot.locationVariantId ? locationAsset.location?.variants.find((item) => item.id === shot.locationVariantId) : undefined;
            if (shot.locationVariantId && !variant) warnings.push("镜头绑定的场景变体已删除，回退到场景概念图");
            const variantImage = activeSlotImage(variant?.concept);
            if (variant && variantImage) {
                pushUnique(secondary, reference(`location-${locationAsset.id}-${variant.id}`, "location-variant", variantImage, `${locationAsset.name} · ${variant.name}`));
            } else {
                const locationImage = activeSlotImage(locationAsset.concept);
                if (locationImage) pushUnique(secondary, reference(`location-${locationAsset.id}`, "location", locationImage, locationAsset.name));
            }
        }
        if (medium === "image" && previousShot) {
            const image = mediaImageRef(previousShot);
            if (image) pushUnique(secondary, reference(`previous-${previousShot.id}`, "previous-shot", image, `上一镜 ${previousShot.shotNo}`));
        }
        if (medium === "image" && anchorShot) {
            const image = mediaImageRef(anchorShot);
            if (image) pushUnique(secondary, reference(`anchor-${anchorShot.id}`, "anchor-shot", image, `锚点 ${anchorShot.shotNo}`));
        }
        if (includeStoryboard) {
            const image = mediaImageRef(shot);
            if (image) pushUnique(secondary, reference(`storyboard-${shot.id}`, "storyboard", image, `分镜图 ${shot.shotNo}`));
        }
        // 风格圣经参考预算不足时最先丢，因此排在队列末尾。
        if (project.style) {
            const styleImages = [activeSlotImage(project.style.concept), ...[...project.style.concept.images].reverse()]
                .filter((image): image is FilmImageRef => Boolean(image))
                .filter((image, index, list) => list.findIndex((item) => item.id === image.id) === index)
                .slice(0, 2);
            for (const [index, image] of styleImages.entries()) {
                pushUnique(secondary, reference(`style-${project.style.id}-${image.id}`, "style", image, `风格圣经 ${index + 1}`));
            }
        }
        const remaining = maxReferences - packageRefs.length;
        const dropped = secondary.slice(remaining);
        if (dropped.length) warnings.push(`参考图预算不足，已省略：${dropped.map((ref) => ref.label).join("、")}`);
        references = [...packageRefs, ...secondary.slice(0, remaining)];
    }
    for (const snapshot of snapshots) snapshot.references = references.filter((ref) => ref.characterId === snapshot.characterId);

    const directorStyle = directorStyleFor(project.directorStyleId);
    const styleText = [
        resolveFilmStyleText(project),
        directorStyle && [directorStyle.visual, directorStyle.camera.grammar, directorStyle.camera.movement, directorStyle.prompts.imageSuffix].filter(Boolean).join("；"),
    ].filter(Boolean).join("；");
    const previousInstruction = references.some((ref) => ref.role === "previous-shot") ? "参考图中的上一镜画面用于衔接本镜，保持人物位置、道具状态和环境光线一致。" : "";
    const anchorInstruction = references.some((ref) => ref.role === "anchor-shot") ? "与参考图中的锚点帧保持相同的色调、光线、材质与画风，角色和场景设定不要改变。" : "";
    const promptBase = {
        shot,
        scene: sceneContext,
        characters: snapshots.map((snapshot) => snapshot.prompt),
        location: locationText,
        style: styleText,
        previousInstruction,
        anchorInstruction,
    };

    let prompt: string;
    if (medium === "video") {
        const segments = shot.videoSegments?.length ? shot.videoSegments : createDefaultSegments(shot.duration);
        const validation = validateSegments(segments, shot.duration);
        if (validation) throw new Error(validation);
        prompt = buildFilmShotPrompt({
            ...promptBase,
            medium: "video",
            videoSegments: segments,
            videoMode: frames ? "frames" : "reference",
            hasFirstFrame: frames && Boolean(shot.firstFrame),
            hasLastFrame: frames && Boolean(shot.lastFrame),
        });
    } else {
        prompt = buildFilmShotPrompt({ ...promptBase, medium: "image" });
    }

    const inputSignature = JSON.stringify({
        compilerVersion: FILM_GENERATION_COMPILER_VERSION,
        medium,
        prompt,
        characters: snapshots.map((snapshot) => ({ characterId: snapshot.characterId, characterSignature: snapshot.characterSignature, stateId: snapshot.stateId || "" })),
        references: references.map((ref) => ({ id: ref.id, role: ref.role, revision: ref.revision, characterId: ref.characterId || "" })),
        propBindings: (shot.propBindings || []).map((binding) => {
            const prop = props.find((item) => item.id === binding.propId);
            return { propId: binding.propId, signature: prop ? filmAssetSignature(prop) : "" };
        }),
        locationVariantId: shot.locationVariantId || "",
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