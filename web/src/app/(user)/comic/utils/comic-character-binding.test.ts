import assert from "node:assert/strict";
import test from "node:test";

import { createComicCharacter, createComicProject } from "./comic-project";
import { copyComicCharacterForProject, removeComicPanelCharacterBinding, setComicPanelCharacterBindings, suggestLegacyPanelBindings } from "./comic-character-binding";

function projectWithCast() {
    const project = createComicProject({ title: "绑定" });
    const character = createComicCharacter(1);
    character.id = "c1";
    character.name = "林夏";
    character.variants = [{
        id: "v1",
        name: "校服",
        description: "",
        outfitOverride: "校服",
        paletteOverride: "",
        propChanges: "",
        stateDescription: "",
        createdAt: "",
        updatedAt: "",
    }];
    const other = createComicCharacter(2);
    other.id = "c2";
    other.name = "阿明";
    project.characters = [character, other];
    const page = project.chapters[0]!.pages[0]!;
    const panel = page.panels[0]!;
    panel.image = {
        url: "blob:old",
        storageKey: "image:old",
        generationContext: {
            inputSignature: "old-signature",
            compilerVersion: "1",
            prompt: "old prompt",
            references: [],
            missingReferenceIds: [],
            createdAt: "2026-01-01T00:00:00.000Z",
        },
    };
    page.pageImage = { url: "blob:page", storageKey: "image:page" };
    page.compositionContext = { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [], confirmedAt: "2026-01-01T00:00:00.000Z" };
    page.reviewStatus = "approved";
    return { project, chapter: project.chapters[0]!, page, panel };
}

test("panel bindings write readable snapshots and invalidate only the composed page", () => {
    const { project, chapter, page, panel } = projectWithCast();
    const next = setComicPanelCharacterBindings(project, chapter.id, page.id, panel.id, [{ characterId: "c1", variantId: "v1" }]);
    const nextPage = next.chapters[0]!.pages[0]!;
    assert.deepEqual(nextPage.panels[0]!.characterBindings, [{ characterId: "c1", variantId: "v1", source: "manual", characterNameSnapshot: "林夏", variantNameSnapshot: "校服" }]);
    assert.equal(nextPage.panels[0]!.image?.storageKey, "image:old");
    assert.equal(nextPage.panels[0]!.image?.generationContext?.inputSignature, "old-signature");
    assert.equal(nextPage.pageImage, undefined);
    assert.equal(nextPage.compositionContext, undefined);
    assert.equal(nextPage.reviewStatus, "draft");
});

test("panel bindings reject missing characters and variants owned by another character", () => {
    const { project, chapter, page, panel } = projectWithCast();
    assert.throws(() => setComicPanelCharacterBindings(project, chapter.id, page.id, panel.id, [{ characterId: "missing" }]), /角色/);
    assert.throws(() => setComicPanelCharacterBindings(project, chapter.id, page.id, panel.id, [{ characterId: "c2", variantId: "v1" }]), /变体/);
});

test("library imports are independent character copies that keep media references", () => {
    const source = createComicCharacter(1);
    source.id = "library-1";
    source.name = "林夏";
    source.references.primary = { id: "library-1:primary", revision: 3, slot: { images: [{ id: "library-1:primary:image", url: "blob:portrait", storageKey: "image:portrait" }], activeImageId: "library-1:primary:image" } };
    source.variants = [{
        id: "library-variant-1",
        name: "校服",
        description: "",
        outfitOverride: "校服",
        paletteOverride: "",
        propChanges: "",
        stateDescription: "",
        referenceImage: { id: "library-variant-1:reference", revision: 2, slot: { images: [{ id: "library-variant-1:reference:image", url: "blob:uniform", storageKey: "image:uniform" }], activeImageId: "library-variant-1:reference:image" } },
        createdAt: "",
        updatedAt: "",
    }];
    const copy = copyComicCharacterForProject(source);
    assert.notEqual(copy.id, source.id);
    assert.equal(copy.sourceLibraryCharacterId, source.id);
    assert.notEqual(copy.variants[0]?.id, source.variants[0]?.id);
    assert.notEqual(copy.variants[0]?.referenceImage?.id, source.variants[0]?.referenceImage?.id);
    assert.equal(copy.references.primary?.id === source.references.primary?.id, false);
    assert.equal(copy.references.primary?.slot.images[0]?.storageKey, "image:portrait");
    assert.equal(copy.variants[0]?.referenceImage?.slot.images[0]?.storageKey, "image:uniform");
});

test("legacy suggestions use unique exact names and aliases without pronouns or substring collisions", () => {
    const { project, panel } = projectWithCast();
    const short = createComicCharacter(3);
    short.id = "c3";
    short.name = "林";
    project.characters.push(short);
    panel.description = "林夏和林走进教室，她看向阿明";
    panel.dialogue = "阿明：走吧";
    assert.deepEqual(suggestLegacyPanelBindings(panel, project.characters), [
        { characterId: "c1", characterNameSnapshot: "林夏" },
        { characterId: "c2", characterNameSnapshot: "阿明" },
    ]);
    panel.characterBindings = [{ characterId: "c1", source: "manual", characterNameSnapshot: "林夏" }];
    assert.deepEqual(suggestLegacyPanelBindings(panel, project.characters), [{ characterId: "c2", characterNameSnapshot: "阿明" }]);
});

test("legacy suggestions leave ambiguous aliases unresolved", () => {
    const { project, panel } = projectWithCast();
    const other = createComicCharacter(4);
    other.id = "c4";
    other.name = "阿明";
    other.aliases = ["小夏"];
    project.characters[0]!.aliases = ["小夏"];
    project.characters.push(other);
    panel.description = "小夏走过来";
    assert.deepEqual(suggestLegacyPanelBindings(panel, project.characters), []);
});

test("removing a panel binding uses the same invalidation path", () => {
    const { project, chapter, page, panel } = projectWithCast();
    const bound = setComicPanelCharacterBindings(project, chapter.id, page.id, panel.id, [{ characterId: "c1" }]);
    const next = removeComicPanelCharacterBinding(bound, chapter.id, page.id, panel.id, "c1");
    assert.deepEqual(next.chapters[0]?.pages[0]?.panels[0]?.characterBindings, []);
    assert.equal(next.chapters[0]?.pages[0]?.pageImage, undefined);
});
