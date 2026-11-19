import assert from "node:assert/strict";
import test from "node:test";

import { buildFilmShotGenerationContext, resolveFilmMediaContextState } from "./film-shot-generation";
import { createEmptyCharacterProfile } from "./film-character";
import type { FilmAsset, FilmContinuitySheet, FilmGenerationContext, FilmMediaVersion, FilmProject, FilmShot, FilmShotCharacterBinding } from "@/lib/film/types";

const imageSlot = (id: string, storageKey?: string) => ({ images: [{ id: `${id}-img`, url: `${id}.png`, storageKey }], locked: false });

const character = (id: string, name: string, overrides: Partial<FilmAsset> = {}): FilmAsset => ({
    id, name, aliases: [], description: `${name}的描述`, visualPrompt: "", status: "ready", concept: { images: [], locked: false },
    character: { ...createEmptyCharacterProfile(), master: imageSlot(id, `image:${id}`) },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

const shot = (id: string, overrides: Partial<FilmShot> = {}): FilmShot => ({
    id, shotNo: id, shotType: "MS", cameraMovement: "", duration: 5, description: "画面描述", dialogue: "", audio: "", prompt: "",
    characterBindings: [], propBindings: [], ...overrides,
});

const project = (overrides: Partial<FilmProject> = {}): FilmProject => ({
    id: "p1", title: "测试", visualStyle: "", aspect: "16:9", stylePreset: "custom", stage: "storyboard", scriptText: "",
    episodes: [], characters: [], locations: [], props: [], costumes: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

const binding = (characterId: string, name: string, extra: Partial<FilmShotCharacterBinding> = {}): FilmShotCharacterBinding => ({
    characterId, source: "manual", characterNameSnapshot: name, continuity: {}, ...extra,
});

const sheet = (overrides: Partial<FilmContinuitySheet> = {}): FilmContinuitySheet => ({
    shotNo: "s1", version: "v1", prevFrameSummary: "", nextFrameRequirement: "", characterState: "", propState: "",
    environment: "", cameraParams: "", audioState: "", emotionNarrative: "", risks: "", forbidden: "", referenceAssets: "", ...overrides,
});

const imageOpts = { medium: "image" as const, maxReferences: 6 };

test("角色身份、造型状态与镜头连续性编译进提示词", () => {
    const profile = createEmptyCharacterProfile();
    profile.states = [{ id: "injured", name: "受伤", description: "额头有伤", costumeId: "cos1", condition: "左臂受伤", heldPropIds: ["prop1"], look: { images: [], locked: false } }];
    const c = character("c1", "沈星晴", { character: profile, description: "红色短发" });
    const costume = character("cos1", "破损外套");
    const prop = character("prop1", "鱼");
    const s = shot("s1", { characterBindings: [binding("c1", "沈星晴", { stateId: "injured", stateNameSnapshot: "受伤", continuity: { emotion: "克制", intentionalChange: "外套被雨淋湿" } })] });
    const ctx = buildFilmShotGenerationContext(project({ characters: [c], costumes: [costume], props: [prop] }), s, imageOpts);
    assert.match(ctx.prompt, /红色短发/);
    assert.match(ctx.prompt, /受伤/);
    assert.match(ctx.prompt, /破损外套/);
    assert.match(ctx.prompt, /克制/);
    assert.match(ctx.prompt, /外套被雨淋湿/);
    assert.equal(ctx.characters[0].stateName, "受伤");
    assert.equal(ctx.characters[0].characterSignature.length > 0, true);
});

test("图片与视频共用同一段角色身份文本", () => {
    const c = character("c1", "沈星晴");
    const s = shot("s1", { characterBindings: [binding("c1", "沈星晴")] });
    const p = project({ characters: [c] });
    const image = buildFilmShotGenerationContext(p, s, imageOpts);
    const video = buildFilmShotGenerationContext(p, s, { medium: "video", maxReferences: 8, videoMode: "reference" });
    assert.equal(image.characters[0].prompt, video.characters[0].prompt);
});

test("相同输入签名稳定，角色设定与参考图变化都会改变签名", () => {
    const c = character("c1", "沈星晴");
    const s = shot("s1", { characterBindings: [binding("c1", "沈星晴")] });
    const p = project({ characters: [c] });
    const base = buildFilmShotGenerationContext(p, s, imageOpts);
    assert.equal(buildFilmShotGenerationContext(p, s, imageOpts).inputSignature, base.inputSignature);
    const changedDesc = buildFilmShotGenerationContext(project({ characters: [{ ...c, description: "蓝色长发" }] }), s, imageOpts);
    assert.notEqual(changedDesc.inputSignature, base.inputSignature);
    const changedImage = buildFilmShotGenerationContext(project({ characters: [{ ...c, character: { ...c.character!, master: imageSlot("v2", "image:v2") } }] }), s, imageOpts);
    assert.notEqual(changedImage.inputSignature, base.inputSignature);
});

test("场记、上一镜与锚点变化都会改变签名", () => {
    const c = character("c1", "沈星晴");
    const s = shot("s1", { characterBindings: [binding("c1", "沈星晴")] });
    const p = project({ characters: [c] });
    const base = buildFilmShotGenerationContext(p, s, imageOpts);
    const withSheet = buildFilmShotGenerationContext(p, { ...s, continuity: sheet({ prevFrameSummary: "上一镜末帧" }) }, imageOpts);
    assert.notEqual(withSheet.inputSignature, base.inputSignature);
    const prev = shot("prev", { imageUrl: "prev.png", storageKey: "image:prev" });
    const withPrev = buildFilmShotGenerationContext(p, s, { ...imageOpts, previousShot: prev });
    assert.equal(withPrev.previousShotId, "prev");
    assert.notEqual(withPrev.inputSignature, base.inputSignature);
    const withPrev2 = buildFilmShotGenerationContext(p, s, { ...imageOpts, previousShot: { ...prev, storageKey: "image:prev2" } });
    assert.notEqual(withPrev2.inputSignature, withPrev.inputSignature);
    const anchor = shot("anchor", { imageUrl: "anchor.png", storageKey: "image:anchor" });
    const withAnchor = buildFilmShotGenerationContext(p, s, { ...imageOpts, anchorShot: anchor });
    assert.equal(withAnchor.anchorShotId, "anchor");
    assert.notEqual(withAnchor.inputSignature, base.inputSignature);
});

test("每个绑定角色保留一张身份包参考", () => {
    const c1 = character("c1", "甲");
    const c2 = character("c2", "乙");
    const s = shot("s1", { characterBindings: [binding("c1", "甲"), binding("c2", "乙")] });
    const ctx = buildFilmShotGenerationContext(project({ characters: [c1, c2] }), s, imageOpts);
    const packages = ctx.references.filter((ref) => ref.role === "character-package");
    assert.equal(packages.length, 2);
    assert.deepEqual(packages.map((ref) => ref.characterId).sort(), ["c1", "c2"]);
});

test("绑定角色超过参考预算时明确阻断", () => {
    const chars = [character("c1", "甲"), character("c2", "乙"), character("c3", "丙")];
    const s = shot("s1", { characterBindings: chars.map((c) => binding(c.id, c.name)) });
    assert.throws(() => buildFilmShotGenerationContext(project({ characters: chars }), s, { medium: "image", maxReferences: 2 }), /超出/);
});

test("预算不足时省略次级参考并给出 warnings", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.slot = { images: [{ id: "f1", url: "face.png" }], locked: false };
    profile.master = imageSlot("c1", "image:c1");
    const c = character("c1", "甲", { character: profile });
    const loc = character("l1", "场景", { concept: imageSlot("loc", "image:loc") });
    const s = shot("s1", { shotType: "CU", description: "特写", characterBindings: [binding("c1", "甲")], locationId: "l1" });
    const ctx = buildFilmShotGenerationContext(project({ characters: [c], locations: [loc] }), s, { medium: "image", maxReferences: 2 });
    assert.equal(ctx.references.length, 2);
    assert.equal(ctx.references.some((ref) => ref.role === "location"), true);
    assert.equal(ctx.references.some((ref) => ref.role === "character-detail"), false);
    assert.equal(ctx.warnings.some((warning) => /省略|预算/.test(warning)), true);
});

test("首尾帧模式记录帧引用且保留角色文本", () => {
    const c = character("c1", "甲");
    const s = shot("s1", {
        characterBindings: [binding("c1", "甲")], videoMode: "frames",
        firstFrame: { kind: "storyboard", url: "first.png", storageKey: "image:first" },
        lastFrame: { kind: "storyboard", url: "last.png", storageKey: "image:last" },
    });
    const ctx = buildFilmShotGenerationContext(project({ characters: [c] }), s, { medium: "video", maxReferences: 8, videoMode: "frames" });
    assert.deepEqual(ctx.references.map((ref) => ref.role), ["first-frame", "last-frame"]);
    assert.equal(ctx.characters[0].references.length, 0);
    assert.match(ctx.characters[0].prompt, /甲的描述/);
});

test("视频参考模式合成时间轴并按上限分配参考", () => {
    const c = character("c1", "甲");
    const s = shot("s1", { characterBindings: [binding("c1", "甲")], videoSegments: [{ id: "seg", start: 0, end: 5, prompt: "动作" }] });
    const ctx = buildFilmShotGenerationContext(project({ characters: [c] }), s, { medium: "video", maxReferences: 8, videoMode: "reference", includeStoryboard: true });
    assert.equal(ctx.references.some((ref) => ref.role === "character-package"), true);
    assert.match(ctx.prompt, /0-5s/);
});

test("视频参考模式承接上一镜角色状态但不加上一镜参考图", () => {
    const c = character("c1", "沈星晴");
    const prev = shot("prev", { characterBindings: [binding("c1", "沈星晴", { continuity: { outfit: "破损外套", heldProps: ["鱼"] } })] });
    const s = shot("s1", { characterBindings: [binding("c1", "沈星晴")], videoSegments: [{ id: "seg", start: 0, end: 5, prompt: "动作" }] });
    const ctx = buildFilmShotGenerationContext(project({ characters: [c] }), s, { medium: "video", maxReferences: 8, videoMode: "reference", previousShot: prev });
    assert.match(ctx.prompt, /承接上一镜/);
    assert.match(ctx.prompt, /破损外套/);
    assert.equal(ctx.previousShotId, "prev");
    assert.equal(ctx.references.some((ref) => ref.role === "previous-shot"), false);
});

test("视频分段非法时阻断编译", () => {
    const s = shot("s1", { duration: 5, videoSegments: [{ id: "seg", start: 0, end: 3, prompt: "x" }] });
    assert.throws(() => buildFilmShotGenerationContext(project(), s, { medium: "video", maxReferences: 8, videoMode: "reference" }), /结束在镜头时长/);
});

const mediaVersion = (generationContext?: FilmGenerationContext): FilmMediaVersion => ({ id: "v", url: "u", createdAt: "", generationContext });
const context = (overrides: Partial<FilmGenerationContext> = {}): FilmGenerationContext => ({
    inputSignature: "sig", compilerVersion: "film-shot-gen/1", prompt: "", characters: [], references: [], missingReferenceIds: [], warnings: [], createdAt: "", ...overrides,
});

test("媒体版本状态按自身上下文派生", () => {
    assert.equal(resolveFilmMediaContextState(mediaVersion(), "sig"), "unrecorded");
    assert.equal(resolveFilmMediaContextState(mediaVersion(context({ inputSignature: "old" })), "sig"), "stale");
    assert.equal(resolveFilmMediaContextState(mediaVersion(context({ missingReferenceIds: ["r1"] })), "sig"), "incomplete");
    assert.equal(resolveFilmMediaContextState(mediaVersion(context()), "sig"), "current");
});
test("次级参考按服装、造型、道具、变体、表情/细节、风格的顺序进入预算", () => {
    const profile = createEmptyCharacterProfile();
    profile.master = imageSlot("c1", "image:c1");
    profile.parts.face.slot = { images: [{ id: "face", url: "face.png" }], locked: false };
    profile.parts.limbs.slot = { images: [{ id: "limbs", url: "limbs.png" }], locked: false };
    profile.expressions = { images: [{ id: "exp", url: "exp.png", label: "怒" }], locked: false };
    profile.states = [{ id: "s1", name: "受伤", description: "", costumeId: "cos1", condition: "", heldPropIds: ["prop1"], look: { images: [{ id: "look", url: "look.png" }], locked: false } }];
    const c = character("c1", "甲", { character: profile });
    const costume = character("cos1", "白衬衫", { concept: imageSlot("cos1", "image:cos1") });
    const prop = character("prop1", "信", { concept: imageSlot("prop1", "image:prop1") });
    const loc = character("l1", "咖啡馆", {
        concept: imageSlot("loc", "image:loc"),
        location: { variants: [{ id: "v1", name: "夜·雨", description: "", concept: imageSlot("var", "image:var") }] },
    });
    const style = character("style1", "风格圣经", { concept: imageSlot("style", "image:style") });
    const s = shot("s1", {
        shotType: "CU",
        description: "面部特写，手部握信",
        characterBindings: [binding("c1", "甲", { stateId: "s1", continuity: { emotion: "愤怒" } })],
        propBindings: [{ propId: "prop1", propNameSnapshot: "信", source: "manual" }],
        locationId: "l1",
        locationVariantId: "v1",
    });
    const ctx = buildFilmShotGenerationContext(project({ characters: [c], costumes: [costume], props: [prop], locations: [loc], style }), s, { medium: "image", maxReferences: 10 });
    const roles = ctx.references.map((ref) => ref.role);
    assert.deepEqual(roles.slice(0, 7), ["character-package", "costume", "character-state", "prop", "location-variant", "character-expression", "character-detail"]);
    assert.equal(roles[roles.length - 1], "style");
});

test("服装母版更新后角色签名与镜头输入签名都会变化", () => {
    const profile = createEmptyCharacterProfile();
    profile.master = imageSlot("c1", "image:c1");
    profile.states = [{ id: "s1", name: "正装", description: "", costumeId: "cos1", condition: "", heldPropIds: [], look: { images: [], locked: false } }];
    const c = character("c1", "甲", { character: profile });
    const costume = character("cos1", "白衬衫", { concept: imageSlot("cos1", "image:cos1") });
    const s = shot("s1", { characterBindings: [binding("c1", "甲", { stateId: "s1" })] });
    const base = buildFilmShotGenerationContext(project({ characters: [c], costumes: [costume] }), s, imageOpts);
    const updated = { ...costume, updatedAt: "2026-02-02T00:00:00.000Z" };
    const after = buildFilmShotGenerationContext(project({ characters: [c], costumes: [updated] }), s, imageOpts);
    assert.notEqual(after.characters[0].characterSignature, base.characters[0].characterSignature);
    assert.notEqual(after.inputSignature, base.inputSignature);
});

test("镜头的道具绑定与场景变体都会进入输入签名", () => {
    const c = character("c1", "甲");
    const prop = character("p1", "信", { concept: imageSlot("p1", "image:p1") });
    const baseShot = shot("s1", { characterBindings: [binding("c1", "甲")] });
    const withProp = { ...baseShot, propBindings: [{ propId: "p1", propNameSnapshot: "信", source: "manual" as const }] };
    const p = project({ characters: [c], props: [prop] });
    const withoutProp = buildFilmShotGenerationContext(p, baseShot, imageOpts);
    const bound = buildFilmShotGenerationContext(p, withProp, imageOpts);
    assert.notEqual(bound.inputSignature, withoutProp.inputSignature);
    const changedVariant = buildFilmShotGenerationContext(p, { ...withProp, locationVariantId: "v1" }, imageOpts);
    assert.notEqual(changedVariant.inputSignature, bound.inputSignature);
});
