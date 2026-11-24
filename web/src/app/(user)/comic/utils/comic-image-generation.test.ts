import assert from "node:assert/strict";
import test from "node:test";

import { createComicCharacter, createComicPage, createComicProject } from "./comic-project";
import { assertComicPageCompositionConfirmed, buildComicPanelGenerationContext, comicPageCompositionWarnings, createComicGeneratedPanelImage, createComicGenerationContext, createComicPanelGenerationSnapshot, currentComicPanelInputSignature, isComicPanelGenerationSnapshotCurrent, resolveComicPanelImageState } from "./comic-image-generation";
import { activeComicSlotImage } from "./comic-image-slot";
import { comicPageCompositionInputSignature } from "./comic-page-composition";
import type { ComicCharacter, ComicCharacterReference } from "../types";

function reference(id: string, revision = 0): ComicCharacterReference {
    return { id, revision, slot: { images: [{ id: `${id}:image`, url: `blob:${id}`, storageKey: `image:${id}`, width: 800, height: 1000 }], activeImageId: `${id}:image` } };
}

function character(name: string, id: string, withImages = true): ComicCharacter {
    const character = createComicCharacter(1);
    character.id = id;
    character.name = name;
    character.visualIdentity.description = "短发，校服，左眉有疤";
    character.visualIdentity.face = "窄脸，深色眼睛";
    character.defaultLook.outfit = "藏青校服";
    character.defaultLook.fixedProps = "旧相机";
    character.behavior.personality = "冷静克制";
    character.behavior.speechStyle = "短句";
    character.behavior.expressionBaseline = "少笑";
    character.constraints.mustKeep = ["左眉疤", "黑发"];
    character.constraints.forbidden = ["长发"];
    character.notes = "怕水";
    if (withImages) {
        character.references.primary = reference(`${id}:primary`, 1);
        character.references.face = reference(`${id}:face`, 2);
        character.references.fullBody = reference(`${id}:full`, 3);
    }
    character.variants = [{
        id: `${id}:variant`,
        name: "校服",
        description: "故事前期",
        outfitOverride: "白衬衫与百褶裙",
        paletteOverride: "藏青",
        propChanges: "背着书包",
        stateDescription: "干净",
        referenceImage: reference(`${id}:variant-image`, 4),
        createdAt: "",
        updatedAt: "",
    }];
    return character;
}

test("panel context compiles only explicitly bound cast and all visual semantics", () => {
    const project = createComicProject({ title: "测试" });
    project.styleGuide = "黑白网点，强对比";
    const lin = character("林夏", "c1");
    const unbound = character("阿明", "c2");
    project.characters = [lin, unbound];
    const page = createComicPage(1);
    page.panels[0]!.description = "林夏走进旧校舍";
    page.panels[0]!.characterBindings = [{ characterId: "c1", variantId: "c1:variant", source: "manual", characterNameSnapshot: "林夏", variantNameSnapshot: "校服" }];
    const compiled = buildComicPanelGenerationContext(project, page, page.panels[0]!);
    assert.match(compiled.prompt, /黑白网点/);
    assert.match(compiled.prompt, /林夏/);
    assert.match(compiled.prompt, /短发，校服，左眉有疤/);
    assert.match(compiled.prompt, /左眉疤/);
    assert.match(compiled.prompt, /怕水/);
    assert.match(compiled.prompt, /少笑/);
    assert.match(compiled.prompt, /本次变化/);
    assert.match(compiled.prompt, /白衬衫与百褶裙/);
    assert.doesNotMatch(compiled.prompt, /阿明/);
    assert.deepEqual(compiled.referenceDescriptors.map((item) => item.role), ["character-primary", "character-variant", "character-face", "character-full-body"]);
    assert.ok(compiled.referenceDescriptors.length <= 5);
    assert.doesNotMatch(compiled.inputSignature, /data:image|blob:/);
    const repeated = buildComicPanelGenerationContext(project, page, page.panels[0]!);
    assert.equal(repeated.inputSignature, compiled.inputSignature);
    project.styleGuide = "彩色";
    assert.notEqual(buildComicPanelGenerationContext(project, page, page.panels[0]!).inputSignature, compiled.inputSignature);
});

