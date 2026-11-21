"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { App, Input } from "antd";
import { FolderOpen, Lock, Star, Trash2, Unlock, Upload } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmAsset, FilmAssetKind, FilmCharacterProfile, FilmCharacterState, FilmImageRef, FilmImageSlot, FilmLocationVariant } from "@/lib/film/types";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/assets/asset-picker-modal";
import { uploadImage } from "@/services/image-storage";
import { createCharacterState, ensureCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { activeSlotImage, appendSlotImage, createFilmImageSlot, FILM_IMAGE_SLOT_LIMIT, removeSlotImage, selectSlotImage, updateSlotImage } from "@/app/(user)/film/utils/film-image-slot";

type FilmAssetSlotFieldsProps = {
    theme: CanvasTheme;
    kind: FilmAssetKind;
    asset: FilmAsset;
    onChange: (patch: Partial<FilmAsset>) => void;
};

export function FilmAssetSlotFields({ theme, kind, asset, onChange }: FilmAssetSlotFieldsProps) {
    const profile = ensureCharacterProfile(asset);
    const variants = asset.location?.variants ?? [];
    const patchProfile = (patch: Partial<FilmCharacterProfile>) => onChange({ character: { ...profile, ...patch } });
    const patchState = (stateId: string, patch: Partial<FilmCharacterState>) => patchProfile({ states: profile.states.map((state) => state.id === stateId ? { ...state, ...patch } : state) });
    const patchVariants = (next: FilmLocationVariant[]) => onChange({ location: { variants: next } });
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };

    return (
        <div className="flex flex-col gap-3">
            <SlotEditor theme={theme} title={kind === "style" ? "风格参考" : "概念图"} slot={asset.concept} nextLabel={kind === "style" ? "风格参考" : "概念图"} onChange={(concept) => onChange({ concept })} />
            {kind === "location" || kind === "prop" || kind === "costume" ? (
                <SlotEditor theme={theme} title="设定图（角度 / 细节）" slot={asset.views ?? createFilmImageSlot()} onChange={(views) => onChange({ views })} />
            ) : null}
            {kind === "character" ? (
                <>
                    <SlotEditor theme={theme} title="角色母版（身份包）" slot={profile.master} nextLabel={asset.name} onChange={(master) => patchProfile({ master })} />
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

function SlotEditor({ theme, title, slot, nextLabel, onChange }: { theme: CanvasTheme; title: string; slot: FilmImageSlot; nextLabel?: string; onChange: (slot: FilmImageSlot) => void }) {
    const { message } = App.useApp();
    const uploadRef = useRef<HTMLInputElement>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const active = activeSlotImage(slot);
    const activeIndex = active ? slot.images.findIndex((image) => image.id === active.id) : -1;
    const addImage = (image: FilmImageRef) => onChange(appendSlotImage(slot, nextLabel ? { ...image, label: image.label || nextLabel } : image));

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            const uploaded = await uploadImage(file);
            addImage({ id: crypto.randomUUID(), url: uploaded.url, storageKey: uploaded.storageKey, source: "upload", width: uploaded.width, height: uploaded.height, createdAt: new Date().toISOString() });
        } catch {
            message.error("图片上传失败");
        }
    };

    const handlePickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind !== "image") {
            message.warning("请选择图片素材");
            return;
        }
        setPickerOpen(false);
        try {
            if (payload.storageKey || payload.source === "library") {
                addImage({ id: crypto.randomUUID(), url: payload.dataUrl, storageKey: payload.storageKey, source: payload.source === "library" ? "library" : "asset", createdAt: new Date().toISOString() });
                return;
            }
            const uploaded = await uploadImage(payload.dataUrl);
            addImage({ id: crypto.randomUUID(), url: uploaded.url, storageKey: uploaded.storageKey, source: "asset", createdAt: new Date().toISOString() });
        } catch {
            message.error("素材引入失败");
        }
    };

    return (
        <div className="flex flex-col gap-1.5 rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px]" style={{ color: theme.node.text }}>{title}</span>
                <span className="text-[10px]" style={{ color: theme.node.muted }}>版本 {slot.images.length}/{FILM_IMAGE_SLOT_LIMIT}{active ? ` · v${activeIndex + 1}` : ""}</span>
                {slot.locked ? <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: theme.canvas.selectionStroke }}><Lock className="size-2.5" />锁定</span> : null}
                <div className="ml-auto flex items-center gap-1">
                    <button type="button" className="grid size-6 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => uploadRef.current?.click()} aria-label={`上传${title}`}><Upload className="size-3" /></button>
                    <button type="button" className="grid size-6 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => setPickerOpen(true)} aria-label={`从素材选择${title}`}><FolderOpen className="size-3" /></button>
                    <button type="button" className="grid size-6 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => onChange({ ...slot, locked: !slot.locked })} aria-label={slot.locked ? `解锁${title}` : `锁定${title}`}>{slot.locked ? <Unlock className="size-3" /> : <Lock className="size-3" />}</button>
                </div>
            </div>
            {slot.images.length ? (
                <div className="grid grid-cols-4 gap-1.5">
                    {slot.images.map((image, index) => (
                        <button key={image.id} type="button" className="relative h-14 overflow-hidden rounded-md border" style={{ borderColor: active?.id === image.id ? theme.canvas.selectionStroke : theme.node.stroke, background: theme.node.panel }} onClick={() => onChange(selectSlotImage(slot, image.id))} aria-pressed={active?.id === image.id} title={image.label || `版本 ${index + 1}`}>
                            <SlotThumb theme={theme} url={image.url} storageKey={image.storageKey} />
                            <span className="absolute left-0.5 top-0.5 rounded bg-black/55 px-1 text-[8px] text-white">v{index + 1}</span>
                            {image.rating ? <span className="absolute right-0.5 top-0.5 rounded bg-black/55 px-1 text-[8px] text-amber-300">{"★".repeat(image.rating)}</span> : null}
                            {image.label ? <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[8px] text-white">{image.label}</span> : null}
                        </button>
                    ))}
                </div>
            ) : <span className="text-[10px]" style={{ color: theme.node.muted }}>还没有图片，可以上传、从素材选择或由后续生成写入。</span>}
            {active ? (
                <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px]" style={{ color: theme.node.muted }}>评分</span>
                    {([1, 2, 3] as const).map((rating) => (
                        <button key={rating} type="button" className="grid size-5 place-items-center rounded border" style={{ borderColor: (active.rating || 0) >= rating ? theme.canvas.selectionStroke : theme.node.stroke, color: (active.rating || 0) >= rating ? theme.canvas.selectionStroke : theme.node.muted }} aria-label={`评分 ${rating}`} onClick={() => onChange(updateSlotImage(slot, active.id, { rating: active.rating === rating ? 0 : rating }))}><Star className="size-2.5" /></button>
                    ))}
                    <button type="button" className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => onChange(removeSlotImage(slot, active.id))}><Trash2 className="size-2.5" />删除当前</button>
                </div>
            ) : null}
            <input ref={uploadRef} hidden type="file" accept="image/*" onChange={handleFile} />
            <AssetPickerModal open={pickerOpen} defaultTab="my-assets" kind="image" onInsert={(payload) => void handlePickedAsset(payload)} onClose={() => setPickerOpen(false)} />
        </div>
    );
}

function SlotThumb({ theme, url, storageKey }: { theme: CanvasTheme; url?: string; storageKey?: string }) {
    const src = useResolvedMediaSrc(url, storageKey);
    return src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[9px]" style={{ color: theme.node.muted }}>无图</span>;
}
