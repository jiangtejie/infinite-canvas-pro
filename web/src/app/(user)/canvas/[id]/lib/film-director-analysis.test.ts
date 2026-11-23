import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import type { FilmEpisode, FilmShot } from "@/lib/film/types";
import { scriptTextHash } from "@/lib/film/film-script-import";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmContextRole, type FilmParseSnapshot, type FilmShotNodeData } from "../../types";
import { createFilmAsset } from "./film-asset-factory";
import { applyFilmDirectorAnalysis, buildFilmDirectorAnalysis } from "./film-director-analysis";
import { undoFilmParseGraph } from "./film-script-parse";

const scriptNode = (parseSnapshots: FilmParseSnapshot[] = []): CanvasNodeData => ({
    id: "script",
    type: CanvasNodeType.FilmScript,
    title: "剧本",
    position: { x: 100, y: 100 },
    width: 520,
    height: 380,
    metadata: { status: "idle", filmScript: { text: "沈迟在旧城咖啡馆把钥匙放在桌上。\n阿青推门进来。", parseSnapshots } },
});

const sceneNode = (id: string, name: string): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmScene,
    title: name,
    position: { x: 700, y: 100 },
    width: 360,
    height: 240,
    metadata: { status: "idle", filmScene: { episodeId: "old", episodeTitle: "旧集", name, location: "", time: "", mood: "" } },
});

const shotNode = (id: string, description: string): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmShot,
    title: id,
    position: { x: 700, y: 380 },
    width: 420,
    height: 320,
    metadata: { status: "idle", filmShot: { shotNo: id, shotType: "中景", cameraMovement: "固定", duration: 4, description, dialogue: "", audio: "", prompt: "" } as FilmShotNodeData },
});

const projectAssetNode = (id: string, kind: "character" | "location" | "prop", name: string, aliases: string[] = []): CanvasNodeData => {
    const key = kind === "character" ? "filmCharacter" : kind === "location" ? "filmLocation" : "filmProp";
    return {
        id,
        type: kind === "character" ? CanvasNodeType.FilmCharacter : kind === "location" ? CanvasNodeType.FilmLocation : CanvasNodeType.FilmProp,
        title: name,
        position: { x: 0, y: 0 },
        width: 360,
        height: 420,
        metadata: { status: "idle", [key]: { asset: { ...createFilmAsset(kind, 1), id: `${id}-asset`, name, aliases } } },
    };
};

const shot = (id: string, shotNo: string, description: string): FilmShot => ({
    id,
    shotNo,
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
        { id: "sc1", name: "咖啡馆", location: "旧城咖啡馆", time: "夜", mood: "", shots: [shot("a1", "01", "沈迟把钥匙放在桌上"), shot("a2", "02", "沈迟看向窗外")] },
        { id: "sc2", name: "仓库", location: "旧仓库", time: "夜", mood: "", shots: [shot("b1", "01", "阿青推门进来")] },
    ],
}];

const suggestions = (): FilmAssetSuggestion[] => [
    { key: "character:沈迟", kind: "character", name: "沈迟", aliases: ["老沈"], description: "主角", visualPrompt: "黑风衣" },
    { key: "character:阿青", kind: "character", name: "阿青", aliases: [], description: "配角", visualPrompt: "短发" },
    { key: "location:旧城咖啡馆", kind: "location", name: "旧城咖啡馆", aliases: [], description: "主场景", visualPrompt: "暖光" },
    { key: "prop:钥匙", kind: "prop", name: "钥匙", aliases: [], description: "关键道具", visualPrompt: "铜钥匙" },
    { key: "costume:红围巾", kind: "costume", name: "红围巾", aliases: [], description: "造型", visualPrompt: "红色羊毛" },
];

const allSceneKeys = ["0:0", "0:1"];
const allAssetKeys = suggestions().map((item) => item.key);

