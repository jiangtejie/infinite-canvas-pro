"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal } from "antd";
import { ArrowLeft, BookOpen, ImagePlus, Library, MapPin, Pencil, Search, Trash2, UserRound } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ComicCharacterEditor } from "../components/comic-character-editor";
import { useComicImageSrc } from "../hooks/use-comic-image-src";
import { useComicCastStore } from "../stores/use-comic-cast-store";
import { useComicStore } from "../stores/use-comic-store";
import type { ComicImageRef, ComicLibraryCharacter } from "../types";
import { activeComicSlotImage } from "../utils/comic-image-slot";
import { comicCharacterLibraryUsageIndex, comicLocationLibraryUsageIndex } from "../utils/comic-library-usage";

export default function ComicLibraryPage() {
    const confirm = useConfirm();
    const hydrated = useComicCastStore((state) => state.hydrated);
    const characters = useComicCastStore((state) => state.characters);
    const locations = useComicCastStore((state) => state.locations);
    const updateCharacter = useComicCastStore((state) => state.updateCharacter);
    const removeCharacter = useComicCastStore((state) => state.removeCharacter);
    const removeLocation = useComicCastStore((state) => state.removeLocation);
    const projects = useComicStore((state) => state.projects);
    const [query, setQuery] = useState("");
    const [editing, setEditing] = useState<ComicLibraryCharacter | null>(null);
    const characterUsage = useMemo(() => comicCharacterLibraryUsageIndex(projects), [projects]);
    const locationUsage = useMemo(() => comicLocationLibraryUsageIndex(projects), [projects]);
    const keyword = query.trim().toLowerCase();
    const filteredCharacters = keyword
        ? characters.filter((item) => [item.name, item.role, item.visualIdentity.description, ...item.aliases].some((value) => value.toLowerCase().includes(keyword)))
        : characters;

    const deleteCharacter = async (id: string, name: string) => {
        const used = characterUsage.get(id)?.projects || 0;
        const accepted = await confirm({
            title: `从库中删除「${name}」？`,
            description: used ? `已被 ${used} 个漫画项目引用；删除库条目不影响项目里的副本。` : "已导入到漫画项目里的副本不受影响。",
            confirmText: "从库中删除",
            tone: "danger",
        });
        if (accepted) removeCharacter(id);
    };
    const deleteLocation = async (id: string, name: string) => {
        const used = locationUsage.get(id)?.projects || 0;
        const accepted = await confirm({
            title: `从库中删除「${name}」？`,
            description: used ? `已被 ${used} 个漫画项目引用；删除库条目不影响项目里的副本。` : "已导入到漫画项目里的副本不受影响。",
            confirmText: "从库中删除",
            tone: "danger",
        });
        if (accepted) removeLocation(id);
    };

    return (
        <main className="min-h-0 flex-1 overflow-y-auto bg-transparent text-foreground">
            <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                <PageHeader
                    eyebrow="创作工作台"
                    title="角色与场景库"
                    description="漫画项目里点「存入库」的角色和场景会汇总到这里，可在任意项目设定里导入；导入和存入都是独立副本，删除库条目不影响项目。"
                    meta={<><span className="chip chip-acid">{characters.length} 个角色</span><span className="chip">{locations.length} 个场景</span></>}
                    actions={<div className="flex flex-wrap items-center gap-2"><Input allowClear className="!w-[220px]" prefix={<Search className="size-3.5 opacity-50" />} placeholder="搜索姓名、身份或外观" value={query} onChange={(event) => setQuery(event.target.value)} /><Button href="/comic" icon={<ArrowLeft className="size-4" />}>返回漫画工作台</Button></div>}
                />
                {!hydrated ? <LoadingState label="正在加载角色与场景库" /> : null}
                {hydrated && !characters.length && !locations.length ? <EmptyState title="库还是空的" description="打开漫画项目的「设定」，编辑角色或场景后点卡片上的库图标存入。" icon={<Library className="size-6" />} action={<Button type="primary" href="/comic">去漫画工作台</Button>} /> : null}

                {hydrated && characters.length ? (
                    <section className="space-y-3">
                        <h2 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4 opacity-60" />角色库</h2>
                        <div className="grid gap-3 lg:grid-cols-2">
                            {filteredCharacters.map((item) => (
                                <article key={item.id} className="rounded-xl border border-border/70 bg-card/40 p-4">
                                    <div className="flex items-start gap-3">
                                        <LibraryImage image={activeComicSlotImage(item.references.primary?.slot)} name={item.name} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{item.name}</h3>
                                                <Button type="text" size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<Pencil className="size-3.5" />} aria-label="编辑角色" onClick={() => setEditing(item)} />
                                                <Button type="text" size="small" danger className="!h-7 !w-7 !min-w-7 !p-0" icon={<Trash2 className="size-3.5" />} aria-label="从库中删除角色" onClick={() => void deleteCharacter(item.id, item.name)} />
                                            </div>
                                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.role || "未填写身份"}</p>
                                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.visualIdentity.description || "未填写外观"}</p>
                                        </div>
                                    </div>
                                    {item.defaultLook.outfit || item.behavior.personality ? <p className="mt-3 line-clamp-2 border-t border-border/60 pt-2 text-[11px] leading-5 text-muted-foreground">{[item.defaultLook.outfit, item.behavior.personality].filter(Boolean).join(" · ")}</p> : null}
                                    <p className="mt-2 text-[10px] text-muted-foreground/60">{item.variants.length} 个变体 · {Object.values(item.references).filter((reference) => activeComicSlotImage(reference?.slot)).length} 张基础参考</p>
                                    <UsageLine usage={characterUsage.get(item.id)} bindings />
                                </article>
                            ))}
                        </div>
                        {!filteredCharacters.length ? <p className="m-0 rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-xs text-muted-foreground">没有匹配的角色</p> : null}
                    </section>
                ) : null}

                {hydrated && locations.length ? (
                    <section className="space-y-3">
                        <h2 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 opacity-60" />场景库</h2>
                        <div className="grid gap-3 lg:grid-cols-2">
                            {locations.map((item) => (
                                <article key={item.id} className="rounded-xl border border-border/70 bg-card/40 p-4">
                                    <div className="flex items-start gap-3">
                                        <LibraryImage image={activeComicSlotImage(item.image)} name={item.name} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2"><h3 className="min-w-0 flex-1 truncate text-base font-semibold">{item.name}</h3><Button type="text" size="small" danger className="!h-7 !w-7 !min-w-7 !p-0" icon={<Trash2 className="size-3.5" />} aria-label="从库中删除场景" onClick={() => void deleteLocation(item.id, item.name)} /></div>
                                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.atmosphere || "未填写气氛"}</p>
                                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description || "未填写空间结构"}</p>
                                        </div>
                                    </div>
                                    <UsageLine usage={locationUsage.get(item.id)} />
                                </article>
                            ))}
                        </div>
                    </section>
                ) : null}

                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60"><BookOpen className="size-3.5" />库本机自动保存，登录后同步到账号；重要内容仍建议导出项目备份。</p>
            </div>

            <Modal
                open={Boolean(editing)}
                title="编辑角色库条目"
                width={860}
                destroyOnHidden
                onCancel={() => setEditing(null)}
                footer={<div className="flex justify-end gap-2"><Button onClick={() => setEditing(null)}>取消</Button><Button type="primary" onClick={() => { if (!editing) return; updateCharacter(editing.id, editing); setEditing(null); }}>保存到库</Button></div>}
            >
                {editing ? <ComicCharacterEditor character={editing} onChange={(character) => setEditing({ ...character, createdAt: editing.createdAt })} /> : null}
                <p className="mb-0 mt-3 text-[11px] leading-5 text-muted-foreground">只更新角色库条目；已经导入项目的角色副本不会跟着变化。</p>
            </Modal>
        </main>
    );
}

function UsageLine({ usage, bindings }: { usage?: { projects: number; copies: number; bindings: number }; bindings?: boolean }) {
    if (!usage?.projects) return null;
    return (
        <p className="mt-2 text-[10px] text-muted-foreground/60">
            {usage.projects} 个项目 · {usage.copies} 份副本{bindings && usage.bindings ? ` · ${usage.bindings} 个页格引用` : ""}
        </p>
    );
}

function LibraryImage({ image, name }: { image?: ComicImageRef; name: string }) {
    const src = useComicImageSrc(image);
    return <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-background/40 text-muted-foreground">{src ? <img src={src} alt={name} className="size-full object-cover" /> : <ImagePlus className="size-5" />}</span>;
}
