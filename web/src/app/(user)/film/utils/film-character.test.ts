import assert from "node:assert/strict";
import test from "node:test";

import { CHARACTER_PART_DEFINITIONS, characterDetailImage, characterMasterImages, characterPackageImage, characterProgress, characterReferenceImages, createCharacterState, createEmptyCharacterProfile, findFilmCharacterState, filmCharacterSignature, filmSignatureDigest, isCharacterCardStale } from "./film-character";
import type { FilmAsset } from "@/lib/film/types";

const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({ id: "c1", name: "沈星晴", aliases: [], description: "", visualPrompt: "", status: "idle", createdAt: "2026-01-01T00:00:00.000Z", ...overrides });

test("空角色档案包含五个部位", () => {
    const profile = createEmptyCharacterProfile();
    assert.equal(CHARACTER_PART_DEFINITIONS.length, 5);
    assert.deepEqual(Object.keys(profile.parts).sort(), ["face", "hair", "limbs", "lower", "upper"]);
    assert.equal(profile.masterLocked, false);
});

test("旧角色没有档案时回退到主图", () => {
    const images = characterMasterImages(asset({ imageUrl: "cover.png", storageKey: "image:1" }));
    assert.equal(images.length, 1);
    assert.equal(images[0].url, "cover.png");
});

test("参考图按部位顺序收集，可排除当前部位", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.images = [{ id: "f1", url: "face.png" }];
    profile.parts.upper.images = [{ id: "u1", url: "upper.png" }];
    const refs = characterReferenceImages(asset({ character: profile }), { includeMaster: true });
    assert.deepEqual(refs.map((item) => item.url), ["face.png", "upper.png"]);
    const excluded = characterReferenceImages(asset({ character: profile }), { excludePart: "face" });
    assert.deepEqual(excluded.map((item) => item.url), ["upper.png"]);
});

test("身份包优先角色卡，特写追加面部细节参考", () => {
    const profile = createEmptyCharacterProfile();
    profile.card = { id: "card", url: "card.png" };
    profile.parts.face.images = [{ id: "f1", url: "face.png" }];
    const character = asset({ character: profile });
    assert.equal(characterPackageImage(character)?.url, "card.png");
    assert.equal(characterDetailImage(character, { shotType: "CU", description: "特写", dialogue: "" })?.url, "face.png");
    assert.equal(characterDetailImage(character, { shotType: "MS", description: "远景", dialogue: "" }), undefined);
});

test("没有角色卡时身份包回退全身图，手部/道具镜头取四肢或道具参考", () => {
    const profile = createEmptyCharacterProfile();
    profile.masterViews = [{ id: "m1", url: "master.png" }];
    profile.parts.limbs.images = [{ id: "l1", url: "hand.png" }];
    const character = asset({ character: profile });
    assert.equal(characterPackageImage(character)?.url, "master.png");
    assert.equal(characterDetailImage(character, { shotType: "MS", description: "手部握剑", dialogue: "" })?.url, "hand.png");
});

test("角色签名覆盖视觉文字、图片和造型状态设定", () => {
    const profile = createEmptyCharacterProfile();
    const character = asset({
        description: "红色短发",
        character: profile,
    });
    const baseline = filmCharacterSignature(character);
    assert.equal(filmCharacterSignature(character), baseline);

    const changedPartPrompt = { ...character, character: { ...profile, parts: { ...profile.parts, face: { ...profile.parts.face, prompt: "左眉有疤" } } } };
    const changedPartImage = { ...character, character: { ...profile, parts: { ...profile.parts, face: { ...profile.parts.face, images: [{ id: "face-v2", url: "face.png" }] } } } };
    const changedState = { ...character, character: { ...profile, states: [{ id: "injured", name: "受伤", description: "额头有伤", outfit: "破损外套", physicalCondition: "左臂受伤", heldProps: [], referenceImage: { id: "state-v1", url: "state.png" } }] } };
    assert.notEqual(filmCharacterSignature(changedPartPrompt), baseline);
    assert.notEqual(filmCharacterSignature(changedPartImage), baseline);
    assert.notEqual(filmCharacterSignature(changedState), baseline);
});

test("角色卡在设定变化后过期，生成任务状态不影响判定", () => {
    const profile = { ...createEmptyCharacterProfile(), card: { id: "card", url: "card.png" } };
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
    assert.equal(first.outfit, "");
    assert.deepEqual(first.heldProps, []);
});

test("角色状态只由所属角色的稳定 ID 解析", () => {
    const first = asset({ id: "c1", character: { ...createEmptyCharacterProfile(), states: [{ id: "injured", name: "受伤", description: "", outfit: "", physicalCondition: "", heldProps: [] }] } });
    const second = asset({ id: "c2", character: { ...createEmptyCharacterProfile(), states: [] } });
    assert.equal(findFilmCharacterState(first, "injured")?.name, "受伤");
    assert.equal(findFilmCharacterState(second, "injured"), undefined);
});

test("进度统计包含部位、锁定与合成图", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.images = [{ id: "f1", url: "face.png" }];
    profile.parts.face.locked = true;
    const progress = characterProgress(asset({ character: profile }));
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 5);
    assert.equal(progress.locked, 1);
    assert.equal(progress.master, 0);
});
