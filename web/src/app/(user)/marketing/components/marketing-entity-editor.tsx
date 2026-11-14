"use client";

import { useState } from "react";
import { App, Button, Checkbox, Input, Modal, Select } from "antd";
import type { MarketingBrand, MarketingListing, MarketingLocation, MarketingOffering, MarketingWorkspace } from "@/lib/marketing";
import { errorMessage } from "@/lib/utils";
import { MarketingDetailsEditor, MarketingFactsEditor } from "./marketing-details-editor";

export type MarketingEditorValue =
    | { kind: "workspace"; item: MarketingWorkspace }
    | { kind: "brand"; item: MarketingBrand }
    | { kind: "location"; item: MarketingLocation }
    | { kind: "offering"; item: MarketingOffering };
const labels = { workspace: "资料空间", brand: "品牌", location: "门店 / 服务点", offering: "商品 / 服务" };

export function MarketingEntityEditor({ value, workspace, onSave, onClose }: { value: MarketingEditorValue; workspace: MarketingWorkspace; onSave: (value: MarketingEditorValue, listings: MarketingListing[]) => Promise<void>; onClose: () => void }) {
    const { message } = App.useApp();
    const [draft, setDraft] = useState(value);
    const [listings, setListings] = useState(workspace.listings);
    const [saving, setSaving] = useState(false);
    const patch = (update: Partial<MarketingEditorValue["item"]>) => setDraft((current) => ({ ...current, item: { ...current.item, ...update } } as MarketingEditorValue));
    const save = async () => {
        if (!draft.item.name.trim()) return void message.warning("请输入名称");
        if (draft.item.assets.some((asset) => !asset.assetId || !asset.role.trim())) return void message.warning("请补全图片和用途，或移除空引用");
        if (draft.item.facts.some((fact) => !fact.label.trim() || !fact.value.trim() || (fact.approved && !fact.source.trim()))) return void message.warning("请补全事实名称、内容与已确认事实的依据");
        setSaving(true);
        try { await onSave(draft, listings); onClose(); } catch (error) { message.error(errorMessage(error, "资料保存失败")); } finally { setSaving(false); }
    };
    return <Modal title={`编辑${labels[draft.kind]}`} open width="min(840px, 96vw)" onCancel={saving ? undefined : onClose} mask={{ closable: false }} footer={<div className="flex justify-end gap-2"><Button disabled={saving} onClick={onClose}>取消</Button><Button type="primary" loading={saving} onClick={() => void save()}>保存资料</Button></div>}>
        <fieldset disabled={saving} className="max-h-[72dvh] space-y-5 overflow-y-auto py-2 pr-2">
            <label className="block space-y-2 text-sm"><span>名称</span><Input autoFocus aria-label="资料名称" maxLength={100} value={draft.item.name} onChange={(event) => patch({ name: event.target.value })} /></label>
            {draft.kind === "workspace" ? <label className="block space-y-2 text-sm"><span>所属行业</span><Input aria-label="所属行业" maxLength={200} placeholder="如：餐饮、家政、零售、企业服务，可自由填写" value={draft.item.industry} onChange={(event) => patch({ industry: event.target.value })} /></label> : null}
            {draft.kind === "location" ? <>
                <label className="block space-y-2 text-sm"><span>经营形式</span><Select className="w-full" aria-label="经营形式" value={draft.item.kind} options={[{ value: "store", label: "实体门店" }, { value: "service", label: "服务点" }, { value: "online", label: "线上业务" }]} onChange={(kind) => patch({ kind })} /></label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm"><span>城市</span><Input aria-label="门店城市" maxLength={100} value={draft.item.city} onChange={(event) => patch({ city: event.target.value })} /></label><label className="space-y-2 text-sm"><span>区域</span><Input aria-label="门店区域" maxLength={100} value={draft.item.district} onChange={(event) => patch({ district: event.target.value })} /></label></div>
                <label className="block space-y-2 text-sm"><span>地址</span><Input aria-label="门店地址" maxLength={500} value={draft.item.address} onChange={(event) => patch({ address: event.target.value })} /></label>
                <label className="block space-y-2 text-sm"><span>当地风格与客群特点</span><Input.TextArea aria-label="当地风格与客群特点" rows={3} maxLength={5000} value={draft.item.localContext} placeholder="填写实际了解的本地偏好；留空时不让模型凭城市名编造" onChange={(event) => patch({ localContext: event.target.value })} /></label>
            </> : null}
            {draft.kind === "offering" ? <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm"><span>类型</span><Select className="w-full" aria-label="商品服务类型" value={draft.item.kind} options={[{ value: "product", label: "商品" }, { value: "service", label: "服务" }]} onChange={(kind) => patch({ kind })} /></label><label className="space-y-2 text-sm"><span>分类</span><Input aria-label="商品分类" maxLength={200} value={draft.item.category} onChange={(event) => patch({ category: event.target.value })} /></label></div> : null}
            <MarketingDetailsEditor value={draft.item} onChange={patch} />
            {draft.kind === "location" ? <section className="space-y-4 border-t border-border pt-5"><h3 className="text-sm font-semibold">本店可提供的商品 / 服务</h3><p className="text-xs text-muted-foreground">先在品牌下建立商品，再配置本店是否提供。价格、库存或优惠等门店特有信息请填写为本店事实。</p>
                {workspace.offerings.filter((item) => item.brandId === draft.item.brandId).map((offering) => {
                    const listing = listings.find((item) => item.locationId === draft.item.id && item.offeringId === offering.id);
                    const update = (patchValue: Partial<MarketingListing>) => setListings((current) => {
                        const entry = { workspaceId: workspace.id, locationId: draft.item.id, offeringId: offering.id, available: false, highlights: "", facts: [], ...listing, ...patchValue };
                        return [...current.filter((item) => item.locationId !== entry.locationId || item.offeringId !== entry.offeringId), entry];
                    });
                    return <div key={offering.id} className="space-y-3 rounded-lg border border-border p-3"><Checkbox checked={listing?.available || false} onChange={(event) => update({ available: event.target.checked })}>{offering.name}</Checkbox>{listing?.available ? <><Input aria-label={`${offering.name}本店特点`} maxLength={3000} placeholder="本店推荐场景 / 特点（事实主张需在下方核对）" value={listing.highlights} onChange={(event) => update({ highlights: event.target.value })} /><MarketingFactsEditor value={listing.facts} onChange={(facts) => update({ facts })} /></> : null}</div>;
                })}
            </section> : null}
        </fieldset>
    </Modal>;
}