const apply = (nodes: CanvasNodeData[], connections: CanvasConnection[], proposal: ReturnType<typeof buildFilmDirectorAnalysis>, selection: Partial<{ mode: "overwrite" | "append"; sceneKeys: string[]; assetKeys: string[]; bindMentions: boolean }> = {}) => {
    const result = applyFilmDirectorAnalysis(nodes, connections, proposal, {
        mode: selection.mode ?? "overwrite",
        sceneKeys: selection.sceneKeys ?? allSceneKeys,
        assetKeys: selection.assetKeys ?? allAssetKeys,
        bindMentions: selection.bindMentions ?? true,
    });
    if ("error" in result) throw new Error(result.error);
    return { result } as const;
};

const roleOf = (node: CanvasNodeData): FilmContextRole | null => {
    if (node.type === CanvasNodeType.FilmCharacter) return "character";
    if (node.type === CanvasNodeType.FilmLocation) return "location";
    if (node.type === CanvasNodeType.FilmProp) return "prop";
    return null;
};

test("applies only the selected scenes and keeps one atomic snapshot", () => {
    const nodes = [scriptNode(), sceneNode("old-scene", "旧场"), shotNode("old-shot", "旧镜头")];
    const connections: CanvasConnection[] = [{ id: "old-edge", fromNodeId: "old-scene", toNodeId: "old-shot", kind: "composition" }];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, connections);

    const applied = apply(nodes, connections, proposal, { sceneKeys: ["0:0"], assetKeys: [], bindMentions: false });
    const { result } = applied;
    const scenes = result.nodes.filter((node) => node.type === CanvasNodeType.FilmScene);
    const shots = result.nodes.filter((node) => node.type === CanvasNodeType.FilmShot);
    assert.equal(result.sceneCount, 1);
    assert.equal(result.shotCount, 2);
    assert.equal(scenes.length, 1);
    assert.equal(scenes[0].metadata?.filmScene?.name, "咖啡馆");
    assert.equal(shots.length, 2);
    assert.ok(shots.every((node) => node.metadata?.filmShot?.description !== "阿青推门进来"));
    assert.ok(!result.nodes.some((node) => node.id === "old-scene" || node.id === "old-shot"));
    assert.equal(result.connections.filter((edge) => edge.kind === "composition").length, 2);
    assert.equal(result.connections.filter((edge) => edge.kind === "sequence").length, 1);
    assert.equal(result.connections.filter((edge) => edge.kind === "derived" && edge.data.source === "script-analysis").length, 1);
    assert.equal(result.createdNodes.length, 3);
});

test("does not duplicate existing same-category assets and never creates costumes", () => {
    const existing = projectAssetNode("char-shen", "character", "沈迟", ["老沈"]);
    const nodes = [scriptNode(), existing];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, []);
    assert.equal(proposal.assets.items.find((item) => item.name === "沈迟")?.existingNodeId, existing.id);

    const applied = apply(nodes, [], proposal, { bindMentions: false });
    const { result } = applied;
    assert.deepEqual(result.createdAssetNodes.map((node) => node.title).sort(), ["旧城咖啡馆", "钥匙", "阿青"].sort());
    const characters = result.nodes.filter((node) => node.type === CanvasNodeType.FilmCharacter);
    assert.deepEqual(characters.map((node) => node.metadata?.filmCharacter?.asset.name).sort(), ["沈迟", "阿青"].sort());
    assert.equal(characters.filter((node) => node.metadata?.filmCharacter?.asset.name === "沈迟").length, 1);
    assert.ok(result.nodes.every((node) => node.type.startsWith("film")));
    assert.deepEqual(
        [...new Set(result.createdNodes.map((node) => node.type))].sort(),
        [CanvasNodeType.FilmCharacter, CanvasNodeType.FilmLocation, CanvasNodeType.FilmProp, CanvasNodeType.FilmScene, CanvasNodeType.FilmShot].sort(),
    );
});

