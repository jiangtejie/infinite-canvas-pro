"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Input, InputNumber, Modal, Popover, Select } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useCopyText } from "@/hooks/use-copy-text";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { clampFilmVideoDuration } from "@/app/(user)/film/utils/film-video-limits";
import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { FilmAssetKind } from "@/lib/film/types";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { CanvasNodeData, FilmBindingEdgeData } from "../../types";
import { patchFilmShotNode } from "../lib/film-node-patch";
import type { FilmBindingAssetOption, FilmShotBindingChip } from "../lib/film-studio-types";
import type { FilmContextLens } from "../lib/film-context-lens";
import { FilmCameraMovementControl, FilmShotTypeControl, FilmTransitionControl } from "./film-shot-basic-controls";
import { FilmShotProfessionalFields } from "./film-shot-professional-fields";
import { FilmShotVideoFrames } from "./film-shot-video-frames";

type FilmShotPanelProps = {
    theme: CanvasTheme;
    shot: CanvasNodeData | null;
    sceneLabel: string;
    bindings: FilmShotBindingChip[];
    styleName: string | null;
    contextLenses: { image: FilmContextLens | null; video: FilmContextLens | null };
    canCreateShot: boolean;
    onCreateShot: () => void;
    onUpdate: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onClose: () => void;
    imageGenerating: boolean;
    imageError: string | null;
    taskProgress: number;
    canGenerateImage: boolean;
    onGenerateImage: () => void;
    onStopImage: () => void;
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: () => void;
    onStopVideo: () => void;
    availableAssets: FilmBindingAssetOption[];
    onAddBinding: (assetNodeId: string) => void;
    onRemoveBinding: (edgeId: string) => void;
    onUpdateBinding: (edgeId: string, patch: Partial<FilmBindingEdgeData>) => void;
    onEditAsset: (nodeId: string) => void;
    onOpenScript: () => void;
    onCreateAsset: (kind: FilmAssetKind) => void;
    openSections: Set<string>;
    onToggleSection: (key: string) => void;
};

function FilmCreditHint({ theme, config, videoSeconds }: { theme: CanvasTheme; config: AiConfig; videoSeconds: number }) {
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const user = useUserStore((state) => state.user);
    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);
    if (config.channelMode !== "remote") {
        return <div className="pl-[46px] text-[10px]" style={{ color: theme.node.muted }}>本地渠道 · 不计积分</div>;
    }
    const imageCredits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.imageModel, count: 1 });
    const videoCredits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.videoModel, seconds: videoSeconds, resolution: config.vquality });
    const hasPrice = imageCredits > 0 || videoCredits > 0;
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[46px] text-[10px]" style={{ color: theme.node.muted }}>
            <span className="inline-flex items-center gap-0.5">分镜图 {imageCredits > 0 ? <>约 <CreditSymbol />{imageCredits.toLocaleString()}</> : "按后台单价"}</span>
            <span className="inline-flex items-center gap-0.5">视频 {videoCredits > 0 ? <>约 <CreditSymbol />{videoCredits.toLocaleString()}</> : "按后台单价"}</span>
            {user ? <span className="inline-flex items-center gap-0.5">余额 <CreditSymbol />{user.credits.toLocaleString()}</span> : null}
            {user && hasPrice && user.credits < Math.max(imageCredits, videoCredits) ? <a href="/account?tab=recharge" className="text-amber-500 underline-offset-2 hover:underline">余额不足</a> : null}
        </div>
    );
}

function uniqueContextIssues(lenses: { image: FilmContextLens | null; video: FilmContextLens | null }) {
    const issues = new Map<string, "warning" | "error">();
    [lenses.image, lenses.video].forEach((lens) => {
        lens?.issues.forEach((issue) => {
            if (!issues.has(issue.message) || issue.level === "error") issues.set(issue.message, issue.level);
        });
    });
    return [...issues.entries()].map(([message, level]) => ({ message, level }));
}

function contextIssueCount(lenses: { image: FilmContextLens | null; video: FilmContextLens | null }) {
    return uniqueContextIssues(lenses).length;
}

