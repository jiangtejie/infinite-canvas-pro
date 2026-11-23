"use client";

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { App, Drawer, Input } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { applyFilmLibraryEntry, filmLibraryEntryIsNewer, findFilmLibraryEntry } from "@/app/(user)/film/utils/film-library";
import { CANVAS_Z } from "../[id]/lib/canvas-layer";
import { canvasStatusColors } from "../lib/canvas-palette";
import { patchFilmContextAssetNode, patchFilmSceneNode, patchFilmScriptNode, updateFilmContextAssetNode } from "../[id]/lib/film-node-patch";
import { filmBeatFrameCount, updateFilmBeatFrame, updateFilmBeatPrompt, updateFilmBeatTitle } from "../[id]/lib/film-beat";
import { FilmAssetSlotFields } from "../[id]/components/film-asset-slot-fields";
import { FilmLibraryPickerDialog } from "../[id]/components/film-library-picker-dialog";
import { FILM_CONTEXT_ROLE_LABELS, type FilmShotContextChip } from "../[id]/lib/film-studio-types";
import { CanvasNodeType, type CanvasNodeData, type FilmSceneNodeData, type FilmScriptNodeData } from "../types";

type CanvasFilmInspectorProps = {
    open: boolean;
    node: CanvasNodeData | null;
    onClose: () => void;
    onChange: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    analysisProgress?: { stage: "structure" | "assets"; done: number; total: number } | null;
    onRunDirectorAnalysis?: (nodeId: string) => void;
    onUndoParse?: (nodeId: string) => void;
    boundShotNumbers?: string[];
    onImportLibraryAsset?: (kind: FilmAssetKind, entry: FilmAsset) => void;
    onStopAssetTask?: (nodeId: string) => void;
    shotContexts?: FilmShotContextChip[];
    shotPrevious?: { id: string; shotNo: string } | null;
    shotNext?: { id: string; shotNo: string } | null;
    onOpenShotFocus?: (shotId: string) => void;
    onLocateShot?: (shotId: string) => void;
};

const TITLES: Partial<Record<CanvasNodeType, string>> = {
    [CanvasNodeType.FilmScript]: "剧本",
    [CanvasNodeType.FilmScene]: "场次",
    [CanvasNodeType.FilmShot]: "镜头",
    [CanvasNodeType.FilmCharacter]: "角色",
    [CanvasNodeType.FilmLocation]: "场景",
    [CanvasNodeType.FilmProp]: "道具",
    [CanvasNodeType.FilmStyle]: "风格",
    [CanvasNodeType.FilmBeat]: "动作节拍",
};

function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function assetTaskTargetLabel(target: "concept" | "view" | "board" | "variant") {
    if (target === "board") return "角色参考板";
    if (target === "concept") return "概念图";
    if (target === "view") return "设定图";
    return "场景变体";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ opacity: 0.6 }}>{label}</span>
            {children}
        </label>
    );
}