test("binds selected mentions with ai context edges and correct roles", () => {
    const existing = projectAssetNode("char-shen", "character", "沈迟", ["老沈"]);
    const nodes = [scriptNode(), existing];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, []);
    const applied = apply(nodes, [], proposal);
    const { result } = applied;
    const contextEdges = result.connections.filter((edge) => edge.kind === "context");
    assert.ok(contextEdges.length >= 5);
    assert.ok(contextEdges.every((edge) => edge.data.source === "ai"));
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    for (const edge of contextEdges) {
        const source = byId.get(edge.fromNodeId);
        assert.ok(source);
        assert.equal(edge.data.role, roleOf(source));
        assert.equal(byId.get(edge.toNodeId)?.type, CanvasNodeType.FilmShot);
    }
    const shotByDescription = (description: string) => result.nodes.find((node) => node.metadata?.filmShot?.description === description)!;
    const edgeTargets = (nodeId: string) => contextEdges.filter((edge) => edge.fromNodeId === nodeId).map((edge) => edge.toNodeId);
    assert.deepEqual(edgeTargets(existing.id).sort(), [shotByDescription("沈迟把钥匙放在桌上").id, shotByDescription("沈迟看向窗外").id].sort());
    const keyProp = result.createdAssetNodes.find((node) => node.title === "钥匙")!;
    assert.deepEqual(edgeTargets(keyProp.id), [shotByDescription("沈迟把钥匙放在桌上").id]);
    const location = result.createdAssetNodes.find((node) => node.title === "旧城咖啡馆")!;
    assert.equal(edgeTargets(location.id).length, 2);
    const aqing = result.createdAssetNodes.find((node) => node.title === "阿青")!;
    assert.deepEqual(edgeTargets(aqing.id), [shotByDescription("阿青推门进来").id]);
    const perShotLocations = new Map<string, number>();
    contextEdges.filter((edge) => edge.data.role === "location").forEach((edge) => perShotLocations.set(edge.toNodeId, (perShotLocations.get(edge.toNodeId) ?? 0) + 1));
    assert.ok([...perShotLocations.values()].every((count) => count === 1));
    assert.ok(!result.nodes.some((node) => node.title === "红围巾"));
});

test("rejects an empty selection without mutating the graph", () => {
    const nodes = [scriptNode(), sceneNode("old-scene", "旧场"), shotNode("old-shot", "旧镜头")];
    const connections: CanvasConnection[] = [{ id: "old-edge", fromNodeId: "old-scene", toNodeId: "old-shot", kind: "composition" }];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, connections);
    const beforeNodes = structuredClone(nodes);
    const beforeConnections = structuredClone(connections);
    const empty = applyFilmDirectorAnalysis(nodes, connections, proposal, { mode: "overwrite", sceneKeys: [], assetKeys: allAssetKeys, bindMentions: true });
    assert.ok("error" in empty);
    assert.deepEqual(nodes, beforeNodes);
    assert.deepEqual(connections, beforeConnections);
    const missingScript = applyFilmDirectorAnalysis([sceneNode("old-scene", "旧场")], [], proposal, { mode: "overwrite", sceneKeys: allSceneKeys, assetKeys: [], bindMentions: false });
    assert.ok("error" in missingScript);
});

test("snapshot records exactly the created and removed nodes and edges and undo restores once", () => {
    const existing = projectAssetNode("char-shen", "character", "沈迟", ["老沈"]);
    const nodes = [scriptNode(), existing, sceneNode("old-scene", "旧场"), shotNode("old-shot", "旧镜头")];
    const connections: CanvasConnection[] = [
        { id: "old-composition", fromNodeId: "old-scene", toNodeId: "old-shot", kind: "composition" },
        { id: "old-context", fromNodeId: existing.id, toNodeId: "old-shot", kind: "context", data: { role: "character", source: "manual" } },
        { id: "old-derived", fromNodeId: "script", toNodeId: "old-scene", kind: "derived", data: { source: "script-handoff" } },
    ];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, connections);
    const applied = apply(nodes, connections, proposal);
    const { result } = applied;
    const script = result.nodes.find((node) => node.id === "script")!;
    const snapshot = script.metadata?.filmScript?.parseSnapshots.at(-1);
    assert.ok(snapshot);
    assert.deepEqual(snapshot.nodes.map((node) => node.id).sort(), result.createdNodes.map((node) => node.id).sort());
    const originalEdgeIds = new Set(connections.map((edge) => edge.id));
    assert.deepEqual(snapshot.connections.map((edge) => edge.id).sort(), result.connections.filter((edge) => !originalEdgeIds.has(edge.id)).map((edge) => edge.id).sort());
    assert.deepEqual(snapshot.removedNodes?.map((node) => node.id).sort(), ["old-scene", "old-shot"].sort());
    assert.deepEqual(snapshot.removedConnections?.map((edge) => edge.id).sort(), ["old-composition", "old-context", "old-derived"].sort());
    assert.equal(snapshot.nodes.filter((node) => node.type === CanvasNodeType.FilmCharacter).length, 1);
    assert.ok(!snapshot.nodes.some((node) => node.id === existing.id));

    const undone = undoFilmParseGraph(script, result.nodes, result.connections);
    assert.ok(undone);
    assert.deepEqual(undone.nodes.map((node) => node.id).sort(), nodes.map((node) => node.id).sort());
    assert.deepEqual(undone.connections.map((edge) => edge.id).sort(), connections.map((edge) => edge.id).sort());
    assert.deepEqual(undone.scriptPatch.parseSnapshots, []);
});

