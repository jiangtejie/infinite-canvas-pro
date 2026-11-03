"use client";

import { useEffect, useState } from "react";
import { Button, Input, Tag } from "antd";
import { PenLine, Trash2 } from "lucide-react";

import { useImagePreviewUrl } from "./use-preview-url";
import type { GenerationCategory, GenerationLog } from "../history";

function CategoryPreviewImage({ image, index, count }: { image: GenerationLog["images"][number]; index: number; count: number }) {
    const src = useImagePreviewUrl(`image-result:${image.id}`, image.storageKey || image.dataUrl, image.dataUrl);
    return (
        <img
            src={src}
            alt=""
            className={`${count === 1 ? "inset-0 size-full rounded-none border-0" : "h-[92%] w-[86%] rounded-lg border border-border"} absolute object-cover shadow-xl transition-transform duration-200 group-hover:scale-[1.02]`}
            style={{
                left: count === 1 ? 0 : `${3 + index * 4}%`,
                top: count === 1 ? 0 : `${4 + index * 3}%`,
                transform: count === 1 ? "none" : `rotate(${(index - 2) * 4}deg)`,
                zIndex: index + 1,
            }}
        />
    );
}

export function CategoryCard({
    category,
    logs,
    onRename,
    onDelete,
    onOpen,
}: {
    category: GenerationCategory;
    logs: GenerationLog[];
    onRename: (category: GenerationCategory, name: string) => void;
    onDelete: (category: GenerationCategory) => void;
    onOpen: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(category.name);
    const images = logs.flatMap((log) => log.images).slice(0, 6);

    useEffect(() => {
        setName(category.name);
    }, [category.name]);

    const saveName = () => {
        const value = name.trim();
        if (!value) return;
        onRename(category, value);
        setEditing(false);
    };

    return (
        <div className="group relative min-h-[360px] overflow-hidden rounded-lg border border-border bg-muted/60 sm:min-h-[420px]">
            <button type="button" className="absolute inset-0 z-0 text-left" onClick={onOpen} aria-label={`打开分类 ${category.name}`} />
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {images.length ? (
                    <>
                        {images.map((image, index) => (
                            <CategoryPreviewImage key={`${image.id}-${index}`} image={image} index={index} count={images.length} />
                        ))}
                    </>
                ) : (
                    <div className="flex size-full items-center justify-center text-sm text-muted-foreground">暂无图片</div>
                )}
            </div>
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-3 pt-10 text-white">
                {editing ? <Input value={name} autoFocus onChange={(event) => setName(event.target.value)} onPressEnter={saveName} onBlur={saveName} /> : <div className="truncate text-sm font-semibold">{category.name}</div>}
            </div>
            <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                <Tag className="m-0 text-[10px]">{logs.length} 条</Tag>
                <Tag className="m-0 text-[10px]">{images.length} 图</Tag>
            </div>
            <div className="absolute bottom-2 right-2 z-20 flex gap-1">
                <Button title="改名" aria-label="重命名分类" size="small" icon={<PenLine className="size-3.5" />} onClick={() => setEditing(true)} />
                <Button title="删除" aria-label="删除分类" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(category)} />
            </div>
        </div>
    );
}
