"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { App, Button, Checkbox, Image, Input, Modal, Select, Spin } from "antd";
import { Download, ImageIcon, ImagePlus, Library, Lock, Plus, Sparkles, Trash2, Unlock, Upload, UserRound } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/state-panel";
import { useDownloadFile } from "@/hooks/use-download-file";
import { cn } from "@/lib/utils";
import styles from "./film-character.module.css";
import { uploadImage } from "@/services/image-storage";
import type { FilmAsset, FilmCharacterPartKey, FilmCharacterProp, FilmImageRef, FilmProject } from "@/lib/film/types";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useFilmCharacterImage } from "../hooks/use-film-character-image";
import { useElapsedSeconds } from "../hooks/use-elapsed-seconds";
import { useFilmDeleteConfirm } from "../hooks/use-film-delete-confirm";
import { addFilmAsset, importFilmAsset, removeFilmAsset } from "../utils/film-edits";
import { CHARACTER_PART_DEFINITIONS, characterCardSignature, characterMasterImages, characterProgress, createEmptyCharacterProfile, ensureCharacterProfile, characterPartLabel } from "../utils/film-character";
import type { CharacterCardOptions } from "../utils/film-character-card";
import { FilmAssetThumbnail, FilmImageThumbnail } from "./film-asset-thumbnail";

type FilmCharacterWorkspaceProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
};

type UploadTarget = { kind: "part"; key: FilmCharacterPartKey } | { kind: "prop"; propId: string } | null;

