import assert from "node:assert/strict";
import test from "node:test";

import { parseComicBreakdown, parseComicConcept } from "./comic-ai";
import { createComicCharacter } from "./comic-project";

test("concept parser accepts fenced JSON and bounds target pages", () => {
    const concept = parseComicConcept("```json\n{\"genre\":\"都市\",\"audience\":\"大学生\",\"logline\":\"主角获得分镜能力\",\"synopsis\":\"一段完整梗概\",\"styleGuide\":\"黑白网点\",\"targetPages\":5000}\n```");
    assert.equal(concept.genre, "都市");
    assert.equal(concept.targetPages, undefined);
    assert.throws(() => parseComicConcept("{\"genre\":\"都市\"}"), /logline/);
});

test("breakdown resolves unique cast names and aliases without inventing characters", () => {
    const lin = createComicCharacter(1);
    lin.id = "c1";
    lin.name = "林夏";
    lin.aliases = ["小夏"];
    lin.variants = [{
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
    const alice = createComicCharacter(2);
    alice.id = "c2";
    alice.name = "Alice";
    const pages = parseComicBreakdown(JSON.stringify({
        pages: [{
            panels: [
                { description: "校门口", dialogue: "", caption: "", sfx: "", characters: [{ name: "小夏", variant: "校服" }, { name: "陌生人" }, { name: " Ａｌｉｃｅ " }] },
                { description: "雨中", dialogue: "", caption: "", sfx: "", characters: [{ name: "林夏", variant: "战斗服" }] },
            ],
        }],
    }), [lin, alice]);
    assert.deepEqual(pages[0]?.panels[0]?.characterBindings, [
        { characterId: "c1", variantId: "v1", source: "ai", characterNameSnapshot: "林夏", variantNameSnapshot: "校服" },
        { characterId: "c2", source: "ai", characterNameSnapshot: "Alice" },
    ]);
    assert.deepEqual(pages[0]?.panels[0]?.characterSuggestions, [{ characterName: "陌生人", reason: "unknown-character" }]);
    assert.deepEqual(pages[0]?.panels[1]?.characterBindings, []);
    assert.deepEqual(pages[0]?.panels[1]?.characterSuggestions, [{ characterName: "林夏", variantName: "战斗服", reason: "unknown-variant" }]);
});

test("breakdown keeps ambiguous names and variant ownership conflicts unresolved", () => {
    const first = createComicCharacter(1);
    first.id = "c1";
    first.name = "林夏";
    first.aliases = ["小夏"];
    const second = createComicCharacter(2);
    second.id = "c2";
    second.name = "阿明";
    second.aliases = ["小夏"];
    second.variants = [{
        id: "v2",
        name: "校服",
        description: "",
        outfitOverride: "校服",
        paletteOverride: "",
        propChanges: "",
        stateDescription: "",
        createdAt: "",
        updatedAt: "",
    }];
    const pages = parseComicBreakdown(JSON.stringify({
        pages: [{
            panels: [
                { description: "", dialogue: "", caption: "", sfx: "", characters: [{ name: "小夏" }] },
                { description: "", dialogue: "", caption: "", sfx: "", characters: [{ name: "林夏", variant: "校服" }] },
            ],
        }],
    }), [first, second]);
    assert.deepEqual(pages[0]?.panels[0]?.characterBindings, []);
    assert.deepEqual(pages[0]?.panels[0]?.characterSuggestions, [{ characterName: "小夏", reason: "ambiguous-character" }]);
    assert.deepEqual(pages[0]?.panels[1]?.characterSuggestions, [{ characterName: "林夏", variantName: "校服", reason: "variant-owner-mismatch" }]);
});

test("breakdown parser builds pages and panels with stable field bounds", () => {
    const pages = parseComicBreakdown(JSON.stringify({
        pages: [
            { title: "第 1 页", summary: "开场", panels: [{ description: "广角校园", dialogue: "早上好", caption: "", sfx: "叮" }, { description: "特写", dialogue: "", caption: "心里一紧", sfx: "" }] },
            { summary: "转折", panels: [{ description: "人物转身", dialogue: "等一下", caption: "", sfx: "" }] },
        ],
    }));
    assert.equal(pages.length, 2);
    assert.equal(pages[0]?.title, "第 1 页");
    assert.equal(pages[0]?.panels.length, 2);
    assert.equal(pages[1]?.title, "第 2 页");
    assert.throws(() => parseComicBreakdown("{\"pages\":[]}"), /格式不正确/);
    assert.throws(() => parseComicBreakdown("{\"pages\":[{\"panels\":[]}]}"), /缺少页格/);
});
