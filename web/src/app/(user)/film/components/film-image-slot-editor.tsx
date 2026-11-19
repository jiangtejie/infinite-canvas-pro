"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { App, Button, Dropdown } from "antd";
import { FolderOpen, ImagePlus, Lock, Star, Trash2, Unlock, Upload } from "lucide-react";

import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { cn } from "@/lib/utils";
import { uploadImage } from "@/services/image-storage";
import type { FilmImageRef, FilmImageSlot } from "@/lib/film/types";
import { appendSlotImage, FILM_IMAGE_SLOT_LIMIT, removeSlotImage, selectSlotImage, updateSlotImage } from "../utils/film-image-slot";
import { FilmImageThumbnail } from "./film-asset-thumbnail";

type FilmImageSlotEditorProps = {
    slot: FilmImageSlot;
    onChange: (slot: FilmImageSlot) => void;
    /** 新加入的图片默认标签，例如表情名。 */
    nextLabel?: string;
    thumbClassName?: string;
    disabled?: boolean;
};

/** 通用图槽位编辑器：版本池选定、评分、锁定、删除，以及本地上传 / 素材库引入。 */
export function FilmImageSlotEditor({ slot, onChange, nextLabel, thumbClassName, disabled }: FilmImageSlotEditorProps) {
    const { message } = App.useApp();
    const uploadRef = useRef<HTMLInputElement>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const active = slot.images.find((image) => image.id === slot.activeImageId) || slot.images[slot.images.length - 1];

    const addImage = (image: FilmImageRef) => onChange(appendSlotImage(slot, nextLabel ? { ...image, label: image.label || nextLabel } : image));

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            const uploaded = await uploadImage(file);
            addImage({ id: `img-${Date.now()}`, url: uploaded.url, storageKey: uploaded.storageKey, source: "upload", width: uploaded.width, height: uploaded.height, createdAt: new Date().toISOString() });
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
                addImage({
                    id: `img-${Date.now()}`,
                    url: payload.dataUrl,
                    storageKey: payload.storageKey,
                    source: payload.source === "library" ? "library" : "asset",
                    createdAt: new Date().toISOString(),
                });
                return;
            }
            const uploaded = await uploadImage(payload.dataUrl);
            addImage({ id: `img-${Date.now()}`, url: uploaded.url, storageKey: uploaded.storageKey, source: "asset", createdAt: new Date().toISOString() });
        } catch {
            message.error("素材引入失败");
        }
    };

    const activeIndex = active ? slot.images.findIndex((image) => image.id === active.id) : -1;
    const rate = (rating: 1 | 2 | 3) => {
        if (!active) return;
        onChange(updateSlotImage(slot, active.id, { rating: active.rating === rating ? 0 : rating }));
    };

    return (
        <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60 uppercase">
                    版本池 {slot.images.length}/{FILM_IMAGE_SLOT_LIMIT}{active ? ` · 当前 v${activeIndex + 1}` : ""}
                </span>
                {slot.locked ? <span className="chip chip-acid"><Lock className="mr-0.5 inline size-2.5" />锁定</span> : null}
                <div className="ml-auto flex flex-wrap items-center gap-1">
                    <Dropdown
                        trigger={["click"]}
                        disabled={disabled}
                        menu={{
                            items: [
                                { key: "upload", icon: <Upload className="size-3.5" />, label: "上传本地图片", onClick: () => uploadRef.current?.click() },
                                { key: "asset", icon: <FolderOpen className="size-3.5" />, label: "从素材库选择", onClick: () => setPickerOpen(true) },
                            ],
                        }}
                    >
                        <Button size="small" icon={<ImagePlus className="size-3.5" />} disabled={disabled}>加入图片</Button>
                    </Dropdown>
                    <Button
                        size="small"
                        icon={slot.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                        onClick={() => onChange({ ...slot, locked: !slot.locked })}
                    >
                        {slot.locked ? "解锁" : "锁定"}
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
                {slot.images.map((image, index) => (
                    <button
                        key={image.id}
                        type="button"
                        onClick={() => onChange(selectSlotImage(slot, image.id))}
                        aria-pressed={active?.id === image.id}
                        className={cn("relative overflow-hidden rounded-md border transition-colors", active?.id === image.id ? "border-acid" : "border-border/60 hover:border-acid/50")}
                        title={image.label || `版本 ${index + 1}`}
                    >
                        <FilmImageThumbnail url={image.url} storageKey={image.storageKey} alt={image.label || `版本 ${index + 1}`} className={cn("w-full", thumbClassName || "h-14")} />
                        <span className="absolute left-0.5 top-0.5 rounded bg-background/80 px-1 font-mono text-[7px] text-foreground/70">v{index + 1}</span>
                        {image.label ? <span className="absolute bottom-0.5 left-0.5 max-w-[calc(100%-4px)] truncate rounded bg-background/80 px-1 font-mono text-[7px] text-foreground/70">{image.label}</span> : null}
                        {image.rating ? <span className="absolute right-0.5 top-0.5 flex items-center gap-px rounded bg-background/80 px-1 font-mono text-[7px] text-acid">{"★".repeat(image.rating)}</span> : null}
                    </button>
                ))}
            </div>
            {active ? (
                <div className="flex flex-wrap items-center gap-1">
                    <span className="font-mono text-[9px] text-muted-foreground/60">评分</span>
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
                        onClick={() => onChange(removeSlotImage(slot, active.id))}
                    >
                        删除当前
                    </Button>
                </div>
            ) : <p className="text-[10px] leading-4 text-muted-foreground/60">还没有图片，可以上传、从素材库选择或生成。</p>}
            <input ref={uploadRef} hidden type="file" accept="image/*" onChange={handleFile} />
            <AssetPickerModal open={pickerOpen} defaultTab="my-assets" kind="image" onInsert={(payload) => void handlePickedAsset(payload)} onClose={() => setPickerOpen(false)} />
        </div>
    );
}