export function CanvasFilmInspector({ open, node, onClose, onChange, analysisProgress, onRunDirectorAnalysis, onUndoParse, boundShotNumbers = [], onImportLibraryAsset, onStopAssetTask, shotContexts = [], shotPrevious, shotNext, onOpenShotFocus, onLocateShot }: CanvasFilmInspectorProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const projectId = useParams<{ id: string }>()?.id || "";
    const { message } = App.useApp();
    const confirm = useConfirm();
    const [libraryOpen, setLibraryOpen] = useState(false);
    const characters = useFilmCastStore((state) => state.characters);
    const locations = useFilmCastStore((state) => state.locations);
    const props = useFilmCastStore((state) => state.props);
    const costumes = useFilmCastStore((state) => state.costumes);
    const styles = useFilmCastStore((state) => state.styles);
    const saveAsset = useFilmCastStore((state) => state.saveAsset);
    if (!node) return null;
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const patchScript = (patch: Partial<FilmScriptNodeData>) => onChange(node.id, (current) => patchFilmScriptNode(current, patch));
    const patchScene = (patch: Partial<FilmSceneNodeData>) => onChange(node.id, (current) => patchFilmSceneNode(current, patch));
    const patchAsset = (patch: Partial<FilmAsset>) => onChange(node.id, (current) => patchFilmContextAssetNode(current, patch));
    const updateAsset = (updater: (asset: FilmAsset) => FilmAsset) => onChange(node.id, (current) => updateFilmContextAssetNode(current, updater));
    const script = node.metadata?.filmScript;
    const scene = node.metadata?.filmScene;
    const shot = node.metadata?.filmShot;
    const beat = node.metadata?.filmBeat;
    const shotImageCount = shot?.imageVersions?.length ?? 0;
    const shotVideoCount = shot?.videoVersions?.length ?? 0;
    const shotStatus = shot?.pendingTask
        ? `${shot.pendingTask.kind === "video" ? "视频" : "分镜图"}生成中`
        : node.metadata?.status === "error"
            ? "生成失败"
            : shotImageCount || shotVideoCount || shot?.imageUrl || shot?.videoUrl
                ? "已有媒体"
                : "待生成";
    const assetNode = node.type === CanvasNodeType.FilmCharacter ? { kind: "character" as const, asset: node.metadata?.filmCharacter?.asset }
        : node.type === CanvasNodeType.FilmLocation ? { kind: "location" as const, asset: node.metadata?.filmLocation?.asset }
            : node.type === CanvasNodeType.FilmProp ? { kind: "prop" as const, asset: node.metadata?.filmProp?.asset }
                : node.type === CanvasNodeType.FilmStyle ? { kind: "style" as const, asset: node.metadata?.filmStyle?.asset }
                    : null;
    const libraryLists: Record<FilmAssetKind, FilmAsset[]> = { character: characters, location: locations, prop: props, costume: costumes, style: styles };
    const libraryAssets = assetNode?.asset ? libraryLists[assetNode.kind] : [];
    const sourceEntry = assetNode?.asset ? findFilmLibraryEntry(libraryAssets, assetNode.asset) : undefined;
    const saveAssetToLibrary = async () => {
        if (!assetNode?.asset) return;
        const asset = assetNode.asset;
        const existing = findFilmLibraryEntry(libraryAssets, asset);
        const libraryNewer = filmLibraryEntryIsNewer(existing, asset);
        const ok = await confirm({
            title: existing ? `更新母版库「${existing.name}」？` : `存入${FILM_ASSET_KIND_LABELS[assetNode.kind]}母版库？`,
            description: existing
                ? `${libraryNewer ? "库条目比当前项目副本新，继续会用项目副本覆盖库中较新的版本。" : "会用当前项目副本覆盖库条目。"}其他项目里的副本不会自动更新。`
                : "会把当前资产存入母版库，之后可在其他影视项目中导入独立副本。",
            confirmText: existing ? "覆盖库条目" : "存入母版库",
            tone: libraryNewer ? "warning" : "default",
        });
        if (!ok) return;
        const mode = saveAsset(assetNode.kind, asset);
        const next = useFilmCastStore.getState();
        const nextList = assetNode.kind === "character" ? next.characters : assetNode.kind === "location" ? next.locations : assetNode.kind === "prop" ? next.props : next.styles;
        const saved = findFilmLibraryEntry(nextList, asset);
        if (saved) patchAsset({ sourceLibraryAssetId: saved.id });
        message.success(mode === "created" ? "已存入母版库" : "已更新母版库条目");
    };
    const replaceFromLibrary = async (entry: FilmAsset) => {
        if (!assetNode?.asset) return;
        const ok = await confirm({
            title: `从库更新「${assetNode.asset.name}」？`,
            description: (
                <div className="flex flex-col gap-2">
                    <span>将用库条目「{entry.name}」（更新于 {formatTime(entry.updatedAt)}）覆盖当前项目副本；历史媒体不会改写。</span>
                    {boundShotNumbers.length ? <span>{boundShotNumbers.length} 个镜头正在引用此资产：{boundShotNumbers.join("、")}。更新后下一次生成会使用新参考。</span> : null}
                </div>
            ),
            confirmText: "更新资产",
            tone: "warning",
            stacked: true,
        });
        if (!ok) return;
        const updated = applyFilmLibraryEntry(assetNode.asset, entry);
        onChange(node.id, (current) => updateFilmContextAssetNode(current, () => updated));
        message.success("已从母版库更新资产");
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="min(520px, 96vw)"
            zIndex={CANVAS_Z.popover}
            title={`${TITLES[node.type] || "影视节点"} · ${node.type === CanvasNodeType.FilmShot ? "概览" : "编辑"}`}
            styles={{
                header: { background: theme.node.panel, color: theme.node.text },
                body: { background: theme.node.panel, color: theme.node.text, paddingTop: 12 },
            }}
        >
            <div className="flex flex-col gap-3">
                {node.type === CanvasNodeType.FilmScript ? (
                    <>
                        <Field label="剧本正文">
                            <Input.TextArea
                                value={script?.text || ""}
                                autoSize={{ minRows: 12, maxRows: 24 }}
                                style={inputStyle}
                                onChange={(event) => patchScript({ text: event.target.value })}
                            />
                        </Field>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionSoft, color: theme.node.text }} disabled={Boolean(analysisProgress)} onClick={() => onRunDirectorAnalysis?.(node.id)}>
                                {analysisProgress ? `导演分析中 · ${analysisProgress.stage === "structure" ? "拆解结构" : "提取资产"}${analysisProgress.total ? ` ${analysisProgress.done}/${analysisProgress.total}` : "…"}` : "导演分析"}
                            </button>
                            {(script?.parseSnapshots?.length ?? 0) > 0 ? (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={Boolean(analysisProgress)} onClick={() => onUndoParse?.(node.id)}>撤销上次导演分析</button>
                            ) : null}
                        </div>
                        <div className="text-xs" style={{ color: theme.node.muted }}>AI 会先生成结构、镜头与资产提案，确认后一次写入画布；撤销会恢复最近一次分析前的节点和连线。</div>
                    </>
                ) : null}
                {node.type === CanvasNodeType.FilmScene ? (
                    <>
                        <Field label="集标题">
                            <Input value={scene?.episodeTitle || ""} style={inputStyle} onChange={(event) => patchScene({ episodeTitle: event.target.value })} />
                        </Field>
                        <Field label="场次名称">
                            <Input value={scene?.name || ""} style={inputStyle} onChange={(event) => patchScene({ name: event.target.value })} />
                        </Field>
                        <Field label="地点">
                            <Input value={scene?.location || ""} style={inputStyle} onChange={(event) => patchScene({ location: event.target.value })} />
                        </Field>
                        <Field label="时间">
                            <Input value={scene?.time || ""} style={inputStyle} onChange={(event) => patchScene({ time: event.target.value })} />
                        </Field>
                        <Field label="气氛">
                            <Input value={scene?.mood || ""} style={inputStyle} onChange={(event) => patchScene({ mood: event.target.value })} />
                        </Field>
                        <Field label="备注">
                            <Input.TextArea value={scene?.notes || ""} autoSize={{ minRows: 2, maxRows: 6 }} style={inputStyle} onChange={(event) => patchScene({ notes: event.target.value })} />
                        </Field>
                    </>
                ) : null}
                {node.type === CanvasNodeType.FilmShot ? (
                    <>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                                ["镜号", shot?.shotNo || "—"],
                                ["景别", shot?.shotType || "未设置"],
                                ["时长", `${shot?.duration ?? 0}s`],
                                ["运镜", shot?.cameraMovement || "未设置"],
                                ["转场", shot?.transition || "未设置"],
                                ["状态", shotStatus],
                            ].map(([label, value]) => (
                                <div key={label} className="flex flex-col gap-0.5 rounded-lg border px-2.5 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                    <span style={{ color: theme.node.muted }}>{label}</span>
                                    <span style={{ color: theme.node.text }}>{value}</span>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-lg border px-2.5 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}>
                            {shot?.description || "镜头描述尚未填写"}
                            {shot?.prompt ? <div className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>创作补充：{shot.prompt}</div> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                            <span>图片版本 {shotImageCount}</span>
                            <span>· 视频版本 {shotVideoCount}</span>
                            <span>· 上一镜 {shotPrevious ? `#${shotPrevious.shotNo}` : "无"}</span>
                            <span>· 下一镜 {shotNext ? `#${shotNext.shotNo}` : "无"}</span>
                        </div>
                        <section className="flex flex-col gap-1.5">
                            <span className="text-[11px] tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>上下文</span>
                            {shotContexts.length ? <div className="flex flex-wrap gap-1">{shotContexts.map((context) => <span key={context.edgeId} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{FILM_CONTEXT_ROLE_LABELS[context.role]} · {context.name}{context.stateName ? ` · ${context.stateName}` : ""}{context.variantName ? ` · ${context.variantName}` : ""}</span>)}</div> : <span className="text-[11px]" style={{ color: theme.node.muted }}>还没有上下文，去镜头聚焦添加上下文。</span>}
                        </section>
                        <div className="flex flex-wrap gap-2">
                            {onOpenShotFocus ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={() => { onClose(); onOpenShotFocus(node.id); }}>打开镜头聚焦</button> : null}
                            {onLocateShot ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => { onClose(); onLocateShot(node.id); }}>在导演板定位</button> : null}
                        </div>
                    </>
                ) : null}
                {node.type === CanvasNodeType.FilmBeat ? (
                    <>
                        <Field label="标题">
                            <Input value={beat?.title || ""} style={inputStyle} onChange={(event) => onChange(node.id, (current) => updateFilmBeatTitle(current, event.target.value))} />
                        </Field>
                        <Field label="总提示词">
                            <Input.TextArea
                                value={beat?.prompt || ""}
                                autoSize={{ minRows: 3, maxRows: 8 }}
                                style={inputStyle}
                                onChange={(event) => onChange(node.id, (current) => updateFilmBeatPrompt(current, event.target.value))}
                            />
                        </Field>
                        <div className="grid grid-cols-3 gap-2">
                            {Array.from({ length: filmBeatFrameCount(beat?.mode ?? "grid9") }, (_, index) => (
                                <Field key={index} label={`节拍 ${index + 1}`}>
                                    <Input.TextArea
                                        value={beat?.frames[index] || ""}
                                        autoSize={{ minRows: 2, maxRows: 4 }}
                                        maxLength={120}
                                        style={inputStyle}
                                        onChange={(event) => onChange(node.id, (current) => updateFilmBeatFrame(current, index, event.target.value))}
                                    />
                                </Field>
                            ))}
                        </div>
                        <div className="text-xs" style={{ color: theme.node.muted }}>非空 {beat?.frames.filter((frame) => frame.trim()).length || 0} 格；帧内容会进入关联镜头的生成提示词与输入签名。</div>
                        {beat?.errorMessage ? <div className="rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}>{beat.errorMessage}</div> : null}
                    </>
                ) : null}
                {assetNode?.asset ? (
                    <>
                        <Field label="资产类型">
                            <Input value={FILM_ASSET_KIND_LABELS[assetNode.kind]} disabled style={inputStyle} />
                        </Field>
                        <Field label="名称">
                            <Input value={assetNode.asset.name} style={inputStyle} onChange={(event) => patchAsset({ name: event.target.value })} />
                        </Field>
                        <Field label="设定描述">
                            <Input.TextArea value={assetNode.asset.description} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchAsset({ description: event.target.value })} />
                        </Field>
                        <Field label="视觉提示">
                            <Input.TextArea value={assetNode.asset.visualPrompt} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchAsset({ visualPrompt: event.target.value })} />
                        </Field>
                        <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                            <div className="flex items-start justify-between gap-2 text-xs">
                                <span style={{ color: theme.node.muted }}>母版库来源</span>
                                <span className="min-w-0 text-right" style={{ color: theme.node.text }}>
                                    {assetNode.asset.sourceLibraryAssetId ? (sourceEntry ? `${sourceEntry.name} · ${formatTime(sourceEntry.updatedAt)}` : "来源条目已删除") : "项目内创建"}
                                </span>
                            </div>
                            {boundShotNumbers.length ? <div className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>{boundShotNumbers.length} 个镜头引用：{boundShotNumbers.join("、")}</div> : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => setLibraryOpen(true)}>从母版库导入</button>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={() => void saveAssetToLibrary()}>存入母版库</button>
                            </div>
                        </div>
                        {assetNode.asset.pendingTask ? (
                            <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: canvasStatusColors.loading, color: theme.node.text }}>
                                <span>{assetTaskTargetLabel(assetNode.asset.pendingTask.target)}生成中；刷新后会自动恢复轮询，完成后写入对应槽位。</span>
                                {onStopAssetTask ? <button type="button" className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => onStopAssetTask(node.id)}>停止生成</button> : null}
                            </div>
                        ) : null}
                        {assetNode.asset.status === "failed" && assetNode.asset.errorMessage && !assetNode.asset.pendingTask ? <div className="rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}>{assetNode.asset.errorMessage}</div> : null}
                        <FilmAssetSlotFields theme={theme} kind={assetNode.kind} asset={assetNode.asset} nodeId={node.id} projectId={projectId} onChange={patchAsset} onChangeAsset={updateAsset} />
                        <FilmLibraryPickerDialog
                            open={libraryOpen}
                            theme={theme}
                            kind={assetNode.kind}
                            currentAssetName={assetNode.asset.name}
                            onClose={() => setLibraryOpen(false)}
                            onReplace={(entry) => {
                                setLibraryOpen(false);
                                void replaceFromLibrary(entry);
                            }}
                            onImport={(entry) => {
                                setLibraryOpen(false);
                                onImportLibraryAsset?.(assetNode.kind, entry);
                            }}
                        />
                    </>
                ) : null}
            </div>
        </Drawer>
    );
}
