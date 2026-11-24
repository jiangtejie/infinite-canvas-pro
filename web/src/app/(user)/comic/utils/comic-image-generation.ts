import type { ReferenceImage } from "@/types/image";
import { imageToDataUrl } from "@/services/image-storage";
import type { ComicCharacter, ComicCharacterReference, ComicGeneratedPanelImage, ComicGenerationContext, ComicGenerationReference, ComicImageRef, ComicLocation, ComicPage, ComicPanel, ComicProject } from "../types";
import { activeComicSlotImage } from "./comic-image-slot";

export const COMIC_COMPILER_VERSION = "3";
const MAX_REFERENCES = 5;

export type ComicReferenceDescriptor = {
    id: string;
    revision: string;
    role: ComicGenerationReference["role"];
    image: ComicImageRef;
    imageKey: string;
    label: string;
};

export type ComicPanelAnchor = {
    panelId: string;
    inputSignature: string;
    image: ComicImageRef;
};

export type ComicPanelGenerationContext = {
    prompt: string;
    referenceDescriptors: ComicReferenceDescriptor[];
    warnings: string[];
    inputSignature: string;
    compilerVersion: string;
};

export type ComicReferenceLoadResult = {
    references: ReferenceImage[];
    missingReferenceIds: string[];
    loadedDescriptors: ComicReferenceDescriptor[];
};

export type ComicPanelGenerationOptions = {
    anchor?: ComicPanelAnchor;
    model?: string;
    size?: string;
};

function parts(values: Array<string | false | undefined>) {
    return values.filter(Boolean).join("；");
}

function characterIdentity(character: ComicCharacter) {
    return parts([
        character.visualIdentity.description,
        character.visualIdentity.ageRange && `年龄段：${character.visualIdentity.ageRange}`,
        character.visualIdentity.bodyProportions && `体型：${character.visualIdentity.bodyProportions}`,
        character.visualIdentity.face && `脸部：${character.visualIdentity.face}`,
        character.visualIdentity.hairstyle && `发型：${character.visualIdentity.hairstyle}`,
        character.visualIdentity.skinTone && `肤色：${character.visualIdentity.skinTone}`,
        character.visualIdentity.signatureFeatures && `标志：${character.visualIdentity.signatureFeatures}`,
        character.defaultLook.outfit && `默认造型：${character.defaultLook.outfit}`,
        character.defaultLook.palette && `配色：${character.defaultLook.palette}`,
        character.defaultLook.fixedProps && `固定道具：${character.defaultLook.fixedProps}`,
        character.notes && `补充：${character.notes}`,
        character.constraints.mustKeep.length ? `必须保持：${character.constraints.mustKeep.join("、")}` : "",
    ]);
}

function characterVariant(character: ComicCharacter, variantId?: string) {
    if (!variantId) return "";
    const variant = character.variants.find((item) => item.id === variantId);
    if (!variant) return "";
    return parts([
        variant.description,
        variant.identityOverrides?.description && `外观变化：${variant.identityOverrides.description}`,
        variant.outfitOverride && `服装：${variant.outfitOverride}`,
        variant.paletteOverride && `配色：${variant.paletteOverride}`,
        variant.propChanges && `道具：${variant.propChanges}`,
        variant.stateDescription && `状态：${variant.stateDescription}`,
    ]);
}

function characterBehavior(character: ComicCharacter) {
    return parts([
        character.behavior.personality,
        character.behavior.speechStyle && `说话方式：${character.behavior.speechStyle}`,
        character.behavior.expressionBaseline && `表情基调：${character.behavior.expressionBaseline}`,
        character.constraints.forbidden.length ? `禁用：${character.constraints.forbidden.join("、")}` : "",
    ]);
}

function descriptor(reference: ComicCharacterReference | undefined, role: ComicGenerationReference["role"], label: string): ComicReferenceDescriptor | null {
    const image = activeComicSlotImage(reference?.slot);
    if (!reference || !image) return null;
    return { id: reference.id, revision: String(reference.revision), role, image, imageKey: comicImageKey(image), label };
}

