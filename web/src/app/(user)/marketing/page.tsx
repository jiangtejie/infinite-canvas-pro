"use client";

import { useEffect, useState } from "react";
import { App, Alert, Button, Empty, Select, Spin, Tag } from "antd";
import { Building2, MapPin, Package, Pencil, Plus, RefreshCw, Store, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { PageHeader } from "@/components/ui/page-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { emptyMarketingDetails, type MarketingListing, type MarketingWorkspace } from "@/lib/marketing";
import { errorMessage } from "@/lib/utils";
import { useMarketingStore } from "@/stores/use-marketing-store";
import { useUserStore } from "@/stores/use-user-store";
import { MarketingEntityEditor, type MarketingEditorValue } from "./components/marketing-entity-editor";
import { MarketingQuickCreate, type QuickMarketingInput } from "./components/marketing-quick-create";

export default function MarketingPage() {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const workspaces = useMarketingStore((state) => state.workspaces);
    const loading = useMarketingStore((state) => state.loading);
    const load = useMarketingStore((state) => state.load);
    const save = useMarketingStore((state) => state.save);
    const remove = useMarketingStore((state) => state.remove);
    const details = useMarketingStore((state) => state.details);
    const ensureDetail = useMarketingStore((state) => state.ensureDetail);
    const token = useUserStore((state) => state.token);
    const [workspaceId, setWorkspaceId] = useState("");
    const [brandId, setBrandId] = useState("");
    const [editing, setEditing] = useState<MarketingEditorValue | null>(null);
    const [quickOpen, setQuickOpen] = useState(false);
    const [error, setError] = useState("");
    const [detailError, setDetailError] = useState("");
    const [busy, setBusy] = useState(false);
    const workspace = workspaces.find((item) => item.id === workspaceId) || workspaces[0];
    const detailLoaded = workspace ? details[workspace.id] === true : false;
    const brand = workspace?.brands.find((item) => item.id === brandId) || workspace?.brands[0];
    const refresh = async () => { setError(""); try { await load(true); } catch (err) { setError(errorMessage(err, "资料加载失败")); } };
    useEffect(() => { void load().catch((err) => setError(errorMessage(err, "资料加载失败"))); }, [load]);
    const workspaceToLoad = workspace?.id || "";
    useEffect(() => {
        if (!workspaceToLoad || detailLoaded) {
            setDetailError("");
            return;
        }
        setDetailError("");
        void ensureDetail(workspaceToLoad).catch((err) => setDetailError(errorMessage(err, "资料加载失败")));
    }, [workspaceToLoad, detailLoaded, ensureDetail]);
    const createWorkspace = () => setEditing({ kind: "workspace", item: { ...emptyMarketingDetails(), id: nanoid(), name: "", industry: "", ownerUserId: "", revision: 0, createdAt: "", updatedAt: "", brands: [], locations: [], offerings: [], listings: [] } });
    const createQuickWorkspace = async (input: QuickMarketingInput) => {
        const workspaceId = nanoid();
        const brandId = nanoid();
        const locationId = nanoid();
        const offeringId = input.offeringName.trim() ? nanoid() : "";
        const next: MarketingWorkspace = {
            ...emptyMarketingDetails(),
            id: workspaceId,
            ownerUserId: "",
            name: input.workspaceName.trim(),
            industry: input.industry.trim(),
            revision: 0,
            createdAt: "",
            updatedAt: "",
            brands: [{ ...emptyMarketingDetails(), id: brandId, workspaceId, name: input.brandName.trim() }],
            locations: [{ ...emptyMarketingDetails(), id: locationId, workspaceId, brandId, name: input.locationName.trim(), kind: input.locationKind, city: input.city.trim(), district: input.district.trim(), address: input.address.trim(), localContext: "" }],
            offerings: offeringId ? [{ ...emptyMarketingDetails(), id: offeringId, workspaceId, brandId, name: input.offeringName.trim(), kind: input.offeringKind, category: "" }] : [],
            listings: offeringId ? [{ workspaceId, locationId, offeringId, available: true, highlights: "", facts: [] }] : [],
        };
        const saved = await save(next);
        setWorkspaceId(saved.id);
        setBrandId(saved.brands[0]?.id || "");
        message.success("单店资料已创建，可继续补充事实和图片");
    };
    const saveEditor = async (value: MarketingEditorValue, listings: MarketingListing[]) => {
        let next: MarketingWorkspace;
        if (value.kind === "workspace") next = value.item;
        else {
            if (!workspace) throw new Error("请先创建资料空间");
            const replace = <T extends { id: string }>(items: T[], item: T) => items.some((entry) => entry.id === item.id) ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item];
            next = { ...workspace, listings };
            if (value.kind === "brand") next.brands = replace(workspace.brands, value.item);
            if (value.kind === "location") next.locations = replace(workspace.locations, value.item);
            if (value.kind === "offering") next.offerings = replace(workspace.offerings, value.item);
        }
        const saved = await save(next);
        setWorkspaceId(saved.id);
        if (value.kind === "brand") setBrandId(value.item.id);
        message.success("营销资料已保存");
    };
    const deleteItem = async (kind: "workspace" | "brand" | "location" | "offering", id: string, name: string) => {
        if (!workspace) return;
        const detail = kind === "workspace" ? "将删除该空间的品牌、门店和商品资料；画布内已有的复刻记录与图片会保留。" : kind === "brand" ? "将同时移除该品牌的门店、商品和可售关联；已有复刻记录会保留。" : "将移除资料及对应门店商品关联；已有复刻记录会保留。";
        if (!await confirm({ title: `删除「${name}」？`, description: detail, confirmText: "删除资料", tone: "danger" })) return;
        setBusy(true);
        try {
            if (kind === "workspace") await remove(id);
            else {
                const locations = workspace.locations.filter((item) => kind === "brand" ? item.brandId !== id : kind !== "location" || item.id !== id);
                const offerings = workspace.offerings.filter((item) => kind === "brand" ? item.brandId !== id : kind !== "offering" || item.id !== id);
                await save({ ...workspace, brands: workspace.brands.filter((item) => kind !== "brand" || item.id !== id), locations, offerings, listings: workspace.listings.filter((item) => locations.some((location) => location.id === item.locationId) && offerings.some((offering) => offering.id === item.offeringId)) });
            }
            message.success("资料已删除");
        } catch (err) { message.error(errorMessage(err, "删除失败")); } finally { setBusy(false); }
    };
    const editorWorkspace = editing?.kind === "workspace" ? editing.item : workspace;
    return <main className="h-full overflow-y-auto text-foreground"><div className="page-shell space-y-7 py-10 sm:py-12">
        <PageHeader eyebrow="素材与提示词" title="营销资料" description="集中维护企业、品牌、门店和商品事实，在复刻时明确选择本次使用的资料。" actions={<div className="flex flex-wrap gap-2"><Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>刷新</Button><Button icon={<Store className="size-4" />} onClick={() => setQuickOpen(true)}>快速创建单店</Button><Button type="primary" icon={<Plus className="size-4" />} onClick={createWorkspace}>新建资料空间</Button></div>} />
        {!token ? <Alert type="info" showIcon title="当前保存在本机浏览器" description="登录后可将游客资料接管到账户。图片复用“我的素材”，跨设备使用前需要同步图片文件。" /> : null}
        {error ? <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => void refresh()}>重试</Button>} /> : null}
        {loading && !workspaces.length ? <div className="py-20 text-center"><Spin /></div> : !workspace ? <Empty description="先创建一个资料空间，填写经营主体与行业，再添加品牌、门店和商品。"><div className="flex flex-wrap justify-center gap-2"><Button type="primary" onClick={createWorkspace}>创建第一份资料</Button><Button icon={<Store className="size-4" />} onClick={() => setQuickOpen(true)}>快速创建单店</Button></div></Empty> : <>
            <div className="flex flex-wrap items-center gap-3 border-b border-border pb-5"><Building2 className="size-5 text-muted-foreground" /><Select className="min-w-48 flex-1 sm:max-w-sm" aria-label="选择营销资料空间" showSearch optionFilterProp="label" value={workspace.id} options={workspaces.map((item) => ({ value: item.id, label: item.name }))} onChange={(id) => { setWorkspaceId(id); setBrandId(""); }} /><Tag>{workspace.industry || "未指定行业"}</Tag><span className="text-xs text-muted-foreground">版本 {workspace.revision}</span><Button type="text" disabled={!detailLoaded} icon={<Pencil className="size-4" />} onClick={() => setEditing({ kind: "workspace", item: workspace })}>企业资料</Button><Button type="text" danger disabled={busy} aria-label="删除资料空间" icon={<Trash2 className="size-4" />} onClick={() => void deleteItem("workspace", workspace.id, workspace.name)} /></div>
            {!detailLoaded ? detailError ? <Alert type="error" showIcon title={detailError} action={<Button size="small" onClick={() => { setDetailError(""); void ensureDetail(workspace.id).catch((err) => setDetailError(errorMessage(err, "资料加载失败"))); }}>重试</Button>} /> : <div className="py-20 text-center"><Spin /></div> : <>
            <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-muted-foreground">品牌</span><Select className="min-w-44 flex-1 sm:max-w-xs" aria-label="选择品牌" placeholder="先添加品牌" value={brand?.id} options={workspace.brands.map((item) => ({ value: item.id, label: item.name }))} onChange={setBrandId} /><Button icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: "brand", item: { ...emptyMarketingDetails(), id: nanoid(), workspaceId: workspace.id, name: "" } })}>添加品牌</Button>{brand ? <><Button type="text" onClick={() => setEditing({ kind: "brand", item: brand })}>品牌资料</Button><Button type="text" danger disabled={busy} aria-label="删除品牌" icon={<Trash2 className="size-4" />} onClick={() => void deleteItem("brand", brand.id, brand.name)} /></> : null}</div>
            {brand ? <div className="grid gap-8 lg:grid-cols-2">
                <section className="space-y-4"><div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-semibold"><MapPin className="size-4" />门店与服务点</h2><Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ kind: "location", item: { ...emptyMarketingDetails(), id: nanoid(), workspaceId: workspace.id, brandId: brand.id, name: "", kind: "store", city: "", district: "", address: "", localContext: "" } })}>添加门店</Button></div><p className="text-xs leading-5 text-muted-foreground">门店负责城市特点与本店卖点；编辑门店可配置实际提供的商品与服务。</p>{workspace.locations.filter((item) => item.brandId === brand.id).map((item) => <article key={item.id} className="flex gap-3 border-b border-border py-4"><div className="min-w-0 flex-1"><h3 className="font-medium">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{[item.city, item.district, item.address].filter(Boolean).join(" · ") || "未填写位置"}</p><p className="mt-2 text-xs text-muted-foreground">{workspace.listings.filter((listing) => listing.locationId === item.id && listing.available).length} 项可用商品 / 服务 · {item.facts.filter((fact) => fact.approved).length} 项确认事实</p></div><Button size="small" onClick={() => setEditing({ kind: "location", item })}>编辑</Button><Button type="text" size="small" danger disabled={busy} aria-label={`删除${item.name}`} icon={<Trash2 className="size-4" />} onClick={() => void deleteItem("location", item.id, item.name)} /></article>)}{!workspace.locations.some((item) => item.brandId === brand.id) ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无门店或服务点" /> : null}</section>
                <section className="space-y-4"><div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-semibold"><Package className="size-4" />商品与服务</h2><Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ kind: "offering", item: { ...emptyMarketingDetails(), id: nanoid(), workspaceId: workspace.id, brandId: brand.id, name: "", kind: "product", category: "" } })}>添加商品</Button></div><p className="text-xs leading-5 text-muted-foreground">品牌共用商品资料；价格、可售情况和推荐特点可按门店独立维护。</p>{workspace.offerings.filter((item) => item.brandId === brand.id).map((item) => <article key={item.id} className="flex gap-3 border-b border-border py-4"><div className="min-w-0 flex-1"><h3 className="font-medium">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.kind === "product" ? "商品" : "服务"}{item.category ? ` · ${item.category}` : ""}</p><p className="mt-2 text-xs text-muted-foreground">{item.assets.length} 张关联图片 · {item.facts.filter((fact) => fact.approved).length} 项确认事实</p></div><Button size="small" onClick={() => setEditing({ kind: "offering", item })}>编辑</Button><Button type="text" size="small" danger disabled={busy} aria-label={`删除${item.name}`} icon={<Trash2 className="size-4" />} onClick={() => void deleteItem("offering", item.id, item.name)} /></article>)}{!workspace.offerings.some((item) => item.brandId === brand.id) ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无商品或服务" /> : null}</section>
            </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="添加品牌后即可维护门店和商品" />}
            </>}
        </>}
        {editing && editorWorkspace ? <MarketingEntityEditor key={`${editing.kind}:${editing.item.id}`} value={editing} workspace={editorWorkspace} onSave={saveEditor} onClose={() => setEditing(null)} /> : null}
        <MarketingQuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} onCreate={createQuickWorkspace} />
    </div></main>;
}
