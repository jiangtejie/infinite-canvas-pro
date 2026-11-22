"use client";

import { useState } from "react";
import { App } from "antd";
import { Sparkles, Square } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmAsset, FilmAssetTask, FilmImageRef, FilmImageSlot } from "@/lib/film/types";
import { ensureCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";
import { buildFilmReferenceBoardPrompt, DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID, FILM_REFERENCE_BOARD_TEMPLATES } from "@/app/(user)/film/utils/film-reference-board-templates";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { useFilmReferenceBoardGeneration } from "../hooks/use-film-reference-board-generation";
import { SlotEditor } from "./film-image-slot-editor";

type Props = {
    theme: CanvasTheme;
    asset: FilmAsset;
    nodeId: string;
    projectId: string;
    onChangeTemplate: (templateId: string) => void;
    onChangeBoard: (board: FilmImageSlot) => void;
    onGenerated: (image: FilmImageRef, templateId: string) => void;
    onPendingTask: (task: FilmAssetTask | null) => void;
};

export function FilmReferenceBoardPanel({ theme, asset, nodeId, projectId, onChangeTemplate, onChangeBoard, onGenerated, onPendingTask }: Props) {
    const { message } = App.useApp();
    const [showPrompt, setShowPrompt] = useState(false);
    const profile = ensureCharacterProfile(asset);
    const board = profile.board ?? createFilmImageSlot();
    const templateId = asset.referenceTemplateId || DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID;
    const preview = buildFilmReferenceBoardPrompt(asset, templateId);
    const { generating, progress, error, generate, stop } = useFilmReferenceBoardGeneration({ asset, nodeId, projectId, onGenerated, onPendingTask });
    return (
        <section className="flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium" style={{ color: theme.node.text }}>角色参考板</span>
                <span className="text-[10px]" style={{ color: theme.node.muted }}>{preview.template.name} · {preview.aspect}{preview.requiresTextRendering ? " · 依赖文字渲染" : ""}</span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
                {FILM_REFERENCE_BOARD_TEMPLATES.map((template) => {
                    const active = templateId === template.id;
                    return (
                        <button key={template.id} type="button" className="rounded-lg border px-2 py-1.5 text-left" style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.fill }} onClick={() => onChangeTemplate(template.id)} disabled={generating} aria-pressed={active}>
                            <span className="block text-[11px]" style={{ color: theme.node.text }}>{template.name}</span>
                            <span className="mt-0.5 block text-[10px] leading-4" style={{ color: theme.node.muted }}>{template.description}</span>
                        </button>
                    );
                })}
            </div>
            {preview.warnings.length ? <div className="flex flex-col gap-0.5 text-[10px]" style={{ color: theme.node.muted }}>{preview.warnings.map((warning) => <span key={warning}>· {warning}</span>)}</div> : null}
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionSoft, color: theme.node.text }} disabled={generating} onClick={() => void generate(templateId).then((ok) => { if (ok) message.success("已生成角色参考板"); })}>
                    <Sparkles className="size-3.5" />{generating ? `生成中 ${Math.round(progress)}%` : "生成参考板"}
                </button>
                {generating ? <button type="button" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }} onClick={stop}><Square className="size-3" />停止</button> : null}
                <button type="button" className="ml-auto text-[11px] underline underline-offset-2" style={{ color: theme.node.muted }} onClick={() => setShowPrompt((value) => !value)}>{showPrompt ? "收起提示词" : "查看提示词"}</button>
            </div>
            {showPrompt ? <div className="thin-scrollbar max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border px-2 py-1.5 text-[10px] leading-4" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{preview.prompt}</div> : null}
            {error ? <div className="text-[10px]" style={{ color: canvasStatusColors.error }}>{error}</div> : null}
            <SlotEditor theme={theme} title="参考板版本" slot={board} nextLabel={preview.template.name} onChange={onChangeBoard} />
            <div className="text-[10px] leading-4" style={{ color: theme.node.muted }}>镜头生成以当前参考板为角色身份参考；造型状态可额外提供变化参考。</div>
        </section>
    );
}
