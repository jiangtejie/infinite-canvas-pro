"use client";

import { useState, type ReactNode } from "react";
import { Input, InputNumber, Popover, Select } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmAssetKind } from "@/lib/film/types";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { CanvasNodeData, FilmBindingEdgeData } from "../../types";
import { patchFilmShotNode } from "../lib/film-node-patch";
import type { FilmBindingAssetOption, FilmShotBindingChip } from "../lib/film-studio-types";
import { FilmShotVideoFrames } from "./film-shot-video-frames";

type FilmShotPanelProps = {
    theme: CanvasTheme;
    shot: CanvasNodeData | null;
    sceneLabel: string;
    bindings: FilmShotBindingChip[];
    styleName: string | null;
    canCreateShot: boolean;
    onCreateShot: () => void;
    onUpdate: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onClose: () => void;
    imageGenerating: boolean;
    imageError: string | null;
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
};

function Section({ theme, title, children }: { theme: CanvasTheme; title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
            <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
            {children}
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

function BindingPicker({ theme, assets, onAdd, onClose }: { theme: CanvasTheme; assets: FilmBindingAssetOption[]; onAdd: (nodeId: string) => void; onClose: () => void }) {
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

function AddBindingButton({ theme, assets, onAdd }: { theme: CanvasTheme; assets: FilmBindingAssetOption[]; onAdd: (nodeId: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover trigger="click" open={open} onOpenChange={setOpen} arrow={false} styles={{ content: { padding: 0, background: theme.node.panel } }} content={<BindingPicker theme={theme} assets={assets} onAdd={(nodeId) => { onAdd(nodeId); setOpen(false); }} onClose={() => setOpen(false)} />}>
            <button type="button" className="rounded-full border border-dashed px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>+ 添加绑定</button>
        </Popover>
    );
}

export function FilmShotPanel({ theme, shot, sceneLabel, bindings, styleName, canCreateShot, onCreateShot, onUpdate, onClose, imageGenerating, imageError, canGenerateImage, onGenerateImage, onStopImage, videoGenerating, videoError, canGenerateVideo, onGenerateVideo, onStopVideo, availableAssets, onAddBinding, onRemoveBinding, onUpdateBinding, onEditAsset }: FilmShotPanelProps) {
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const filmShot = shot?.metadata?.filmShot;
    const update = (patch: Parameters<typeof patchFilmShotNode>[1]) => {
        if (shot) onUpdate(shot.id, (node) => patchFilmShotNode(node, patch));
    };

    return (
        <div className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-r" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">镜头设置</div>
                    <div className="truncate text-xs" style={{ color: theme.node.muted }}>{sceneLabel}{filmShot?.shotNo ? ` · ${filmShot.shotNo}` : ""}</div>
                </div>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="收起镜头设置">×</button>
            </div>
            {!shot ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="text-sm" style={{ color: theme.node.muted }}>该场次还没有镜头</div>
                    {canCreateShot ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCreateShot}>新增镜头</button> : null}
                </div>
            ) : (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                    <Section theme={theme} title="镜头">
                        <Field theme={theme} label="镜号"><Input size="small" value={filmShot?.shotNo || ""} style={inputStyle} onChange={(event) => update({ shotNo: event.target.value })} /></Field>
                        <Field theme={theme} label="景别"><Input size="small" value={filmShot?.shotType || ""} style={inputStyle} onChange={(event) => update({ shotType: event.target.value })} /></Field>
                        <Field theme={theme} label="时长（秒）"><InputNumber size="small" min={1} max={60} value={filmShot?.duration ?? 4} style={{ ...inputStyle, width: "100%" }} onChange={(value) => update({ duration: value ?? 4 })} /></Field>
                        <Field theme={theme} label="运镜"><Input size="small" value={filmShot?.cameraMovement || ""} style={inputStyle} onChange={(event) => update({ cameraMovement: event.target.value })} /></Field>
                    </Section>
                    <Section theme={theme} title="画面">
                        <Field theme={theme} label="描述"><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={filmShot?.description || ""} style={inputStyle} onChange={(event) => update({ description: event.target.value })} /></Field>
                        <Field theme={theme} label="画面提示词"><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={filmShot?.prompt || ""} style={inputStyle} onChange={(event) => update({ prompt: event.target.value })} /></Field>
                        <Field theme={theme} label="负面提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={filmShot?.negativePrompt || ""} style={inputStyle} onChange={(event) => update({ negativePrompt: event.target.value })} /></Field>
                    </Section>
                    <Section theme={theme} title="上下文">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {bindings.map((binding) => (
                                <BindingChip key={binding.edgeId} theme={theme} binding={binding} onUpdate={(patch) => onUpdateBinding(binding.edgeId, patch)} onEditAsset={() => onEditAsset(binding.id)} onRemove={() => onRemoveBinding(binding.edgeId)} />
                            ))}
                            <AddBindingButton theme={theme} assets={availableAssets} onAdd={onAddBinding} />
                            {styleName ? <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>风格 · {styleName}</span> : null}
                        </div>
                    </Section>
                    <Section theme={theme} title="状态">
                        <div className="flex flex-wrap items-center gap-2">
                            {imageGenerating ? (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStopImage}>停止生成</button>
                            ) : (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateImage} onClick={onGenerateImage}>生成分镜图</button>
                            )}
                            <span className="text-xs" style={{ color: theme.node.muted }}>
                                {filmShot?.imageUrl ? "已生成" : imageGenerating ? "生成中…" : imageError ? "生成失败" : "未生成"}
                            </span>
                        </div>
                        {imageError ? <div className="text-xs" style={{ color: canvasStatusColors.error }}>{imageError}</div> : null}
                    </Section>
                    <Section theme={theme} title="视频">
                        {filmShot ? <FilmShotVideoFrames theme={theme} filmShot={filmShot} disabled={videoGenerating} onChange={update} /> : null}
                        <div className="flex flex-wrap items-center gap-2">
                            {videoGenerating ? (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStopVideo}>停止生成</button>
                            ) : (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateVideo} onClick={onGenerateVideo}>生成分镜视频</button>
                            )}
                            <span className="text-xs" style={{ color: theme.node.muted }}>
                                {filmShot?.videoUrl ? "已生成" : videoGenerating ? "生成中…" : videoError ? "生成失败" : "未生成"}
                            </span>
                        </div>
                        {videoError ? <div className="text-xs" style={{ color: canvasStatusColors.error }}>{videoError}</div> : null}
                    </Section>
                </div>
            )}
        </div>
    );
}
