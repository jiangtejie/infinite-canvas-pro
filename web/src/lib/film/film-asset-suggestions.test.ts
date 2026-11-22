import assert from "node:assert/strict";
import test from "node:test";

import { mergeFilmAssetSuggestions, parseFilmAssetSuggestionRows } from "./film-asset-suggestions";

test("parses chinese kinds, aliases and dedupes names", () => {
    const suggestions = parseFilmAssetSuggestionRows(`\`\`\`json
    [
      {"kind":"角色","name":"沈迟","aliases":["老沈","沈队"],"description":"刑警队长","visualPrompt":"深色风衣"},
      {"kind":"character","name":" 沈迟 ","aliases":["沈队"],"visualPrompt":"短发"},
      {"kind":"地点","name":"废弃车站","description":"终点站"},
      {"kind":"prop","name":"旧怀表"},
      {"kind":"style","name":"冷灰风格"},
      {"kind":"costume","name":""}
    ]
    \`\`\``);
    assert.deepEqual(suggestions.map((item) => [item.kind, item.name]), [["character", "沈迟"], ["location", "废弃车站"], ["prop", "旧怀表"]]);
    assert.deepEqual(suggestions[0].aliases, ["老沈", "沈队"]);
    assert.equal(suggestions[0].visualPrompt, "深色风衣");
});

test("merges duplicate suggestions across chunks and keeps first filled text", () => {
    const target = parseFilmAssetSuggestionRows(`[{"kind":"character","name":"阿青","aliases":["青姐"],"description":""}]`);
    mergeFilmAssetSuggestions(target, [{
        key: "character:阿青", kind: "character", name: "阿青", aliases: ["阿青姑娘"], description: "船娘", visualPrompt: "蓝布衫",
    }]);
    assert.equal(target.length, 1);
    assert.deepEqual(target[0].aliases, ["青姐", "阿青姑娘"]);
    assert.equal(target[0].description, "船娘");
    assert.equal(target[0].visualPrompt, "蓝布衫");
});

test("rejects responses that do not contain an array", () => {
    assert.throws(() => parseFilmAssetSuggestionRows('{"message":"没有"}'), /没有返回资产数组/);
});