export function FilmCharacterWorkspace({ project, onUpdate }: FilmCharacterWorkspaceProps) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const { confirmDelete } = useFilmDeleteConfirm();
    const downloadFile = useDownloadFile();
    const characters = useMemo(() => project.characters || [], [project.characters]);
    const libraryCharacters = useFilmCastStore((state) => state.characters);
    const addLibraryAsset = useFilmCastStore((state) => state.addAsset);
    const { generatingKey, batchProgress, generatePart, generateMissingParts, generateMaster, generateCard: createCard, stopCharacterImage } = useFilmCharacterImage(project, onUpdate);
    const [selectedId, setSelectedId] = useState("");
    const [selectedPart, setSelectedPart] = useState<FilmCharacterPartKey>("face");
    const [previewMode, setPreviewMode] = useState<"master" | "part">("master");
    const [masterPreviewId, setMasterPreviewId] = useState("");
    const [stageZoom, setStageZoom] = useState(1);
    const [composingCard, setComposingCard] = useState(false);
    const [cardOpen, setCardOpen] = useState(false);
    const [cardPreset, setCardPreset] = useState<NonNullable<CharacterCardOptions["preset"]>>("standard");
    const [cardBackground, setCardBackground] = useState<NonNullable<CharacterCardOptions["background"]>>("white");
    const [cardIncludeProps, setCardIncludeProps] = useState(true);
    const elapsed = useElapsedSeconds(Boolean(generatingKey));
    const [importOpen, setImportOpen] = useState(false);
    const uploadRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<UploadTarget>(null);

    useEffect(() => {
        if (selectedId && characters.some((asset) => asset.id === selectedId)) return;
        setSelectedId(characters[0]?.id || "");
    }, [characters, selectedId]);

    const selected = characters.find((asset) => asset.id === selectedId) || null;
    const profile = selected ? ensureCharacterProfile(selected) : null;
    const part = profile ? profile.parts[selectedPart] : null;
    const progress = selected ? characterProgress(selected) : null;
    const masterImages = selected ? characterMasterImages(selected) : [];
    const partImages = part?.images || [];
    const cardImage = selected?.character?.card;
    const cardStale = Boolean(cardImage && profile?.cardSignature && selected && profile.cardSignature !== characterCardSignature(selected));
    const previewImages = previewMode === "master" ? masterImages : partImages;
    const masterPreview = masterImages.find((image) => image.id === masterPreviewId) || masterImages[masterImages.length - 1];
    const previewImage = previewMode === "master" ? masterPreview : previewImages[previewImages.length - 1];
    const generatingPart = generatingKey === `part:${selectedPart}`;
    const generatingMaster = generatingKey === "master";

    const createCharacter = () => {
        const next = addFilmAsset(characters, "character");
        const created: FilmAsset = { ...next[next.length - 1], character: createEmptyCharacterProfile() };
        onUpdate({ characters: [...characters, created] });
        setSelectedId(created.id);
        setSelectedPart("face");
        setPreviewMode("master");
    };

    const updateCharacter = (patch: Partial<FilmAsset>) => {
        if (!selected) return;
        onUpdate({ characters: characters.map((asset) => asset.id === selected.id ? { ...asset, ...patch } : asset) });
    };

    const patchCharacter = (updater: (asset: FilmAsset) => FilmAsset) => {
        if (!selected) return;
        onUpdate({ characters: characters.map((asset) => asset.id === selected.id ? updater(asset) : asset) });
    };

    const updatePart = (key: FilmCharacterPartKey, patch: Partial<{ prompt: string; notes: string; locked: boolean; images: FilmImageRef[] }>) => {
        patchCharacter((asset) => {
            const nextProfile = ensureCharacterProfile(asset);
            return {
                ...asset,
                character: { ...nextProfile, parts: { ...nextProfile.parts, [key]: { ...nextProfile.parts[key], ...patch } } },
            };
        });
    };

    const updateProp = (propId: string, patch: Partial<FilmCharacterProp>) => {
        patchCharacter((asset) => {
            const nextProfile = ensureCharacterProfile(asset);
            return {
                ...asset,
                character: { ...nextProfile, props: nextProfile.props.map((prop) => prop.id === propId ? { ...prop, ...patch } : prop) },
            };
        });
    };

    const addProp = () => {
        patchCharacter((asset) => {
            const nextProfile = ensureCharacterProfile(asset);
            const prop: FilmCharacterProp = { id: `prop-${Date.now()}`, name: "新道具", type: "accessory", description: "", images: [], locked: false };
            return { ...asset, character: { ...nextProfile, props: [...nextProfile.props, prop] } };
        });
    };

    const removeProp = (propId: string) => {
        patchCharacter((asset) => {
            const nextProfile = ensureCharacterProfile(asset);
            return { ...asset, character: { ...nextProfile, props: nextProfile.props.filter((prop) => prop.id !== propId) } };
        });
    };

    const saveToLibrary = () => {
        if (!selected) return;
        addLibraryAsset("character", selected);
        message.success("已存入角色库");
    };

    const importFromLibrary = (asset: FilmAsset) => {
        const next = importFilmAsset(characters, asset);
        onUpdate({ characters: next });
        setSelectedId(next[next.length - 1].id);
        setImportOpen(false);
        message.success("已导入当前项目");
    };

    const removeSelected = () => {
        if (!selected) return;
        confirmDelete({
            title: `删除「${selected.name}」？`,
            description: "删除后已有分镜里的角色引用会失效，但分镜本身不受影响。",
            detail: selected.description || "角色 · 未填写描述",
            confirmText: "删除角色",
            onConfirm: () => {
                onUpdate({ characters: removeFilmAsset(characters, selected.id) });
                setSelectedId("");
            },
        });
    };

    const triggerUpload = (target: UploadTarget) => {
        setUploadTarget(target);
        uploadRef.current?.click();
    };

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !uploadTarget || !selected) return;
        try {
            const uploaded = await uploadImage(file, { localOnly: true });
            const image: FilmImageRef = { id: `img-${Date.now()}`, url: uploaded.url, storageKey: uploaded.storageKey, source: "upload", createdAt: new Date().toISOString() };
            if (uploadTarget.kind === "part") {
                const key = uploadTarget.key;
                const currentImages = ensureCharacterProfile(selected).parts[key].images;
                updatePart(key, { images: [...currentImages, image] });
            } else {
                const prop = ensureCharacterProfile(selected).props.find((item) => item.id === uploadTarget.propId);
                if (prop) updateProp(prop.id, { images: [...prop.images, image] });
            }
        } catch {
            message.error("图片上传失败");
        } finally {
            setUploadTarget(null);
        }
    };

    const selectPart = (key: FilmCharacterPartKey) => {
        setSelectedPart(key);
        setPreviewMode("part");
    };

    const confirmGeneratePart = async (key: FilmCharacterPartKey) => {
        if (!selected || batchProgress) return;
        const currentPart = ensureCharacterProfile(selected).parts[key];
        if (currentPart.locked) {
            message.warning("该部位已锁定，先解锁再生成");
            return;
        }
        const confirmed = await confirm({
            title: `生成「${characterPartLabel(key)}」参考图？`,
            description: "会调用一次图片生成任务，生成时会自动带上面部与全身参考。",
            confirmText: "生成",
        });
        if (!confirmed) return;
        await generatePart(selected.id, key);
    };

    const generateCard = async () => {
        if (!selected || composingCard) return;
        setComposingCard(true);
        try {
            const ok = await createCard(selected.id, { preset: cardPreset, background: cardBackground, includeProps: cardIncludeProps });
            if (ok) {
                setCardOpen(false);
                setPreviewMode("master");
                message.success("角色卡已生成，分镜默认引用这一张");
            }
        } finally {
            setComposingCard(false);
        }
    };

    const downloadCard = () => {
        if (!cardImage || !selected) return;
        downloadFile(cardImage.url, `${selected.name}-角色卡.png`);
    };

    const toggleMasterLock = () => {
        patchCharacter((asset) => {
            const nextProfile = ensureCharacterProfile(asset);
            return { ...asset, character: { ...nextProfile, masterLocked: !nextProfile.masterLocked } };
        });
    };

    useEffect(() => {
        if (previewMode === "part" && !partImages.length && masterImages.length) setPreviewMode("master");
    }, [previewMode, partImages.length, masterImages.length]);

    useEffect(() => {
        setMasterPreviewId("");
    }, [selectedId]);

    return (
        <>
            <div className={cn(styles.characterLayout, "min-h-0")}>
                <section className="punk-panel flex max-h-[80dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                    <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-3 py-2.5">
                        <span className="eyebrow">01 角色</span>
                        <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={createCharacter} aria-label="新建角色" />
                        <Button size="small" type="text" icon={<Library className="size-3.5" />} onClick={() => setImportOpen(true)} aria-label="从角色库导入" />
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                        {characters.length === 0 ? <p className="px-1 py-2 text-[11px] leading-5 text-muted-foreground/60">还没有角色，点右上角「+」开始。</p> : null}
                        <div className="grid gap-1.5">
                            {characters.map((asset) => {
                                const info = characterProgress(asset);
                                const ratio = info.done / info.total;
                                return (
                                    <button
                                        key={asset.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedId(asset.id);
                                            setPreviewMode("master");
                                        }}
                                        className={cn("group flex items-center gap-2 rounded-lg border p-2 text-left transition-all hover:-translate-y-0.5", selectedId === asset.id ? "border-acid/60 bg-acid/[0.05]" : "border-border/60 bg-card/50 hover:border-acid/40")}
                                    >
                                        <FilmAssetThumbnail asset={asset} className="size-10 shrink-0 rounded-md border border-border/60" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                                            <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground/60">{info.master ? "已合成" : "未合成"}</span>
                                        </span>
                                        <span className="relative grid size-8 shrink-0 place-items-center">
                                            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                                                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
                                                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--acid)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(1, ratio)) * 94} 94`} />
                                            </svg>
                                            <span className="font-mono text-[8px] text-muted-foreground/80">{info.done}/{info.total}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">道具 / 饰品</span>
                            <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={addProp} disabled={!selected} aria-label="添加道具" />
                        </div>
                        {selected && ensureCharacterProfile(selected).props.length === 0 ? <p className="mt-1 text-[10px] leading-4 text-muted-foreground/60">还没有道具，比如发饰、武器、手部饰品。</p> : null}
                        <div className="mt-2 grid gap-1.5">
                            {selected ? ensureCharacterProfile(selected).props.map((prop) => (
                                <div key={prop.id} className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/30 p-1.5">
                                    <FilmImageThumbnail url={prop.images[0]?.url} storageKey={prop.images[0]?.storageKey} alt={prop.name} className="size-8 shrink-0 rounded border border-border/60" />
                                    <input value={prop.name} onChange={(event) => updateProp(prop.id, { name: event.target.value })} className="min-w-0 flex-1 rounded border border-border/60 bg-background/40 px-1.5 py-1 text-[11px] text-foreground" />
                                    <button type="button" aria-label="上传道具图" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground/60 hover:text-foreground" onClick={() => triggerUpload({ kind: "prop", propId: prop.id })}>
                                        <Upload className="size-3" />
                                    </button>
                                    <button type="button" aria-label="删除道具" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground/60 hover:text-hot" onClick={() => removeProp(prop.id)}>
                                        <Trash2 className="size-3" />
                                    </button>
                                </div>
                            )) : null}
                        </div>
                    </div>
                </section>

                <section className="punk-panel flex min-h-0 flex-col overflow-hidden rounded-xl">
                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5">
                        <span className="eyebrow">03 角色舞台</span>
                        {selected ? <Input size="small" className="h-7 max-w-40" value={selected.name} onChange={(event) => updateCharacter({ name: event.target.value })} /> : null}
                        {progress ? <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">{progress.master ? "已合成" : "未合成"} · 锁定 {progress.locked}</span> : null}
                    </div>

                    {!selected ? (
                        <EmptyState
                            className="flex-1 py-10"
                            icon={<UserRound className="size-5" />}
                            title="还没有角色"
                            description={`新建角色后按「${CHARACTER_PART_DEFINITIONS.map((part) => part.label).join(" → ")}」逐块补齐参考。`}
                            action={<Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={createCharacter}>新建第一个角色</Button>}
                        />
                    ) : (
                        <div className={cn(styles.characterBody, "min-h-0 p-3")}>
                            <div className={cn(styles.slotColumn, "hidden lg:flex")}>
                                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">02 头部</span>
                                {(["face", "hair"] as FilmCharacterPartKey[]).map((key) => (
                                    <PartSlot key={key} partKey={key} profile={profile!} selected={selectedPart === key} generating={generatingKey === `part:${key}`} onSelect={() => selectPart(key)} onGenerate={() => confirmGeneratePart(key)} />
                                ))}
                                <div className="mt-auto rounded-md border border-border/50 px-2 py-1.5 font-mono text-[9px] text-muted-foreground/50">参考 {progress?.done}/{progress?.total}</div>
                            </div>

                            <div className="flex min-h-0 flex-col gap-2">
                                <div className={cn(styles.stage, "flex min-h-[420px] flex-1 flex-col p-3")}>
                                    <div className="relative z-10 flex flex-wrap items-center gap-2">
                                        <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/60 p-0.5 backdrop-blur">
                                            <button type="button" onClick={() => setPreviewMode("master")} aria-pressed={previewMode === "master"} className={cn("rounded px-2 py-1 text-[11px] transition-colors", previewMode === "master" ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}>全身合成</button>
                                            <button type="button" onClick={() => setPreviewMode("part")} aria-pressed={previewMode === "part"} className={cn("rounded px-2 py-1 text-[11px] transition-colors", previewMode === "part" ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}>{characterPartLabel(selectedPart)}</button>
                                        </div>
                                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{previewMode === "master" ? "全身合成图" : "部位参考"}</span>
                                        <div className="ml-auto flex items-center gap-1">
                                            <div className="flex items-center gap-0.5 rounded border border-border/60 bg-background/50 px-1 py-0.5">
                                                <button type="button" aria-label="缩小预览" className="grid size-4 place-items-center rounded text-muted-foreground/70 hover:text-foreground" onClick={() => setStageZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}>−</button>
                                                <span className="w-8 text-center font-mono text-[9px] text-muted-foreground/70">{Math.round(stageZoom * 100)}%</span>
                                                <button type="button" aria-label="放大预览" className="grid size-4 place-items-center rounded text-muted-foreground/70 hover:text-foreground" onClick={() => setStageZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}>+</button>
                                                <button type="button" aria-label="重置缩放" className="ml-0.5 font-mono text-[8px] text-muted-foreground/50 hover:text-foreground" onClick={() => setStageZoom(1)}>重置</button>
                                            </div>
                                            <span className="chip">{previewImages.length} 图</span>
                                            {cardImage ? <span className="chip chip-acid">角色卡</span> : null}
                                            {cardStale ? <button type="button" className="chip chip-acid" onClick={() => setCardOpen(true)}>角色卡需更新</button> : null}
                                            {profile?.masterLocked ? <span className="chip">合成图已锁定</span> : null}
                                        </div>
                                    </div>

                                    <div className="relative z-10 flex min-h-[300px] flex-1 items-center justify-center px-2 py-4">
                                        {previewImage ? (
                                            <div className={styles.stageFrame} style={{ transform: `scale(${stageZoom})`, transition: "transform 150ms ease" }}>
                                                <Image src={previewImage.url} alt={previewMode === "master" ? "全身合成图" : characterPartLabel(selectedPart)} style={{ maxHeight: 420, width: "auto" }} className="rounded-md" preview={{ mask: "放大预览" }} />
                                                <span aria-hidden className={styles.stageCorner} style={{ left: -1, top: -1, borderWidth: "2px 0 0 2px" }} />
                                                <span aria-hidden className={styles.stageCorner} style={{ right: -1, top: -1, borderWidth: "2px 2px 0 0" }} />
                                                <span aria-hidden className={styles.stageCorner} style={{ left: -1, bottom: -1, borderWidth: "0 0 2px 2px" }} />
                                                <span aria-hidden className={styles.stageCorner} style={{ right: -1, bottom: -1, borderWidth: "0 2px 2px 0" }} />
                                            </div>
                                        ) : (
                                            <EmptyStage />
                                        )}
                                        {(previewMode === "master" ? generatingMaster : generatingPart) ? (
                                            <div className="absolute inset-0 grid place-items-center rounded-lg bg-background/60 backdrop-blur-[2px]">
                                                <span className={styles.stageScan} aria-hidden />
                                                <div className="relative z-10 flex flex-col items-center gap-2">
                                                    <Spin size="small" />
                                                    <span className="font-mono text-[10px] text-acid">{previewMode === "master" ? "正在合成全身图" : `正在生成${characterPartLabel(selectedPart)}`} · {elapsed}s</span>
                                                    <span className="text-[10px] text-muted-foreground">生成完成前可以先编辑其他部位</span>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>

                                    {masterImages.length > 1 ? (
                                        <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto pb-1">
                                            <span className="font-mono text-[9px] text-muted-foreground/50">合成历史</span>
                                            {masterImages.map((image, index) => (
                                                <button
                                                    key={image.id}
                                                    type="button"
                                                    onClick={() => { setMasterPreviewId(image.id); setPreviewMode("master"); }}
                                                    className={cn("relative h-10 w-14 shrink-0 overflow-hidden rounded border transition-colors", masterPreview?.id === image.id ? "border-acid" : "border-border/60 hover:border-acid/50")}
                                                >
                                                    <FilmImageThumbnail url={image.url} storageKey={image.storageKey} alt={`合成版本 ${index + 1}`} className="h-10 w-full" />
                                                    <span className="absolute left-0.5 top-0.5 rounded bg-background/80 px-1 font-mono text-[7px] text-foreground/70">v{index + 1}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 p-2 backdrop-blur">
                                    <Button size="small" type="primary" loading={generatingMaster} disabled={Boolean(batchProgress)} icon={<Sparkles className="size-3.5" />} onClick={() => void generateMaster(selected.id)}>生成全身合成图</Button>
                                    <Button size="small" loading={generatingPart} disabled={Boolean(batchProgress)} icon={<Sparkles className="size-3.5" />} onClick={() => void confirmGeneratePart(selectedPart)}>生成{characterPartLabel(selectedPart)}</Button>
                                    <Button size="small" loading={Boolean(batchProgress)} disabled={generatingMaster || generatingPart} icon={<Sparkles className="size-3.5" />} onClick={() => void generateMissingParts(selected.id)}>
                                        {batchProgress ? `补齐中 ${batchProgress.done}/${batchProgress.total}` : "补齐缺失部位"}
                                    </Button>
                                    <Button size="small" loading={composingCard} icon={<ImageIcon className="size-3.5" />} onClick={() => setCardOpen(true)}>
                                        生成角色卡
                                    </Button>
                                    <Button size="small" disabled={!cardImage} icon={<Download className="size-3.5" />} onClick={downloadCard}>下载角色卡</Button>
                                    <Button size="small" icon={profile?.masterLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />} onClick={toggleMasterLock}>{profile?.masterLocked ? "已锁定" : "锁定合成图"}</Button>
                                    <Button size="small" icon={<Library className="size-3.5" />} onClick={saveToLibrary}>存入角色库</Button>
                                    {generatingKey || batchProgress ? <Button size="small" danger onClick={stopCharacterImage}>停止生成</Button> : null}
                                    <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={removeSelected}>删除</Button>
                                </div>
                            </div>

                            <div className={cn(styles.slotColumn, "hidden lg:flex")}>
                                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">02 身体</span>
                                {(["upper", "lower", "limbs"] as FilmCharacterPartKey[]).map((key) => (
                                    <PartSlot key={key} partKey={key} profile={profile!} selected={selectedPart === key} generating={generatingKey === `part:${key}`} onSelect={() => selectPart(key)} onGenerate={() => confirmGeneratePart(key)} />
                                ))}
                            </div>

                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:hidden">
                                {CHARACTER_PART_DEFINITIONS.map((definition) => (
                                    <PartSlot key={definition.key} partKey={definition.key} profile={profile!} selected={selectedPart === definition.key} generating={generatingKey === `part:${definition.key}`} onSelect={() => selectPart(definition.key)} onGenerate={() => confirmGeneratePart(definition.key)} />
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                <section className="punk-panel flex max-h-[80dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                    <div className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                        <span className="eyebrow">04 {characterPartLabel(selectedPart)}参考</span>
                        {part?.locked ? <span className="chip chip-acid">锁定</span> : null}
                    </div>
                    {selected ? (
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                            <div className="grid gap-3">
                                <div className="grid grid-cols-4 gap-1.5">
                                    {partImages.map((image) => (
                                        <div key={image.id} className="group/image relative overflow-hidden rounded-md border border-border/60">
                                            <FilmImageThumbnail url={image.url} storageKey={image.storageKey} alt="参考图" className="h-14 w-full" />
                                            <button
                                                type="button"
                                                aria-label="删除参考图"
                                                className="absolute right-0.5 top-0.5 hidden size-4 place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-hot group-hover/image:grid"
                                                onClick={() => updatePart(selectedPart, { images: partImages.filter((item) => item.id !== image.id) })}
                                            >
                                                <Trash2 className="size-2.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <button type="button" className="grid h-14 place-items-center rounded-md border border-dashed border-border/60 text-muted-foreground/50 transition-colors hover:border-acid/50 hover:text-acid" onClick={() => triggerUpload({ kind: "part", key: selectedPart })}>
                                        <ImagePlus className="size-4" />
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">参考来源</span>
                                    {selectedPart !== "face" && profile && profile.parts.face.images.length ? <span className="chip">面部 ×{profile.parts.face.images.length}</span> : null}
                                    {cardImage ? <span className="chip">角色卡</span> : null}
                                    {masterImages.length ? <span className="chip">全身 ×{masterImages.length}</span> : null}
                                    {partImages.length ? <span className="chip">本部位 ×{partImages.length}</span> : null}
                                    {!(selectedPart !== "face" && profile?.parts.face.images.length) && !masterImages.length && !partImages.length ? <span className="text-[10px] text-muted-foreground/60">暂无参考，将按文字描述生成</span> : null}
                                </div>
                                <label className="grid gap-1">
                                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">部位提示词</span>
                                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={part?.prompt || ""} placeholder={CHARACTER_PART_DEFINITIONS.find((item) => item.key === selectedPart)?.hint} onChange={(event) => updatePart(selectedPart, { prompt: event.target.value })} />
                                </label>
                                <label className="grid gap-1">
                                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">备注</span>
                                    <Input value={part?.notes || ""} placeholder="材质、颜色、细节补充" onChange={(event) => updatePart(selectedPart, { notes: event.target.value })} />
                                </label>
                                <p className="text-[11px] leading-5 text-muted-foreground/70">生成时会自动带上面部参考和全身合成图；锁定后的部位不会被后续生成覆盖。</p>
                            </div>
                        </div>
                    ) : null}
                    {selected ? (
                        <div className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-background/60 px-4 py-2.5">
                            <Button size="small" type="primary" loading={generatingPart} disabled={Boolean(part?.locked) || Boolean(batchProgress)} icon={<Sparkles className="size-3.5" />} onClick={() => void generatePart(selected.id, selectedPart)}>生成本部位</Button>
                            <Button size="small" icon={part?.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />} onClick={() => updatePart(selectedPart, { locked: !part?.locked })}>{part?.locked ? "解锁" : "锁定"}</Button>
                        </div>
                    ) : (
                        <EmptyState className="flex-1 py-10" icon={<ImagePlus className="size-5" />} title="选择一个角色" description="左侧选择角色后，这里会显示面部、身体和道具参考图。" />
                    )}
                </section>
            </div>

            <input ref={uploadRef} hidden type="file" accept="image/*" onChange={handleFile} />

            <Modal title="生成角色卡" open={cardOpen} onCancel={() => { if (!composingCard) setCardOpen(false); }} mask={{ closable: !composingCard }} footer={null} width={520}>
                <div className="grid gap-3">
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">版式</span>
                        <Select
                            value={cardPreset}
                            onChange={(value: NonNullable<CharacterCardOptions["preset"]>) => setCardPreset(value)}
                            options={[
                                { value: "standard", label: "标准角色卡（全身 + 面部 + 服装细节 + 道具）" },
                                { value: "threeView", label: "三视图卡（多版全身并排 + 面部）" },
                            ]}
                        />
                    </label>
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">背景</span>
                        <Select
                            value={cardBackground}
                            onChange={(value: NonNullable<CharacterCardOptions["background"]>) => setCardBackground(value)}
                            options={[{ value: "white", label: "纯白" }, { value: "gray", label: "浅灰" }]}
                        />
                    </label>
                    <Checkbox checked={cardIncludeProps} onChange={(event) => setCardIncludeProps(event.target.checked)}>包含道具 / 饰品</Checkbox>
                    <p className="text-[11px] leading-5 text-muted-foreground/70">
                        {masterImages.length ? "角色卡由浏览器本地拼合，不额外消耗生成次数；分镜生成默认只引用这一张。" : "还没有全身图，确认后会先生成一张全身三视图（消耗一次生成），再拼成角色卡。"}
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setCardOpen(false)} disabled={composingCard}>取消</Button>
                        {composingCard ? <Button danger onClick={stopCharacterImage}>停止生成</Button> : null}
                        <Button type="primary" loading={composingCard} onClick={() => void generateCard()}>生成角色卡</Button>
                    </div>
                </div>
            </Modal>

            <Modal title="从角色库导入" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={680}>
                {libraryCharacters.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">角色库还是空的，先在项目里生成并点「存入角色库」。</p> : null}
                <div className="thin-scrollbar grid max-h-[60dvh] gap-2 overflow-y-auto sm:grid-cols-2">
                    {libraryCharacters.map((asset) => (
                        <button key={asset.id} type="button" onClick={() => importFromLibrary(asset)} className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/50 p-2 text-left transition-colors hover:border-acid/50">
                            <FilmImageThumbnail url={asset.imageUrl} storageKey={asset.storageKey} alt={asset.name} className="size-12 shrink-0 rounded-md border border-border/60" />
                            <span className="min-w-0">
                                <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                                <span className="mt-0.5 line-clamp-1 block text-[10px] leading-4 text-muted-foreground/70">{asset.description || "未填写描述"}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Modal>
        </>
    );
}

function PartSlot({ partKey, profile, selected, generating, onSelect, onGenerate }: {
    partKey: FilmCharacterPartKey;
    profile: ReturnType<typeof ensureCharacterProfile>;
    selected: boolean;
    generating: boolean;
    onSelect: () => void;
    onGenerate: () => void;
}) {
    const definition = CHARACTER_PART_DEFINITIONS.find((item) => item.key === partKey)!;
    const current = profile.parts[partKey];
    const latest = current.images[current.images.length - 1];
    return (
        <div
            role="button"
            tabIndex={0}
            title={`${definition.label}：${definition.hint}（双击生成）`}
            onClick={onSelect}
            onDoubleClick={onGenerate}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect();
                }
            }}
            className={cn("group relative cursor-pointer overflow-hidden rounded-lg border transition-colors", selected ? "border-acid/60 bg-acid/[0.06]" : "border-border/60 bg-card/50 hover:border-border")}
        >
            <span className="relative block h-16 w-full overflow-hidden">
                {latest ? <FilmImageThumbnail url={latest.url} storageKey={latest.storageKey} alt={definition.label} className="h-16 w-full" /> : (
                    <span className="grid h-16 w-full place-items-center text-muted-foreground/35">
                        <ImageIcon className="size-4" aria-hidden />
                    </span>
                )}
                {current.locked ? <span className="absolute right-1 top-1 grid size-4 place-items-center rounded bg-background/80 text-acid"><Lock className="size-2.5" /></span> : null}
                {generating ? (
                    <span className="absolute inset-0 grid place-items-center bg-background/60"><Spin size="small" /></span>
                ) : (
                    <button
                        type="button"
                        aria-label={`生成${definition.label}`}
                        className="absolute right-1 top-1 hidden size-4 place-items-center rounded bg-background/80 text-muted-foreground hover:text-acid group-hover:grid"
                        onClick={(event) => {
                            event.stopPropagation();
                            onGenerate();
                        }}
                    >
                        <Sparkles className="size-2.5" />
                    </button>
                )}
            </span>
            <span className="flex items-center justify-between gap-1 px-1.5 py-1">
                <span className="truncate text-[10px] text-foreground/80">{definition.label}</span>
                <span className="font-mono text-[9px] text-muted-foreground/50">{current.images.length}</span>
            </span>
        </div>
    );
}

function EmptyStage() {
    return (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 50% 42%, color-mix(in oklab, var(--acid) 7%, transparent), transparent 62%)" }} />
            <div aria-hidden className="film-scan pointer-events-none absolute inset-0" />
            <div className="film-float relative flex flex-col items-center">
                <span aria-hidden className="absolute -inset-8 rounded-full border border-acid/10" />
                <span aria-hidden className="absolute -inset-16 rounded-full border border-dashed border-border/40" />
                <svg viewBox="0 0 120 260" className="relative h-64 opacity-70" aria-label="人物剪影">
                    <g fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 4">
                        <circle cx="60" cy="30" r="17" />
                        <path d="M43 74 C43 54 50 48 60 48 C70 48 77 54 77 74 L82 132 L70 136 L68 214 L75 254 L61 254 L60 190 L59 254 L45 254 L52 214 L50 136 L38 132 Z" />
                    </g>
                </svg>
                <p className="relative mt-2 text-center text-[10px] leading-5 text-muted-foreground/60">可以直接生成全身合成图或角色卡，<br />部位参考按需补充</p>
            </div>
        </div>
    );
}
