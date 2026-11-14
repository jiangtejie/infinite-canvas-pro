"use client";

import { useRef, useState } from "react";
import { App, Button, Input, Select, Switch } from "antd";
import { Plus, Trash2, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import { errorMessage } from "@/lib/utils";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import type { MarketingDetails, MarketingFact } from "@/lib/marketing";

export function MarketingFactsEditor({ value, onChange }: { value: MarketingFact[]; onChange: (facts: MarketingFact[]) => void }) {
    const patch = (id: string, update: Partial<MarketingFact>) => onChange(value.map((fact) => fact.id === id ? { ...fact, ...update } : fact));
    return <div className="space-y-3">
        <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">可核对的营销事实</span><Button size="small" icon={<Plus className="size-3.5" />} onClick={() => onChange([...value, { id: nanoid(), label: "", value: "", source: "", approved: false, validUntil: "" }])}>添加事实</Button></div>
        <p className="text-xs leading-5 text-muted-foreground">价格、主推特点、资质、优惠和效果均填写依据。只有已确认且未过期的事实进入策划；修改内容后需重新确认。</p>
        {value.map((fact) => <div key={fact.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2"><Input aria-label="事实名称" placeholder="名称，如：招牌菜 / 本店价格" maxLength={100} value={fact.label} onChange={(event) => patch(fact.id, { label: event.target.value, approved: false })} /><Button type="text" danger aria-label="删除事实" icon={<Trash2 className="size-4" />} onClick={() => onChange(value.filter((item) => item.id !== fact.id))} /></div>
            <Input.TextArea aria-label="事实内容" placeholder="真实、具体的事实内容" autoSize={{ minRows: 2, maxRows: 4 }} maxLength={3000} value={fact.value} onChange={(event) => patch(fact.id, { value: event.target.value, approved: false })} />
            <Input aria-label="事实依据" placeholder="依据，如：本店菜单、合同、检测报告、运营确认" maxLength={1000} value={fact.source} onChange={(event) => patch(fact.id, { source: event.target.value, approved: false })} />
            <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted-foreground">有效至<Input type="date" aria-label="事实有效期" value={fact.validUntil ? fact.validUntil.slice(0, 10) : ""} onChange={(event) => patch(fact.id, { validUntil: event.target.value ? `${event.target.value}T23:59:59+08:00` : "", approved: false })} /></label><label className="flex items-center gap-2 text-xs"><Switch size="small" aria-label="确认该事实" checked={fact.approved} disabled={!fact.label.trim() || !fact.value.trim() || !fact.source.trim()} onChange={(approved) => patch(fact.id, { approved })} />已核对</label></div>
        </div>)}
    </div>;
}

export function MarketingDetailsEditor({ value, onChange }: { value: MarketingDetails; onChange: (patch: Partial<MarketingDetails>) => void }) {
    const { message } = App.useApp();
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [uploading, setUploading] = useState(false);
    const uploadRef = useRef<HTMLInputElement>(null);
    const imageOptions = assets.filter((asset) => asset.kind === "image").map((asset) => ({ label: asset.title, value: asset.id }));
    const uploadImages = async (files: FileList | null) => {
        const list = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        if (!list.length) return;
        setUploading(true);
        try {
            const refs = [...value.assets];
            for (const file of list) {
                const image = await uploadImage(file);
                const id = addAsset({ kind: "image", title: file.name.replace(/\.[^.]+$/, "") || "营销图片", coverUrl: image.url, tags: [], source: "marketing", data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType } });
                refs.push({ assetId: id, role: "营销图片" });
                onChange({ assets: [...refs] });
            }
            message.success("图片已加入“我的素材”并关联");
        } catch (error) {
            message.error(errorMessage(error, "图片上传失败"));
        } finally {
            setUploading(false);
            if (uploadRef.current) uploadRef.current.value = "";
        }
    };
    return <div className="space-y-5">
        <label className="block space-y-2 text-sm"><span>基本介绍</span><Input.TextArea aria-label="基本介绍" rows={3} maxLength={5000} value={value.description} placeholder="提供可核对的背景介绍；具体营销主张写到下方事实中" onChange={(event) => onChange({ description: event.target.value })} /></label>
        <label className="block space-y-2 text-sm"><span>目标受众</span><Input aria-label="目标受众" maxLength={2000} value={value.audience} placeholder="如：附近上班族、带孩子的家庭" onChange={(event) => onChange({ audience: event.target.value })} /></label>
        <label className="block space-y-2 text-sm"><span>表达与风格指导</span><Input.TextArea aria-label="表达与风格指导" rows={3} maxLength={5000} value={value.guidance} placeholder="描述希望采用的语气和风格；不是给 Agent 的执行权限" onChange={(event) => onChange({ guidance: event.target.value })} /></label>
        <label className="block space-y-2 text-sm"><span>避免的表述</span><Select className="w-full" mode="tags" aria-label="避免的表述" tokenSeparators={["，", ","]} value={value.forbidden} onChange={(forbidden) => onChange({ forbidden })} placeholder="如：全市第一、保证有效；Enter 添加" /></label>
        <MarketingFactsEditor value={value.facts} onChange={(facts) => onChange({ facts })} />
        <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">关联图片</span><div className="flex flex-wrap items-center gap-2"><Button size="small" icon={<Upload className="size-3.5" />} loading={uploading} onClick={() => uploadRef.current?.click()}>上传图片</Button><Button size="small" icon={<Plus className="size-3.5" />} disabled={value.assets.some((ref) => !ref.assetId)} onClick={() => onChange({ assets: [...value.assets, { assetId: "", role: "商品外观" }] })}>选择图片</Button></div></div><input ref={uploadRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void uploadImages(event.target.files)} /><p className="text-xs leading-5 text-muted-foreground">复用“我的素材”，可标注 Logo、门店环境、包装、商品外观等用途。上传的图片会自动加入“我的素材”。<a href="/assets" target="_blank" rel="noreferrer">管理我的素材</a></p>
            {value.assets.map((ref, index) => <div className="flex flex-wrap items-center gap-2" key={index}><Select className="min-w-40 flex-1" showSearch optionFilterProp="label" aria-label="选择营销图片" value={ref.assetId || undefined} options={imageOptions.filter((option) => option.value === ref.assetId || !value.assets.some((item) => item.assetId === option.value))} onChange={(assetId) => onChange({ assets: value.assets.map((item, i) => i === index ? { ...item, assetId } : item) })} /><Input className="!w-36" aria-label="图片用途" maxLength={100} value={ref.role} onChange={(event) => onChange({ assets: value.assets.map((item, i) => i === index ? { ...item, role: event.target.value } : item) })} /><Button type="text" danger aria-label="解除图片引用" icon={<Trash2 className="size-4" />} onClick={() => onChange({ assets: value.assets.filter((_, i) => i !== index) })} /></div>)}
        </div>
    </div>;
}