export function buildComicPanelGenerationContext(project: ComicProject, page: ComicPage, panel: ComicPanel, options: ComicPanelGenerationOptions = {}): ComicPanelGenerationContext {
    const warnings: string[] = [];
    const referenceDescriptors: ComicReferenceDescriptor[] = [];
    const seen = new Set<string>();
    const addReference = (item: ComicReferenceDescriptor) => {
        const key = `${item.role}:${item.id}`;
        if (seen.has(key)) return true;
        if (referenceDescriptors.length >= MAX_REFERENCES) {
            warnings.push(`${item.label}未加入参考图预算（最多 ${MAX_REFERENCES} 张）`);
            return false;
        }
        seen.add(key);
        referenceDescriptors.push(item);
        return true;
    };
    const text = `${panel.description} ${panel.dialogue} ${panel.caption}`;
    const boundCharacters: Array<{ character: ComicCharacter; variantId?: string }> = [];
    const identityLines: string[] = [];
    const variantLines: string[] = [];
    const behaviorLines: string[] = [];
    for (const binding of panel.characterBindings) {
        const character = project.characters.find((item) => item.id === binding.characterId);
        if (!character) {
            warnings.push(`已删除角色：${binding.characterNameSnapshot || binding.characterId}`);
            continue;
        }
        boundCharacters.push({ character, variantId: binding.variantId });
        const identity = characterIdentity(character);
        identityLines.push(`- ${character.name}${character.role ? `（${character.role}）` : ""}${identity ? `：${identity}` : ""}`);
        const variant = characterVariant(character, binding.variantId);
        if (binding.variantId) {
            if (variant) variantLines.push(`- ${character.name} · ${binding.variantNameSnapshot || binding.variantId}：${variant}`);
            else warnings.push(`${character.name} 的变体已失效：${binding.variantNameSnapshot || binding.variantId}`);
        }
        const behavior = characterBehavior(character);
        if (behavior) behaviorLines.push(`- ${character.name}：${behavior}`);
    }

    const matchedLocations: ComicLocation[] = project.locations.filter((location) => location.name && text.includes(location.name));
    const sceneLines = matchedLocations.map((location) => `- ${location.name}：${parts([location.description, location.atmosphere && `气氛：${location.atmosphere}`])}`);

    for (const { character } of boundCharacters) {
        const primary = descriptor(character.references.primary, "character-primary", `${character.name}主参考`);
        const face = descriptor(character.references.face, "character-face", `${character.name}脸部参考`);
        const fullBody = descriptor(character.references.fullBody, "character-full-body", `${character.name}全身参考`);
        if (primary) addReference(primary);
        else if (face) addReference(face);
        else if (fullBody) addReference(fullBody);
        else warnings.push(`${character.name} 没有可用的主/脸部/全身参考图`);
    }
    for (const { character, variantId } of boundCharacters) {
        const variant = character.variants.find((item) => item.id === variantId);
        const reference = descriptor(variant?.referenceImage, "character-variant", `${character.name}变体参考`);
        if (reference) addReference(reference);
    }
    if (boundCharacters.length === 1) {
        const character = boundCharacters[0]!.character;
        const face = descriptor(character.references.face, "character-face", `${character.name}脸部参考`);
        const fullBody = descriptor(character.references.fullBody, "character-full-body", `${character.name}全身参考`);
        if (face) addReference(face);
        if (fullBody) addReference(fullBody);
    }
    for (const location of matchedLocations) {
        const image = activeComicSlotImage(location.image);
        if (!image) continue;
        addReference({ id: `location:${location.id}`, revision: image.storageKey || image.id, role: "location", image, imageKey: comicImageKey(image), label: `${location.name}场景参考` });
    }
    if (options.anchor) {
        addReference({
            id: `panel:${options.anchor.panelId}`,
            revision: options.anchor.inputSignature || "unrecorded",
            role: "panel-anchor",
            image: options.anchor.image,
            imageKey: comicImageKey(options.anchor.image),
            label: "页内构图锚点",
        });
    }

    const prompt = [
        project.styleGuide ? `画风与表达：${project.styleGuide}` : "",
        `漫画页格画面：${panel.description || page.summary || "按本页梗概补全画面"}`,
        identityLines.length ? `角色身份（必须保持）：\n${identityLines.join("\n")}` : "",
        variantLines.length ? `本次变化（角色变体）：\n${variantLines.join("\n")}` : "",
        behaviorLines.length ? `角色表演：\n${behaviorLines.join("\n")}` : "",
        sceneLines.length ? `场景设定：\n${sceneLines.join("\n")}` : "",
        "只画画面内容，不要画对白框、旁白、拟声词或任何文字；构图要为后期贴字留出空间。",
    ].filter(Boolean).join("\n\n");

    const canonical = {
        compilerVersion: COMIC_COMPILER_VERSION,
        prompt,
        page: { id: page.id, summary: page.summary },
        panel: { id: panel.id, description: panel.description, dialogue: panel.dialogue, caption: panel.caption, layout: panel.layout || null },
        bindings: panel.characterBindings.map((binding) => {
            const character = project.characters.find((item) => item.id === binding.characterId);
            const variant = character?.variants.find((item) => item.id === binding.variantId);
            return {
                characterId: binding.characterId,
                variantId: binding.variantId || "",
                characterName: binding.characterNameSnapshot,
                variantName: binding.variantNameSnapshot || "",
                character: character ? {
                    name: character.name,
                    aliases: character.aliases,
                    role: character.role,
                    visualIdentity: character.visualIdentity,
                    defaultLook: character.defaultLook,
                    behavior: character.behavior,
                    constraints: character.constraints,
                    notes: character.notes,
                    references: Object.values(character.references).map((item) => item ? { id: item.id, revision: item.revision } : null),
                } : null,
                variant: variant ? {
                    name: variant.name,
                    description: variant.description,
                    identityOverrides: variant.identityOverrides || null,
                    outfitOverride: variant.outfitOverride,
                    paletteOverride: variant.paletteOverride,
                    propChanges: variant.propChanges,
                    stateDescription: variant.stateDescription,
                    reference: variant.referenceImage ? { id: variant.referenceImage.id, revision: variant.referenceImage.revision } : null,
                } : null,
            };
        }),
        scenes: matchedLocations.map((location) => {
            const image = activeComicSlotImage(location.image);
            return { id: location.id, name: location.name, description: location.description, atmosphere: location.atmosphere, imageKey: image?.storageKey || image?.id || "unversioned" };
        }),
        references: referenceDescriptors.map((item) => ({ id: item.id, revision: item.revision, role: item.role, ...(item.role === "panel-anchor" ? { imageKey: item.imageKey } : {}) })),
        anchor: options.anchor ? { panelId: options.anchor.panelId, inputSignature: options.anchor.inputSignature, imageKey: comicImageKey(options.anchor.image) } : null,
        model: options.model || "",
        size: options.size || "",
    };

    return {
        prompt,
        referenceDescriptors,
        warnings,
        inputSignature: JSON.stringify(canonical),
        compilerVersion: COMIC_COMPILER_VERSION,
    };
}

