"use client";

import { Input } from "antd";
import { Trash2 } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmAsset, FilmAssetKind, FilmCharacterProfile, FilmCharacterState, FilmLocationVariant } from "@/lib/film/types";
import { createCharacterState, ensureCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { appendSlotImage, createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";
import { FilmReferenceBoardPanel } from "./film-reference-board-panel";
import { SlotEditor } from "./film-image-slot-editor";

type FilmAssetSlotFieldsProps = {
    theme: CanvasTheme;
    kind: FilmAssetKind;
    asset: FilmAsset;
    nodeId: string;
    projectId: string;
    onChange: (patch: Partial<FilmAsset>) => void;
    onChangeAsset: (updater: (asset: FilmAsset) => FilmAsset) => void;
};

export function FilmAssetSlotFields({ theme, kind, asset, nodeId, projectId, onChange, onChangeAsset }: FilmAssetSlotFieldsProps) {
    const profile = ensureCharacterProfile(asset);
    const variants = asset.location?.variants ?? [];
    const patchProfile = (patch: Partial<FilmCharacterProfile>) => onChange({ character: { ...profile, ...patch } });
    const patchState = (stateId: string, patch: Partial<FilmCharacterState>) => patchProfile({ states: profile.states.map((state) => state.id === stateId ? { ...state, ...patch } : state) });
    const patchVariants = (next: FilmLocationVariant[]) => onChange({ location: { variants: next } });
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };

    return (
        <div className="flex flex-col gap-3">
            {kind !== "character" ? <SlotEditor theme={theme} title={kind === "style" ? "风格参考" : "概念图"} slot={asset.concept} nextLabel={kind === "style" ? "风格参考" : "概念图"} onChange={(concept) => onChange({ concept })} /> : null}
            {kind === "location" || kind === "prop" || kind === "costume" ? (
                <SlotEditor theme={theme} title="设定图（角度 / 细节）" slot={asset.views ?? createFilmImageSlot()} onChange={(views) => onChange({ views })} />
            ) : null}
            {kind === "character" ? (
                <>
                    <FilmReferenceBoardPanel
                        theme={theme}
                        asset={asset}
                        nodeId={nodeId}
                        projectId={projectId}
                        onChangeTemplate={(templateId) => onChange({ referenceTemplateId: templateId })}
                        onChangeBoard={(board) => onChangeAsset((current) => ({ ...current, character: { ...ensureCharacterProfile(current), board } }))}
                        onGenerated={(image, templateId) => onChangeAsset((current) => {
                            const nextProfile = ensureCharacterProfile(current);
                            return {
                                ...current,
                                referenceTemplateId: templateId,
                                character: { ...nextProfile, board: appendSlotImage(nextProfile.board ?? createFilmImageSlot(), image) },
                            };
                        })}
                        onPendingTask={(pendingTask) => onChangeAsset((current) => ({ ...current, pendingTask: pendingTask ?? undefined }))}
                    />
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>造型状态 · {profile.states.length}</span>
                        <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => patchProfile({ states: [...profile.states, createCharacterState(profile.states.length + 1)] })}>+ 新增造型</button>
                    </div>
                    {profile.states.map((state) => (
                        <div key={state.id} className="flex flex-col gap-2 rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                            <div className="flex items-center gap-1">
                                <Input size="small" value={state.name} style={inputStyle} onChange={(event) => patchState(state.id, { name: event.target.value })} />
                                <button type="button" className="grid size-7 shrink-0 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => patchProfile({ states: profile.states.filter((item) => item.id !== state.id) })} aria-label={`删除造型 ${state.name}`}><Trash2 className="size-3.5" /></button>
                            </div>
                            <SlotEditor theme={theme} title="造型参考" slot={state.look} nextLabel={state.name} onChange={(look) => patchState(state.id, { look })} />
                        </div>
                    ))}
                </>
            ) : null}
            {kind === "location" ? (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>场景变体 · {variants.length}</span>
                        <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => patchVariants([...variants, { id: crypto.randomUUID(), name: `变体 ${variants.length + 1}`, description: "", concept: createFilmImageSlot() }])}>+ 新增变体</button>
                    </div>
                    {variants.map((variant) => (
                        <div key={variant.id} className="flex flex-col gap-2 rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                            <div className="flex items-center gap-1">
                                <Input size="small" value={variant.name} style={inputStyle} onChange={(event) => patchVariants(variants.map((item) => item.id === variant.id ? { ...item, name: event.target.value } : item))} />
                                <button type="button" className="grid size-7 shrink-0 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => patchVariants(variants.filter((item) => item.id !== variant.id))} aria-label={`删除变体 ${variant.name}`}><Trash2 className="size-3.5" /></button>
                            </div>
                            <SlotEditor theme={theme} title="变体概念图" slot={variant.concept} nextLabel={variant.name} onChange={(concept) => patchVariants(variants.map((item) => item.id === variant.id ? { ...item, concept } : item))} />
                        </div>
                    ))}
                </>
            ) : null}
        </div>
    );
}
