"use client";

import { useMemo, type ReactNode } from "react";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { CanvasNodeData, CanvasConnection } from "../types";
import { canvasStatusColors } from "../lib/canvas-palette";
import { FilmNodeShell, type FilmNodeShellAction } from "../[id]/components/film-node-shell";
import { FilmBeatNodeCard } from "../[id]/components/film-beat-node-card";
import { summarizeFilmNode } from "../[id]/lib/film-node-summary";
import type { FilmNodeSummary, FilmNodeSummaryOptions } from "../[id]/lib/film-node-summary";
import type { FilmVersionKind } from "../[id]/lib/film-version-room";
import type { FilmNodeType } from "../[id]/lib/film-graph-types";
import { FILM_NODE_TYPE_BY_CANVAS_TYPE } from "../[id]/lib/film-node-registry";

export type FilmNodeCardProps = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    theme: CanvasTheme;
    onTitleChange?: (nodeId: string, title: string) => void;
    onGenerateImage?: (shotId: string) => void;
    onGenerateVideo?: (shotId: string) => void;
    onFocusShot?: (shotId: string) => void;
    onOpenScript?: () => void;
    onEditAsset?: (nodeId: string) => void;
    onCreateShot?: (sceneId: string) => void;
    onOpenVersions?: (shotId: string, kind: FilmVersionKind) => void;
    onViewMedia?: (node: CanvasNodeData) => void;
    onUpdateBeat?: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onDecomposeBeat?: (nodeId: string) => void;
    onGenerateBeatPreview?: (nodeId: string) => void;
    onStopBeatTask?: (nodeId: string) => void;
    onLocateBeatShots?: (nodeId: string) => void;
    summary?: FilmNodeSummary;
    summaryOptions?: FilmNodeSummaryOptions;
};

function TextBlock({ children, theme, prominent = false, className = "" }: { children: string; theme: CanvasTheme; prominent?: boolean; className?: string }) {
    return <p className={`whitespace-pre-wrap break-words ${prominent ? "font-medium" : "text-xs leading-5"} ${className}`} style={{ color: prominent ? theme.node.text : theme.node.muted }}>{children}</p>;
}

function useFilmSummary(props: FilmNodeCardProps) {
    return useMemo(() => props.summary ?? summarizeFilmNode(props.node, props.nodes, props.connections, props.summaryOptions), [props.node, props.nodes, props.connections, props.summary, props.summaryOptions]);
}

function FilmCard(props: FilmNodeCardProps & { summary: FilmNodeSummary; actions?: FilmNodeShellAction[]; children: (summary: FilmNodeSummary) => ReactNode }) {
    return <FilmNodeShell node={props.node} theme={props.theme} summary={props.summary} onTitleChange={props.onTitleChange} actions={props.actions}>{props.children(props.summary)}</FilmNodeShell>;
}

export function FilmScriptNodeCard(props: FilmNodeCardProps) {
    const summary = useFilmSummary(props);
    const actions = props.onOpenScript ? [{ label: "导演分析", primary: true, onClick: props.onOpenScript }] : [];
    return <FilmCard {...props} summary={summary} actions={actions}>{(nodeSummary) => <div className="flex h-full flex-col gap-2 p-3"><div className="text-[10px]" style={{ color: props.theme.node.muted }}>{nodeSummary.description ? `${nodeSummary.description.length} 字 · 内容摘要` : "空剧本"}</div><TextBlock theme={props.theme} className="line-clamp-6">{nodeSummary.description || "剧本正文尚未填写"}</TextBlock></div>}</FilmCard>;
}

export function FilmSceneNodeCard(props: FilmNodeCardProps) {
    const scene = props.node.metadata?.filmScene;
    const shotCount = props.connections.filter((edge) => edge.kind === "composition" && edge.fromNodeId === props.node.id).length;
    const summary = useFilmSummary(props);
    const actions = props.onCreateShot ? [{ label: "新增镜头", primary: true, onClick: () => props.onCreateShot?.(props.node.id) }] : [];
    return <FilmCard {...props} summary={summary} actions={actions}>{() => <div className="flex flex-col gap-2 p-3"><TextBlock theme={props.theme} prominent className="line-clamp-1">{[scene?.episodeTitle, scene?.name].filter(Boolean).join(" · ") || "未命名场次"}</TextBlock><TextBlock theme={props.theme} className="line-clamp-2">{[scene?.location, scene?.time, scene?.mood].filter(Boolean).join(" / ") || "地点、时间与氛围尚未填写"}</TextBlock>{scene?.purpose ? <TextBlock theme={props.theme} className="line-clamp-2">{scene.purpose}</TextBlock> : null}{scene?.beatSummary ? <TextBlock theme={props.theme} className="line-clamp-2">{scene.beatSummary}</TextBlock> : null}{scene?.notes ? <TextBlock theme={props.theme} className="line-clamp-2">{scene.notes}</TextBlock> : null}<span className="text-[10px]" style={{ color: props.theme.node.muted }}>受影响 {shotCount} 个镜头</span></div>}</FilmCard>;
}