export type ComicPanelGenerationSnapshot = {
    context: ComicPanelGenerationContext;
    image?: ComicGeneratedPanelImage;
    anchor?: ComicPanelAnchor;
};

function comicImageKey(image?: ComicImageRef) {
    return image ? `${image.storageKey || image.url}:${image.width || ""}:${image.height || ""}` : "";
}

export function createComicPanelGenerationSnapshot(project: ComicProject, page: ComicPage, panel: ComicPanel, options: ComicPanelGenerationOptions = {}): ComicPanelGenerationSnapshot {
    return { context: buildComicPanelGenerationContext(project, page, panel, options), image: panel.image, anchor: options.anchor };
}

export function isComicPanelGenerationSnapshotCurrent(project: ComicProject, page: ComicPage, panel: ComicPanel, snapshot: ComicPanelGenerationSnapshot, options: ComicPanelGenerationOptions = {}) {
    if (comicImageKey(panel.image) !== comicImageKey(snapshot.image)) return false;
    let anchor: ComicPanelAnchor | undefined;
    if (snapshot.anchor) {
        const anchorPanel = page.panels.find((item) => item.id === snapshot.anchor!.panelId);
        if (!anchorPanel?.image) return false;
        const inputSignature = currentComicPanelInputSignature(project, page, anchorPanel, options);
        if (inputSignature !== snapshot.anchor.inputSignature || comicImageKey(anchorPanel.image) !== comicImageKey(snapshot.anchor.image)) return false;
        anchor = { panelId: anchorPanel.id, inputSignature, image: anchorPanel.image };
    }
    return buildComicPanelGenerationContext(project, page, panel, { ...options, anchor }).inputSignature === snapshot.context.inputSignature;
}