function ContextLensSummary({ theme, lenses }: { theme: CanvasTheme; lenses: { image: FilmContextLens | null; video: FilmContextLens | null } }) {
    const [previewOpen, setPreviewOpen] = useState(false);
    const copyText = useCopyText();
    const lens = lenses.image ?? lenses.video;
    if (!lens) return <span className="text-xs" style={{ color: theme.node.muted }}>选择镜头后显示生成上下文。</span>;
    const details = lens.scene
        ? [lens.scene.location && `地点 ${lens.scene.location}`, lens.scene.time && `时间 ${lens.scene.time}`, lens.scene.mood && `氛围 ${lens.scene.mood}`, lens.scene.notes && `备注 ${lens.scene.notes}`].filter(Boolean).join(" · ")
        : "";
    const issues = uniqueContextIssues(lenses);
    return (
        <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-start justify-between gap-2">
                <span className="shrink-0" style={{ color: theme.node.muted }}>场次</span>
                <span className="min-w-0 text-right" style={{ color: lens.scene ? theme.node.text : theme.node.muted }}>{lens.scene ? lens.scene.label : "未归属场次"}</span>
            </div>
            {details ? <div className="text-[11px] leading-5" style={{ color: theme.node.muted }}>{details}</div> : null}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]" style={{ color: theme.node.muted }}>
                <span className="truncate" title={lens.styleName || undefined}>风格 · {lens.styleName || "未设置"}</span>
                <span>上一镜 · {lens.previousShot ? `#${lens.previousShot.shotNo}` : "无"}</span>
                <span>分镜图 · {lenses.image?.references.length ?? 0} 参考</span>
                <span>视频 · {lenses.video?.references.length ?? 0} 参考</span>
            </div>
            {issues.slice(0, 4).map((issue) => (
                <div key={issue.message} className="flex items-start gap-1 text-[11px] leading-4" style={{ color: issue.level === "error" ? canvasStatusColors.error : canvasStatusColors.loading }}>· {issue.message}</div>
            ))}
            {issues.length > 4 ? <div className="text-[10px]" style={{ color: theme.node.muted }}>还有 {issues.length - 4} 条提醒，见生成信息。</div> : null}
            {lens.prompt ? <button type="button" className="self-start text-[11px] underline underline-offset-2" style={{ color: theme.node.muted }} onClick={() => setPreviewOpen(true)}>查看完整提示词</button> : null}
            <Modal
                open={previewOpen}
                onCancel={() => setPreviewOpen(false)}
                title="完整提示词预览"
                width={760}
                zIndex={CANVAS_Z.popover}
                styles={{ header: { background: theme.node.panel, color: theme.node.text }, body: { background: theme.node.panel, color: theme.node.text, paddingTop: 8 }, footer: { background: theme.node.panel } }}
                footer={(
                    <div className="flex justify-end gap-2">
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => copyText(lens.prompt, "提示词已复制")}>复制提示词</button>
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={() => setPreviewOpen(false)}>关闭</button>
                    </div>
                )}
            >
                <pre className="thin-scrollbar max-h-[62vh] overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-xs leading-5" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}>{lens.prompt}</pre>
            </Modal>
        </div>
    );
}

function Section({ theme, title, open, onToggle, children }: { theme: CanvasTheme; title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
    const sectionRef = useRef<HTMLElement>(null);
    const toggle = () => {
        onToggle();
        if (!open) window.setTimeout(() => sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
    };
    return (
        <section ref={sectionRef} className="border-b" style={{ borderColor: theme.node.stroke }}>
            <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left" onClick={toggle} aria-expanded={open}>
                <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
                <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: theme.node.muted }} />
            </button>
            {open ? <div className="flex flex-col gap-2 px-4 pb-3">{children}</div> : null}
        </section>
    );
}

function Field({ theme, label, children }: { theme: CanvasTheme; label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: theme.node.muted }}>{label}</span>
            {children}
        </label>
    );
}

