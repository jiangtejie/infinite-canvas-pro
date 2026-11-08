"use client";

import { useMemo } from "react";
import { AlertTriangle, GitBranch } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmProject } from "@/lib/film/types";
import { buildFilmBranchGraph } from "../utils/film-branch";

const NODE_W = 136;
const NODE_H = 64;
const STEP = NODE_W + 56;
const PAD_X = 40;
const NODE_Y = 160;
const CANVAS_H = 300;

export function FilmBranchGraph({ project, onJumpToShot }: { project: FilmProject; onJumpToShot: (shotId: string) => void }) {
    const graph = useMemo(() => buildFilmBranchGraph(project), [project]);
    const position = useMemo(() => new Map(graph.nodes.map((node) => [node.shotId, { x: PAD_X + node.index * STEP, y: NODE_Y }])), [graph.nodes]);
    const width = Math.max(320, PAD_X * 2 + Math.max(0, graph.nodes.length - 1) * STEP + NODE_W);
    const sceneStarts = useMemo(() => {
        const seen = new Set<string>();
        return graph.nodes.filter((node) => {
            const key = node.episodeTitle + "::" + node.sceneName;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [graph.nodes]);
    const branchOffsets = new Map<string, number>();
    for (const edge of graph.edges) {
        if (edge.kind !== "branch") continue;
        branchOffsets.set(edge.id, branchOffsets.size);
    }

    if (!graph.nodes.length) {
        return <div className="rounded-lg border border-dashed border-border/70 px-4 py-12 text-center text-xs text-muted-foreground">还没有镜头，无法生成分支图。</div>;
    }

    return (
        <div className="thin-scrollbar overflow-x-auto rounded-lg border border-border/70 bg-background/40">
            <div className="relative" style={{ width, height: CANVAS_H }}>
                <svg width={width} height={CANVAS_H} className="absolute inset-0" aria-hidden>
                    <defs>
                        <marker id="branch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                            <path d="M0 0 L10 5 L0 10 z" fill="var(--acid)" />
                        </marker>
                        <marker id="linear-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" opacity="0.5" />
                        </marker>
                    </defs>
                    {sceneStarts.map((node) => {
                        const point = position.get(node.shotId);
                        if (!point) return null;
                        return (
                            <g key={node.episodeTitle + "-" + node.sceneName}>
                                <line x1={point.x - 24} y1={36} x2={point.x - 24} y2={CANVAS_H - 24} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 5" />
                                <text x={point.x - 16} y={26} className="fill-muted-foreground/70" fontSize="9" fontFamily="monospace">{node.episodeTitle} / {node.sceneName}</text>
                            </g>
                        );
                    })}
                    {graph.edges.map((edge) => {
                        const from = position.get(edge.fromShotId);
                        const to = position.get(edge.toShotId);
                        if (!from || !to) return null;
                        if (edge.kind === "linear") {
                            return <line key={edge.id} x1={from.x + NODE_W} y1={from.y + NODE_H / 2} x2={to.x - 3} y2={to.y + NODE_H / 2} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" markerEnd="url(#linear-arrow)" />;
                        }
                        const offset = 48 + (branchOffsets.get(edge.id) || 0) * 26;
                        const midX = (from.x + NODE_W / 2 + to.x + NODE_W / 2) / 2;
                        const controlY = Math.max(46, NODE_Y - offset);
                        const path = `M ${from.x + NODE_W / 2} ${from.y} C ${from.x + NODE_W / 2} ${controlY}, ${to.x + NODE_W / 2} ${controlY}, ${to.x + NODE_W / 2} ${to.y}`;
                        return (
                            <g key={edge.id}>
                                <path d={path} fill="none" stroke="var(--acid)" strokeOpacity="0.55" strokeWidth="1.5" markerEnd="url(#branch-arrow)" />
                                <text x={midX} y={controlY + 14} textAnchor="middle" fontSize="9" fontFamily="monospace" className="fill-acid/90">{edge.label || "分支"}</text>
                            </g>
                        );
                    })}
                </svg>
                {graph.nodes.map((node) => {
                    const point = position.get(node.shotId);
                    if (!point) return null;
                    return (
                        <button
                            key={node.shotId}
                            type="button"
                            onClick={() => onJumpToShot(node.shotId)}
                            title={node.episodeTitle + " / " + node.sceneName + " / 镜头 " + node.shotNo}
                            style={{ left: point.x, top: point.y, width: NODE_W, height: NODE_H }}
                            className={cn(
                                "absolute flex flex-col justify-between rounded-lg border bg-card/90 px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-acid/60 hover:shadow-md",
                                node.unreachable ? "border-amber-500/50" : node.branchCount ? "border-acid/40" : "border-border/70",
                            )}
                        >
                            <span className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] font-medium text-foreground/85">{node.shotNo}</span>
                                {node.branchCount ? <span className="flex items-center gap-0.5 rounded border border-acid/30 bg-acid/[0.06] px-1 py-0.5 text-[8px] text-acid"><GitBranch className="size-2.5" />{node.branchCount}</span> : null}
                                {node.unreachable ? <AlertTriangle className="ml-auto size-3 text-amber-500" /> : null}
                            </span>
                            <span className="line-clamp-2 text-[9px] leading-3.5 text-muted-foreground/75">{node.sceneName}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