export function FilmCharacterNodeCard(props: FilmNodeCardProps) {
    const asset = props.node.metadata?.filmCharacter?.asset;
    return <ContextNodeCard {...props} label="角色设定" details={[asset?.description, asset?.visualPrompt].filter(Boolean).join("\n")} />;
}

export function FilmLocationNodeCard(props: FilmNodeCardProps) {
    const asset = props.node.metadata?.filmLocation?.asset;
    const variants = asset?.location?.variants.map((variant) => variant.name).filter(Boolean).join("、");
    return <ContextNodeCard {...props} label="场景设定" details={[asset?.description, asset?.visualPrompt, variants && `场景变体：${variants}`].filter(Boolean).join("\n")} />;
}

export function FilmPropNodeCard(props: FilmNodeCardProps) {
    const asset = props.node.metadata?.filmProp?.asset;
    return <ContextNodeCard {...props} label="道具设定" details={[asset?.description, asset?.visualPrompt].filter(Boolean).join("\n")} />;
}

export function FilmStyleNodeCard(props: FilmNodeCardProps) {
    const asset = props.node.metadata?.filmStyle?.asset;
    return <ContextNodeCard {...props} label="全局风格圣经" details={[asset?.description, asset?.visualPrompt].filter(Boolean).join("\n")} />;
}

function ContextNodeCard(props: FilmNodeCardProps & { label: string; details: string }) {
    const summary = useFilmSummary(props);
    const affectedShotCount = props.connections.filter((edge) => edge.kind === "context" && edge.fromNodeId === props.node.id).length;
    const actions = props.onEditAsset ? [{ label: "编辑设定", primary: true, onClick: () => props.onEditAsset?.(props.node.id) }] : [];
    return <FilmCard {...props} summary={summary} actions={actions}>{() => <div className="flex flex-col gap-2 p-3"><span className="text-[10px]" style={{ color: props.theme.node.muted }}>{props.label}</span><TextBlock theme={props.theme} prominent>{props.node.metadata?.filmCharacter?.asset.name || props.node.metadata?.filmLocation?.asset.name || props.node.metadata?.filmProp?.asset.name || props.node.metadata?.filmStyle?.asset.name || props.node.title}</TextBlock><TextBlock theme={props.theme} className="line-clamp-5">{props.details || "设定内容尚未填写"}</TextBlock><span className="text-[10px]" style={{ color: props.theme.node.muted }}>受影响 {affectedShotCount} 个镜头</span></div>}</FilmCard>;
}

