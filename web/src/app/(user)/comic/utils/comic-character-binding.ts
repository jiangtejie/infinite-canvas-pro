import { nanoid } from "nanoid";

import type { ComicCharacter, ComicCharacterReference, ComicPanel, ComicPanelCharacterBinding, ComicPanelCharacterSuggestion, ComicProject } from "../types";
import { resetComicReviewStatus, updateComicPage, updateComicPanel } from "./comic-project";

export type ComicCharacterSuggestionResolution = {
    binding?: ComicPanelCharacterBinding;
    suggestion?: ComicPanelCharacterSuggestion;
};

export function normalizeComicCastName(value: string) {
    return value.normalize("NFKC").trim();
}

export type LegacyComicBindingSuggestion = {
    characterId: string;
    characterNameSnapshot: string;
};

export function suggestLegacyPanelBindings(panel: ComicPanel, characters: ComicCharacter[]): LegacyComicBindingSuggestion[] {
    const text = normalizeComicCastName([panel.description, panel.dialogue, panel.caption].join("\n"));
    if (!text) return [];
    const boundIds = new Set(panel.characterBindings.map((binding) => binding.characterId));
    const owners = new Map<string, Set<string>>();
    for (const character of characters) {
        for (const name of [character.name, ...character.aliases]) {
            const normalized = normalizeComicCastName(name);
            if (!normalized) continue;
            const ids = owners.get(normalized) || new Set<string>();
            ids.add(character.id);
            owners.set(normalized, ids);
        }
    }
    const matchedNames = [...owners.keys()].filter((name) => text.includes(name));
    const longestNames = matchedNames.filter((name) => !matchedNames.some((other) => other.length > name.length && other.includes(name)));
    const matchedCharacters = new Map<string, { character: ComicCharacter; index: number }>();
    for (const character of characters) {
        if (boundIds.has(character.id)) continue;
        for (const name of [character.name, ...character.aliases]) {
            const normalized = normalizeComicCastName(name);
            if (!normalized || !longestNames.includes(normalized) || owners.get(normalized)?.size !== 1) continue;
            const index = text.indexOf(normalized);
            const current = matchedCharacters.get(character.id);
            if (!current || index < current.index) matchedCharacters.set(character.id, { character, index });
        }
    }
    return [...matchedCharacters.values()]
        .sort((left, right) => left.index - right.index)
        .map(({ character }) => ({ characterId: character.id, characterNameSnapshot: character.name }));
}

export function resolveComicCharacterSuggestion(characters: ComicCharacter[], characterName: string, variantName = ""): ComicCharacterSuggestionResolution {
    const target = normalizeComicCastName(characterName);
    if (!target) return {};
    const matches = characters.filter((character) => [character.name, ...character.aliases].some((name) => normalizeComicCastName(name) === target));
    if (!matches.length) return { suggestion: { characterName, reason: "unknown-character" } };
    if (matches.length > 1) return { suggestion: { characterName, reason: "ambiguous-character" } };
    const character = matches[0]!;
    if (!variantName) {
        return { binding: { characterId: character.id, source: "ai", characterNameSnapshot: character.name } };
    }
    const targetVariant = normalizeComicCastName(variantName);
    const variants = character.variants.filter((variant) => normalizeComicCastName(variant.name) === targetVariant);
    if (variants.length === 1) {
        const variant = variants[0]!;
        return { binding: { characterId: character.id, variantId: variant.id, source: "ai", characterNameSnapshot: character.name, variantNameSnapshot: variant.name } };
    }
    const belongsElsewhere = variants.length === 0 && characters.some((other) => other.id !== character.id && other.variants.some((variant) => normalizeComicCastName(variant.name) === targetVariant));
    return { suggestion: { characterName, variantName, reason: belongsElsewhere ? "variant-owner-mismatch" : "unknown-variant" } };
}

export function setComicPanelCharacterBindings(
    project: ComicProject,
    chapterId: string,
    pageId: string,
    panelId: string,
    bindings: Array<{ characterId: string; variantId?: string }>,
): ComicProject {
    const chapter = project.chapters.find((item) => item.id === chapterId);
    const page = chapter?.pages.find((item) => item.id === pageId);
    const panel = page?.panels.find((item) => item.id === panelId);
    if (!chapter || !page || !panel) return project;
    const normalized: ComicPanelCharacterBinding[] = [];
    for (const binding of bindings) {
        const character = project.characters.find((item) => item.id === binding.characterId);
        if (!character) throw new Error("角色不存在或已被删除");
        const variant = binding.variantId ? character.variants.find((item) => item.id === binding.variantId) : undefined;
        if (binding.variantId && !variant) throw new Error("变体不存在或不属于该角色");
        if (normalized.some((item) => item.characterId === character.id && item.variantId === variant?.id)) continue;
        normalized.push({
            characterId: character.id,
            variantId: variant?.id,
            source: "manual",
            characterNameSnapshot: character.name,
            variantNameSnapshot: variant?.name,
        });
    }
    const next = updateComicPanel(project, chapterId, pageId, panelId, { characterBindings: normalized });
    return updateComicPage(next, chapterId, pageId, {
        pageImage: undefined,
        compositionContext: undefined,
        reviewStatus: resetComicReviewStatus(page.reviewStatus),
    });
}

export function removeComicPanelCharacterBinding(project: ComicProject, chapterId: string, pageId: string, panelId: string, characterId: string): ComicProject {
    const page = project.chapters.find((chapter) => chapter.id === chapterId)?.pages.find((item) => item.id === pageId);
    const panel = page?.panels.find((item) => item.id === panelId);
    if (!panel?.characterBindings.some((binding) => binding.characterId === characterId)) return project;
    return setComicPanelCharacterBindings(project, chapterId, pageId, panelId, panel.characterBindings.filter((binding) => binding.characterId !== characterId));
}

function copyReference(reference: ComicCharacterReference | undefined) {
    return reference ? { ...reference, id: nanoid(), slot: { ...reference.slot, images: reference.slot.images.map((image) => ({ ...image })) } } : undefined;
}

export function copyComicCharacterForProject(source: ComicCharacter): ComicCharacter {
    return {
        ...source,
        id: nanoid(),
        aliases: [...source.aliases],
        visualIdentity: { ...source.visualIdentity },
        defaultLook: { ...source.defaultLook },
        behavior: { ...source.behavior },
        constraints: { mustKeep: [...source.constraints.mustKeep], forbidden: [...source.constraints.forbidden] },
        references: {
            primary: copyReference(source.references.primary),
            face: copyReference(source.references.face),
            fullBody: copyReference(source.references.fullBody),
        },
        variants: source.variants.map((variant) => ({
            ...variant,
            id: nanoid(),
            identityOverrides: variant.identityOverrides ? { ...variant.identityOverrides } : undefined,
            referenceImage: copyReference(variant.referenceImage),
        })),
        sourceLibraryCharacterId: source.id,
    };
}