test("reference budget prioritizes role identities, then variants, then anchor", () => {
    const project = createComicProject({ title: "预算" });
    const first = character("林夏", "c1");
    const second = character("阿明", "c2");
    project.characters = [first, second];
    const page = createComicPage(1);
    page.panels[0]!.description = "林夏和阿明站在门口";
    page.panels[0]!.characterBindings = [
        { characterId: "c1", variantId: "c1:variant", source: "manual", characterNameSnapshot: "林夏" },
        { characterId: "c2", variantId: "c2:variant", source: "manual", characterNameSnapshot: "阿明" },
    ];
    const anchor = { panelId: "anchor-panel", inputSignature: "anchor-signature", image: activeComicSlotImage(reference("anchor-image", 8).slot)! };
    const compiled = buildComicPanelGenerationContext(project, page, page.panels[0]!, { anchor, model: "m1", size: "1k" });
    assert.deepEqual(compiled.referenceDescriptors.map((item) => item.role), ["character-primary", "character-primary", "character-variant", "character-variant", "panel-anchor"]);
    assert.equal(compiled.referenceDescriptors.length, 5);
    assert.equal(compiled.referenceDescriptors[4]?.revision, "anchor-signature");
});

test("more than five bound roles keeps bindings but warns which references were omitted", () => {
    const project = createComicProject({ title: "超额" });
    project.characters = Array.from({ length: 6 }, (_, index) => character(`角色${index + 1}`, `c${index + 1}`));
    const page = createComicPage(1);
    page.panels[0]!.description = "全员合影";
    page.panels[0]!.characterBindings = project.characters.map((item) => ({ characterId: item.id, source: "manual", characterNameSnapshot: item.name }));
    const compiled = buildComicPanelGenerationContext(project, page, page.panels[0]!);
    assert.equal(compiled.referenceDescriptors.filter((item) => item.role === "character-primary").length, 5);
    assert.ok(compiled.warnings.some((warning) => warning.includes("角色6")));
    assert.equal(page.panels[0]!.characterBindings.length, 6);
});

test("missing identity references warn but do not block compilation", () => {
    const project = createComicProject({ title: "缺图" });
    const noImages = character("无名", "c1", false);
    project.characters = [noImages];
    const page = createComicPage(1);
    page.panels[0]!.description = "无名站在雨里";
    page.panels[0]!.characterBindings = [{ characterId: "c1", source: "manual", characterNameSnapshot: "无名" }];
    const compiled = buildComicPanelGenerationContext(project, page, page.panels[0]!);
    assert.deepEqual(compiled.referenceDescriptors, []);
    assert.ok(compiled.warnings.some((warning) => warning.includes("无名")));
    assert.match(compiled.prompt, /无名/);
});

test("generated panel metadata keeps the compiled context and original image fields", () => {
    const project = createComicProject({ title: "上下文" });
    const page = createComicPage(1);
    const compiled = buildComicPanelGenerationContext(project, page, page.panels[0]!);
    const context = createComicGenerationContext(compiled, {
        references: [],
        missingReferenceIds: ["missing-ref"],
        loadedDescriptors: [],
    }, { model: "m1", size: "1k" });
    const image = createComicGeneratedPanelImage({ url: "blob:image", storageKey: "image:image", width: 10, height: 20 }, context);
    assert.equal(image.url, "blob:image");
    assert.equal(image.width, 10);
    assert.equal(image.generationContext?.inputSignature, compiled.inputSignature);
    assert.deepEqual(image.generationContext?.missingReferenceIds, ["missing-ref"]);
    assert.equal(image.generationContext?.model, "m1");
});

test("page composition warnings separate stale, unrecorded and incomplete panels", () => {
    const project = createComicProject({ title: "合成" });
    const page = createComicPage(1);
    const panel = page.panels[0]!;
    const compiled = buildComicPanelGenerationContext(project, page, panel);
    const context = createComicGenerationContext(compiled, { references: [], missingReferenceIds: [], loadedDescriptors: [] });
    panel.image = createComicGeneratedPanelImage({ url: "blob:image" }, context);
    assert.deepEqual(comicPageCompositionWarnings(project, page), { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [] });
    panel.image = createComicGeneratedPanelImage({ url: "blob:image" }, { ...context, missingReferenceIds: ["ref"] });
    assert.deepEqual(comicPageCompositionWarnings(project, page).incompletePanelIds, [panel.id]);
    panel.image = createComicGeneratedPanelImage({ url: "blob:image" }, { ...context, inputSignature: "old" });
    assert.deepEqual(comicPageCompositionWarnings(project, page).stalePanelIds, [panel.id]);
    assert.throws(() => assertComicPageCompositionConfirmed(project, page, []), /确认/);
    assert.doesNotThrow(() => assertComicPageCompositionConfirmed(project, page, [panel.id]));
    panel.image = { url: "blob:image" };
    assert.deepEqual(comicPageCompositionWarnings(project, page).unrecordedPanelIds, [panel.id]);
});

