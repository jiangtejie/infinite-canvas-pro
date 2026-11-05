"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "antd";
import { Minus, Plus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmScriptAnalysis } from "../types";

type FilmScriptGraphProps = {
    analysis: FilmScriptAnalysis | null;
    open: boolean;
    onClose: () => void;
    onApplyAssets?: () => void;
};

type GraphNode = { name: string; role: string; description: string; aliases: string[]; x: number; y: number };

const GRAPH_WIDTH = 900;
const GRAPH_HEIGHT = 620;
const MAX_RELATION_NODES = 24;
const MAX_SCENES = 16;

export function FilmScriptGraph({ analysis, open, onClose, onApplyAssets }: FilmScriptGraphProps) {
    const [mode, setMode] = useState<"relations" | "scenes" | "beats" | "network">("relations");
    const [zoom, setZoom] = useState(1);
    const [minStrength, setMinStrength] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [episodeFilter, setEpisodeFilter] = useState("");
    const [selectedCharacter, setSelectedCharacter] = useState("");
    const [selectedScene, setSelectedScene] = useState<number | null>(null);

    const characters = useMemo(() => (analysis?.characters || []).slice(0, MAX_RELATION_NODES), [analysis]);
    const nodes = useMemo<GraphNode[]>(() => characters.map((character, index) => {
        const angle = -Math.PI / 2 + (index / Math.max(1, characters.length)) * Math.PI * 2;
        const radius = characters.length <= 2 ? 90 : characters.length <= 6 ? 180 : 225;
        return {
            name: character.name,
            role: character.role,
            description: character.description,
            aliases: character.aliases,
            x: GRAPH_WIDTH / 2 + Math.cos(angle) * radius * 1.15,
            y: GRAPH_HEIGHT / 2 + Math.sin(angle) * radius,
        };
    }), [characters]);
    const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.name, node])), [nodes]);
    const visibleRelationships = useMemo(() => (analysis?.relationships || []).filter((relationship) => {
        return relationship.strength >= minStrength && nodeMap.has(relationship.from) && nodeMap.has(relationship.to);
    }), [analysis, minStrength, nodeMap]);
    const selectedCharacterInfo = analysis?.characters.find((character) => character.name === selectedCharacter) || null;
    const selectedSceneInfo = selectedScene !== null ? analysis?.scenes[selectedScene] : null;
    const episodes = useMemo(() => [...new Set((analysis?.scenes || []).map((scene) => scene.episode))], [analysis]);
    const filteredScenes = useMemo(() => (analysis?.scenes || []).filter((scene) => {
        if (episodeFilter && scene.episode !== episodeFilter) return false;
        if (!keyword) return true;
        const text = `${scene.heading} ${scene.summary} ${scene.characters.join(" ")} ${scene.mood}`;
        return text.includes(keyword);
    }), [analysis, episodeFilter, keyword]);
    const scenes = useMemo(() => filteredScenes.slice(0, MAX_SCENES), [filteredScenes]);
    const networkCharacters = useMemo(() => {
        const matched = (analysis?.characters || []).filter((character) => !keyword || [character.name, character.role, ...character.aliases].join(" ").includes(keyword));
        return matched.slice(0, 10);
    }, [analysis, keyword]);
    const networkScenes = useMemo(() => filteredScenes.slice(0, 10), [filteredScenes]);
    const networkCharPositions = useMemo(() => new Map(networkCharacters.map((character, index) => [character.name, { x: 130, y: 70 + index * (460 / Math.max(1, networkCharacters.length - 1)) }])), [networkCharacters]);
    const networkScenePositions = useMemo(() => new Map(networkScenes.map((scene, index) => [scene.sceneIndex, { x: 740, y: 70 + index * (460 / Math.max(1, networkScenes.length - 1)) }])), [networkScenes]);
    const beatCount = useMemo(() => (analysis?.scenes || []).reduce((total, scene) => total + scene.beats.length, 0), [analysis]);
    const beatTypeCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const scene of analysis?.scenes || []) {
            for (const beat of scene.beats) counts.set(beat.type, (counts.get(beat.type) || 0) + 1);
        }
        return [...counts.entries()];
    }, [analysis]);

    if (!analysis) {
        return (
            <Modal open={open} onCancel={onClose} footer={null} width={960} title="剧情图谱">
                <p className="py-8 text-center text-xs text-muted-foreground">还没有剧情分析数据，先在「导入剧本」里做一次 AI 语义解析。</p>
            </Modal>
        );
    }

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={1180} title={`剧情图谱 · ${analysis.characters.length} 角色 / ${analysis.relationships.length} 关系 / ${analysis.scenes.length} 场`} destroyOnHidden>
            <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                        {([{ value: "relations", label: "人物关系" }, { value: "scenes", label: "场次剧情" }, { value: "network", label: "人物场景" }, { value: "beats", label: "剧情节拍" }] as const).map((item) => (
                            <button key={item.value} type="button" onClick={() => setMode(item.value)} className={cn("rounded px-2.5 py-1 text-[11px] transition-colors", mode === item.value ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    {mode === "relations" ? (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                            <span>关系强度</span>
                            {[1, 3, 4, 5].map((value) => (
                                <button key={value} type="button" onClick={() => setMinStrength(value)} className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", minStrength === value ? "border-acid/50 text-acid" : "border-border/60 text-muted-foreground/70")}>
                                    {value === 1 ? "全部" : `≥${value}`}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    <Select size="small" className="w-28" value={episodeFilter} onChange={(value: string) => setEpisodeFilter(value)} options={[{ value: "", label: "全部集" }, ...episodes.map((episode) => ({ value: episode, label: episode }))]} />
                    <Input size="small" style={{ width: 170 }} allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索角色/场次" />
                    <div className="ml-auto flex items-center gap-1">
                        {onApplyAssets ? <Button size="small" onClick={onApplyAssets}>应用角色/场景</Button> : null}
                        <button type="button" aria-label="缩小" className="grid size-6 place-items-center rounded border border-border/60 text-muted-foreground/70 hover:text-foreground" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}><Minus className="size-3" /></button>
                        <span className="w-9 text-center font-mono text-[10px] text-muted-foreground/60">{Math.round(zoom * 100)}%</span>
                        <button type="button" aria-label="放大" className="grid size-6 place-items-center rounded border border-border/60 text-muted-foreground/70 hover:text-foreground" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}><Plus className="size-3" /></button>
                        <button type="button" aria-label="重置缩放" className="grid size-6 place-items-center rounded border border-border/60 text-muted-foreground/70 hover:text-foreground" onClick={() => setZoom(1)}><RotateCcw className="size-3" /></button>
                    </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                    {mode === "beats" ? (
                        <div className="thin-scrollbar grid max-h-[560px] content-start gap-2 overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-3 sm:grid-cols-2">
                            {analysis.scenes.flatMap((scene) => scene.beats.map((beat, index) => (
                                <div key={`${scene.sceneIndex}-${index}-${beat.type}`} className="grid gap-1 rounded-lg border border-border/70 bg-card/50 p-2.5">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="chip chip-acid shrink-0">{beat.type}</span>
                                        <span className="min-w-0 truncate font-mono text-[9px] text-muted-foreground/60">{scene.episode} / {scene.heading}</span>
                                    </div>
                                    <p className="text-[11px] leading-5 text-foreground/80">{beat.summary}</p>
                                    <p className="text-[10px] text-muted-foreground/60">第 {scene.sceneIndex + 1} 场{scene.mood ? ` · ${scene.mood}` : ""}</p>
                                </div>
                            )))}
                            {!beatCount ? <p className="col-span-full py-6 text-center text-xs text-muted-foreground">还没有分析出剧情节拍</p> : null}
                        </div>
                    ) : (
                    <div className="relative h-[560px] overflow-hidden rounded-lg border border-border/60 bg-background/40">
                        <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} className="h-full w-full transition-transform" style={{ transform: `scale(${zoom})` }}>
                            <defs>
                                <marker id="film-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
                                </marker>
                            </defs>
                            {mode === "relations" ? (
                                <>
                                    {visibleRelationships.map((relationship, index) => {
                                        const from = nodeMap.get(relationship.from)!;
                                        const to = nodeMap.get(relationship.to)!;
                                        const arrow = relationship.direction !== "bilateral";
                                        const labelX = (from.x + to.x) / 2;
                                        const labelY = (from.y + to.y) / 2 - 6;
                                        return (
                                            <g key={`${relationship.from}-${relationship.to}-${relationship.type}-${index}`}>
                                                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={`color-mix(in srgb, var(--acid) ${20 + relationship.strength * 10}%, var(--border))`} strokeWidth={1 + relationship.strength * 0.5} opacity={0.75} markerEnd={arrow ? "url(#film-graph-arrow)" : undefined} />
                                                <text x={labelX} y={labelY} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>{relationship.type}</text>
                                            </g>
                                        );
                                    })}
                                    {nodes.map((node) => {
                                        const selected = selectedCharacter === node.name;
                                        const matched = !keyword || [node.name, node.role, ...node.aliases].join(" ").includes(keyword);
                                        return (
                                            <g key={node.name} className="cursor-pointer" opacity={matched ? 1 : 0.25} onClick={() => { setSelectedCharacter(node.name); setSelectedScene(null); }}>
                                                <circle cx={node.x} cy={node.y} r={selected ? 30 : 26} fill="var(--card)" stroke={selected ? "var(--acid)" : "var(--border)"} strokeWidth={selected ? 2 : 1.2} />
                                                <text x={node.x} y={node.y - 2} textAnchor="middle" className="fill-foreground" style={{ fontSize: 11, fontWeight: 600 }}>{truncate(node.name, 5)}</text>
                                                <text x={node.x} y={node.y + 11} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 8 }}>{truncate(node.role || "角色", 6)}</text>
                                            </g>
                                        );
                                    })}
                                </>
                            ) : mode === "scenes" ? (
                                <>
                                    {scenes.map((scene, index) => {
                                        const column = index % 4;
                                        const row = Math.floor(index / 4);
                                        const x = 50 + column * 210;
                                        const y = 45 + row * 145;
                                        const selected = selectedScene === scene.sceneIndex;
                                        return (
                                            <g key={`${scene.heading}-${scene.sceneIndex}`} className="cursor-pointer" onClick={() => { setSelectedScene(scene.sceneIndex); setSelectedCharacter(""); }}>
                                                {index < scenes.length - 1 ? (
                                                    <>
                                                        {column < 3 ? <line x1={x + 180} y1={y + 50} x2={x + 210} y2={y + 50} stroke="var(--border)" strokeWidth={1.5} markerEnd="url(#film-graph-arrow)" /> : <line x1={x + 80} y1={y + 100} x2={x + 80} y2={y + 145} stroke="var(--border)" strokeWidth={1.5} markerEnd="url(#film-graph-arrow)" />}
                                                    </>
                                                ) : null}
                                                <rect x={x} y={y} width={180} height={100} rx={8} fill="var(--card)" stroke={selected ? "var(--acid)" : "var(--border)"} strokeWidth={selected ? 2 : 1.2} />
                                                <text x={x + 10} y={y + 18} className="fill-muted-foreground" style={{ fontSize: 8 }}>{scene.episode}</text>
                                                <text x={x + 10} y={y + 34} className="fill-foreground" style={{ fontSize: 11, fontWeight: 600 }}>{truncate(scene.heading, 16)}</text>
                                                <text x={x + 10} y={y + 50} className="fill-muted-foreground" style={{ fontSize: 9 }}>{truncate(scene.summary || "无摘要", 22)}</text>
                                                <text x={x + 10} y={y + 66} className="fill-muted-foreground" style={{ fontSize: 8 }}>{truncate(scene.characters.join("、") || "无角色", 20)}</text>
                                                <text x={x + 10} y={y + 82} className="fill-muted-foreground" style={{ fontSize: 8 }}>{scene.mood ? `情绪：${scene.mood}` : ""}</text>
                                            </g>
                                        );
                                    })}
                                </>
                            ) : (
                                <>
                                    {networkCharacters.map((character) => {
                                        const position = networkCharPositions.get(character.name)!;
                                        return (
                                            <g key={`network-char-${character.name}`} className="cursor-pointer" onClick={() => { setSelectedCharacter(character.name); setSelectedScene(null); }}>
                                                <circle cx={position.x} cy={position.y} r={20} fill="var(--card)" stroke={selectedCharacter === character.name ? "var(--acid)" : "var(--border)"} strokeWidth={selectedCharacter === character.name ? 2 : 1.2} />
                                                <text x={position.x} y={position.y + 3} textAnchor="middle" className="fill-foreground" style={{ fontSize: 10, fontWeight: 600 }}>{truncate(character.name, 5)}</text>
                                            </g>
                                        );
                                    })}
                                    {networkCharacters.flatMap((character) => {
                                        const from = networkCharPositions.get(character.name)!;
                                        return networkScenes.filter((scene) => scene.characters.includes(character.name)).map((scene) => {
                                            const to = networkScenePositions.get(scene.sceneIndex)!;
                                            return <line key={`network-link-${character.name}-${scene.sceneIndex}`} x1={from.x + 20} y1={from.y} x2={to.x - 92} y2={to.y} stroke="var(--border)" strokeWidth={1} opacity={0.55} />;
                                        });
                                    })}
                                    {networkScenes.map((scene) => {
                                        const position = networkScenePositions.get(scene.sceneIndex)!;
                                        return (
                                            <g key={`network-scene-${scene.sceneIndex}`} className="cursor-pointer" onClick={() => { setSelectedScene(scene.sceneIndex); setSelectedCharacter(""); }}>
                                                <rect x={position.x - 92} y={position.y - 26} width={184} height={52} rx={7} fill="var(--card)" stroke={selectedScene === scene.sceneIndex ? "var(--acid)" : "var(--border)"} strokeWidth={selectedScene === scene.sceneIndex ? 2 : 1.2} />
                                                <text x={position.x} y={position.y - 6} textAnchor="middle" className="fill-foreground" style={{ fontSize: 9, fontWeight: 600 }}>{truncate(scene.heading, 18)}</text>
                                                <text x={position.x} y={position.y + 9} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 8 }}>{truncate(scene.episode, 14)}</text>
                                            </g>
                                        );
                                    })}
                                </>
                            )}
                        </svg>
                        {mode === "relations" && !nodes.length ? <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">分析里还没有角色数据</p> : null}
                        {mode === "scenes" && !scenes.length ? <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">分析里还没有场次数据</p> : null}
                        {mode === "network" && (!networkCharacters.length || !networkScenes.length) ? <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">没有匹配的人物或场次</p> : null}
                    </div>
                    )}

                    <div className="thin-scrollbar grid max-h-[560px] content-start gap-2 overflow-y-auto rounded-lg border border-border/60 bg-card/40 p-3">
                        {mode === "beats" ? (
                            <>
                                <span className="text-sm font-medium text-foreground">剧情节拍</span>
                                <p className="text-[11px] leading-5 text-muted-foreground/70">共 {beatCount} 个节拍，按场次顺序排列。</p>
                                {beatTypeCounts.length ? (
                                    <div className="flex flex-wrap gap-1">
                                        {beatTypeCounts.map(([type, count]) => <span key={type} className="chip">{type} ×{count}</span>)}
                                    </div>
                                ) : null}
                                <p className="text-[11px] leading-5 text-muted-foreground/60">节拍来自 AI 语义分析，可用来检查这一集的叙事节奏（目标、冲突、转折、高潮）。</p>
                            </>
                        ) : mode === "relations" || (mode === "network" && selectedCharacterInfo) ? (
                            selectedCharacterInfo ? (
                                <>
                                    <span className="text-sm font-medium text-foreground">{selectedCharacterInfo.name}</span>
                                    {selectedCharacterInfo.role || selectedCharacterInfo.description ? <p className="text-[11px] leading-5 text-muted-foreground/70">{[selectedCharacterInfo.role, selectedCharacterInfo.description].filter(Boolean).join("：")}</p> : null}
                                    {selectedCharacterInfo.aliases.length ? <p className="font-mono text-[10px] text-muted-foreground/60">别名：{selectedCharacterInfo.aliases.join("、")}</p> : null}
                                    <div className="grid gap-1">
                                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">关系</span>
                                        {analysis.relationships.filter((relationship) => relationship.from === selectedCharacterInfo.name || relationship.to === selectedCharacterInfo.name).map((relationship) => (
                                            <p key={`${relationship.from}-${relationship.to}-${relationship.type}`} className="text-[11px] leading-5 text-foreground/80">
                                                {relationship.from} → {relationship.to} · {relationship.type} · 第 {relationship.sceneRange.start + 1}-{relationship.sceneRange.end + 1} 场{relationship.evolution.length ? ` · ${relationship.evolution.length} 次变化` : ""}
                                            </p>
                                        ))}
                                        {!analysis.relationships.some((relationship) => relationship.from === selectedCharacterInfo.name || relationship.to === selectedCharacterInfo.name) ? <p className="text-[11px] text-muted-foreground/60">没有分析出关系</p> : null}
                                    </div>
                                    <div className="grid gap-1">
                                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">出场场次</span>
                                        {analysis.scenes.filter((scene) => scene.characters.includes(selectedCharacterInfo.name)).slice(0, 8).map((scene) => <p key={scene.heading} className="text-[11px] leading-5 text-foreground/80">{scene.episode} / {scene.heading}</p>)}
                                    </div>
                                </>
                            ) : (
                                <p className="text-[11px] leading-5 text-muted-foreground/60">点左侧人物节点，查看角色、关系和出场场次。</p>
                            )
                        ) : selectedSceneInfo ? (
                            <>
                                <span className="text-sm font-medium text-foreground">{selectedSceneInfo.heading}</span>
                                <p className="font-mono text-[10px] text-muted-foreground/60">{selectedSceneInfo.episode} · 第 {selectedSceneInfo.sceneIndex + 1} 场</p>
                                <p className="text-[11px] leading-5 text-foreground/80">{selectedSceneInfo.summary || "无摘要"}</p>
                                {selectedSceneInfo.mood ? <p className="text-[11px] text-muted-foreground/70">情绪：{selectedSceneInfo.mood}</p> : null}
                                {selectedSceneInfo.characters.length ? <p className="text-[11px] leading-5 text-muted-foreground/70">角色：{selectedSceneInfo.characters.join("、")}</p> : null}
                                {selectedSceneInfo.props.length ? <p className="text-[11px] leading-5 text-muted-foreground/70">道具：{selectedSceneInfo.props.join("、")}</p> : null}
                                {selectedSceneInfo.beats.length ? (
                                    <div className="grid gap-1">
                                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">剧情节拍</span>
                                        {selectedSceneInfo.beats.map((beat, index) => <p key={`${beat.type}-${index}`} className="text-[11px] leading-5 text-foreground/80">{beat.type}：{beat.summary}</p>)}
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <p className="text-[11px] leading-5 text-muted-foreground/60">点左侧场次节点，查看该场摘要、角色、道具和剧情节拍。</p>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function truncate(value: string, max: number) {
    const text = (value || "").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