export function FilmShotNodeCard(props: FilmNodeCardProps) {
    const shot = props.node.metadata?.filmShot;
    const summary = useFilmSummary(props);
    const imageSrc = useResolvedMediaSrc(shot?.imageUrl, shot?.storageKey);
    const videoSrc = useResolvedMediaSrc(shot?.videoUrl, shot?.videoStorageKey, "media");
    const imageCount = summary.imageVersionCount || 0;
    const videoCount = summary.videoVersionCount || 0;
    const currentVersionLabel = [
        imageCount ? `图 v${currentVersionIndex(shot?.imageVersions, shot?.imageUrl, shot?.storageKey) + 1}` : "",
        videoCount ? `视频 v${currentVersionIndex(shot?.videoVersions, shot?.videoUrl, shot?.videoStorageKey) + 1}` : "",
    ].filter(Boolean).join(" / ");
    const contextLabels = summary.contextLabels || [];
    const actions: FilmNodeShellAction[] = [];
    if (props.onGenerateImage) actions.push({ label: "生成分镜图", primary: true, onClick: () => props.onGenerateImage?.(props.node.id), disabled: summary.pendingGeneration !== null });
    if (props.onGenerateVideo) actions.push({ label: "生成视频", onClick: () => props.onGenerateVideo?.(props.node.id), disabled: summary.pendingGeneration !== null });
    if (props.onFocusShot) actions.push({ label: "打开镜头聚焦", onClick: () => props.onFocusShot?.(props.node.id) });
    if (props.onEditAsset) actions.push({ label: "镜头概览", onClick: () => props.onEditAsset?.(props.node.id) });
    if (props.onOpenVersions && imageCount) actions.push({ label: `图片版本 ${imageCount}`, onClick: () => props.onOpenVersions?.(props.node.id, "image") });
    if (props.onOpenVersions && videoCount) actions.push({ label: `视频版本 ${videoCount}`, onClick: () => props.onOpenVersions?.(props.node.id, "video") });
    return <FilmCard {...props} summary={summary} actions={actions}>{(nodeSummary) => <div className="flex h-full min-h-0 flex-col gap-2 p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{nodeSummary.shotNo || "未编号"}</span><span className="text-[10px]" style={{ color: props.theme.node.muted }}>{nodeSummary.sceneLabel}</span></div><div className="text-xs" style={{ color: props.theme.node.text }}>{shot?.shotType || "未设置景别"} · {shot?.cameraMovement || "未设置运镜"} · {shot?.duration ?? 0}s</div><TextBlock theme={props.theme} className="line-clamp-2">{nodeSummary.description || "镜头描述尚未填写"}</TextBlock><div className="flex flex-wrap gap-1">{contextLabels.slice(0, 6).map((label) => <span key={label} className="max-w-full truncate rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: props.theme.node.stroke, color: props.theme.node.muted }}>{label}</span>)}{contextLabels.length > 6 ? <span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: props.theme.node.stroke, color: props.theme.node.muted }}>+{contextLabels.length - 6}</span> : null}</div><button type="button" className="relative flex min-h-[96px] w-full flex-1 items-center justify-center overflow-hidden rounded border" style={{ borderColor: props.theme.node.stroke, background: props.theme.node.fill, color: props.theme.node.placeholder }} onPointerDown={(event) => event.stopPropagation()} onClick={() => props.onViewMedia?.(props.node)} disabled={!imageSrc && !videoSrc} aria-label="预览镜头媒体">{videoSrc ? <video src={videoSrc} muted playsInline className="h-full w-full object-contain" /> : imageSrc ? <img src={imageSrc} alt={shot?.shotNo || "镜头分镜图"} className="h-full w-full object-contain" /> : <span className="text-xs">空镜头画面</span>}</button><div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px]" style={{ color: props.theme.node.muted }}><span className="flex items-center gap-1">当前 {currentVersionLabel || "—"} · 共 {props.onOpenVersions && imageCount ? <button type="button" className="underline underline-offset-2" onPointerDown={(event) => event.stopPropagation()} onClick={() => props.onOpenVersions?.(props.node.id, "image")}>图 {imageCount}</button> : <span>图 {imageCount}</span>} / {props.onOpenVersions && videoCount ? <button type="button" className="underline underline-offset-2" onPointerDown={(event) => event.stopPropagation()} onClick={() => props.onOpenVersions?.(props.node.id, "video")}>视频 {videoCount}</button> : <span>视频 {videoCount}</span>}</span><span>上一镜 #{nodeSummary.previousShotNo || "无"} · 参考 {nodeSummary.referenceCount ?? "—"}</span><span style={{ color: nodeSummary.status === "error" ? canvasStatusColors.error : nodeSummary.needsRefresh ? canvasStatusColors.loading : undefined }}>{nodeSummary.pendingGeneration ? `${nodeSummary.pendingGeneration === "image" ? "分镜图" : "视频"}生成中${typeof nodeSummary.progress === "number" && nodeSummary.progress > 0 ? ` ${nodeSummary.progress}%` : ""}` : nodeSummary.status === "error" ? "生成失败" : nodeSummary.needsRefresh ? "需更新" : nodeSummary.refreshState === "unrecorded" ? "未记录生成上下文" : "上下文一致"}</span></div></div>}</FilmCard>;
}

function currentVersionIndex(versions: Array<{ url: string; storageKey?: string }> | undefined, url?: string, storageKey?: string) {
    if (!versions?.length) return -1;
    const index = versions.findIndex((version) => (url && version.url === url) || (storageKey && version.storageKey === storageKey));
    return index >= 0 ? index : versions.length - 1;
}

const filmNodeCards: Record<FilmNodeType, (props: FilmNodeCardProps) => ReactNode> = {
    filmScript: FilmScriptNodeCard,
    filmScene: FilmSceneNodeCard,
    filmShot: FilmShotNodeCard,
    filmCharacter: FilmCharacterNodeCard,
    filmLocation: FilmLocationNodeCard,
    filmProp: FilmPropNodeCard,
    filmStyle: FilmStyleNodeCard,
    filmBeat: FilmBeatNodeCard,
};

export function FilmNodeCardDispatcher(props: FilmNodeCardProps) {
    const type = FILM_NODE_TYPE_BY_CANVAS_TYPE[props.node.type];
    const Card = type ? filmNodeCards[type] : null;
    return Card ? <Card {...props} /> : null;
}
