"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { App, Button, Dropdown, Input, Modal } from "antd";
import { FolderOpen, ImagePlus, Library, Plus, Trash2, Upload, UserRound, MapPin } from "lucide-react";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/assets/asset-picker-modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { uploadImage } from "@/services/image-storage";
import { useComicImageSrc } from "../../hooks/use-comic-image-src";
import { useComicCastStore } from "../../stores/use-comic-cast-store";
import { errorMessage } from "@/lib/utils";
import { ComicCharacterEditor } from "../../components/comic-character-editor";
import type { ComicCharacter, ComicImageRef, ComicLibraryCharacter, ComicLibraryLocation, ComicLocation, ComicProject } from "../../types";
import { copyComicCharacterForProject } from "../../utils/comic-character-binding";
import { createComicCharacter, createComicLocation, invalidateComicPageCompositions, invalidateComicPagesForCharacter } from "../../utils/comic-project";
import { comicImageFromPickedAsset } from "../../utils/comic-reference";

type UploadTarget = { kind: "location"; id: string };

export function ComicCastStage({ project, onChange }: { project: ComicProject; onChange: (project: ComicProject) => void }) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
    const [pickerTarget, setPickerTarget] = useState<UploadTarget | null>(null);
    const [uploading, setUploading] = useState(false);
    const [importKind, setImportKind] = useState<"character" | "location" | null>(null);
    const libraryCharacters = useComicCastStore((state) => state.characters);
    const libraryLocations = useComicCastStore((state) => state.locations);
    const addLibraryCharacter = useComicCastStore((state) => state.addCharacter);
    const addLibraryLocation = useComicCastStore((state) => state.addLocation);
    const characters = project.characters || [];
    const locations = project.locations || [];

    const patchCharacter = (id: string, patch: Partial<ComicCharacter>) => onChange(invalidateComicPagesForCharacter({ ...project, characters: characters.map((item) => item.id === id ? { ...item, ...patch } : item) }, id));
    const patchLocation = (id: string, patch: Partial<ComicLocation>) => onChange(invalidateComicPageCompositions({ ...project, locations: locations.map((item) => item.id === id ? { ...item, ...patch } : item) }));

    const pickImage = (target: UploadTarget) => {
        setUploadTarget(target);
        fileRef.current?.click();
    };

    const uploadCastImage = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !uploadTarget) return;
        setUploading(true);
        try {
            const uploaded = await uploadImage(file);
            const image: ComicImageRef = { url: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height };
            patchLocation(uploadTarget.id, { image });
            message.success("参考图已更新");
        } catch (error) {
            message.error(errorMessage(error, "参考图上传失败"));
        } finally {
            setUploading(false);
            setUploadTarget(null);
        }
    };

    const handlePickedLocationImage = async (payload: InsertAssetPayload) => {
        const target = pickerTarget;
        setPickerTarget(null);
        if (!target) return;
        setUploading(true);
        try {
            patchLocation(target.id, { image: await comicImageFromPickedAsset(payload) });
            message.success("参考图已更新");
        } catch (error) {
            message.error(errorMessage(error, "素材引入失败"));
        } finally {
            setUploading(false);
        }
    };

    const removeCharacter = async (character: ComicCharacter) => {
        const accepted = await confirm({ title: `删除角色「${character.name}」？`, description: "角色设定和参考图会一起删除。", confirmText: "删除角色", tone: "danger" });
        if (accepted) onChange(invalidateComicPagesForCharacter({ ...project, characters: characters.filter((item) => item.id !== character.id) }, character.id));
    };

    const removeLocation = async (location: ComicLocation) => {
        const accepted = await confirm({ title: `删除场景「${location.name}」？`, description: "场景设定和参考图会一起删除。", confirmText: "删除场景", tone: "danger" });
        if (accepted) onChange(invalidateComicPageCompositions({ ...project, locations: locations.filter((item) => item.id !== location.id) }));
    };

    const saveCharacterToLibrary = (character: ComicCharacter) => {
        addLibraryCharacter(character);
        message.success(`「${character.name}」已存入角色库`);
    };

    const saveLocationToLibrary = (location: ComicLocation) => {
        addLibraryLocation(location);
        message.success(`「${location.name}」已存入场景库`);
    };

    const importCharacter = (item: ComicLibraryCharacter) => {
        const copy = copyComicCharacterForProject(item);
        onChange({ ...project, characters: [...characters, copy] });
        setImportKind(null);
        message.success(`已导入「${item.name}」`);
    };

    const importLocation = (item: ComicLibraryLocation) => {
        const base = createComicLocation(locations.length + 1);
        const copy = { ...item, id: base.id } as ComicLocation;
        onChange({ ...project, locations: [...locations, copy] });
        setImportKind(null);
        message.success(`已导入「${item.name}」`);
    };

    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-border/70 bg-card/40 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="eyebrow">Cast / 角色</p>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight">角色设定</h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">外观、性格、服装和表情基调写清楚，后面拆页和作画才有稳定依据。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="small" icon={<Library className="size-3.5" />} disabled={!libraryCharacters.length} onClick={() => setImportKind("character")}>从库导入{libraryCharacters.length ? ` (${libraryCharacters.length})` : ""}</Button>
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => onChange({ ...project, characters: [...characters, createComicCharacter(characters.length + 1)] })}>添加角色</Button>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {characters.map((character) => (
                        <article key={character.id} className="rounded-lg border border-border/60 bg-background/30 p-3">
                            <ComicCharacterEditor
                                character={character}
                                onChange={(next) => patchCharacter(character.id, next)}
                                actions={<>
                                    <Button type="text" size="small" className="!h-8 !w-8 !min-w-8 !p-0" icon={<Library className="size-3.5" />} aria-label="存入角色库" title="存入角色库" onClick={() => saveCharacterToLibrary(character)} />
                                    <Button type="text" danger size="small" className="!h-8 !w-8 !min-w-8 !p-0" icon={<Trash2 className="size-3.5" />} aria-label="删除角色" onClick={() => void removeCharacter(character)} />
                                </>}
                            />
                        </article>
                    ))}
                    {!characters.length ? <EmptyCast icon={<UserRound className="size-5" />} text="还没有角色，先添加主角和关键配角。" /> : null}
                </div>
            </section>

            <section className="rounded-xl border border-border/70 bg-card/40 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="eyebrow">Scene / 场景</p>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight">场景设定</h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">空间结构、光线和气氛统一后，跨页出现时不容易画漂。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="small" icon={<Library className="size-3.5" />} disabled={!libraryLocations.length} onClick={() => setImportKind("location")}>从库导入{libraryLocations.length ? ` (${libraryLocations.length})` : ""}</Button>
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => onChange({ ...project, locations: [...locations, createComicLocation(locations.length + 1)] })}>添加场景</Button>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {locations.map((location) => (
                        <article key={location.id} className="rounded-lg border border-border/60 bg-background/30 p-3">
                            <div className="flex gap-3">
                                <LocationImagePicker image={location.image} label={location.name} target={{ kind: "location", id: location.id }} onUpload={pickImage} onPick={setPickerTarget} />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Input value={location.name} maxLength={100} placeholder="场景名" onChange={(event) => patchLocation(location.id, { name: event.target.value })} />
                                        <Button type="text" size="small" className="!h-8 !w-8 !min-w-8 !p-0" icon={<Library className="size-3.5" />} aria-label="存入场景库" title="存入场景库" onClick={() => saveLocationToLibrary(location)} />
                                        <Button type="text" danger size="small" className="!h-8 !w-8 !min-w-8 !p-0" icon={<Trash2 className="size-3.5" />} aria-label="删除场景" onClick={() => void removeLocation(location)} />
                                    </div>
                                    <Input.TextArea rows={2} value={location.description} maxLength={3000} placeholder="空间结构、关键道具、可用机位" onChange={(event) => patchLocation(location.id, { description: event.target.value })} />
                                </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <label className="block space-y-1 text-xs"><span className="text-muted-foreground">光线 / 气氛</span><Input.TextArea rows={2} value={location.atmosphere} maxLength={2000} onChange={(event) => patchLocation(location.id, { atmosphere: event.target.value })} /></label>
                                <label className="block space-y-1 text-xs"><span className="text-muted-foreground">其他设定</span><Input.TextArea rows={2} value={location.notes} maxLength={2000} onChange={(event) => patchLocation(location.id, { notes: event.target.value })} /></label>
                            </div>
                        </article>
                    ))}
                    {!locations.length ? <EmptyCast icon={<MapPin className="size-5" />} text="还没有场景，先建立主要地点。" /> : null}
                </div>
            </section>

            <input ref={fileRef} hidden type="file" accept="image/*" onChange={(event) => void uploadCastImage(event)} />
            <AssetPickerModal open={Boolean(pickerTarget)} defaultTab="my-assets" kind="image" onInsert={(payload) => void handlePickedLocationImage(payload)} onClose={() => setPickerTarget(null)} />
            {uploading ? <div className="text-[11px] text-muted-foreground">正在上传参考图…</div> : null}

            <Modal title={importKind === "character" ? "从角色库导入" : "从场景库导入"} open={Boolean(importKind)} onCancel={() => setImportKind(null)} footer={null} width={540} destroyOnHidden>
                <div className="thin-scrollbar max-h-[60dvh] space-y-2 overflow-y-auto py-1">
                    {importKind === "character" ? libraryCharacters.map((item) => <ImportRow key={item.id} image={item.references.primary} name={item.name} subtitle={[item.role, item.visualIdentity.description].filter(Boolean).join(" · ")} onClick={() => importCharacter(item)} />) : null}
                    {importKind === "location" ? libraryLocations.map((item) => <ImportRow key={item.id} image={item.image} name={item.name} subtitle={[item.description, item.atmosphere].filter(Boolean).join(" · ")} onClick={() => importLocation(item)} />) : null}
                    {(importKind === "character" ? libraryCharacters.length : libraryLocations.length) === 0 ? <p className="m-0 py-8 text-center text-xs text-muted-foreground">库里还没有条目，先在项目设定里点「存入库」。</p> : null}
                </div>
            </Modal>
        </div>
    );
}

