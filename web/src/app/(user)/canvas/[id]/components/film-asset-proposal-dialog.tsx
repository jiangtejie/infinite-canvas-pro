"use client";

import { Check, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import { suggestionKindLabel } from "@/lib/film/film-asset-suggestions";
import type { FilmScriptAssetProposal } from "../lib/film-script-assets";

type Props = {
    theme: CanvasTheme;
    proposal: FilmScriptAssetProposal;
    selectedKeys: Set<string>;
    bindToShots: boolean;
    onToggle: (key: string) => void;
    onSelectAll: () => void;
    onClear: () => void;
    onBindChange: (value: boolean) => void;
    onApply: () => void;
    onCancel: () => void;
};

const KIND_ORDER: FilmAssetSuggestionKind[] = ["character", "location", "prop", "costume"];

export function FilmAssetProposalDialog({ theme, proposal, selectedKeys, bindToShots, onToggle, onSelectAll, onClear, onBindChange, onApply, onCancel }: Props) {
    const selected = proposal.items.filter((item) => selectedKeys.has(item.key));
    const selectedNew = selected.filter((item) => !item.existingNodeId).length;
    const selectedExisting = selected.length - selectedNew;
    const linkedShots = new Set(selected.flatMap((item) => item.mentionShotIds)).size;
    return (
        <Modal open onCancel={onCancel} footer={null} closable={false} centered width="min(860px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="text-base font-semibold">AI 资产提案</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>确认要创建的资产；已有资产不会重复创建，勾选后可同时绑定到剧本中提及的镜头。</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onCancel} aria-label="关闭资产提案"><X className="size-4" /></button>
                </div>
                <div className="thin-scrollbar flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-5 py-4">
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>提案 {proposal.totals.assets} 项</span>
                        {KIND_ORDER.filter((kind) => proposal.totals.byKind[kind]).map((kind) => (
                            <span key={kind} className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{suggestionKindLabel(kind)} {proposal.totals.byKind[kind]}</span>
                        ))}
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已有 {proposal.totals.existing} 项</span>
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>剧本提及 {proposal.totals.mentions} 镜</span>
                        <span className="ml-auto flex items-center gap-1">
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onSelectAll}>全选</button>
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onClear}>清空</button>
                        </span>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <input type="checkbox" checked={bindToShots} onChange={(event) => onBindChange(event.target.checked)} aria-label="同时绑定到提及镜头" />
                        <span className="flex flex-col gap-0.5">
                            <span>同时绑定到提及镜头</span>
                            <span className="text-[10px]" style={{ color: theme.node.muted }}>按剧本中的名称与别名匹配；每镜最多一个场景，服装不直接绑定。</span>
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
                                        const checked = selectedKeys.has(item.key);
                                        return (
                                            <label key={item.key} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: checked ? theme.canvas.selectionStroke : theme.node.stroke, background: checked ? theme.canvas.selectionSoft : theme.node.fill }}>
                                                <input type="checkbox" className="mt-1" checked={checked} onChange={() => onToggle(item.key)} aria-label={`选择资产 ${item.name}`} />
                                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <span className="truncate text-xs font-medium">{item.name}</span>
                                                        {item.existingNodeId ? <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>画布已有</span> : null}
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
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>已选 {selected.length} 项 · 新建 {selectedNew} · 已有 {selectedExisting}{bindToShots && linkedShots ? ` · 提及 ${linkedShots} 镜` : ""}</span>
                    <div className="flex gap-2">
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCancel}>取消</button>
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selected.length} onClick={onApply}>应用 {selected.length} 项资产</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
