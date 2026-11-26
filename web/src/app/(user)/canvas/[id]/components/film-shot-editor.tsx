"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Input, InputNumber, Modal, Popover, Select } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useCopyText } from "@/hooks/use-copy-text";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { clampFilmVideoDuration } from "@/app/(user)/film/utils/film-video-limits";
import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasNodeData, FilmContextEdgeData, FilmShotNodeData } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { CANVAS_Z } from "../lib/canvas-layer";
import { patchFilmShotNode } from "../lib/film-node-patch";
import { filmShotMediaSummary } from "../lib/film-shot-views";
import type { FilmContextLens } from "../lib/film-context-lens";
import { FILM_CONTEXT_ROLE_LABELS, FILM_SHOT_CONTEXT_CREATABLE_KINDS, type FilmContextNodeOption, type FilmShotContextChip, type FilmShotContextCreatableKind } from "../lib/film-studio-types";
import { FilmCameraMovementControl, FilmShotTypeControl, FilmTransitionControl } from "./film-shot-basic-controls";
import { FilmShotProfessionalFields } from "./film-shot-professional-fields";
import { FilmShotVideoFrames } from "./film-shot-video-frames";

export type FilmShotEditorProps = {
    theme: CanvasTheme;
    shot: CanvasNodeData;
    contexts: FilmShotContextChip[];
    availableContexts: FilmContextNodeOption[];
    styleName: string | null;
    contextLenses: { image: FilmContextLens | null; video: FilmContextLens | null };
    openSections?: Set<string>;
    onToggleSection?: (key: string) => void;
    onUpdate: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    onAddContext: (shotId: string, nodeId: string) => void;
    onRemoveContext: (edgeId: string) => void;
    onUpdateContext: (edgeId: string, patch: Partial<Omit<FilmContextEdgeData, "role">>) => void;
    onEditAsset: (nodeId: string) => void;
    onCreateAsset: (shotId: string, kind: FilmShotContextCreatableKind) => void;
    onOpenScript: () => void;
    /** 生成状态由调用方按传入的 shot 计算；命令本身显式带 shotId，不依赖 active shot。 */
    imageGenerating: boolean;
    imageError: string | null;
    taskProgress: number;
    canGenerateImage: boolean;
    onGenerateImage: (shotId: string) => void;
    onStopImage: (shotId: string) => void;
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: (shotId: string) => void;
    onStopVideo: (shotId: string) => void;
};