function BindingEditor({ theme, binding, onUpdate, onEditAsset, onClose }: { theme: CanvasTheme; binding: FilmShotBindingChip; onUpdate: (patch: Partial<FilmBindingEdgeData>) => void; onEditAsset: () => void; onClose: () => void }) {
    const continuity = binding.continuity ?? {};
    const setContinuity = (patch: Partial<typeof continuity>) => onUpdate({ continuity: { ...continuity, ...patch } });
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    return (
        <div className="flex w-[264px] flex-col gap-2 p-2" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between text-xs font-medium">
                <span className="truncate">绑定 · {binding.name}</span>
                <button type="button" className="grid size-6 place-items-center opacity-55 hover:opacity-100" onClick={onClose} aria-label="关闭绑定编辑">×</button>
            </div>
            {binding.kind === "character" ? (
                <>
                    <Field theme={theme} label="造型"><Select size="small" allowClear placeholder="默认造型" style={{ width: "100%" }} value={binding.stateId} options={binding.states.map((state) => ({ value: state.id, label: state.name }))} onChange={(value) => onUpdate({ stateId: value })} /></Field>
                    <Field theme={theme} label="情绪"><Input size="small" style={inputStyle} value={continuity.emotion ?? ""} onChange={(event) => setContinuity({ emotion: event.target.value })} /></Field>
                    <Field theme={theme} label="服装"><Input size="small" style={inputStyle} value={continuity.outfit ?? ""} onChange={(event) => setContinuity({ outfit: event.target.value })} /></Field>
                    <Field theme={theme} label="身体状况"><Input size="small" style={inputStyle} value={continuity.physicalCondition ?? ""} onChange={(event) => setContinuity({ physicalCondition: event.target.value })} /></Field>
                    <Field theme={theme} label="持有道具"><Input size="small" style={inputStyle} value={(continuity.heldProps ?? []).join("、")} onChange={(event) => setContinuity({ heldProps: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) })} /></Field>
                    <Field theme={theme} label="刻意变化"><Input size="small" style={inputStyle} value={continuity.intentionalChange ?? ""} onChange={(event) => setContinuity({ intentionalChange: event.target.value })} /></Field>
                </>
            ) : null}
            {binding.kind === "location" ? (
                <Field theme={theme} label="场景变体"><Select size="small" allowClear placeholder="默认场景" style={{ width: "100%" }} value={binding.variantId} options={binding.variants.map((variant) => ({ value: variant.id, label: variant.name }))} onChange={(value) => onUpdate({ variantId: value })} /></Field>
            ) : null}
            {binding.kind === "prop" ? <div className="text-xs" style={{ color: theme.node.muted }}>道具绑定无额外覆盖。</div> : null}
            <button type="button" className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={onEditAsset}>编辑资产设定</button>
        </div>
    );
}

function BindingPicker({ theme, assets, onAdd, onCreateAsset, onClose }: { theme: CanvasTheme; assets: FilmBindingAssetOption[]; onAdd: (nodeId: string) => void; onCreateAsset: (kind: FilmAssetKind) => void; onClose: () => void }) {
    return (
        <div className="flex w-[240px] flex-col gap-2 p-2" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between text-xs font-medium">
                <span>添加绑定</span>
                <button type="button" className="grid size-6 place-items-center opacity-55 hover:opacity-100" onClick={onClose} aria-label="关闭绑定选择">×</button>
            </div>
            {assets.length ? (["character", "location", "prop"] as FilmAssetKind[]).map((kind) => {
                const items = assets.filter((asset) => asset.kind === kind);
                return items.length ? (
                    <div key={kind} className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: theme.node.muted }}>{FILM_ASSET_KIND_LABELS[kind]}</span>
                        {items.map((asset) => <button key={asset.nodeId} type="button" className="rounded-lg border px-2 py-1 text-left text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }} onClick={() => onAdd(asset.nodeId)}>{asset.name}</button>)}
                    </div>
                ) : null;
            }) : <span className="text-xs" style={{ color: theme.node.muted }}>画布中还没有可绑定的角色、场景或道具资产。</span>}
            <div className="flex flex-wrap gap-1 border-t pt-1.5" style={{ borderColor: theme.node.stroke }}>
                {(["character", "location", "prop"] as FilmAssetKind[]).map((kind) => (
                    <button key={kind} type="button" className="rounded-full border border-dashed px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => { onCreateAsset(kind); onClose(); }}>+ {FILM_ASSET_KIND_LABELS[kind]}</button>
                ))}
            </div>
        </div>
    );
}

function BindingChip({ theme, binding, onUpdate, onEditAsset, onRemove }: { theme: CanvasTheme; binding: FilmShotBindingChip; onUpdate: (patch: Partial<FilmBindingEdgeData>) => void; onEditAsset: () => void; onRemove: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <Popover trigger="click" open={open} onOpenChange={setOpen} arrow={false} styles={{ content: { padding: 0, background: theme.node.panel } }} content={<BindingEditor theme={theme} binding={binding} onUpdate={onUpdate} onEditAsset={() => { setOpen(false); onEditAsset(); }} onClose={() => setOpen(false)} />}>
                <button type="button">{FILM_ASSET_KIND_LABELS[binding.kind]} · {binding.name}{binding.stateName ? ` · ${binding.stateName}` : ""}{binding.variantName ? ` · ${binding.variantName}` : ""}</button>
            </Popover>
            <button type="button" className="opacity-55 hover:opacity-100" onClick={() => { setOpen(false); onRemove(); }} aria-label={`移除${binding.name}绑定`}>×</button>
        </span>
    );
}

