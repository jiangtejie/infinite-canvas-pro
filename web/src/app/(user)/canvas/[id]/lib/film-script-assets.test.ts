import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import { applyFilmScriptAssetProposal, buildFilmScriptAssetProposal } from "./film-script-assets";

const scriptNode = (): CanvasNodeData => ({
    id: "script",
    type: CanvasNodeType.Script,
    title: "剧本",
    position: { x: 100, y: 100 },
    width: 520,
    height: 380,
    metadata: { status: "idle", filmScript: { text: "剧本", parseSnapshots: [] } },
});

const sceneNode = (): CanvasNodeData => ({
    id: "scene",
    type: CanvasNodeType.Scene,
    title: "咖啡馆",
    position: { x: 700, y: 100 },
    width: 360,
    height: 240,
    metadata: { status: "idle", filmScene: { episodeId: "e1", episodeTitle: "第 1 集", name: "咖啡馆", location: "旧城咖啡馆", time: "夜", mood: "" } },
});

const shotNode = (id: string, description: string): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Shot,
    title: id,
    position: { x: 700, y: 380 },
    width: 420,
    height: 320,
    metadata: { status: "idle", filmShot: { shotNo: id, shotType: "中景", cameraMovement: "固定", duration: 4, description, dialogue: "", audio: "", prompt: "" } as FilmShotNodeData },
});

const assetNode = (id: string, kind: "character" | "location", name: string, aliases: string[] = []): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmAsset,
    title: name,
    position: { x: 0, y: 0 },
    width: 360,
    height: 420,
    metadata: { status: "idle", filmAsset: { kind, asset: { ...createFilmAsset(kind, 1), id: `${id}-asset`, name, aliases } } },
});

const composition = (shotId: string): CanvasConnection => ({ id: `scene-${shotId}`, fromNodeId: "scene", toNodeId: shotId, kind: "composition" });

const suggestion = (kind: FilmAssetSuggestion["kind"], name: string, aliases: string[] = []): FilmAssetSuggestion => ({
    key: `${kind}:${name}`,
    kind,
    name,
    aliases,
    description: `${name} 设定`,
    visualPrompt: `${name} 外观`,
});

const baseNodes = () => [scriptNode(), sceneNode(), shotNode("s1", "沈迟把钥匙放在桌上"), shotNode("s2", "阿青推门进来")];
const baseConnections = () => [composition("s1"), composition("s2")];

test("builds proposal with existing matches and shot mentions", () => {
    const nodes = [...baseNodes(), assetNode("char-old", "character", "沈迟", ["老沈"])];
    const proposal = buildFilmScriptAssetProposal([
        suggestion("character", "沈迟", ["老沈"]),
        suggestion("location", "旧城咖啡馆"),
        suggestion("prop", "钥匙"),
    ], nodes, baseConnections());
    assert.equal(proposal.items[0].existingNodeId, "char-old");
    assert.deepEqual(proposal.items[0].mentionShotIds, ["s1"]);
    assert.deepEqual(proposal.items[1].mentionShotIds, ["s1", "s2"]);
    assert.deepEqual(proposal.items[2].mentionShotIds, ["s1"]);
    assert.deepEqual(proposal.totals, { assets: 3, existing: 1, mentions: 2, byKind: { character: 1, location: 1, prop: 1, costume: 0 } });
});

test("creates new assets beside the script and binds characters, locations and props", () => {
    const nodes = [...baseNodes(), assetNode("char-old", "character", "沈迟", ["老沈"])];
    const proposal = buildFilmScriptAssetProposal([
        suggestion("character", "沈迟", ["老沈"]),
        suggestion("location", "旧城咖啡馆"),
        suggestion("character", "阿青"),
        suggestion("costume", "红围巾"),
    ], nodes, baseConnections());
    const result = applyFilmScriptAssetProposal(scriptNode(), proposal.items, { bindToShots: true }, nodes, baseConnections());

    assert.equal(result.createdCount, 3);
    assert.equal(result.boundCount, 4);
    assert.deepEqual(result.createdNodes.map((node) => node.title), ["旧城咖啡馆", "阿青", "红围巾"]);
    assert.ok(result.createdNodes.every((node) => node.position.x === -340));
    const bindingSources = result.connections.filter((edge) => edge.kind === "binding").map((edge) => edge.data?.source);
    assert.deepEqual(bindingSources, ["ai", "ai", "ai", "ai"]);
    assert.equal(result.connections.filter((edge) => edge.kind === "binding" && edge.fromNodeId === "char-old").length, 1);
    assert.equal(result.connections.filter((edge) => edge.kind === "binding" && edge.fromNodeId === "char-old" && edge.toNodeId === "s1").length, 1);
    assert.equal(result.nodes.filter((node) => node.type === CanvasNodeType.FilmAsset).length, 4);
});

test("keeps one location per shot and can skip binding", () => {
    const oldLocation = assetNode("loc-old", "location", "老车站");
    const nodes = [...baseNodes(), oldLocation];
    const connections: CanvasConnection[] = [...baseConnections(), { id: "old-bind", fromNodeId: "loc-old", toNodeId: "s1", kind: "binding", data: { source: "manual" } }];
    const proposal = buildFilmScriptAssetProposal([suggestion("location", "旧城咖啡馆")], nodes, connections);
    const result = applyFilmScriptAssetProposal(scriptNode(), proposal.items, { bindToShots: true }, nodes, connections);
    assert.equal(result.createdCount, 1);
    assert.equal(result.boundCount, 1);
    assert.deepEqual(result.connections.filter((edge) => edge.kind === "binding" && edge.fromNodeId === result.createdNodes[0].id).map((edge) => edge.toNodeId), ["s2"]);

    const withoutBind = applyFilmScriptAssetProposal(scriptNode(), proposal.items, { bindToShots: false }, nodes, connections);
    assert.equal(withoutBind.createdCount, 1);
    assert.equal(withoutBind.boundCount, 0);
    assert.equal(withoutBind.connections.filter((edge) => edge.kind === "binding").length, 1);
});
