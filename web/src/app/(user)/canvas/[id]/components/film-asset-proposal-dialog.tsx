"use client";

import { Check } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import { suggestionKindLabel } from "@/lib/film/film-asset-suggestions";
import type { FilmScriptAssetProposal } from "../lib/film-script-assets";

type Props = {
    theme: CanvasTheme;
    proposal: FilmScriptAssetProposal;
    selectedKeys: Set<string>;
    bindMentions: boolean;
    onToggle: (key: string) => void;
    onSelectAll: () => void;
    onClear: () => void;
    onBindChange: (value: boolean) => void;
};

const KIND_ORDER: FilmAssetSuggestionKind[] = ["character", "location", "prop", "costume"];

export function FilmAssetProposalTab({ theme, proposal, selectedKeys, bindMentions, onToggle, onSelectAll, onClear, onBindChange }: Props) {
    return (
        <div className="flex flex-col gap-3" style={{ color: theme.node.text }}>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>提案 {proposal.totals.assets} 项</span>
                {KIND_ORDER.filter((kind) => proposal.totals.byKind[kind]).map((kind) => (
                    <span key={kind} className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{suggestionKindLabel(kind)} {proposal.totals.byKind[kind]}</span>
                ))}
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已有 {proposal.totals.existing} 项</span>
                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>提案提及 {proposal.totals.mentions} 镜</span>
                <span className="ml-auto flex items-center gap-1">
                    <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onSelectAll}>全选</button>
                    <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onClear}>清空</button>
                </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                <input type="checkbox" checked={bindMentions} onChange={(event) => onBindChange(event.target.checked)} aria-label="按名称或别名关联提及镜头" />
                <span className="flex flex-col gap-0.5">
                    <span>按名称/别名关联提及镜头</span>
                    <span className="text-[10px]" style={{ color: theme.node.muted }}>应用后按最终镜头文本匹配并写入场景引用；每镜最多一个场景，服装不绑定。</span>
                </span>
            </label>
            <div className="flex flex-col gap-3">
                {KIND_ORDER.map((kind) => {
                    const items = proposal.items.filter((item) => item.kind === kind);
                    if (!items.length) return null;
                    return (
                        <section key={kind} className="flex flex-col gap-2">
                            <div className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{suggestionKindLabel(kind)} · {items.length}</div>
                            {items.map((item) => {
                                const applicable = item.kind !== "costume";
                                const checked = applicable && selectedKeys.has(item.key);
                                return (
                                    <label key={item.key} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: checked ? theme.canvas.selectionStroke : theme.node.stroke, background: checked ? theme.canvas.selectionSoft : theme.node.fill, opacity: applicable ? 1 : 0.6 }}>
                                        <input type="checkbox" className="mt-1" checked={checked} disabled={!applicable} onChange={() => applicable && onToggle(item.key)} aria-label={`选择资产 ${item.name}`} />
                                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                                            <span className="flex flex-wrap items-center gap-1.5">
                                                <span className="truncate text-xs font-medium">{item.name}</span>
                                                {item.existingNodeId ? <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>画布已有</span> : null}
                                                {applicable ? null : <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>仅母版库</span>}
                                                <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>{item.mentionShotIds.length ? `提及 ${item.mentionShotIds.length} 镜` : "剧本未直接提及"}</span>
                                            </span>
                                            {item.aliases.length ? <span className="truncate text-[10px]" style={{ color: theme.node.muted }}>别名：{item.aliases.join("、")}</span> : null}
                                            <span className="truncate text-[11px]" style={{ color: theme.node.muted }}>{item.description || item.visualPrompt || "还没有设定描述"}</span>
                                        </span>
                                        {checked ? <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: theme.canvas.selectionStroke }} /> : null}
                                    </label>
                                );
                            })}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
