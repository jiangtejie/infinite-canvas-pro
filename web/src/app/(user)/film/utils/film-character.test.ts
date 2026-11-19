import assert from "node:assert/strict";
import test from "node:test";

import { CHARACTER_PART_DEFINITIONS, characterDetailImage, characterMasterImages, characterPackageImage, characterProgress, characterReferenceImages, createCharacterState, createEmptyCharacterProfile, findFilmCharacterState, filmCharacterSignature, filmSignatureDigest, isCharacterCardStale } from "./film-character";
import { appendSlotImage, createFilmImageSlot, selectSlotImage } from "./film-image-slot";
import type { FilmAsset } from "@/lib/film/types";

const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({ id: "c1", name: "沈星晴", aliases: [], description: "", visualPrompt: "", status: "idle", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", concept: createFilmImageSlot(), ...overrides });

test("空角色档案包含五个部位与三个公共槽位", () => {
    const profile = createEmptyCharacterProfile();
    assert.equal(CHARACTER_PART_DEFINITIONS.length, 5);
    assert.deepEqual(Object.keys(profile.parts).sort(), ["face", "hair", "limbs", "lower", "upper"]);
    assert.equal(profile.master.locked, false);
    assert.equal(profile.card.images.length, 0);
    assert.equal(profile.expressions.images.length, 0);
    assert.deepEqual(profile.propIds, []);
});

test("全身合成图来自 master 槽位版本池", () => {
    const profile = createEmptyCharacterProfile();
    profile.master = appendSlotImage(profile.master, { id: "m1", url: "master.png" });
    const images = characterMasterImages(asset({ character: profile }));
    assert.deepEqual(images.map((image) => image.url), ["master.png"]);
    assert.deepEqual(characterMasterImages(asset()), []);
});

test("参考图按部位顺序取当前选定版本，可排除当前部位", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.slot = appendSlotImage(appendSlotImage(profile.parts.face.slot, { id: "f1", url: "face-v1.png" }), { id: "f2", url: "face-v2.png" });
    profile.parts.face.slot = selectSlotImage(profile.parts.face.slot, "f1");
    profile.parts.upper.slot = appendSlotImage(profile.parts.upper.slot, { id: "u1", url: "upper.png" });
    profile.master = appendSlotImage(profile.master, { id: "m1", url: "master.png" });
    const refs = characterReferenceImages(asset({ character: profile }), { includeMaster: true });
    assert.deepEqual(refs.map((item) => item.url), ["master.png", "face-v1.png", "upper.png"]);
    const excluded = characterReferenceImages(asset({ character: profile }), { excludePart: "face" });
    assert.deepEqual(excluded.map((item) => item.url), ["upper.png"]);
});

test("身份包优先角色卡，特写追加面部细节参考", () => {
    const profile = createEmptyCharacterProfile();
    profile.card = appendSlotImage(profile.card, { id: "card", url: "card.png" });
    profile.parts.face.slot = appendSlotImage(profile.parts.face.slot, { id: "f1", url: "face.png" });
    const character = asset({ character: profile });
    assert.equal(characterPackageImage(character)?.url, "card.png");
    assert.equal(characterDetailImage(character, { shotType: "CU", description: "特写", dialogue: "" })?.url, "face.png");
    assert.equal(characterDetailImage(character, { shotType: "MS", description: "远景", dialogue: "" }), undefined);
});

test("没有角色卡时身份包回退全身图当前版本，手部镜头取四肢参考", () => {
    const profile = createEmptyCharacterProfile();
    profile.master = appendSlotImage(appendSlotImage(profile.master, { id: "m1", url: "master-v1.png" }), { id: "m2", url: "master-v2.png" });
    profile.master = selectSlotImage(profile.master, "m1");
    profile.parts.limbs.slot = appendSlotImage(profile.parts.limbs.slot, { id: "l1", url: "hand.png" });
    const character = asset({ character: profile });
    assert.equal(characterPackageImage(character)?.url, "master-v1.png");
    assert.equal(characterDetailImage(character, { shotType: "MS", description: "手部握剑", dialogue: "" })?.url, "hand.png");
});

test("角色签名覆盖视觉文字、槽位选定和造型状态设定", () => {
    const profile = createEmptyCharacterProfile();
    const character = asset({ description: "红色短发", character: profile });
    const baseline = filmCharacterSignature(character);
    assert.equal(filmCharacterSignature(character), baseline);

    const changedPartPrompt = { ...character, character: { ...profile, parts: { ...profile.parts, face: { ...profile.parts.face, prompt: "左眉有疤" } } } };
    const changedPartImage = { ...character, character: { ...profile, parts: { ...profile.parts, face: { ...profile.parts.face, slot: appendSlotImage(profile.parts.face.slot, { id: "face-v2", url: "face.png" }) } } } };
    const changedState = { ...character, character: { ...profile, states: [{ id: "injured", name: "受伤", description: "额头有伤", condition: "左臂受伤", heldPropIds: ["prop-1"], look: createFilmImageSlot() }] } };
    const changedProps = { ...character, character: { ...profile, propIds: ["prop-1"] } };
    assert.notEqual(filmCharacterSignature(changedPartPrompt), baseline);
    assert.notEqual(filmCharacterSignature(changedPartImage), baseline);
    assert.notEqual(filmCharacterSignature(changedState), baseline);
    assert.notEqual(filmCharacterSignature(changedProps), baseline);
});

test("切换当前版本会改变签名，仅评分变化不改变签名", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.slot = appendSlotImage(appendSlotImage(profile.parts.face.slot, { id: "f1", url: "face-v1.png" }), { id: "f2", url: "face-v2.png" });
    const character = asset({ character: profile });
    const selectedLatest = filmCharacterSignature(character);
    const switched = { ...character, character: { ...profile, parts: { ...profile.parts, face: { ...profile.parts.face, slot: selectSlotImage(profile.parts.face.slot, "f1") } } } };
    assert.notEqual(filmCharacterSignature(switched), selectedLatest);
    const rated = { ...character, character: { ...profile, parts: { ...profile.parts, face: { ...profile.parts.face, slot: { ...profile.parts.face.slot, images: profile.parts.face.slot.images.map((image) => ({ ...image, rating: 3 as const })) } } } } };
    assert.equal(filmCharacterSignature(rated), selectedLatest);
});

