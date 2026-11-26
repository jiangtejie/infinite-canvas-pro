"use client";

import { useState } from "react";
import { Modal } from "antd";
import { Check } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset } from "@/lib/film/types";
import type { FilmAssetProjectKind } from "../lib/film-script-assets";

export type FilmLibrarySaveCandidate = { nodeId: string; kind: FilmAssetProjectKind; asset: FilmAsset };

type Props = {
    theme: CanvasTheme;
    assets: FilmLibrarySaveCandidate[];
    onClose: () => void;
    onSave: (selected: FilmLibrarySaveCandidate[]) => void;
};

/** 分析应用后的存库建议：默认勾选角色与场景，道具留给用户确认。 */
export function FilmLibrarySaveDialog({ theme, assets, onClose, onSave }: Props) {
    const [selected, setSelected] = useState(() => new Set(assets.filter((item) => item.kind !== "prop").map((item) => item.nodeId)));
    const toggle = (nodeId: string) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
    });
    const chosen = assets.filter((item) => selected.has(item.nodeId));
    return (
        <Modal open onCancel={onClose} footer={null} closable={false} centered width="min(560px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex max-h-[80vh] flex-col" style={{ color: theme.node.text }}>
                <div className="border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="text-base font-semibold">存入母版库</div>
                    <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>{assets.length} 项新资产可沉淀到母版库，供其他影视项目复用；默认勾选角色与场景。</div>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <div className="flex flex-col gap-2">
                        {assets.map((item) => {
                            const checked = selected.has(item.nodeId);
                            return (
                                <label key={item.nodeId} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: checked ? theme.canvas.selectionStroke : theme.node.stroke, background: checked ? theme.canvas.selectionSoft : theme.node.fill }}>
                                    <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggle(item.nodeId)} aria-label={`存入母版库 ${item.asset.name}`} />
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <span className="truncate text-xs font-medium">{item.asset.name}</span>
                                            <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{FILM_ASSET_KIND_LABELS[item.kind]}</span>
                                        </span>
                                        <span className="line-clamp-2 text-[10px]" style={{ color: theme.node.muted }}>{item.asset.description || item.asset.visualPrompt || "还没有设定描述"}</span>
                                    </span>
                                    {checked ? <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: theme.canvas.selectionStroke }} /> : null}
                                </label>
                            );
                        })}
                    </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>已选 {chosen.length} 项</span>
                    <div className="flex gap-2">
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>暂不保存</button>
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!chosen.length} onClick={() => onSave(chosen)}>存入母版库</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
