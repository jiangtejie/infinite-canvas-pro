import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import type { FilmAsset, FilmEpisode, FilmShot } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { createFilmAsset } from "./film-asset-factory";
import { buildFilmScriptAssetProposal, createFilmScriptAssetNode, createFilmScriptAssetNodeFromLibrary, findFilmScriptAssetNode, type FilmAssetLibrary } from "./film-script-assets";

const scriptNode = (): CanvasNodeData => ({
    id: "script",
    type: CanvasNodeType.FilmScript,
    title: "剧本",
    position: { x: 100, y: 100 },
    width: 520,
    height: 380,
    metadata: { status: "idle", filmScript: { text: "剧本", parseSnapshots: [] } },
});

const projectAssetNode = (id: string, kind: "character" | "location", name: string, aliases: string[] = []): CanvasNodeData => {
    const key = kind === "character" ? "filmCharacter" : "filmLocation";
    return {
        id,
        type: kind === "character" ? CanvasNodeType.FilmCharacter : CanvasNodeType.FilmLocation,
        title: name,
        position: { x: 0, y: 0 },
        width: 360,
        height: 420,
        metadata: { status: "idle", [key]: { asset: { ...createFilmAsset(kind, 1), id: `${id}-asset`, name, aliases } } },
    };
};

const shot = (id: string, description: string): FilmShot => ({
    id,
    shotNo: id,
    shotType: "中景",
    cameraMovement: "固定",
    duration: 4,
    description,
    dialogue: "",
    audio: "",
    prompt: description,
    characterBindings: [],
    propBindings: [],
});

const episodes = (): FilmEpisode[] => [{
    id: "ep-1",
    title: "第 1 集",
    scenes: [
        { id: "sc1", name: "咖啡馆", location: "旧城咖啡馆", time: "夜", mood: "", shots: [shot("a1", "沈迟把钥匙放在桌上"), shot("a2", "沈迟看向窗外")] },
        { id: "sc2", name: "仓库", location: "旧仓库", time: "夜", mood: "", shots: [shot("b1", "阿青推门进来")] },
    ],
}];

const suggestion = (kind: FilmAssetSuggestion["kind"], name: string, aliases: string[] = []): FilmAssetSuggestion => ({
    key: `${kind}:${name}`,
    kind,
    name,
    aliases,
    description: `${name} 设定`,
    visualPrompt: `${name} 外观`,
});

test("builds the asset proposal against dedicated nodes and proposed shots", () => {
    const nodes = [scriptNode(), projectAssetNode("char-old", "character", "沈迟", ["老沈"])];
    const proposal = buildFilmScriptAssetProposal([
        suggestion("character", "沈迟", ["老沈"]),
        suggestion("location", "旧城咖啡馆"),
        suggestion("prop", "钥匙"),
        suggestion("costume", "红围巾"),
    ], nodes, episodes());
    assert.equal(proposal.items[0].existingNodeId, "char-old");
    assert.deepEqual(proposal.items[0].mentionShotIds, ["a1", "a2"]);
    assert.deepEqual(proposal.items[1].mentionShotIds, ["a1", "a2"]);
    assert.deepEqual(proposal.items[2].mentionShotIds, ["a1"]);
    assert.deepEqual(proposal.items[3].mentionShotIds, []);
    assert.deepEqual(proposal.totals, { assets: 4, existing: 1, library: 0, mentions: 2, byKind: { character: 1, location: 1, prop: 1, costume: 1 } });
});

test("creates dedicated context nodes instead of generic film assets", () => {
    const character = createFilmScriptAssetNode("character", suggestion("character", "阿青"), { x: -340, y: 100 }, 2);
    const location = createFilmScriptAssetNode("location", suggestion("location", "旧城咖啡馆"), { x: -340, y: 520 }, 1);
    const prop = createFilmScriptAssetNode("prop", suggestion("prop", "钥匙"), { x: -340, y: 940 }, 1);
    assert.deepEqual([character.type, location.type, prop.type], [CanvasNodeType.FilmCharacter, CanvasNodeType.FilmLocation, CanvasNodeType.FilmProp]);
    assert.deepEqual([character.metadata?.filmCharacter?.asset.name, location.metadata?.filmLocation?.asset.name, prop.metadata?.filmProp?.asset.name], ["阿青", "旧城咖啡馆", "钥匙"]);
    assert.equal(character.title, "阿青");
    assert.equal(character.position.x, -340);
});

