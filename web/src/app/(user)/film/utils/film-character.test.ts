import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { characterPackageImage, createCharacterState, createEmptyCharacterProfile, ensureCharacterProfile, findFilmCharacterState, filmCharacterSignature } from "./film-character";
import { appendSlotImage, createFilmImageSlot, selectSlotImage, updateSlotImage } from "./film-image-slot";

const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({
    id: "c1",
    name: "沈星晴",
    aliases: [],
    description: "",
    visualPrompt: "",
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    concept: createFilmImageSlot(),
    ...overrides,
});

test("空角色档案只包含参考板、道具关联与造型状态", () => {
    const profile = createEmptyCharacterProfile();
    assert.equal(profile.board.images.length, 0);
    assert.equal(profile.board.locked, false);
    assert.deepEqual(profile.propIds, []);
    assert.deepEqual(profile.states, []);
    assert.deepEqual(Object.keys(profile).sort(), ["board", "propIds", "states"]);
});

test("旧角色档案缺少参考板时自动补齐，并丢弃旧部位字段", () => {
    const legacy = { ...createEmptyCharacterProfile(), parts: { face: { slot: createFilmImageSlot() } }, master: createFilmImageSlot() } as unknown as FilmAsset["character"];
    delete (legacy as { board?: unknown }).board;
    const profile = ensureCharacterProfile(asset({ character: legacy }));
    assert.equal(profile.board.images.length, 0);
    assert.equal("parts" in profile, false);
    assert.equal("master" in profile, false);
});

test("角色身份包使用参考板当前版本与锁定状态", () => {
    const board = selectSlotImage(appendSlotImage(appendSlotImage(createFilmImageSlot(), { id: "b1", url: "b1.png" }), { id: "b2", url: "b2.png" }), "b1");
    const character = asset({ character: { ...createEmptyCharacterProfile(), board: { ...board, locked: true } } });
    assert.equal(characterPackageImage(character)?.url, "b1.png");
    assert.equal(characterPackageImage(asset()), undefined);
});

test("角色签名覆盖文字、参考板版本、造型状态与道具；评分不影响签名", () => {
    const profile = {
        ...createEmptyCharacterProfile(),
        board: appendSlotImage(createFilmImageSlot(), { id: "b1", url: "b1.png" }),
        states: [{ id: "injured", name: "受伤", description: "额头有伤", condition: "左臂受伤", heldPropIds: ["prop-1"], look: createFilmImageSlot() }],
    };
    const character = asset({ character: profile });
    const baseline = filmCharacterSignature(character);
    assert.equal(filmCharacterSignature(character), baseline);
    assert.notEqual(filmCharacterSignature({ ...character, description: "蓝色长发" }), baseline);
    assert.notEqual(filmCharacterSignature({ ...character, character: { ...profile, board: appendSlotImage(profile.board, { id: "b2", url: "b2.png" }) } }), baseline);
    assert.notEqual(filmCharacterSignature({ ...character, character: { ...profile, states: [{ ...profile.states[0], name: "重伤" }] } }), baseline);
    assert.notEqual(filmCharacterSignature({ ...character, character: { ...profile, propIds: ["prop-2"] } }), baseline);
    const rated = { ...character, character: { ...profile, board: updateSlotImage(profile.board, "b1", { rating: 3 }) } };
    assert.equal(filmCharacterSignature(rated), baseline);
});

test("造型状态有独立稳定 ID 且可按角色解析", () => {
    const first = createCharacterState(1);
    const second = createCharacterState(2);
    assert.notEqual(first.id, second.id);
    const character = asset({ character: { ...createEmptyCharacterProfile(), states: [first, second] } });
    assert.equal(findFilmCharacterState(character, second.id)?.name, "状态 2");
    assert.equal(findFilmCharacterState(character, "missing"), undefined);
    assert.equal(findFilmCharacterState(character), undefined);
});

test("服装与道具母版更新会改变角色签名", () => {
    const costume = asset({ id: "cos1", name: "白衬衫" });
    const prop = asset({ id: "prop1", name: "信" });
    const character = asset({
        character: {
            ...createEmptyCharacterProfile(),
            board: appendSlotImage(createFilmImageSlot(), { id: "b1", url: "b1.png" }),
            states: [{ id: "s1", name: "正装", description: "", costumeId: "cos1", condition: "", heldPropIds: ["prop1"], look: createFilmImageSlot() }],
        },
    });
    const base = filmCharacterSignature(character, { costumes: [costume], props: [prop] });
    assert.notEqual(filmCharacterSignature(character, { costumes: [{ ...costume, updatedAt: "2026-02-02T00:00:00.000Z" }], props: [prop] }), base);
    assert.notEqual(filmCharacterSignature(character, { costumes: [costume], props: [{ ...prop, updatedAt: "2026-03-03T00:00:00.000Z" }] }), base);
});
