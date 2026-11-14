"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Input, Modal, Segmented, Select, Spin } from "antd";
import { availableMarketingOfferings, type MarketingSelection, type MarketingWorkspace } from "@/lib/marketing";
import { useMarketingStore } from "@/stores/use-marketing-store";
import { errorMessage } from "@/lib/utils";
import { readRemixSetupMemory, saveRemixSetupMemory } from "../remix-setup-memory";
import { CanvasAgentSkillPopover } from "./canvas-agent-skill-popover";
import { REMIX_PLACEMENTS, type RemixSettings, type RemixSkillSelection } from "../remix-types";

export type RemixSetupResult = { settings: RemixSettings; selection?: MarketingSelection };
export function CanvasRemixSetup({ sourceTitle, initialSkills, instruction, onResolve }: { sourceTitle: string; initialSkills: RemixSkillSelection[]; instruction: string; onResolve: (result: RemixSetupResult | null) => void }) {
    const { message } = App.useApp();
    const workspaces = useMarketingStore((state) => state.workspaces);
    const loading = useMarketingStore((state) => state.loading);
    const load = useMarketingStore((state) => state.load);
    const details = useMarketingStore((state) => state.details);
    const offline = useMarketingStore((state) => state.offline);
    const ensureDetail = useMarketingStore((state) => state.ensureDetail);
    const [memory] = useState(readRemixSetupMemory);
    const [settings, setSettings] = useState<RemixSettings>(() => ({ mode: "content", goal: "保留原作的结构与传播逻辑，原创重制", placement: "natural", instruction, skills: initialSkills.length ? initialSkills : memory.skills }));
    const [workspaceId, setWorkspaceId] = useState("");
    const [locationId, setLocationId] = useState("");
    const [offeringIds, setOfferingIds] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [detailLoading, setDetailLoading] = useState(false);
    const restoredRef = useRef(false);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const detail = workspace ? details[workspace.id] : undefined;
    const location = detail?.locations.find((item) => item.id === locationId);
    const offerings = detail ? availableMarketingOfferings(detail, locationId) : [];
    useEffect(() => { void load(true).catch((err) => setError(errorMessage(err, "营销资料加载失败"))); }, [load]);
    const selectWorkspace = (id: string) => {
        setWorkspaceId(id);
        setLocationId("");
        setOfferingIds([]);
        setError("");
        if (!id || details[id]) return;
        setDetailLoading(true);
        void ensureDetail(id).catch((err) => setError(errorMessage(err, "营销资料加载失败"))).finally(() => setDetailLoading(false));
    };
    useEffect(() => {
        if (restoredRef.current || !workspaces.length) return;
        if (workspaceId) {
            restoredRef.current = true;
            return;
        }
        const target = workspaces.find((item) => item.id === memory.workspaceId);
        if (!target) {
            restoredRef.current = true;
            return;
        }
        restoredRef.current = true;
        setWorkspaceId(target.id);
        const selected = memory.locations[target.id];
        if (!selected) return;
        const apply = (workspace: MarketingWorkspace) => {
            if (workspace.locations.some((item) => item.id === selected.locationId)) setLocationId(selected.locationId);
            const available = new Set(availableMarketingOfferings(workspace, selected.locationId).map((item) => item.id));
            setOfferingIds(selected.offeringIds.filter((id) => available.has(id)));
        };
        if (details[target.id]) apply(details[target.id]);
        else {
            setDetailLoading(true);
            void ensureDetail(target.id).then(apply).catch((err) => setError(errorMessage(err, "营销资料加载失败"))).finally(() => setDetailLoading(false));
        }
    }, [workspaces, workspaceId, memory, details, ensureDetail]);
    const submit = () => {
        if (!settings.goal.trim()) return void message.warning("请填写本次目标");
        if (settings.mode === "marketing" && (!detail || !location || !offeringIds.length)) return void message.warning("请明确选择资料空间、门店和商品 / 服务");
        const locations = { ...memory.locations };
        if (settings.mode === "marketing" && workspaceId && locationId) locations[workspaceId] = { locationId, offeringIds };
        saveRemixSetupMemory({ workspaceId: settings.mode === "marketing" ? workspaceId || memory.workspaceId : memory.workspaceId, locations, skills: settings.skills });
        onResolve({ settings, selection: settings.mode === "marketing" ? { workspaceId, locationId, offeringIds } : undefined });
    };
    const addSkill = (skill: RemixSkillSelection) => {
        if (settings.skills.some((item) => item.id === skill.id && item.source === skill.source)) return;
        if (settings.skills.length >= 5) return void message.warning("最多选择 5 个 Skill");
        setSettings((current) => ({ ...current, skills: [...current.skills, skill] }));
    };
    return <Modal open title="本次复刻设置" width="min(720px, 96vw)" mask={{ closable: false }} onCancel={() => onResolve(null)} footer={<div className="flex justify-end gap-2"><Button onClick={() => onResolve(null)}>取消</Button><Button type="primary" onClick={submit}>开始组级策划</Button></div>}>
        <div className="max-h-[70dvh] space-y-6 overflow-y-auto py-2 pr-1">
            <p className="text-sm text-muted-foreground">{sourceTitle} · 每次创建独立版本，已有复刻结果保留。</p>
            <Segmented block value={settings.mode} options={[{ label: "内容复刻", value: "content" }, { label: "结合营销资料", value: "marketing" }]} onChange={(value) => { const mode = value as "content" | "marketing"; setSettings((current) => ({ ...current, mode, goal: mode === "content" ? "保留原作的结构与传播逻辑，原创重制" : "通过有用、可信的内容建立门店认知" })); }} />
            {settings.mode === "marketing" ? <Spin spinning={loading || detailLoading}><div className="space-y-5">
                {error ? <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => { setError(""); void load(true).then(() => { if (workspaceId) selectWorkspace(workspaceId); }).catch((err) => setError(errorMessage(err, "加载失败"))); }}>重试</Button>} /> : null}
                {offline ? <Alert type="info" showIcon title="当前使用本机缓存" description="网络不可用，展示上次加载的营销资料；恢复网络后请刷新。" /> : null}
                <section className="space-y-4 rounded-xl border border-border/70 p-4">
                    <div className="flex items-center justify-between text-sm"><span>使用的经营资料</span><a href="/marketing" target="_blank" rel="noreferrer">管理营销资料</a></div>
                    <label className="block space-y-2 text-sm"><span>资料空间</span><Select className="w-full" aria-label="复刻资料空间" placeholder="选择资料空间" value={workspaceId || undefined} options={workspaces.map((item) => ({ value: item.id, label: `${item.name} · ${item.industry || "未指定行业"}` }))} onChange={selectWorkspace} /></label>
                    <label className="block space-y-2 text-sm"><span>门店 / 服务点</span><Select className="w-full" showSearch optionFilterProp="label" aria-label="复刻门店" placeholder="选择本次门店 / 服务点" disabled={!detail || detailLoading} value={locationId || undefined} options={detail?.locations.map((item) => ({ value: item.id, label: `${detail.brands.find((brand) => brand.id === item.brandId)?.name || ""} / ${item.name}${item.city ? ` · ${item.city}` : ""}` }))} onChange={(id) => { setLocationId(id); setOfferingIds([]); }} /></label>
                    <label className="block space-y-2 text-sm"><span>本店可用商品 / 服务</span><Select mode="multiple" maxCount={10} className="w-full" aria-label="复刻商品" placeholder="选择本店可用商品 / 服务" disabled={!location || detailLoading} value={offeringIds} options={offerings.map((item) => ({ value: item.id, label: item.name }))} onChange={setOfferingIds} /></label>
                    <p className="m-0 text-xs leading-5 text-muted-foreground">商品 / 服务最多选择 10 项；开始前会核对已确认事实、有效期和关联图片。</p>
                </section>
                {location ? <div className="rounded-lg border border-border p-3 text-xs leading-6"><div>{location.name} · {[location.city, location.district].filter(Boolean).join(" / ") || "未设置城市"}</div><div className="text-muted-foreground">当地特点：{location.localContext || "未填写；不会凭城市名推测"}</div><div className="text-muted-foreground">已选择 {offeringIds.length} 项商品 / 服务。</div></div> : null}
                <label className="block space-y-2 text-sm"><span>植入方式</span><Select className="w-full" aria-label="营销植入方式" value={settings.placement} options={Object.entries(REMIX_PLACEMENTS).map(([value, label]) => ({ value, label }))} onChange={(placement) => setSettings((current) => ({ ...current, placement }))} /></label>
                <p className="text-xs leading-5 text-muted-foreground">自然植入保留原作视角与信息价值，只在合适位置替换主体；不编造亲测经历、评价或其他商家。明确促销只使用有效且已核对的活动事实。</p>
            </div></Spin> : null}
            <label className="block space-y-2 text-sm"><span>本次目标</span><Input aria-label="本次复刻目标" maxLength={1000} value={settings.goal} onChange={(event) => setSettings((current) => ({ ...current, goal: event.target.value }))} /></label>
            <label className="block space-y-2 text-sm"><span>补充要求</span><Input.TextArea aria-label="复刻补充要求" rows={3} maxLength={4000} placeholder="例如：保留第三人称攻略，只替换清单中的一家店，不加优惠券" value={settings.instruction} onChange={(event) => setSettings((current) => ({ ...current, instruction: event.target.value }))} /></label>
            <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm">行业与表达 Skill</span><CanvasAgentSkillPopover selectedSkills={settings.skills} onSelect={addSkill} onDeleteSelected={(id, source) => setSettings((current) => ({ ...current, skills: current.skills.filter((item) => item.id !== id || item.source !== source) }))} /></div><div className="flex flex-wrap gap-2">{settings.skills.map((skill) => <Button key={`${skill.source}:${skill.id}`} size="small" onClick={() => setSettings((current) => ({ ...current, skills: current.skills.filter((item) => item.id !== skill.id || item.source !== skill.source) }))}>{skill.name} ×</Button>)}</div><p className="text-xs text-muted-foreground">Skill 调整方法与表达，组级策划、事实约束和用户审阅始终生效。</p></div>
        </div>
    </Modal>;
}