test("keeps only the latest three snapshots and appends after the current chain", () => {
    const prior = [0, 1, 2].map((index) => ({
        id: `prior-${index}`,
        createdAt: new Date(2026, 0, index + 1).toISOString(),
        mode: "overwrite" as const,
        nodes: [],
        connections: [],
    }));
    const nodes = [scriptNode(prior), sceneNode("old-scene", "旧场"), shotNode("old-shot", "旧镜头")];
    const connections: CanvasConnection[] = [{ id: "old-edge", fromNodeId: "old-scene", toNodeId: "old-shot", kind: "composition" }];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, connections);
    const applied = apply(nodes, connections, proposal, { mode: "append", assetKeys: [], bindMentions: false });
    const { result } = applied;
    const script = result.nodes.find((node) => node.id === "script")!;
    const snapshots = script.metadata?.filmScript?.parseSnapshots ?? [];
    assert.equal(snapshots.length, 3);
    assert.deepEqual(snapshots.map((snapshot) => snapshot.id).slice(0, 2), ["prior-1", "prior-2"]);
    assert.ok(result.nodes.some((node) => node.id === "old-scene"));
    const firstNewShot = result.createdNodes.find((node) => node.type === CanvasNodeType.FilmShot && node.metadata?.filmShot?.description === "沈迟把钥匙放在桌上")!;
    assert.ok(result.connections.some((edge) => edge.kind === "sequence" && edge.fromNodeId === "old-shot" && edge.toNodeId === firstNewShot.id));
});

test("recomputes mentions against the final graph including existing shots", () => {
    const existing = projectAssetNode("char-shen", "character", "沈迟", ["老沈"]);
    const nodes = [scriptNode(), existing, sceneNode("old-scene", "旧场"), shotNode("old-shot", "沈迟把钥匙放在桌上")];
    const connections: CanvasConnection[] = [{ id: "old-composition", fromNodeId: "old-scene", toNodeId: "old-shot", kind: "composition" }];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, connections);
    const applied = apply(nodes, connections, proposal, { mode: "append", assetKeys: ["character:沈迟"], bindMentions: true });
    const { result } = applied;
    assert.ok(result.connections.some((edge) => edge.kind === "context" && edge.fromNodeId === existing.id && edge.toNodeId === "old-shot" && edge.data.source === "ai" && edge.data.role === "character"));
});

test("projects a source hash and marks costume suggestions as non-project assets", () => {
    const nodes = [scriptNode()];
    const proposal = buildFilmDirectorAnalysis(episodes(), suggestions(), nodes[0], nodes, []);
    assert.equal(proposal.sourceHash, scriptTextHash(nodes[0].metadata!.filmScript!.text));
    assert.equal(proposal.totals.scenes, 2);
    assert.equal(proposal.totals.shots, 3);
    assert.equal(proposal.shots.length, 3);
    assert.ok(proposal.conflicts.some((conflict) => conflict.message.includes("服装")));
});