test("finds an existing node by same category and alias but ignores costumes", () => {
    const nodes = [scriptNode(), projectAssetNode("char-old", "character", "沈迟", ["老沈"]), projectAssetNode("loc-old", "location", "旧城咖啡馆")];
    assert.equal(findFilmScriptAssetNode(nodes, suggestion("character", "老沈"))?.id, "char-old");
    assert.equal(findFilmScriptAssetNode(nodes, suggestion("location", "旧城咖啡馆"))?.id, "loc-old");
    assert.equal(findFilmScriptAssetNode(nodes, suggestion("character", "旧城咖啡馆")), undefined);
    assert.equal(findFilmScriptAssetNode(nodes, suggestion("costume", "沈迟")), undefined);
});

test("aliases from an accepted merge resolve both names to the same canvas asset", () => {
    const nodes = [scriptNode(), projectAssetNode("char-1", "character", "小王", ["王队长"])];
    const proposal = buildFilmScriptAssetProposal([suggestion("character", "小王"), suggestion("character", "王队长")], nodes, []);
    assert.equal(proposal.items[0].existingNodeId, "char-1");
    assert.equal(proposal.items[1].existingNodeId, "char-1");
    assert.equal(proposal.totals.existing, 2);
});

const libraryEntry = (kind: "character" | "location" | "prop" | "costume", name: string, aliases: string[] = []): FilmAsset => ({
    ...createFilmAsset(kind, 1),
    name,
    aliases,
});

const emptyLibrary = (): FilmAssetLibrary => ({ character: [], location: [], prop: [], costume: [], style: [] });

test("matches a library asset by name or alias before creating a new one", () => {
    const library = emptyLibrary();
    library.character = [libraryEntry("character", "沈迟", ["老沈"])];
    const proposal = buildFilmScriptAssetProposal([suggestion("character", "老沈")], [], [], library);
    const item = proposal.items[0];
    assert.equal(item.match, "library");
    assert.equal(item.libraryAsset?.name, "沈迟");
    assert.equal(proposal.totals.library, 1);
    assert.equal(proposal.totals.existing, 0);
});

test("canvas assets keep priority over library matches", () => {
    const library = emptyLibrary();
    library.character = [libraryEntry("character", "沈迟")];
    const nodes = [scriptNode(), projectAssetNode("char-old", "character", "沈迟")];
    const proposal = buildFilmScriptAssetProposal([suggestion("character", "沈迟")], nodes, [], library);
    assert.equal(proposal.items[0].match, "canvas");
    assert.equal(proposal.items[0].existingNodeId, "char-old");
    assert.equal(proposal.totals.library, 0);
});

test("cross-category same names surface a warning instead of silently creating", () => {
    const library = emptyLibrary();
    library.prop = [libraryEntry("prop", "钥匙")];
    const proposal = buildFilmScriptAssetProposal([suggestion("costume", "钥匙")], [], [], library);
    assert.equal(proposal.items[0].match, "new");
    assert.ok(proposal.items[0].categoryConflict?.includes("道具"));
    assert.ok(proposal.items[0].categoryConflict?.includes("服装"));
});

test("library copies keep reference images and record the library source", () => {
    const entry = libraryEntry("character", "沈迟");
    entry.concept.images = [{ id: "concept-1", url: "https://example.com/concept.png" }];
    const applied = createFilmScriptAssetNodeFromLibrary("character", suggestion("character", "沈迟", ["老沈"]), entry, { x: 0, y: 0 });
    const asset = applied.metadata?.filmCharacter?.asset;
    assert.ok(asset);
    assert.equal(asset.sourceLibraryAssetId, entry.id);
    assert.deepEqual(asset.concept.images.map((image) => image.url), ["https://example.com/concept.png"]);
    assert.ok(asset.aliases.includes("老沈"));
    assert.notEqual(asset.id, entry.id);
});
