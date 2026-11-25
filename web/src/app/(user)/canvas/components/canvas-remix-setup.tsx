"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Collapse, Input, Modal, Segmented, Select, Spin } from "antd";
import { availableMarketingOfferings, isMarketingFactValid, marketingImageIssue, resolveMarketingSelection, type MarketingScope, type MarketingSelection, type MarketingWorkspace } from "@/lib/marketing";
import { useAssetStore } from "@/stores/use-asset-store";
import { useMarketingStore } from "@/stores/use-marketing-store";
import { errorMessage } from "@/lib/utils";
import { changeRemixSettingsMode, createInitialRemixSettings, readRemixSetupMemory, REMIX_DEFAULT_GOALS, saveRemixSetupMemory } from "../remix-setup-memory";
import { CanvasAgentSkillPopover } from "./canvas-agent-skill-popover";
import { REMIX_PLACEMENTS, type RemixSettings, type RemixSkillSelection } from "../remix-types";

export type RemixSetupResult = { settings: RemixSettings; selection?: MarketingSelection };
const SCOPE_LABELS: Record<MarketingScope, string> = { workspace: "企业", brand: "品牌", location: "门店", offering: "商品" };

export function CanvasRemixSetup({ sourceTitle, initialSkills, instruction, onResolve }: { sourceTitle: string; initialSkills: RemixSkillSelection[]; instruction: string; onResolve: (result: RemixSetupResult | null) => void }) {
    const { message } = App.useApp();
    const workspaces = useMarketingStore((state) => state.workspaces);
    const loading = useMarketingStore((state) => state.loading);
    const load = useMarketingStore((state) => state.load);
    const details = useMarketingStore((state) => state.details);
    const offline = useMarketingStore((state) => state.offline);
    const ensureDetail = useMarketingStore((state) => state.ensureDetail);
    const assets = useAssetStore((state) => state.assets);
    const [memory] = useState(readRemixSetupMemory);
    const [settings, setSettings] = useState<RemixSettings>(() => createInitialRemixSettings(memory, { instruction, initialSkills }));
    const [selection, setSelection] = useState<MarketingSelection>(() => ({ workspaceId: "", scope: memory.selection?.scope || "workspace" }));
    const [error, setError] = useState("");
    const [detailLoading, setDetailLoading] = useState(false);
    const [openedAt] = useState(() => Date.now());
    const restoredRef = useRef(false);
    const workspaceId = selection.workspaceId;
    const brandId = selection.brandId || "";
    const locationId = selection.locationId || "";
    const offeringIds = selection.offeringIds || [];
    const scope = selection.scope;
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const detail = workspace ? details[workspace.id] : undefined;

    useEffect(() => {
        if (settings.mode !== "marketing") return;
        void load(true).catch((err) => setError(errorMessage(err, "营销资料加载失败")));
    }, [load, settings.mode]);

    const selectWorkspace = (id: string) => {
        setSelection({ workspaceId: id, scope });
        setError("");
        if (!id || details[id]) return;
        setDetailLoading(true);
        void ensureDetail(id).catch((err) => setError(errorMessage(err, "营销资料加载失败"))).finally(() => setDetailLoading(false));
    };

    const restoreSelection = useCallback((workspace: MarketingWorkspace, remembered: MarketingSelection) => {
        try {
            const resolved = resolveMarketingSelection(workspace, remembered);
            setSelection({ workspaceId: workspace.id, scope: remembered.scope, ...(resolved.brand ? { brandId: resolved.brand.id } : {}), ...(resolved.location ? { locationId: resolved.location.id } : {}), ...(resolved.offerings.length ? { offeringIds: resolved.offerings.map((item) => item.id) } : {}) });
        } catch {
            setSelection({ workspaceId: workspace.id, scope: "workspace" });
        }
    }, []);

    useEffect(() => {
        if (restoredRef.current || settings.mode !== "marketing" || workspaceId || !workspaces.length) return;
        const target = workspaces.find((item) => item.id === memory.selection?.workspaceId);
        if (!target) {
            restoredRef.current = true;
            return;
        }
        restoredRef.current = true;
        if (!memory.selection) return;
        setSelection({ workspaceId: target.id, scope: memory.selection.scope });
        if (details[target.id]) {
            restoreSelection(details[target.id], memory.selection);
            return;
        }
        setDetailLoading(true);
        void ensureDetail(target.id).then((loaded) => restoreSelection(loaded, memory.selection!)).catch((err) => setError(errorMessage(err, "营销资料加载失败"))).finally(() => setDetailLoading(false));
    }, [workspaces, workspaceId, memory, details, ensureDetail, restoreSelection, settings.mode]);

    const recheckMarketing = () => {
        if (!workspaceId) return;
        setError("");
        setDetailLoading(true);
        void ensureDetail(workspaceId, true).catch((err) => setError(errorMessage(err, "资料重新检查失败"))).finally(() => setDetailLoading(false));
    };

    const selectScope = (next: MarketingScope) => setSelection((current) => ({
        workspaceId: current.workspaceId,
        scope: next,
        ...(next === "brand" || next === "offering" ? { brandId: next === "brand" ? current.brandId || "" : "" } : {}),
        ...(next === "location" ? { locationId: "" } : {}),
        ...(next === "offering" ? { locationId: "", offeringIds: [] } : {}),
    }));

    const preview = useMemo<{ error: string } | { subject: string; approvedFacts: number; images: number; issues: string[] } | null>(() => {
        if (!detail || !workspaceId) return null;
        try {
            const resolved = resolveMarketingSelection(detail, selection);
            const references = resolved.details.flatMap((item) => item.value.assets);
            const refs = [...new Set(references.map((ref) => ref.assetId))];
            const allFacts = [...resolved.details.flatMap((item) => item.value.facts), ...resolved.listings.flatMap((item) => item.facts)];
            const validFact = (fact: (typeof allFacts)[number]) => isMarketingFactValid(fact, openedAt);
            const approvedFacts = allFacts.filter(validFact).length;
            const issues = [
                ...allFacts.filter((fact) => fact.approved && !validFact(fact)).map((fact) => `事实「${fact.label || "未命名"}」缺少名称、依据、内容或已过期`),
                ...references.map((ref) => marketingImageIssue(ref.role, assets.find((asset) => asset.id === ref.assetId))).filter(Boolean),
            ];
            return { subject: [resolved.workspace.name, resolved.brand?.name, resolved.location?.name, ...resolved.offerings.map((item) => item.name)].filter(Boolean).join(" / "), approvedFacts, images: refs.length, issues };
        } catch (error) {
            return { error: errorMessage(error, "资料范围无效") };
        }
    }, [assets, detail, openedAt, selection, workspaceId]);

    const submit = () => {
        const finalSettings = settings.mode === "content" ? { ...settings, goal: settings.goal.trim() || REMIX_DEFAULT_GOALS.content } : settings;
        if (!finalSettings.goal.trim()) return void message.warning("请填写本次目标");
        if (settings.mode === "marketing") {
            if (!detail || (preview && "error" in preview)) return void message.warning(preview && "error" in preview ? preview.error : "请选择有效的营销资料");
            if (preview && !("error" in preview) && preview.issues.length) return void message.warning(`请先处理：${preview.issues.join("、")}`);
            try { resolveMarketingSelection(detail, selection); } catch (error) { return void message.warning(errorMessage(error, "资料范围无效")); }
        }
        saveRemixSetupMemory({ mode: finalSettings.mode, placement: finalSettings.placement, goal: finalSettings.goal, selection: selection.workspaceId ? selection : memory.selection, skills: finalSettings.skills });
        onResolve({ settings: finalSettings, selection: settings.mode === "marketing" ? selection : undefined });
    };

    const addSkill = (skill: RemixSkillSelection) => {
        if (settings.skills.some((item) => item.id === skill.id && item.source === skill.source)) return;
        if (settings.skills.length >= 5) return void message.warning("最多选择 5 个 Skill");
        setSettings((current) => ({ ...current, skills: [...current.skills, skill] }));
    };

    return <Modal open title="本次复刻设置" width="min(720px, 96vw)" mask={{ closable: false }} destroyOnHidden onCancel={() => onResolve(null)} footer={<div className="flex justify-end gap-2"><Button onClick={() => onResolve(null)}>取消</Button><Button type="primary" onClick={submit}>开始组级策划</Button></div>}>
        <div className="max-h-[70dvh] space-y-6 overflow-y-auto py-2 pr-1">
            <p className="text-sm text-muted-foreground">当前素材：{sourceTitle} · 每次创建独立版本，已有复刻结果保留。</p>
            <Segmented block value={settings.mode} options={[{ label: "内容复刻", value: "content" }, { label: "结合营销资料", value: "marketing" }]} onChange={(value) => { setSettings((current) => changeRemixSettingsMode(current, value as RemixSettings["mode"])); setError(""); }} />
            {settings.mode === "marketing" ? <Spin spinning={loading || detailLoading}><div className="space-y-5">
                {error ? <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => { setError(""); void load(true).then(() => { if (workspaceId) selectWorkspace(workspaceId); }).catch((err) => setError(errorMessage(err, "加载失败"))); }}>重试</Button>} /> : null}
                {offline ? <Alert type="info" showIcon title="当前使用本机缓存" description="网络不可用，展示上次加载的营销资料；恢复网络后请刷新。" /> : null}
                <section className="space-y-4 rounded-xl border border-border/70 p-4">
                    <div className="flex items-center justify-between text-sm"><span>使用的经营资料</span><a href="/marketing" target="_blank" rel="noreferrer">管理营销资料</a></div>
                    <label className="block space-y-2 text-sm"><span>资料空间</span><Select className="w-full" aria-label="复刻资料空间" placeholder="选择资料空间" value={workspaceId || undefined} options={workspaces.map((item) => ({ value: item.id, label: `${item.name} · ${item.industry || "未指定行业"}` }))} onChange={selectWorkspace} /></label>
                    <label className="block space-y-2 text-sm"><span>资料范围</span><Segmented block value={scope} options={(["workspace", "brand", "location", "offering"] as MarketingScope[]).map((value) => ({ value, label: SCOPE_LABELS[value] }))} onChange={(value) => selectScope(value as MarketingScope)} /></label>
                    {scope === "brand" || scope === "offering" ? <label className="block space-y-2 text-sm"><span>品牌</span><Select className="w-full" aria-label="复刻品牌" placeholder="选择品牌" disabled={!detail || detailLoading} value={brandId || undefined} options={detail?.brands.map((item) => ({ value: item.id, label: item.name }))} onChange={(id) => setSelection((current) => ({ ...current, brandId: id, locationId: undefined, offeringIds: [] }))} /></label> : null}
                    {scope === "location" || scope === "offering" ? <label className="block space-y-2 text-sm"><span>门店 / 服务点{scope === "offering" ? "（可选）" : ""}</span><Select className="w-full" allowClear={scope === "offering"} showSearch optionFilterProp="label" aria-label="复刻门店" placeholder={scope === "offering" ? "不限门店" : "选择门店 / 服务点"} disabled={!detail || detailLoading || (scope === "offering" && !brandId)} value={locationId || undefined} options={detail?.locations.filter((item) => scope === "offering" ? item.brandId === brandId : true).map((item) => ({ value: item.id, label: `${item.name}${item.city ? ` · ${item.city}` : ""}` }))} onChange={(id) => setSelection((current) => ({ ...current, locationId: id || undefined, offeringIds: [] }))} /></label> : null}
                    {scope === "location" || scope === "offering" ? <label className="block space-y-2 text-sm"><span>{scope === "location" ? "本店可用商品 / 服务（可选）" : "品牌商品 / 服务"}</span><Select mode="multiple" maxCount={10} className="w-full" aria-label="复刻商品" placeholder={scope === "offering" ? "至少选择一项" : "可留空，只做门店内容"} disabled={!detail || detailLoading || (scope === "location" ? !locationId : !brandId)} value={offeringIds} options={(scope === "location" ? detail ? availableMarketingOfferings(detail, locationId) : [] : detail?.offerings.filter((item) => item.brandId === brandId) || []).map((item) => ({ value: item.id, label: item.name }))} onChange={(ids) => setSelection((current) => ({ ...current, offeringIds: ids }))} /></label> : null}
                    <p className="m-0 text-xs leading-5 text-muted-foreground">商品 / 服务最多选择 10 项；开始前会核对已确认事实、有效期和关联图片。</p>
                    {preview ? "error" in preview
                        ? <Alert type="error" showIcon title={preview.error} action={<div className="flex gap-1"><Button size="small" onClick={recheckMarketing}>重新检查</Button><Button size="small" href="/marketing" target="_blank" rel="noreferrer">去处理</Button></div>} />
                        : <div className="rounded-lg border border-border p-3 text-xs leading-6">
                            <div className="font-medium">本次主体：{preview.subject}</div>
                            <div className="text-muted-foreground">已确认事实 {preview.approvedFacts} 项 · 营销图片 {preview.images} 张</div>
                            {preview.issues.length ? <Alert className="mt-2" type="warning" showIcon title="资料需要处理" description={preview.issues.join("；")} action={<div className="flex gap-1"><Button size="small" onClick={recheckMarketing}>重新检查</Button><Button size="small" href="/marketing" target="_blank" rel="noreferrer">去处理</Button></div>} /> : null}
                            {preview.issues.length ? <p className="mb-0 mt-1 text-muted-foreground">在新标签处理资料，当前模式和填写内容会保留。</p> : null}
                        </div>
                    : null}
                </section>
                <label className="block space-y-2 text-sm"><span>植入方式</span><Select className="w-full" aria-label="营销植入方式" value={settings.placement} options={Object.entries(REMIX_PLACEMENTS).map(([value, label]) => ({ value, label }))} onChange={(placement) => setSettings((current) => ({ ...current, placement }))} /></label>
                <p className="text-xs leading-5 text-muted-foreground">自然植入保留原作视角与信息价值，只在合适位置替换主体；不编造亲测经历、评价或其他商家。明确促销只使用有效且已核对的活动事实。</p>
            </div></Spin> : null}
            {settings.mode === "marketing" ? <label className="block space-y-2 text-sm"><span>本次目标</span><Input aria-label="本次复刻目标" maxLength={1000} value={settings.goal} onChange={(event) => setSettings((current) => ({ ...current, goal: event.target.value }))} /></label> : null}
            <label className="block space-y-2 text-sm"><span>复刻要求</span><Input.TextArea aria-label="复刻补充要求" rows={3} maxLength={4000} placeholder="例如：保留第三人称攻略，只替换清单中的一家店，不加优惠券" value={settings.instruction} onChange={(event) => setSettings((current) => ({ ...current, instruction: event.target.value }))} /></label>
            {settings.mode === "content" ? <Collapse ghost items={[{ key: "advanced", label: "更多设置", children: <label className="block space-y-2 text-sm"><span>默认复刻目标</span><Input aria-label="本次复刻目标" maxLength={1000} value={settings.goal} onChange={(event) => setSettings((current) => ({ ...current, goal: event.target.value }))} /><span className="block text-xs text-muted-foreground">默认保留原作结构与传播逻辑；特殊目标可在这里调整。</span></label> }]} /> : null}
            <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm">表达 Skill（可选）</span><CanvasAgentSkillPopover selectedSkills={settings.skills} onSelect={addSkill} onDeleteSelected={(id, source) => setSettings((current) => ({ ...current, skills: current.skills.filter((item) => item.id !== id || item.source !== source) }))} /></div><div className="flex flex-wrap gap-2">{settings.skills.map((skill) => <Button key={`${skill.source}:${skill.id}`} size="small" onClick={() => setSettings((current) => ({ ...current, skills: current.skills.filter((item) => item.id !== skill.id || item.source !== skill.source) }))}>{skill.name} ×</Button>)}</div><p className="text-xs text-muted-foreground">Skill 调整方法与表达，组级策划、事实约束和用户审阅始终生效。</p></div>
        </div>
    </Modal>;
}