test("page composition signature detects visual edits but ignores review notes", () => {
    const project = createComicProject({ title: "合成快照" });
    const page = project.chapters[0]!.pages[0]!;
    page.panels[0]!.image = { url: "blob:panel", storageKey: "image:panel" };
    const options = { model: "image-model", size: "1k" };
    const signature = comicPageCompositionInputSignature(project, page, options);
    assert.equal(comicPageCompositionInputSignature(project, { ...page, reviewNotes: "仅修改备注" }, options), signature);
    assert.equal(comicPageCompositionInputSignature({ ...project, synopsis: "仅修改梗概" }, page, options), signature);
    assert.notEqual(comicPageCompositionInputSignature(project, { ...page, panels: [{ ...page.panels[0]!, layout: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } }] }, options), signature);
    assert.notEqual(comicPageCompositionInputSignature(project, { ...page, panels: [{ ...page.panels[0]!, image: { url: "blob:replacement" } }] }, options), signature);
    assert.notEqual(comicPageCompositionInputSignature({ ...project, format: "strip" }, page, options), signature);
});

test("current signature tracks the actual panel anchor image", () => {
    const project = createComicProject({ title: "锚点" });
    const page = createComicPage(1);
    page.panels.push(createComicPage(2).panels[0]!);
    const first = page.panels[0]!;
    const second = page.panels[1]!;
    const firstCompiled = buildComicPanelGenerationContext(project, page, first);
    first.image = createComicGeneratedPanelImage({ url: "blob:first", storageKey: "image:first" }, createComicGenerationContext(firstCompiled, { references: [], missingReferenceIds: [], loadedDescriptors: [] }));
    const secondCompiled = buildComicPanelGenerationContext(project, page, second, { anchor: { panelId: first.id, inputSignature: first.image.generationContext!.inputSignature, image: first.image } });
    second.image = createComicGeneratedPanelImage({ url: "blob:second", storageKey: "image:second" }, createComicGenerationContext(secondCompiled, { references: [], missingReferenceIds: [], loadedDescriptors: secondCompiled.referenceDescriptors }));
    assert.equal(currentComicPanelInputSignature(project, page, second), second.image.generationContext?.inputSignature);
    first.image = createComicGeneratedPanelImage({ url: "blob:first-new", storageKey: "image:first-new" }, { ...first.image.generationContext!, inputSignature: "new-anchor" });
    assert.notEqual(currentComicPanelInputSignature(project, page, second), second.image.generationContext?.inputSignature);
});

test("dependent panels become stale when an anchor image changes without a new input signature", () => {
    const project = createComicProject({ title: "同签名换锚点" });
    const page = createComicPage(1);
    const first = page.panels[0]!;
    page.panels.push(createComicPage(2).panels[0]!);
    const second = page.panels[1]!;
    const firstCompiled = buildComicPanelGenerationContext(project, page, first);
    const firstContext = createComicGenerationContext(firstCompiled, { references: [], missingReferenceIds: [], loadedDescriptors: [] });
    first.image = createComicGeneratedPanelImage({ url: "blob:first", storageKey: "image:first", width: 10, height: 20 }, firstContext);
    const anchor = { panelId: first.id, inputSignature: firstContext.inputSignature, image: first.image };
    const secondCompiled = buildComicPanelGenerationContext(project, page, second, { anchor });
    second.image = createComicGeneratedPanelImage({ url: "blob:second" }, createComicGenerationContext(secondCompiled, { references: [], missingReferenceIds: [], loadedDescriptors: secondCompiled.referenceDescriptors }));
    assert.equal(currentComicPanelInputSignature(project, page, second), second.image.generationContext?.inputSignature);
    first.image = createComicGeneratedPanelImage({ url: "blob:first-new", storageKey: "image:first-new", width: 10, height: 20 }, firstContext);
    assert.notEqual(currentComicPanelInputSignature(project, page, second), second.image.generationContext?.inputSignature);
});

