"use client";

import { useState } from "react";
import { Button, Input, Modal } from "antd";
import { ImagePlus, Library, Palette, Plus, Trash2 } from "lucide-react";

import { Field } from "@/components/ui/field";
import type { FilmAsset, FilmProject } from "@/lib/film/types";
import { createFilmAsset } from "../utils/film-edits";
import { latestFilmAssetPatch } from "../utils/film-live-project";
import { useFilmAssetLibrary } from "../hooks/use-film-asset-library";
import { FilmImageSlotEditor } from "./film-image-slot-editor";

type FilmStyleBibleProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateAsset: (kind: "style", asset: FilmAsset) => void;
    onStopAsset: () => void;
    generatingAssetId: string;
};

/** 项目唯一风格圣经：concept 放色彩 / 光影 / 质感参考，visualPrompt 放风格规则。 */
export function FilmStyleBible({ project, onUpdate, onGenerateAsset, onStopAsset, generatingAssetId }: FilmStyleBibleProps) {
    const style = project.style;
    const [importOpen, setImportOpen] = useState(false);
    const { library, entryFor, isOutdated, save, pull, importToProject } = useFilmAssetLibrary(project.id, "style", style ? [style] : [], onUpdate);

    const patchStyle = (patch: Partial<FilmAsset>) => {
        if (!style) return;
        const next = latestFilmAssetPatch(project.id, "style", style.id, () => patch);
        if (next) onUpdate(next);
    };

    const createStyle = () => {
        const next = createFilmAsset("style", 1);
        onUpdate({ style: { ...next, name: "风格圣经", description: "项目统一的色彩、光影与质感规则" } });
    };

    if (!style) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/70 bg-background/25 px-3 py-2.5">
                <div className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Palette className="size-3.5" />风格圣经</span>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground/70">建立项目统一的色彩、光影与质感参考，跨项目可复用。</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {library.length ? <Button size="small" icon={<Library className="size-3.5" />} onClick={() => setImportOpen(true)}>从风格库导入</Button> : null}
                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={createStyle}>新建</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-3 rounded-md border border-border/60 bg-background/25 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Palette className="size-3.5" />风格圣经</span>
                <span className="font-mono text-[10px] text-muted-foreground/60">{style.concept.images.length} 张参考</span>
                <Button size="small" type="text" danger className="ml-auto !h-7 !px-1.5" icon={<Trash2 className="size-3.5" />} onClick={() => onUpdate({ style: undefined })}>移除</Button>
            </div>
            <Field label="风格规则">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={style.visualPrompt} placeholder="例如：低饱和青橙对比，颗粒质感，夜景以钠灯为主光源" onChange={(event) => patchStyle({ visualPrompt: event.target.value })} />
            </Field>
            <FilmImageSlotEditor slot={style.concept} onChange={(concept) => patchStyle({ concept })} nextLabel="风格参考" disabled={generatingAssetId === style.id} />
            <div className="flex flex-wrap items-center gap-2">
                <Button size="small" loading={generatingAssetId === style.id} disabled={style.concept.locked} icon={<ImagePlus className="size-3.5" />} onClick={() => onGenerateAsset("style", style)}>
                    {style.concept.images.length ? "重新生成风格板" : "生成风格板"}
                </Button>
                {generatingAssetId === style.id ? <Button size="small" danger onClick={onStopAsset}>停止生成</Button> : null}
                <Button size="small" icon={<Library className="size-3.5" />} onClick={() => void save(style)}>{entryFor(style) ? "更新风格库" : "存入风格库"}</Button>
                {entryFor(style) ? <Button size="small" onClick={() => void pull(style)}>从库更新</Button> : null}
                {isOutdated(style) ? <span className="chip chip-acid">库有更新</span> : null}
            </div>

            <Modal title="从风格库导入" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={620}>
                <div className="thin-scrollbar grid max-h-[60dvh] gap-2 overflow-y-auto">
                    {library.map((entry) => (
                        <button key={entry.id} type="button" onClick={() => { importToProject(entry); setImportOpen(false); }} className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/50 p-2 text-left transition-colors hover:border-acid/50">
                            <span className="grid size-12 shrink-0 place-items-center rounded-md border border-border/60 bg-background/40"><Palette className="size-4 text-muted-foreground/50" /></span>
                            <span className="min-w-0">
                                <span className="block truncate text-xs font-medium text-foreground">{entry.name}</span>
                                <span className="mt-0.5 line-clamp-1 block text-[10px] leading-4 text-muted-foreground/70">{entry.visualPrompt || "未填写风格规则"}</span>
                                <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground/50">更新于 {new Date(entry.updatedAt).toLocaleString("zh-CN", { hour12: false })} · 导入会替换当前风格圣经</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
