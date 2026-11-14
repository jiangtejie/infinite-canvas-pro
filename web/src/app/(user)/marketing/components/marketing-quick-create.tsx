"use client";

import { useEffect, useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { errorMessage } from "@/lib/utils";
import type { MarketingLocation, MarketingOffering } from "@/lib/marketing";

export type QuickMarketingInput = {
    workspaceName: string;
    industry: string;
    brandName: string;
    locationName: string;
    locationKind: MarketingLocation["kind"];
    city: string;
    district: string;
    address: string;
    offeringName: string;
    offeringKind: MarketingOffering["kind"];
};

const emptyInput = (): QuickMarketingInput => ({ workspaceName: "", industry: "", brandName: "", locationName: "", locationKind: "store", city: "", district: "", address: "", offeringName: "", offeringKind: "product" });

export function MarketingQuickCreate({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (input: QuickMarketingInput) => Promise<void> }) {
    const { message } = App.useApp();
    const [input, setInput] = useState(emptyInput);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (open) setInput(emptyInput());
    }, [open]);
    const patch = (update: Partial<QuickMarketingInput>) => setInput((current) => ({ ...current, ...update }));
    const create = async () => {
        if (!input.workspaceName.trim()) return void message.warning("请填写资料空间名称");
        if (!input.brandName.trim()) return void message.warning("请填写品牌名称");
        if (!input.locationName.trim()) return void message.warning("请填写门店或服务点名称");
        setSaving(true);
        try {
            await onCreate(input);
            onClose();
        } catch (error) {
            message.error(errorMessage(error, "单店资料创建失败"));
        } finally {
            setSaving(false);
        }
    };
    return <Modal title="快速创建单店资料" open={open} width="min(680px, 96vw)" onCancel={saving ? undefined : onClose} mask={{ closable: false }} footer={<div className="flex justify-end gap-2"><Button disabled={saving} onClick={onClose}>取消</Button><Button type="primary" loading={saving} onClick={() => void create()}>创建资料</Button></div>}>
        <fieldset disabled={saving} className="max-h-[72dvh] space-y-5 overflow-y-auto py-2 pr-1">
            <p className="text-xs leading-5 text-muted-foreground">一次创建企业、品牌、门店和一个可售商品；创建后可继续补充事实、图片和更多门店。</p>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm"><span>资料空间名称</span><Input autoFocus aria-label="快速创建资料空间名称" maxLength={100} value={input.workspaceName} placeholder="如：好味道直营" onChange={(event) => patch({ workspaceName: event.target.value })} /></label>
                <label className="space-y-2 text-sm"><span>所属行业</span><Input aria-label="快速创建所属行业" maxLength={200} value={input.industry} placeholder="如：餐饮" onChange={(event) => patch({ industry: event.target.value })} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm"><span>品牌名称</span><Input aria-label="快速创建品牌名称" maxLength={100} value={input.brandName} placeholder="如：好味道" onChange={(event) => patch({ brandName: event.target.value })} /></label>
                <label className="space-y-2 text-sm"><span>门店 / 服务点名称</span><Input aria-label="快速创建门店名称" maxLength={100} value={input.locationName} placeholder="如：西湖店" onChange={(event) => patch({ locationName: event.target.value })} /></label>
            </div>
            <label className="block space-y-2 text-sm"><span>经营形式</span><Select className="w-full" aria-label="快速创建经营形式" value={input.locationKind} options={[{ value: "store", label: "实体门店" }, { value: "service", label: "服务点" }, { value: "online", label: "线上业务" }]} onChange={(locationKind) => patch({ locationKind })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm"><span>城市</span><Input aria-label="快速创建城市" maxLength={100} value={input.city} onChange={(event) => patch({ city: event.target.value })} /></label>
                <label className="space-y-2 text-sm"><span>区域</span><Input aria-label="快速创建区域" maxLength={100} value={input.district} onChange={(event) => patch({ district: event.target.value })} /></label>
            </div>
            <label className="block space-y-2 text-sm"><span>地址</span><Input aria-label="快速创建地址" maxLength={500} value={input.address} onChange={(event) => patch({ address: event.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm"><span>主营商品 / 服务（可选）</span><Input aria-label="快速创建商品名称" maxLength={100} value={input.offeringName} placeholder="如：招牌饭" onChange={(event) => patch({ offeringName: event.target.value })} /></label>
                <label className="space-y-2 text-sm"><span>类型</span><Select className="w-full" aria-label="快速创建商品类型" value={input.offeringKind} options={[{ value: "product", label: "商品" }, { value: "service", label: "服务" }]} onChange={(offeringKind) => patch({ offeringKind })} /></label>
            </div>
        </fieldset>
    </Modal>;
}