test("panel image state has deterministic unrecorded/stale/incomplete/current precedence", () => {
    const page = createComicPage(1);
    const panel = page.panels[0]!;
    const context = {
        inputSignature: "current",
        compilerVersion: "1",
        prompt: "prompt",
        references: [],
        missingReferenceIds: [],
        createdAt: "2026-01-01T00:00:00.000Z",
    };
    assert.equal(resolveComicPanelImageState(panel, "current"), "unrecorded");
    panel.image = { url: "blob:image", generationContext: { ...context, inputSignature: "old" } };
    assert.equal(resolveComicPanelImageState(panel, "current"), "stale");
    panel.image = { url: "blob:image", generationContext: { ...context, missingReferenceIds: ["missing"] } };
    assert.equal(resolveComicPanelImageState(panel, "current"), "incomplete");
    panel.image = { url: "blob:image", generationContext: context };
    assert.equal(resolveComicPanelImageState(panel, "current"), "current");
});

test("panel generation snapshot rejects edits to its target inputs and existing image", () => {
    const project = createComicProject({ title: "生成快照" });
    const page = project.chapters[0]!.pages[0]!;
    const panel = page.panels[0]!;
    const options = { model: "image-model", size: "1k" };
    const snapshot = createComicPanelGenerationSnapshot(project, page, panel, options);
    assert.equal(isComicPanelGenerationSnapshotCurrent(project, page, panel, snapshot, options), true);
    assert.equal(isComicPanelGenerationSnapshotCurrent({ ...project, synopsis: "无关梗概" }, page, panel, snapshot, options), true);
    assert.equal(isComicPanelGenerationSnapshotCurrent(project, page, { ...panel, description: "等待期间改画面" }, snapshot, options), false);
    assert.equal(isComicPanelGenerationSnapshotCurrent(project, page, { ...panel, layout: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }, snapshot, options), false);
    assert.equal(isComicPanelGenerationSnapshotCurrent({ ...project, styleGuide: "彩色" }, page, panel, snapshot, options), false);
    assert.equal(isComicPanelGenerationSnapshotCurrent(project, page, { ...panel, image: { url: "blob:replacement" } }, snapshot, options), false);
});

test("panel generation snapshot tracks the actual anchor image and inputs", () => {
    const project = createComicProject({ title: "锚点快照" });
    const page = project.chapters[0]!.pages[0]!;
    const first = page.panels[0]!;
    page.panels.push(createComicPage(2).panels[0]!);
    const second = page.panels[1]!;
    const options = { model: "image-model", size: "1k" };
    const firstSnapshot = createComicPanelGenerationSnapshot(project, page, first, options);
    first.image = createComicGeneratedPanelImage({ url: "blob:first", storageKey: "image:first" }, createComicGenerationContext(firstSnapshot.context, { references: [], missingReferenceIds: [], loadedDescriptors: [] }, options));
    const anchor = { panelId: first.id, inputSignature: first.image.generationContext!.inputSignature, image: first.image };
    const snapshot = createComicPanelGenerationSnapshot(project, page, second, { ...options, anchor });
    assert.equal(isComicPanelGenerationSnapshotCurrent(project, page, second, snapshot, { ...options, anchor }), true);
    const replaced = { ...project, chapters: project.chapters.map((chapter) => ({ ...chapter, pages: chapter.pages.map((item) => item.id === page.id ? { ...item, panels: item.panels.map((panel) => panel.id === first.id ? { ...panel, image: { url: "blob:new", storageKey: "image:new" } } : panel) } : item) })) };
    const replacedPage = replaced.chapters[0]!.pages[0]!;
    assert.equal(isComicPanelGenerationSnapshotCurrent(replaced, replacedPage, replacedPage.panels[1]!, snapshot, { ...options, anchor }), false);
    const edited = { ...project, chapters: project.chapters.map((chapter) => ({ ...chapter, pages: chapter.pages.map((item) => item.id === page.id ? { ...item, panels: item.panels.map((panel) => panel.id === first.id ? { ...panel, description: "锚点画面已改" } : panel) } : item) })) };
    const editedPage = edited.chapters[0]!.pages[0]!;
    assert.equal(isComicPanelGenerationSnapshotCurrent(edited, editedPage, editedPage.panels[1]!, snapshot, { ...options, anchor }), false);
});
