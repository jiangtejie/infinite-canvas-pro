"use client";

import type { ReactNode } from "react";
import { Input, InputNumber } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { CanvasNodeData } from "../../types";
import { patchFilmShotNode } from "../lib/film-node-patch";
import type { FilmShotBindingChip } from "../lib/film-studio-types";

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

export function FilmShotPanel({ theme, shot, sceneLabel, bindings, styleName, canCreateShot, onCreateShot, onUpdate, onClose, imageGenerating, imageError, canGenerateImage, onGenerateImage, onStopImage }: FilmShotPanelProps) {
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
                        <div className="flex flex-wrap gap-1.5">
                            {bindings.length ? bindings.map((binding) => (
                                <span key={binding.id} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                    {FILM_ASSET_KIND_LABELS[binding.kind]} · {binding.name}
                                </span>
                            )) : <span className="text-xs" style={{ color: theme.node.muted }}>未绑定角色/场景/道具</span>}
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
                </div>
            )}
        </div>
    );
}
