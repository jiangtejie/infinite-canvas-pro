"use client";

import type { ReactNode } from "react";
import { Button, Input } from "antd";
import { Plus, Trash2 } from "lucide-react";

import type { ComicCharacter, ComicImageSlot } from "../types";
import { createComicCharacterVariant } from "../utils/comic-project";
import { applyComicReferenceSlot } from "../utils/comic-image-slot";
import { ComicImageSlotEditor } from "./comic-image-slot-editor";

type ReferenceSlot = "primary" | "face" | "fullBody";

const EMPTY_SLOT: ComicImageSlot = { images: [] };

export function ComicCharacterEditor({ character, onChange, actions }: {
    character: ComicCharacter;
    onChange: (character: ComicCharacter) => void;
    actions?: ReactNode;
}) {
    const patchIdentity = (patch: Partial<ComicCharacter["visualIdentity"]>) => onChange({ ...character, visualIdentity: { ...character.visualIdentity, ...patch } });
    const patchLook = (patch: Partial<ComicCharacter["defaultLook"]>) => onChange({ ...character, defaultLook: { ...character.defaultLook, ...patch } });
    const patchBehavior = (patch: Partial<ComicCharacter["behavior"]>) => onChange({ ...character, behavior: { ...character.behavior, ...patch } });
    const patchConstraints = (patch: Partial<ComicCharacter["constraints"]>) => onChange({ ...character, constraints: { ...character.constraints, ...patch } });
    const patchVariant = (id: string, patch: Partial<ComicCharacter["variants"][number]>) => onChange({
        ...character,
        variants: character.variants.map((variant) => variant.id === id ? { ...variant, ...patch, updatedAt: new Date().toISOString() } : variant),
    });

    const updateReference = (slotName: ReferenceSlot, slot: ComicImageSlot) => {
        const references = { ...character.references };
        if (!slot.images.length) delete references[slotName];
        else references[slotName] = applyComicReferenceSlot(character.references[slotName], `${character.id}:${slotName}`, slot);
        onChange({ ...character, references });
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input className="!min-w-[160px] !flex-1" value={character.name} maxLength={100} placeholder="角色名" onChange={(event) => onChange({ ...character, name: event.target.value })} />
                <Input className="!min-w-[200px] !flex-[1.5]" value={character.aliases.join("，")} placeholder="别名，用逗号分隔" onChange={(event) => onChange({ ...character, aliases: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} />
                <Input className="!min-w-[160px] !flex-1" value={character.role} maxLength={200} placeholder="身份 / 在故事里的作用" onChange={(event) => onChange({ ...character, role: event.target.value })} />
                {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <Field label="外观总述"><Input.TextArea rows={2} value={character.visualIdentity.description} maxLength={2000} placeholder="年龄、体型、面部特征、标志性细节" onChange={(event) => patchIdentity({ description: event.target.value })} /></Field>
                <Field label="年龄段"><Input value={character.visualIdentity.ageRange} maxLength={100} onChange={(event) => patchIdentity({ ageRange: event.target.value })} /></Field>
                <Field label="体型 / 身高比例"><Input value={character.visualIdentity.bodyProportions} maxLength={200} onChange={(event) => patchIdentity({ bodyProportions: event.target.value })} /></Field>
                <Field label="脸部特征"><Input value={character.visualIdentity.face} maxLength={500} onChange={(event) => patchIdentity({ face: event.target.value })} /></Field>
                <Field label="发型"><Input value={character.visualIdentity.hairstyle} maxLength={300} onChange={(event) => patchIdentity({ hairstyle: event.target.value })} /></Field>
                <Field label="肤色"><Input value={character.visualIdentity.skinTone} maxLength={200} onChange={(event) => patchIdentity({ skinTone: event.target.value })} /></Field>
                <Field label="标志性特征"><Input value={character.visualIdentity.signatureFeatures} maxLength={500} onChange={(event) => patchIdentity({ signatureFeatures: event.target.value })} /></Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
                <Field label="基础服装"><Input value={character.defaultLook.outfit} maxLength={500} onChange={(event) => patchLook({ outfit: event.target.value })} /></Field>
                <Field label="基础配色"><Input value={character.defaultLook.palette} maxLength={300} onChange={(event) => patchLook({ palette: event.target.value })} /></Field>
                <Field label="固定道具"><Input value={character.defaultLook.fixedProps} maxLength={300} onChange={(event) => patchLook({ fixedProps: event.target.value })} /></Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
                <Field label="性格"><Input.TextArea rows={2} value={character.behavior.personality} maxLength={2000} onChange={(event) => patchBehavior({ personality: event.target.value })} /></Field>
                <Field label="说话方式"><Input.TextArea rows={2} value={character.behavior.speechStyle} maxLength={1000} onChange={(event) => patchBehavior({ speechStyle: event.target.value })} /></Field>
                <Field label="表情基调"><Input.TextArea rows={2} value={character.behavior.expressionBaseline} maxLength={2000} placeholder="常见表情、情绪阈值、夸张程度" onChange={(event) => patchBehavior({ expressionBaseline: event.target.value })} /></Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
                <Field label="必须保持（逗号分隔）"><Input value={character.constraints.mustKeep.join("，")} maxLength={1000} onChange={(event) => patchConstraints({ mustKeep: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></Field>
                <Field label="禁用元素（逗号分隔）"><Input value={character.constraints.forbidden.join("，")} maxLength={1000} onChange={(event) => patchConstraints({ forbidden: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></Field>
                <Field label="其他设定"><Input.TextArea rows={2} value={character.notes} maxLength={3000} placeholder="口头禅、关系、随身道具" onChange={(event) => onChange({ ...character, notes: event.target.value })} /></Field>
            </div>

            <section className="rounded-lg border border-border/60 bg-background/20 p-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">角色参考图包</span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ComicImageSlotEditor label="主参考" slot={character.references.primary?.slot || EMPTY_SLOT} onChange={(slot) => updateReference("primary", slot)} />
                    <ComicImageSlotEditor label="脸部" slot={character.references.face?.slot || EMPTY_SLOT} onChange={(slot) => updateReference("face", slot)} />
                    <ComicImageSlotEditor label="全身" slot={character.references.fullBody?.slot || EMPTY_SLOT} onChange={(slot) => updateReference("fullBody", slot)} />
                </div>
            </section>

            <section className="space-y-2 rounded-lg border border-border/60 bg-background/20 p-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">角色变体</span>
                    <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={() => onChange({ ...character, variants: [...character.variants, createComicCharacterVariant(character.variants.length + 1)] })}>添加变体</Button>
                </div>
                {character.variants.map((variant) => (
                    <article key={variant.id} className="rounded-md border border-border/50 bg-background/30 p-2.5">
                        <div className="flex items-center gap-2">
                            <Input value={variant.name} maxLength={100} placeholder="变体名，如校服 / 受伤态" onChange={(event) => patchVariant(variant.id, { name: event.target.value })} />
                            <Button type="text" size="small" danger className="!h-7 !w-7 !min-w-7 !p-0" icon={<Trash2 className="size-3.5" />} aria-label="删除变体" onClick={() => onChange({ ...character, variants: character.variants.filter((item) => item.id !== variant.id) })} />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <Field label="适用说明"><Input value={variant.description} maxLength={500} onChange={(event) => patchVariant(variant.id, { description: event.target.value })} /></Field>
                            <Field label="外观变化"><Input value={variant.identityOverrides?.description || ""} maxLength={1000} placeholder="只写相对基础角色变化的部分" onChange={(event) => patchVariant(variant.id, { identityOverrides: { ...variant.identityOverrides, description: event.target.value } })} /></Field>
                            <Field label="服装覆盖"><Input value={variant.outfitOverride} maxLength={500} onChange={(event) => patchVariant(variant.id, { outfitOverride: event.target.value })} /></Field>
                            <Field label="配色覆盖"><Input value={variant.paletteOverride} maxLength={300} onChange={(event) => patchVariant(variant.id, { paletteOverride: event.target.value })} /></Field>
                            <Field label="道具 / 造型变化"><Input value={variant.propChanges} maxLength={500} onChange={(event) => patchVariant(variant.id, { propChanges: event.target.value })} /></Field>
                            <Field label="当前状态"><Input value={variant.stateDescription} maxLength={1000} placeholder="受伤、湿身、伪装等" onChange={(event) => patchVariant(variant.id, { stateDescription: event.target.value })} /></Field>
                        </div>
                        <div className="mt-2 max-w-[260px]">
                            <ComicImageSlotEditor
                                label="变体参考"
                                slot={variant.referenceImage?.slot || EMPTY_SLOT}
                                onChange={(slot) => patchVariant(variant.id, {
                                    referenceImage: slot.images.length ? applyComicReferenceSlot(variant.referenceImage, `${variant.id}:reference`, slot) : undefined,
                                })}
                            />
                        </div>
                    </article>
                ))}
            </section>

        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{label}</span>{children}</label>;
}
