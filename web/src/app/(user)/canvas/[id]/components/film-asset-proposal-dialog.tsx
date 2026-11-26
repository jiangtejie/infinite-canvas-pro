"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import { suggestionKindLabel } from "@/lib/film/film-asset-suggestions";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmScriptAssetProposal } from "../lib/film-script-assets";

type AssetEditPatch = { name?: string; aliases?: string[]; kind?: FilmAssetSuggestionKind; forceNew?: boolean };

type Props = {
    theme: CanvasTheme;
    proposal: FilmScriptAssetProposal;
    selectedKeys: Set<string>;
    bindMentions: boolean;
    onToggle: (key: string) => void;
    onSelectAll: () => void;
    onClear: () => void;
    onBindChange: (value: boolean) => void;
    onEditAsset?: (key: string, patch: AssetEditPatch) => void;
    onMergeAsset?: (sourceKey: string, targetKey: string) => void;
};

const KIND_ORDER: FilmAssetSuggestionKind[] = ["character", "location", "prop", "costume"];

export function FilmAssetProposalTab({ theme, proposal, selectedKeys, bindMentions, onToggle, onSelectAll, onClear, onBindChange, onEditAsset, onMergeAsset }: Props) {
    const [editing, setEditing] = useState(false);
    return (
        <div className="flex flex-col gap-3" style={{ color: theme.node.text }}>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>提案 {proposal.totals.assets} 项</span>
                {KIND_ORDER.filter((kind) => proposal.totals.byKind[kind]).map((kind) => (
                    <span key={kind} className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{suggestionKindLabel(kind)} {proposal.totals.byKind[kind]}</span>
                ))}
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已有 {proposal.totals.existing} 项</span>
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>母版库 {proposal.totals.library} 项</span>
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>提案提及 {proposal.totals.mentions} 镜</span>
                <span className="ml-auto flex items-center gap-1">
                    {onEditAsset ? <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: editing ? theme.canvas.selectionStroke : theme.node.stroke, color: editing ? theme.node.text : theme.node.muted }} onClick={() => setEditing((value) => !value)}>{editing ? "完成编辑" : "编辑资产"}</button> : null}
                    <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onSelectAll}>全选</button>
                    <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onClear}>清空</button>
                </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                <input type="checkbox" checked={bindMentions} onChange={(event) => onBindChange(event.target.checked)} aria-label="按名称或别名关联提及镜头" />
                <span className="shrink-0">按名称/别名关联提及镜头</span>
                <span className="ml-auto hidden truncate text-[11px] md:block" style={{ color: theme.node.muted }}>应用后按最终镜头文本匹配；服装不绑定。</span>
            </label>
            <div className="flex flex-col gap-3">
                {proposal.items.length ? null : <div className="grid min-h-[160px] place-items-center rounded-lg border px-3 text-center text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>没有提取到资产；可在分析预设中关闭资产提取，或重新分析补充。</div>}
                {KIND_ORDER.map((kind) => {
                    const items = proposal.items.filter((item) => item.kind === kind);
                    if (!items.length) return null;
                    return (
                        <section key={kind} className="flex flex-col gap-2">
                            <div className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{suggestionKindLabel(kind)} · {items.length}</div>
                            <div className="grid gap-2 md:grid-cols-2">
                                {items.map((item) => {
                                    const applicable = item.kind !== "costume";
                                    const checked = applicable && selectedKeys.has(item.key);
                                    const matchLabel = item.match === "canvas" ? "画布已有" : item.match === "library" ? "母版库复用" : "新建";
                                    const inputStyle = { background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke };
                                    return (
                                        <label key={item.key} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: checked ? theme.canvas.selectionStroke : theme.node.stroke, background: checked ? theme.canvas.selectionSoft : theme.node.fill, opacity: applicable ? 1 : 0.6 }}>
                                            <input type="checkbox" className="mt-1" checked={checked} disabled={!applicable} onChange={() => applicable && onToggle(item.key)} aria-label={`选择资产 ${item.name}`} />
                                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                {editing && onEditAsset ? (
                                                    <span className="flex flex-col gap-1" onClick={(event) => event.stopPropagation()}>
                                                        <span className="flex flex-wrap items-center gap-1">
                                                            <input aria-label={`资产名 ${item.name}`} className="min-w-0 flex-1 rounded border px-1.5 py-0.5 text-xs" style={inputStyle} value={item.name} onChange={(event) => onEditAsset(item.key, { name: event.target.value })} />
                                                            <select aria-label={`资产类别 ${item.name}`} className="rounded border px-1 py-0.5 text-[11px]" style={inputStyle} value={item.kind} onChange={(event) => onEditAsset(item.key, { kind: event.target.value as FilmAssetSuggestionKind })}>
                                                                {KIND_ORDER.map((value) => <option key={value} value={value}>{suggestionKindLabel(value)}</option>)}
                                                            </select>
                                                            <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px]" style={{ borderColor: item.match === "library" ? theme.canvas.selectionStroke : theme.node.stroke, color: item.match === "library" ? theme.canvas.selectionStroke : theme.node.muted }}>{matchLabel}</span>
                                                        </span>
                                                        <input aria-label={`别名 ${item.name}`} className="rounded border px-1.5 py-0.5 text-[11px]" style={inputStyle} placeholder="别名，用顿号分隔" value={item.aliases.join("、")} onChange={(event) => onEditAsset(item.key, { aliases: event.target.value.split(/[、,，]+/).map((value) => value.trim()).filter(Boolean) })} />
                                                        <span className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                                            {item.libraryAsset ? <label className="flex items-center gap-1"><input type="checkbox" checked={item.forceNew === true} onChange={(event) => onEditAsset(item.key, { forceNew: event.target.checked })} />强制新建</label> : null}
                                                            {onMergeAsset && proposal.items.length > 1 ? <select aria-label={`合并 ${item.name}`} className="rounded border px-1 py-0.5" style={inputStyle} value="" onChange={(event) => { if (event.target.value) onMergeAsset(item.key, event.target.value); }}>
                                                                <option value="">合并到…</option>
                                                                {proposal.items.filter((other) => other.key !== item.key).map((other) => <option key={other.key} value={other.key}>{suggestionKindLabel(other.kind)} · {other.name}</option>)}
                                                            </select> : null}
                                                            <span>{item.mentionShotIds.length ? `提及 ${item.mentionShotIds.length} 镜` : "剧本未直接提及"}</span>
                                                        </span>
                                                        {item.categoryConflict ? <span className="text-[11px] leading-4" style={{ color: canvasStatusColors.loading }}>{item.categoryConflict}</span> : null}
                                                        {item.mentionEvidence?.length ? <span className="truncate text-[11px]" style={{ color: theme.node.muted }}>命中：{item.mentionEvidence.join("、")}</span> : null}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span className="flex flex-wrap items-center gap-1.5">
                                                            <span className="truncate text-xs font-medium">{item.name}</span>
                                                            <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px]" style={{ borderColor: item.match === "library" ? theme.canvas.selectionStroke : theme.node.stroke, color: item.match === "library" ? theme.canvas.selectionStroke : theme.node.muted }}>{matchLabel}</span>
                                                            {applicable ? null : <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>仅母版库</span>}
                                                            <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>{item.mentionShotIds.length ? `提及 ${item.mentionShotIds.length} 镜` : "剧本未直接提及"}</span>
                                                        </span>
                                                        {item.categoryConflict ? <span className="text-[11px] leading-4" style={{ color: canvasStatusColors.loading }}>{item.categoryConflict}</span> : null}
                                                        {item.aliases.length ? <span className="truncate text-[11px]" style={{ color: theme.node.muted }}>别名：{item.aliases.join("、")}</span> : null}
                                                        {item.mentionEvidence?.length ? <span className="truncate text-[11px]" style={{ color: theme.node.muted }}>命中：{item.mentionEvidence.join("、")}</span> : null}
                                                        <span className="truncate text-[11px]" style={{ color: theme.node.muted }}>{item.description || item.visualPrompt || "还没有设定描述"}</span>
                                                    </>
                                                )}
                                            </span>
                                            {checked ? <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: theme.canvas.selectionStroke }} /> : null}
                                        </label>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