test("角色卡在设定变化后过期，生成任务状态不影响判定", () => {
    const profile = { ...createEmptyCharacterProfile(), card: appendSlotImage(createFilmImageSlot(), { id: "card", url: "card.png" }) };
    const base = asset({ description: "红色短发", character: profile });
    const character = { ...base, character: { ...profile, cardSignature: filmCharacterSignature(base) } };
    assert.equal(isCharacterCardStale(character), false);
    assert.equal(isCharacterCardStale({ ...character, description: "蓝色长发" }), true);
    assert.equal(isCharacterCardStale({ ...character, pendingTask: { kind: "image", id: "task", target: "card", startedAt: 1 } }), false);
    assert.equal(isCharacterCardStale(base), false);
});

test("设定签名短摘要稳定且可区分", () => {
    const a = filmCharacterSignature(asset({ description: "红发" }));
    const b = filmCharacterSignature(asset({ description: "蓝发" }));
    assert.equal(filmSignatureDigest(a), filmSignatureDigest(a));
    assert.notEqual(filmSignatureDigest(a), filmSignatureDigest(b));
    assert.match(filmSignatureDigest(a), /^[0-9a-f]{8}$/);
});

test("新建角色状态有独立稳定 ID 和清空字段", () => {
    const first = createCharacterState(1);
    const second = createCharacterState(2);
    assert.notEqual(first.id, second.id);
    assert.equal(first.name, "状态 1");
    assert.equal(first.condition, "");
    assert.deepEqual(first.heldPropIds, []);
    assert.equal(first.look.images.length, 0);
});

test("角色状态只由所属角色的稳定 ID 解析", () => {
    const first = asset({ id: "c1", character: { ...createEmptyCharacterProfile(), states: [{ id: "injured", name: "受伤", description: "", condition: "", heldPropIds: [], look: createFilmImageSlot() }] } });
    const second = asset({ id: "c2", character: { ...createEmptyCharacterProfile(), states: [] } });
    assert.equal(findFilmCharacterState(first, "injured")?.name, "受伤");
    assert.equal(findFilmCharacterState(second, "injured"), undefined);
});

test("进度统计包含部位、锁定、合成图、角色卡与表情", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.slot = appendSlotImage(profile.parts.face.slot, { id: "f1", url: "face.png" });
    profile.parts.face.slot.locked = true;
    profile.card = appendSlotImage(profile.card, { id: "card", url: "card.png" });
    profile.expressions = appendSlotImage(profile.expressions, { id: "e1", url: "happy.png" });
    const progress = characterProgress(asset({ character: profile }));
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 5);
    assert.equal(progress.locked, 1);
    assert.equal(progress.master, 0);
    assert.equal(progress.card, true);
    assert.equal(progress.expressions, 1);
});

test("服装与道具母版变化会改变角色签名", () => {
    const profile = createEmptyCharacterProfile();
    profile.states = [{ id: "s1", name: "正装", description: "", costumeId: "cos1", condition: "", heldPropIds: ["p1"], look: createFilmImageSlot() }];
    const character = asset({ character: profile });
    const costume = asset({ id: "cos1", name: "白衬衫" });
    const prop = asset({ id: "p1", name: "信" });
    const base = filmCharacterSignature(character, { costumes: [costume], props: [prop] });
    assert.notEqual(filmCharacterSignature(character, { costumes: [{ ...costume, updatedAt: "2026-02-02T00:00:00.000Z" }], props: [prop] }), base);
    assert.notEqual(filmCharacterSignature(character, { costumes: [costume], props: [{ ...prop, updatedAt: "2026-03-03T00:00:00.000Z" }] }), base);
});