export function FilmShotEditor({
    theme, shot, contexts, availableContexts, styleName, contextLenses,
    openSections, onToggleSection, onUpdate, onAddContext, onRemoveContext, onUpdateContext,
    onEditAsset, onCreateAsset, onOpenScript,
    imageGenerating, imageError, taskProgress, canGenerateImage, onGenerateImage, onStopImage,
    videoGenerating, videoError, canGenerateVideo, onGenerateVideo, onStopVideo,
}: FilmShotEditorProps) {
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const collapsible = Boolean(openSections && onToggleSection);
    const filmShot = shot.metadata?.filmShot;
    const media = filmShotMediaSummary(shot);
    const contextIssues = contextIssueCount(contextLenses);
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const update = (patch: Partial<FilmShotNodeData>) => onUpdate(shot.id, (node) => patchFilmShotNode(node, patch));
    const sectionState = (key: string) => ({
        open: !collapsible || openSections!.has(key),
        onToggle: collapsible ? () => onToggleSection!(key) : undefined,
    });

    return (
        <div className="flex flex-col">
            <EditorSection theme={theme} {...sectionState("visual")} title="画面">
                <EditorField theme={theme} label="描述">
                    <Input.TextArea autoSize={{ minRows: 4, maxRows: 12 }} value={filmShot?.description || ""} style={inputStyle} onChange={(event) => update({ description: event.target.value })} />
                </EditorField>
                <EditorField theme={theme} label="创作补充">
                    <Input.TextArea autoSize={{ minRows: 4, maxRows: 12 }} placeholder="只写结构化字段无法表达的动作或意图，系统会与镜头字段统一编译" value={filmShot?.prompt || ""} style={inputStyle} onChange={(event) => update({ prompt: event.target.value })} />
                </EditorField>
                <details className="rounded-lg border px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
                    <summary className="cursor-pointer text-[11px]" style={{ color: theme.node.muted }}>高级提示词（负面）</summary>
                    <div className="mt-2">
                        <EditorField theme={theme} label="负面提示词">
                            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={filmShot?.negativePrompt || ""} style={inputStyle} onChange={(event) => update({ negativePrompt: event.target.value })} />
                        </EditorField>
                    </div>
                </details>
                <EditorField theme={theme} label="动作补充（视频）">
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={filmShot?.videoPrompt || ""} style={inputStyle} onChange={(event) => update({ videoPrompt: event.target.value })} />
                </EditorField>
                <MediaSummary theme={theme} shot={shot} />
            </EditorSection>
            <EditorSection theme={theme} {...sectionState("language")} title="镜头语言">
                <div className="grid grid-cols-2 gap-2">
                    <EditorField theme={theme} label="镜号"><Input value={filmShot?.shotNo || ""} style={inputStyle} onChange={(event) => update({ shotNo: event.target.value })} /></EditorField>
                    <EditorField theme={theme} label="景别"><FilmShotTypeControl value={filmShot?.shotType} style={inputStyle} onChange={(value) => update({ shotType: value })} /></EditorField>
                    <EditorField theme={theme} label="时长（秒）"><InputNumber min={1} max={60} value={filmShot?.duration ?? 4} style={{ ...inputStyle, width: "100%" }} onChange={(value) => update({ duration: value ?? 4 })} /></EditorField>
                    <EditorField theme={theme} label="运镜"><FilmCameraMovementControl value={filmShot?.cameraMovement} style={inputStyle} onChange={(value) => update({ cameraMovement: value })} /></EditorField>
                    <div className="col-span-2">
                        <EditorField theme={theme} label="转场"><FilmTransitionControl value={filmShot?.transition} style={inputStyle} onChange={(value) => update({ transition: value })} /></EditorField>
                    </div>
                </div>
                <FilmShotProfessionalFields theme={theme} payload={filmShot} onUpdate={update} variant="panel" groups={["visual"]} />
            </EditorSection>
            <EditorSection theme={theme} {...sectionState("performance")} title="表演">
                <EditorField theme={theme} label="台词">
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} value={filmShot?.dialogue || ""} style={inputStyle} onChange={(event) => update({ dialogue: event.target.value })} />
                </EditorField>
                <FilmShotProfessionalFields theme={theme} payload={filmShot} onUpdate={update} variant="panel" groups={["performance", "sound"]} />
            </EditorSection>
            <EditorSection theme={theme} {...sectionState("context")} title={`上下文${contextIssues ? ` · ${contextIssues}` : ""}`}>
                <ContextLensSummary theme={theme} lenses={contextLenses} />
                <div className="flex flex-wrap items-center gap-1.5">
                    {contexts.map((context) => (
                        <ContextChip key={context.edgeId} theme={theme} context={context} onUpdate={(patch) => onUpdateContext(context.edgeId, patch)} onEditAsset={() => onEditAsset(context.id)} onRemove={() => onRemoveContext(context.edgeId)} />
                    ))}
                    <AddContextButton theme={theme} contexts={availableContexts} onAdd={(nodeId) => onAddContext(shot.id, nodeId)} onCreateAsset={(kind) => onCreateAsset(shot.id, kind)} />
                    {styleName ? <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>风格 · {styleName}</span> : null}
                </div>
                <button type="button" className="self-start rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onOpenScript}>打开剧本拆镜</button>
            </EditorSection>
            <EditorSection theme={theme} {...sectionState("generation")} title="生成">
                {filmShot ? <FilmShotVideoFrames theme={theme} filmShot={filmShot} disabled={videoGenerating} onChange={update} /> : null}
                <div className="grid gap-1.5">
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
                    <span>分镜图：{media.hasImage ? "已生成" : imageGenerating ? `生成中 ${Math.round(taskProgress)}%` : imageError ? "失败" : "未生成"}</span>
                    <span>视频：{media.hasVideo ? "已生成" : videoGenerating ? `生成中 ${Math.round(taskProgress)}%` : videoError ? "失败" : "未生成"}</span>
                </div>
                {imageGenerating || videoGenerating ? (
                    <div className="h-1 overflow-hidden rounded-full" style={{ background: theme.node.fill }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, taskProgress))}%`, background: theme.canvas.selectionStroke }} />
                    </div>
                ) : null}
                {imageError || videoError ? <div className="line-clamp-2 text-[10px]" style={{ color: canvasStatusColors.error }}>{imageError || videoError}</div> : null}
                {videoError && /image\/reference video model|media inputs/i.test(videoError) ? <div className="text-[10px] leading-4" style={{ color: canvasStatusColors.loading }}>当前视频模型不支持图片/参考输入，请在上方切换到 image-to-video 或 reference-to-video 模型。</div> : null}
                <div className="flex gap-2">
                    {imageGenerating ? (
                        <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => onStopImage(shot.id)}>停止出图</button>
                    ) : (
                        <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateImage} onClick={() => onGenerateImage(shot.id)}>生成分镜图</button>
                    )}
                    {videoGenerating ? (
                        <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => onStopVideo(shot.id)}>停止视频</button>
                    ) : (
                        <button type="button" className="flex-1 rounded-lg border px-3 py-2 text-xs disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={!canGenerateVideo} onClick={() => onGenerateVideo(shot.id)}>生成视频</button>
                    )}
                </div>
            </EditorSection>
        </div>
    );
}

function EditorSection({ theme, title, open, onToggle, children }: { theme: CanvasTheme; title: string; open: boolean; onToggle?: () => void; children: ReactNode }) {
    const sectionRef = useRef<HTMLElement>(null);
    const padding = "px-4";
    return (
        <section ref={sectionRef} className="border-b" style={{ borderColor: theme.node.stroke }}>
            {onToggle ? (
                <button type="button" className={`flex w-full items-center justify-between gap-2 py-2.5 text-left ${padding}`} onClick={() => { onToggle(); if (!open) window.setTimeout(() => sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 0); }} aria-expanded={open}>
                    <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
                    <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: theme.node.muted }} />
                </button>
            ) : (
                <div className={`flex items-center justify-between py-2.5 ${padding}`}>
                    <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
                </div>
            )}
            {open ? <div className={`flex flex-col gap-2 pb-3 ${padding}`}>{children}</div> : null}
        </section>
    );
}

function EditorField({ theme, label, children }: { theme: CanvasTheme; label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: theme.node.muted }}>{label}</span>
            {children}
        </label>
    );
}

function MediaSummary({ theme, shot }: { theme: CanvasTheme; shot: CanvasNodeData }) {
    const media = filmShotMediaSummary(shot);
    const imageVersions = shot.metadata?.filmShot?.imageVersions?.length ?? 0;
    const videoVersions = shot.metadata?.filmShot?.videoVersions?.length ?? 0;
    return (
        <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
            <span>分镜图 · {media.hasImage ? "已生成" : "未生成"}{imageVersions ? ` · ${imageVersions} 版本` : ""}</span>
            <span>视频 · {media.hasVideo ? "已生成" : "未生成"}{videoVersions ? ` · ${videoVersions} 版本` : ""}</span>
        </div>
    );
}

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

function ContextEditor({ theme, context, onUpdate, onEditAsset, onClose }: { theme: CanvasTheme; context: FilmShotContextChip; onUpdate: (patch: Partial<Omit<FilmContextEdgeData, "role">>) => void; onEditAsset: () => void; onClose: () => void }) {
    const continuity = context.continuity ?? {};
    const setContinuity = (patch: Partial<typeof continuity>) => onUpdate({ continuity: { ...continuity, ...patch } });
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    return (
        <div className="flex w-[264px] flex-col gap-2 p-2" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between text-xs font-medium">
                <span className="truncate">上下文 · {context.name}</span>
                <button type="button" className="grid size-6 place-items-center opacity-55 hover:opacity-100" onClick={onClose} aria-label="关闭上下文编辑"><X className="size-3.5" /></button>
            </div>
            {context.role === "character" ? (
                <>
                    <EditorField theme={theme} label="造型"><Select size="small" allowClear placeholder="默认造型" style={{ width: "100%" }} value={context.stateId} options={context.states.map((state) => ({ value: state.id, label: state.name }))} onChange={(value) => onUpdate({ stateId: value })} /></EditorField>
                    <EditorField theme={theme} label="情绪"><Input size="small" style={inputStyle} value={continuity.emotion ?? ""} onChange={(event) => setContinuity({ emotion: event.target.value })} /></EditorField>
                    <EditorField theme={theme} label="服装"><Input size="small" style={inputStyle} value={continuity.outfit ?? ""} onChange={(event) => setContinuity({ outfit: event.target.value })} /></EditorField>
                    <EditorField theme={theme} label="身体状况"><Input size="small" style={inputStyle} value={continuity.physicalCondition ?? ""} onChange={(event) => setContinuity({ physicalCondition: event.target.value })} /></EditorField>
                    <EditorField theme={theme} label="持有道具"><Input size="small" style={inputStyle} value={(continuity.heldProps ?? []).join("、")} onChange={(event) => setContinuity({ heldProps: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) })} /></EditorField>
                    <EditorField theme={theme} label="刻意变化"><Input size="small" style={inputStyle} value={continuity.intentionalChange ?? ""} onChange={(event) => setContinuity({ intentionalChange: event.target.value })} /></EditorField>
                </>
            ) : null}
            {context.role === "location" ? (
                <EditorField theme={theme} label="场景变体"><Select size="small" allowClear placeholder="默认场景" style={{ width: "100%" }} value={context.variantId} options={context.variants.map((variant) => ({ value: variant.id, label: variant.name }))} onChange={(value) => onUpdate({ variantId: value })} /></EditorField>
            ) : null}
            {context.role === "prop" ? <div className="text-xs" style={{ color: theme.node.muted }}>道具上下文无额外覆盖。</div> : null}
            <button type="button" className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={onEditAsset}>编辑上下文设定</button>
        </div>
    );
}

function ContextPicker({ theme, contexts, onAdd, onCreateAsset, onClose }: { theme: CanvasTheme; contexts: FilmContextNodeOption[]; onAdd: (nodeId: string) => void; onCreateAsset: (kind: FilmShotContextCreatableKind) => void; onClose: () => void }) {
    const roles = ["character", "location", "prop", "style", "beat"] as const;
    return (
        <div className="flex w-[240px] flex-col gap-2 p-2" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between text-xs font-medium">
                <span>添加上下文</span>
                <button type="button" className="grid size-6 place-items-center opacity-55 hover:opacity-100" onClick={onClose} aria-label="关闭上下文选择"><X className="size-3.5" /></button>
            </div>
            {contexts.length ? roles.map((role) => {
                const items = contexts.filter((context) => context.role === role);
                return items.length ? (
                    <div key={role} className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: theme.node.muted }}>{FILM_CONTEXT_ROLE_LABELS[role]}</span>
                        {items.map((context) => <button key={context.nodeId} type="button" className="rounded-lg border px-2 py-1 text-left text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }} onClick={() => onAdd(context.nodeId)}>{context.name}</button>)}
                    </div>
                ) : null;
            }) : <span className="text-xs" style={{ color: theme.node.muted }}>画布中还没有可添加的角色、场景、道具、风格或动作节拍。</span>}
            <div className="flex flex-wrap gap-1 border-t pt-1.5" style={{ borderColor: theme.node.stroke }}>
                {FILM_SHOT_CONTEXT_CREATABLE_KINDS.map((kind) => (
                    <button key={kind} type="button" className="rounded-full border border-dashed px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => { onCreateAsset(kind); onClose(); }}>+ {FILM_CONTEXT_ROLE_LABELS[kind]}</button>
                ))}
            </div>
        </div>
    );
}

function ContextChip({ theme, context, onUpdate, onEditAsset, onRemove }: { theme: CanvasTheme; context: FilmShotContextChip; onUpdate: (patch: Partial<Omit<FilmContextEdgeData, "role">>) => void; onEditAsset: () => void; onRemove: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <Popover trigger="click" open={open} onOpenChange={setOpen} arrow={false} styles={{ content: { padding: 0, background: theme.node.panel } }} content={<ContextEditor theme={theme} context={context} onUpdate={onUpdate} onEditAsset={() => { setOpen(false); onEditAsset(); }} onClose={() => setOpen(false)} />}>
                <button type="button">{FILM_CONTEXT_ROLE_LABELS[context.role]} · {context.name}{context.stateName ? ` · ${context.stateName}` : ""}{context.variantName ? ` · ${context.variantName}` : ""}</button>
            </Popover>
            <button type="button" className="opacity-55 hover:opacity-100" onClick={() => { setOpen(false); onRemove(); }} aria-label={`移除${context.name}上下文`}><X className="size-3" /></button>
        </span>
    );
}

function AddContextButton({ theme, contexts, onAdd, onCreateAsset }: { theme: CanvasTheme; contexts: FilmContextNodeOption[]; onAdd: (nodeId: string) => void; onCreateAsset: (kind: FilmShotContextCreatableKind) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover trigger="click" open={open} onOpenChange={setOpen} arrow={false} styles={{ content: { padding: 0, background: theme.node.panel } }} content={<ContextPicker theme={theme} contexts={contexts} onAdd={(nodeId) => { onAdd(nodeId); setOpen(false); }} onCreateAsset={onCreateAsset} onClose={() => setOpen(false)} />}>
            <button type="button" className="rounded-full border border-dashed px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>+ 添加上下文</button>
        </Popover>
    );
}