export async function loadComicPanelReferences(descriptors: ComicReferenceDescriptor[]): Promise<ComicReferenceLoadResult> {
    const references: ReferenceImage[] = [];
    const missingReferenceIds: string[] = [];
    const loadedDescriptors: ComicReferenceDescriptor[] = [];
    for (const item of descriptors) {
        try {
            const dataUrl = await imageToDataUrl({ url: item.image.url, storageKey: item.image.storageKey });
            if (!dataUrl) throw new Error("empty reference");
            references.push({ id: item.id, name: `${item.id}.png`, type: "image/png", dataUrl, storageKey: item.image.storageKey });
            loadedDescriptors.push(item);
        } catch {
            missingReferenceIds.push(item.id);
        }
    }
    return { references, missingReferenceIds, loadedDescriptors };
}

export function createComicGenerationContext(
    compiled: ComicPanelGenerationContext,
    loaded: ComicReferenceLoadResult,
    options: { model?: string; size?: string } = {},
): ComicGenerationContext {
    return {
        inputSignature: compiled.inputSignature,
        compilerVersion: compiled.compilerVersion,
        prompt: compiled.prompt,
        references: loaded.loadedDescriptors.map((item) => ({ id: item.id, revision: item.revision, role: item.role, ...(item.role === "panel-anchor" ? { imageKey: item.imageKey } : {}) })),
        missingReferenceIds: loaded.missingReferenceIds,
        model: options.model,
        size: options.size,
        createdAt: new Date().toISOString(),
    };
}

export function createComicGeneratedPanelImage(image: ComicImageRef, context: ComicGenerationContext): ComicGeneratedPanelImage {
    return { ...image, generationContext: context };
}

export function resolveComicPanelImageState(panel: ComicPanel, currentInputSignature: string): "unrecorded" | "stale" | "incomplete" | "current" {
    const context = panel.image?.generationContext;
    if (!context) return "unrecorded";
    if (context.inputSignature !== currentInputSignature) return "stale";
    if (context.missingReferenceIds.length) return "incomplete";
    return "current";
}

export function currentComicPanelInputSignature(project: ComicProject, page: ComicPage, panel: ComicPanel, options: { model?: string; size?: string } = {}) {
    const savedAnchor = panel.image?.generationContext?.references.find((item) => item.role === "panel-anchor");
    const anchorPanel = savedAnchor ? page.panels.find((item) => `panel:${item.id}` === savedAnchor.id) : undefined;
    const anchorSignature = anchorPanel?.image?.generationContext?.inputSignature || savedAnchor?.revision;
    const anchor = savedAnchor && savedAnchor.imageKey && anchorPanel?.image && anchorSignature && savedAnchor.imageKey === comicImageKey(anchorPanel.image) ? { panelId: anchorPanel.id, inputSignature: anchorSignature, image: anchorPanel.image } : undefined;
    return buildComicPanelGenerationContext(project, page, panel, { ...options, anchor }).inputSignature;
}

export type ComicPageCompositionWarnings = {
    stalePanelIds: string[];
    unrecordedPanelIds: string[];
    incompletePanelIds: string[];
};

export function comicPageCompositionWarnings(project: ComicProject, page: ComicPage, options: { model?: string; size?: string } = {}): ComicPageCompositionWarnings {
    const warnings: ComicPageCompositionWarnings = { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [] };
    for (const panel of page.panels) {
        if (!panel.image) continue;
        const state = resolveComicPanelImageState(panel, currentComicPanelInputSignature(project, page, panel, options));
        if (state === "stale") warnings.stalePanelIds.push(panel.id);
        else if (state === "unrecorded") warnings.unrecordedPanelIds.push(panel.id);
        else if (state === "incomplete") warnings.incompletePanelIds.push(panel.id);
    }
    return warnings;
}

export function assertComicPageCompositionConfirmed(project: ComicProject, page: ComicPage, confirmedPanelIds: string[], options: { model?: string; size?: string } = {}): ComicPageCompositionWarnings {
    const warnings = comicPageCompositionWarnings(project, page, options);
    const confirmed = new Set(confirmedPanelIds);
    const unconfirmed = [...warnings.stalePanelIds, ...warnings.unrecordedPanelIds].filter((id) => !confirmed.has(id));
    if (unconfirmed.length) throw new Error(`有 ${unconfirmed.length} 个页格的图与当前设定不一致或缺少生成上下文，请确认后再合成`);
    return warnings;
}