function AddBindingButton({ theme, assets, onAdd, onCreateAsset }: { theme: CanvasTheme; assets: FilmBindingAssetOption[]; onAdd: (nodeId: string) => void; onCreateAsset: (kind: FilmAssetKind) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover trigger="click" open={open} onOpenChange={setOpen} arrow={false} styles={{ content: { padding: 0, background: theme.node.panel } }} content={<BindingPicker theme={theme} assets={assets} onAdd={(nodeId) => { onAdd(nodeId); setOpen(false); }} onCreateAsset={onCreateAsset} onClose={() => setOpen(false)} />}>
            <button type="button" className="rounded-full border border-dashed px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>+ 添加绑定</button>
        </Popover>
    );
}

export function FilmShotPanel({ theme, shot, sceneLabel, bindings, styleName, contextLenses, canCreateShot, onCreateShot, onUpdate, onClose, imageGenerating, imageError, taskProgress, canGenerateImage, onGenerateImage, onStopImage, videoGenerating, videoError, canGenerateVideo, onGenerateVideo, onStopVideo, availableAssets, onAddBinding, onRemoveBinding, onUpdateBinding, onEditAsset, onOpenScript, onCreateAsset, openSections, onToggleSection }: FilmShotPanelProps) {
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const filmShot = shot?.metadata?.filmShot;
    const update = (patch: Parameters<typeof patchFilmShotNode>[1]) => {
        if (shot) onUpdate(shot.id, (node) => patchFilmShotNode(node, patch));
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col border-r" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">镜头设置</div>
                    <div className="truncate text-xs" style={{ color: theme.node.muted }}>{sceneLabel}</div>
                </div>
                <button type="button" className="grid size-8 place-items-center rounded-lg text-base opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="收起镜头设置">×</button>
            </div>
            {!shot ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="text-sm" style={{ color: theme.node.muted }}>该场次还没有镜头</div>
                    <div className="flex flex-wrap justify-center gap-2">
                        {canCreateShot ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCreateShot}>新增镜头</button> : null}
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={onOpenScript}>打开剧本拆镜</button>
                    </div>
                </div>
            ) : (
                <>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                    <Section theme={theme} title="基础" open={openSections.has("basic")} onToggle={() => onToggleSection("basic")}>
                        <div className="grid grid-cols-2 gap-2">
                            <Field theme={theme} label="镜号"><Input value={filmShot?.shotNo || ""} style={inputStyle} onChange={(event) => update({ shotNo: event.target.value })} /></Field>
                            <Field theme={theme} label="景别"><FilmShotTypeControl value={filmShot?.shotType} style={inputStyle} onChange={(value) => update({ shotType: value })} /></Field>
                            <Field theme={theme} label="时长（秒）"><InputNumber min={1} max={60} value={filmShot?.duration ?? 4} style={{ ...inputStyle, width: "100%" }} onChange={(value) => update({ duration: value ?? 4 })} /></Field>
                            <Field theme={theme} label="运镜"><FilmCameraMovementControl value={filmShot?.cameraMovement} style={inputStyle} onChange={(value) => update({ cameraMovement: value })} /></Field>
                            <div className="col-span-2">
                                <Field theme={theme} label="转场"><FilmTransitionControl value={filmShot?.transition} style={inputStyle} onChange={(value) => update({ transition: value })} /></Field>
                            </div>
                        </div>
                    </Section>
                    <Section theme={theme} title="画面" open={openSections.has("visual")} onToggle={() => onToggleSection("visual")}>
                        <Field theme={theme} label="描述"><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={filmShot?.description || ""} style={inputStyle} onChange={(event) => update({ description: event.target.value })} /></Field>
                        <Field theme={theme} label="创作补充"><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="只写结构化字段无法表达的动作或意图，系统会与镜头字段统一编译" value={filmShot?.prompt || ""} style={inputStyle} onChange={(event) => update({ prompt: event.target.value })} /></Field>
                        <details className="rounded-lg border px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
                            <summary className="cursor-pointer text-[11px]" style={{ color: theme.node.muted }}>高级提示词（负面）</summary>
                            <div className="mt-2">
                                <Field theme={theme} label="负面提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={filmShot?.negativePrompt || ""} style={inputStyle} onChange={(event) => update({ negativePrompt: event.target.value })} /></Field>
                            </div>
                        </details>
                        <Field theme={theme} label="动作补充（视频）"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={filmShot?.videoPrompt || ""} style={inputStyle} onChange={(event) => update({ videoPrompt: event.target.value })} /></Field>
                    </Section>
                    <Section theme={theme} title={`上下文${contextIssueCount(contextLenses) ? ` · ${contextIssueCount(contextLenses)}` : ""}`} open={openSections.has("context")} onToggle={() => onToggleSection("context")}>
                        <ContextLensSummary theme={theme} lenses={contextLenses} />
                    </Section>
                    <Section theme={theme} title="专业" open={openSections.has("professional")} onToggle={() => onToggleSection("professional")}>
                        <FilmShotProfessionalFields theme={theme} payload={filmShot} onUpdate={update} variant="panel" />
                    </Section>
                    <Section theme={theme} title="参考" open={openSections.has("references")} onToggle={() => onToggleSection("references")}>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {bindings.map((binding) => (
                                <BindingChip key={binding.edgeId} theme={theme} binding={binding} onUpdate={(patch) => onUpdateBinding(binding.edgeId, patch)} onEditAsset={() => onEditAsset(binding.id)} onRemove={() => onRemoveBinding(binding.edgeId)} />
                            ))}
                            <AddBindingButton theme={theme} assets={availableAssets} onAdd={onAddBinding} onCreateAsset={onCreateAsset} />
                            {styleName ? <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>风格 · {styleName}</span> : null}
                        </div>
                    </Section>
                    <Section theme={theme} title="视频" open={openSections.has("video")} onToggle={() => onToggleSection("video")}>
                        {filmShot ? <FilmShotVideoFrames theme={theme} filmShot={filmShot} disabled={videoGenerating} onChange={update} /> : null}
                    </Section>
                </div>
                <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="mb-2 grid gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="w-10 shrink-0 text-[10px]" style={{ color: theme.node.muted }}>分镜图</span>
                            <ModelPicker config={config} value={config.imageModel} channelId={config.imageChannelId} capability="image" onChange={(model, channelId) => { updateConfig("imageModel", model); if (channelId) updateConfig("imageChannelId", channelId); if (config.imageWorkflowRef) updateConfig("imageWorkflowRef", undefined); }} onMissingConfig={() => openConfigDialog(false)} fullWidth className="!h-7 !min-w-0 !rounded-md !px-2 !text-[11px]" />
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="w-10 shrink-0 text-[10px]" style={{ color: theme.node.muted }}>视频</span>
                            <ModelPicker config={config} value={config.videoModel} channelId={config.videoChannelId} capability="video" onChange={(model, channelId) => { updateConfig("videoModel", model); if (channelId) updateConfig("videoChannelId", channelId); if (config.videoWorkflowRef) updateConfig("videoWorkflowRef", undefined); }} onMissingConfig={() => openConfigDialog(false)} fullWidth className="!h-7 !min-w-0 !rounded-md !px-2 !text-[11px]" />
                        </div>
                        <FilmCreditHint theme={theme} config={config} videoSeconds={clampFilmVideoDuration(filmShot?.duration ?? 4, config.videoModel)} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                        <span>分镜图：{filmShot?.imageUrl ? "已生成" : imageGenerating ? `生成中 ${Math.round(taskProgress)}%` : imageError ? "失败" : "未生成"}</span>
                        <span>视频：{filmShot?.videoUrl ? "已生成" : videoGenerating ? `生成中 ${Math.round(taskProgress)}%` : videoError ? "失败" : "未生成"}</span>
                    </div>
                    {imageGenerating || videoGenerating ? (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: theme.node.fill }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, taskProgress))}%`, background: theme.canvas.selectionStroke }} />
                        </div>
                    ) : null}
                    {imageError || videoError ? <div className="mt-1 line-clamp-2 text-[10px]" style={{ color: canvasStatusColors.error }}>{imageError || videoError}</div> : null}
                    {videoError && /image\/reference video model|media inputs/i.test(videoError) ? <div className="mt-1 text-[10px] leading-4" style={{ color: canvasStatusColors.loading }}>当前视频模型不支持图片/参考输入，请在上方切换到 image-to-video 或 reference-to-video 模型。</div> : null}
                    <div className="mt-2 flex gap-2">
                        {imageGenerating ? (
                            <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStopImage}>停止出图</button>
                        ) : (
                            <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateImage} onClick={onGenerateImage}>生成分镜图</button>
                        )}
                        {videoGenerating ? (
                            <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStopVideo}>停止视频</button>
                        ) : (
                            <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={!canGenerateVideo} onClick={onGenerateVideo}>生成视频</button>
                        )}
                    </div>
                </div>
                </>
            )}
        </div>
    );
}
