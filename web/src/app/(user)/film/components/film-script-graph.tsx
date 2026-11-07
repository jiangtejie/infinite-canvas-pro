"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "antd";
import { Minus, Plus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmScriptAnalysis } from "@/lib/film/types";
import { FilmAmbient } from "@/components/film/film-ambient";

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
    const [hoveredCharacter, setHoveredCharacter] = useState("");
    const [hoveredScene, setHoveredScene] = useState<number | null>(null);

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
    const relatedCharacterNames = useMemo(() => {
        if (!hoveredCharacter) return new Set<string>();
        const names = new Set<string>([hoveredCharacter]);
        for (const relationship of analysis?.relationships || []) {
            if (relationship.from === hoveredCharacter) names.add(relationship.to);
            if (relationship.to === hoveredCharacter) names.add(relationship.from);
        }
        return names;
    }, [analysis, hoveredCharacter]);
    const hoveredSceneCharacterNames = useMemo(() => new Set(hoveredScene !== null ? analysis?.scenes[hoveredScene]?.characters || [] : []), [analysis, hoveredScene]);
    const beatTypeCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const scene of analysis?.scenes || []) {
            for (const beat of scene.beats) counts.set(beat.type, (counts.get(beat.type) || 0) + 1);
        }
        return [...counts.entries()];
    }, [analysis]);

    const exportProductionSheet = () => {
        if (!analysis) return;
        const rows: string[][] = [["集", "场次", "场景", "摘要", "情绪", "角色", "道具", "剧情节拍"]];
        for (const scene of analysis.scenes) {
            rows.push([
                scene.episode,
                String(scene.sceneIndex + 1),
                scene.heading,
                scene.summary,
                scene.mood,
                scene.characters.join("、"),
                scene.props.join("、"),
                scene.beats.map((beat) => `${beat.type}：${beat.summary}`).join("；"),
            ]);
        }
        const csv = rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "剧情制作表.csv";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (!analysis) {
        return (
            <Modal open={open} onCancel={onClose} footer={null} width={960} title="剧情图谱">
                <p className="py-8 text-center text-xs text-muted-foreground">还没有剧情分析数据，先在「导入剧本」里做一次 AI 语义解析。</p>
            </Modal>
        );
    }

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={1180} title={`剧情图谱 · ${analysis.characters.length} 角色 / ${analysis.relationships.length} 关系 / ${analysis.scenes.length} 场`} destroyOnHidden>
            <div className="relative isolate grid gap-3">
                <FilmAmbient className="-top-16 h-44 opacity-60" />
                <div className="relative flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                        {([{ value: "relations", label: "人物关系" }, { value: "scenes", label: "场次剧情" }, { value: "network", label: "人物场景" }, { value: "beats", label: "剧情节拍" }] as const).map((item) => (
                            <button key={item.value} type="button" onClick={() => setMode(item.value)} className={cn("rounded px-2.5 py-1 text-[11px] transition-all", mode === item.value ? "bg-acid/15 text-acid shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--acid)_35%,transparent)]" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground")}>
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
                        <Button size="small" onClick={exportProductionSheet}>导出制作表</Button>
                        <button type="button" aria-label="缩小" className="grid size-6 place-items-center rounded border border-border/60 text-muted-foreground/70 hover:text-foreground" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}><Minus className="size-3" /></button>
                        <span className="w-9 text-center font-mono text-[10px] text-muted-foreground/60">{Math.round(zoom * 100)}%</span>
                        <button type="button" aria-label="放大" className="grid size-6 place-items-center rounded border border-border/60 text-muted-foreground/70 hover:text-foreground" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}><Plus className="size-3" /></button>
                        <button type="button" aria-label="重置缩放" className="grid size-6 place-items-center rounded border border-border/60 text-muted-foreground/70 hover:text-foreground" onClick={() => setZoom(1)}><RotateCcw className="size-3" /></button>
                    </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                    <div key={mode} className="film-stage-enter relative h-[560px] overflow-hidden rounded-lg border border-border/60 bg-background/40" style={{ backgroundImage: "radial-gradient(ellipse at 45% 30%, color-mix(in oklch, var(--acid) 4%, transparent), transparent 62%)" }}>
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
                                        const highlighted = !hoveredCharacter || relationship.from === hoveredCharacter || relationship.to === hoveredCharacter;
                                        return (
                                            <g key={`${relationship.from}-${relationship.to}-${relationship.type}-${index}`}>
                                                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={`color-mix(in srgb, var(--acid) ${20 + relationship.strength * 10}%, var(--border))`} strokeWidth={highlighted && hoveredCharacter ? 2 + relationship.strength * 0.5 : 1 + relationship.strength * 0.5} opacity={hoveredCharacter ? (highlighted ? 0.95 : 0.12) : 0.75} markerEnd={arrow ? "url(#film-graph-arrow)" : undefined} />
                                                <text x={labelX} y={labelY} textAnchor="middle" className="fill-muted-foreground" opacity={hoveredCharacter && !highlighted ? 0.15 : 1} style={{ fontSize: 9 }}>{relationship.type}</text>
                                            </g>
                                        );
                                    })}
                                    {nodes.map((node) => {
                                        const selected = selectedCharacter === node.name;
                                        const matched = !keyword || [node.name, node.role, ...node.aliases].join(" ").includes(keyword);
                                        const hoverDim = Boolean(hoveredCharacter) && !relatedCharacterNames.has(node.name);
                                        return (
                                            <g key={node.name} className="cursor-pointer" opacity={!matched || hoverDim ? 0.25 : 1} onMouseEnter={() => setHoveredCharacter(node.name)} onMouseLeave={() => setHoveredCharacter("")} onClick={() => { setSelectedCharacter(node.name); setSelectedScene(null); }}>
                                                <title>{node.name}{node.role ? ` · ${node.role}` : ""}{node.aliases.length ? `（${node.aliases.join("、")}）` : ""}</title>
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
                                        const hoverDim = hoveredScene !== null && hoveredScene !== scene.sceneIndex;
                                        return (
                                            <g key={`${scene.heading}-${scene.sceneIndex}`} className="cursor-pointer" opacity={hoverDim ? 0.3 : 1} onMouseEnter={() => setHoveredScene(scene.sceneIndex)} onMouseLeave={() => setHoveredScene(null)} onClick={() => { setSelectedScene(scene.sceneIndex); setSelectedCharacter(""); }}>
                                                <title>{scene.heading} · {scene.summary || "无摘要"}</title>
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
                                        const dim = hoveredCharacter ? character.name !== hoveredCharacter : hoveredScene !== null ? !hoveredSceneCharacterNames.has(character.name) : false;
                                        return (
                                            <g key={`network-char-${character.name}`} className="cursor-pointer" opacity={dim ? 0.25 : 1} onMouseEnter={() => setHoveredCharacter(character.name)} onMouseLeave={() => setHoveredCharacter("")} onClick={() => { setSelectedCharacter(character.name); setSelectedScene(null); }}>
                                                <title>{character.name}{character.role ? ` · ${character.role}` : ""}</title>
                                                <circle cx={position.x} cy={position.y} r={20} fill="var(--card)" stroke={selectedCharacter === character.name ? "var(--acid)" : "var(--border)"} strokeWidth={selectedCharacter === character.name ? 2 : 1.2} />
                                                <text x={position.x} y={position.y + 3} textAnchor="middle" className="fill-foreground" style={{ fontSize: 10, fontWeight: 600 }}>{truncate(character.name, 5)}</text>
                                            </g>
                                        );
                                    })}
                                    {networkCharacters.flatMap((character) => {
                                        const from = networkCharPositions.get(character.name)!;
                                        return networkScenes.filter((scene) => scene.characters.includes(character.name)).map((scene) => {
                                            const to = networkScenePositions.get(scene.sceneIndex)!;
                                            const highlighted = hoveredCharacter ? character.name === hoveredCharacter : hoveredScene !== null ? scene.sceneIndex === hoveredScene : false;
                                            const dim = (hoveredCharacter || hoveredScene !== null) && !highlighted;
                                            return <line key={`network-link-${character.name}-${scene.sceneIndex}`} x1={from.x + 20} y1={from.y} x2={to.x - 92} y2={to.y} stroke={highlighted ? "color-mix(in srgb, var(--acid) 55%, var(--border))" : "var(--border)"} strokeWidth={highlighted ? 1.8 : 1} opacity={dim ? 0.12 : highlighted ? 0.9 : 0.55} />;
                                        });
                                    })}
                                    {networkScenes.map((scene) => {
                                        const position = networkScenePositions.get(scene.sceneIndex)!;
                                        const dim = hoveredScene !== null ? scene.sceneIndex !== hoveredScene : Boolean(hoveredCharacter) && !scene.characters.includes(hoveredCharacter);
                                        return (
                                            <g key={`network-scene-${scene.sceneIndex}`} className="cursor-pointer" opacity={dim ? 0.25 : 1} onMouseEnter={() => setHoveredScene(scene.sceneIndex)} onMouseLeave={() => setHoveredScene(null)} onClick={() => { setSelectedScene(scene.sceneIndex); setSelectedCharacter(""); }}>
                                                <title>{scene.heading} · {scene.summary || "无摘要"}</title>
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
                        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-1.5 rounded bg-background/75 px-2 py-1 font-mono text-[9px] text-muted-foreground/70 backdrop-blur">
                            {mode === "relations" ? (
                                <>
                                    <span>节点=人物</span>
                                    <span>连线=关系</span>
                                    <span>粗细=强度</span>
                                    <span>悬停高亮关联</span>
                                </>
                            ) : mode === "scenes" ? (
                                <>
                                    <span>节点=场次</span>
                                    <span>箭头=剧情顺序</span>
                                </>
                            ) : mode === "network" ? (
                                <>
                                    <span>左=人物</span>
                                    <span>右=场次</span>
                                    <span>连线=出场</span>
                                </>
                            ) : (
                                <span>卡片=剧情节拍</span>
                            )}
                        </div>
                    </div>
                    )}

                    <div className="punk-panel thin-scrollbar grid max-h-[560px] content-start gap-2 overflow-y-auto rounded-lg p-3">
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
                                <GraphOverview analysis={analysis} mode={mode} beatCount={beatCount} />
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
                            <GraphOverview analysis={analysis} mode={mode} beatCount={beatCount} />
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

function GraphOverview({ analysis, mode, beatCount }: { analysis: FilmScriptAnalysis; mode: "relations" | "scenes" | "beats" | "network"; beatCount: number }) {
    return (
        <div className="grid gap-3">
            <span className="font-mono text-[9px] tracking-[0.16em] text-acid/70 uppercase">概览</span>
            <div className="grid grid-cols-2 gap-2">
                {[
                    ["角色", analysis.characters.length],
                    ["关系", analysis.relationships.length],
                    ["场次", analysis.scenes.length],
                    ["节拍", beatCount],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
                        <span className="font-mono text-[9px] text-muted-foreground/50">{label}</span>
                        <p className="mt-0.5 font-mono text-sm text-foreground">{value}</p>
                    </div>
                ))}
            </div>
            {mode === "scenes" ? (
                <div className="grid gap-1">
                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">场次</span>
                    {analysis.scenes.slice(0, 8).map((scene) => <p key={scene.sceneIndex} className="truncate text-[11px] leading-5 text-foreground/75">· {scene.heading}</p>)}
                </div>
            ) : (
                <div className="grid gap-1">
                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">关系</span>
                    {[...analysis.relationships].sort((left, right) => right.strength - left.strength).slice(0, 8).map((relationship) => (
                        <p key={`${relationship.from}-${relationship.to}-${relationship.type}`} className="truncate text-[11px] leading-5 text-foreground/75">· {relationship.from} → {relationship.to} · {relationship.type}</p>
                    ))}
                    {!analysis.relationships.length ? <p className="text-[11px] text-muted-foreground/60">还没有分析出关系</p> : null}
                </div>
            )}
            <p className="text-[10px] leading-5 text-muted-foreground/50">点击图中节点查看详情；悬停会高亮关联。</p>
        </div>
    );
}
