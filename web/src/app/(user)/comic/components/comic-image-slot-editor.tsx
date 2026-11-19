"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { App, Button, Dropdown } from "antd";
import { FolderOpen, ImagePlus, Lock, Star, Trash2, Unlock, Upload } from "lucide-react";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/assets/asset-picker-modal";
import { cn } from "@/lib/utils";
import { uploadImage } from "@/services/image-storage";
import { useComicImageSrc } from "../hooks/use-comic-image-src";
import type { ComicImageSlot } from "../types";
import { COMIC_IMAGE_SLOT_LIMIT, activeComicSlotImage, appendComicSlotImage, removeComicSlotImage, selectComicSlotImage, updateComicSlotImage } from "../utils/comic-image-slot";
import { comicImageFromPickedAsset } from "../utils/comic-reference";

export function ComicImageSlotEditor({ slot, label, onChange, disabled }: {
    slot: ComicImageSlot;
    label: string;
    onChange: (slot: ComicImageSlot) => void;
    disabled?: boolean;
}) {
    const { message } = App.useApp();
    const uploadRef = useRef<HTMLInputElement>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const active = activeComicSlotImage(slot);
    const activeIndex = active ? slot.images.findIndex((image) => image.id === active.id) : -1;

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setUploading(true);
        try {
            onChange(appendComicSlotImage(slot, await uploadImage(file)));
        } catch {
            message.error("图片上传失败");
        } finally {
            setUploading(false);
        }
    };

    const handlePicked = async (payload: InsertAssetPayload) => {
        setPickerOpen(false);
        setUploading(true);
        try {
            onChange(appendComicSlotImage(slot, await comicImageFromPickedAsset(payload)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材引入失败");
        } finally {
            setUploading(false);
        }
    };

    const rate = (rating: number) => {
        if (!active) return;
        onChange(updateComicSlotImage(slot, active.id, { rating: active.rating === rating ? 0 : rating }));
    };

    return (
        <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
                <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60 uppercase">
                    {label} {slot.images.length}/{COMIC_IMAGE_SLOT_LIMIT}{active ? ` · 当前 v${activeIndex + 1}` : ""}
                </span>
                {slot.locked ? <span className="chip chip-acid"><Lock className="mr-0.5 inline size-2.5" />锁定</span> : null}
                <div className="ml-auto flex items-center gap-1">
                    <Dropdown
                        trigger={["click"]}
                        disabled={disabled}
                        menu={{
                            items: [
                                { key: "upload", icon: <Upload className="size-3.5" />, label: "上传本地图片", onClick: () => uploadRef.current?.click() },
                                { key: "asset", icon: <FolderOpen className="size-3.5" />, label: "从我的素材 / 素材库选择", onClick: () => setPickerOpen(true) },
                            ],
                        }}
                    >
                        <Button size="small" className="!h-6 !px-1.5" icon={<ImagePlus className="size-3" />} disabled={disabled || uploading}>加入</Button>
                    </Dropdown>
                    <Button
                        size="small"
                        type="text"
                        className="!h-6 !w-6 !min-w-6 !p-0"
                        aria-label={slot.locked ? "解锁参考图" : "锁定参考图"}
                        icon={slot.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                        onClick={() => onChange({ ...slot, locked: !slot.locked })}
                    />
                </div>
            </div>
            {slot.images.length ? (
                <div className="grid grid-cols-3 gap-1">
                    {slot.images.map((image, index) => (
                        <SlotThumbnail
                            key={image.id}
                            image={image}
                            active={active?.id === image.id}
                            index={index}
                            onSelect={() => onChange(selectComicSlotImage(slot, image.id))}
                        />
                    ))}
                </div>
            ) : <p className="m-0 rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[10px] text-muted-foreground/60">还没有图片，可上传或选择素材。</p>}
            {active ? (
                <div className="flex flex-wrap items-center gap-1">
                    {([1, 2, 3] as const).map((rating) => (
                        <button
                            key={rating}
                            type="button"
                            className={cn("grid size-5 place-items-center rounded border text-[9px]", (active.rating || 0) >= rating ? "border-acid/60 text-acid" : "border-border/60 text-muted-foreground/50 hover:text-foreground")}
                            aria-label={`评分 ${rating}`}
                            onClick={() => rate(rating)}
                        >
                            <Star className="size-2.5" />
                        </button>
                    ))}
                    <Button
                        size="small"
                        type="text"
                        danger
                        className="!h-6 !px-1.5"
                        icon={<Trash2 className="size-3" />}
                        onClick={() => onChange(removeComicSlotImage(slot, active.id))}
                    >
                        删除当前
                    </Button>
                </div>
            ) : null}
            <input ref={uploadRef} hidden type="file" accept="image/*" onChange={(event) => void handleFile(event)} />
            <AssetPickerModal open={pickerOpen} defaultTab="my-assets" kind="image" onInsert={(payload) => void handlePicked(payload)} onClose={() => setPickerOpen(false)} />
        </div>
    );
}

function SlotThumbnail({ image, active, index, onSelect }: { image: ComicImageSlot["images"][number]; active: boolean; index: number; onSelect: () => void }) {
    const src = useComicImageSrc(image);
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={active}
            className={cn("relative overflow-hidden rounded-md border transition-colors", active ? "border-acid" : "border-border/60 hover:border-acid/50")}
            title={image.label || `版本 ${index + 1}`}
        >
            <span className="grid h-12 place-items-center bg-background/40 text-muted-foreground">
                {src ? <img src={src} alt={image.label || `版本 ${index + 1}`} className="size-full object-cover" /> : <ImagePlus className="size-3.5" />}
            </span>
            <span className="absolute left-0.5 top-0.5 rounded bg-background/80 px-1 font-mono text-[7px] text-foreground/70">v{index + 1}</span>
            {image.rating ? <span className="absolute right-0.5 top-0.5 rounded bg-background/80 px-1 font-mono text-[7px] text-acid">{"★".repeat(image.rating)}</span> : null}
        </button>
    );
}