function ImportRow({ image, name, subtitle, onClick }: { image?: ComicImageRef; name: string; subtitle: string; onClick: () => void }) {
    return (
        <button type="button" className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-background/30 p-2.5 text-left transition hover:border-acid/40 hover:bg-acid/5" onClick={onClick}>
            <LibraryThumb image={image} name={name} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{name}</span><span className="block truncate text-[11px] text-muted-foreground">{subtitle || "未填写设定"}</span></span>
            <span className="shrink-0 text-[10px] text-muted-foreground/60">导入 →</span>
        </button>
    );
}

function LibraryThumb({ image, name }: { image?: ComicImageRef; name: string }) {
    const src = useComicImageSrc(image);
    return <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border/60 bg-background/40 text-muted-foreground">{src ? <img src={src} alt={name} className="size-full object-cover" /> : <ImagePlus className="size-4" />}</span>;
}

function LocationImagePicker({ image, label, target, onUpload, onPick }: { image?: ComicImageRef; label: string; target: UploadTarget; onUpload: (target: UploadTarget) => void; onPick: (target: UploadTarget) => void }) {
    const src = useComicImageSrc(image);
    return (
        <Dropdown
            trigger={["click"]}
            menu={{
                items: [
                    { key: "upload", icon: <Upload className="size-3.5" />, label: "上传本地图片", onClick: () => onUpload(target) },
                    { key: "asset", icon: <FolderOpen className="size-3.5" />, label: "从我的素材 / 素材库选择", onClick: () => onPick(target) },
                ],
            }}
        >
            <span className="block shrink-0">
                <button type="button" className="grid size-20 place-items-center overflow-hidden rounded-lg border border-dashed border-border/70 bg-background/40 text-muted-foreground transition hover:border-acid/50 hover:text-foreground" aria-label={`设置${label}参考图`}>
                    {src ? <img src={src} alt={label} className="size-full object-cover" /> : <ImagePlus className="size-5" />}
                </button>
            </span>
        </Dropdown>
    );
}

function EmptyCast({ icon, text }: { icon: ReactNode; text: string }) {
    return <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-xs text-muted-foreground">{icon}<span>{text}</span></div>;
}
