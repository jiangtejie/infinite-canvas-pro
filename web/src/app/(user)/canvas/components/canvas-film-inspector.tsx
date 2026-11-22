"use client";

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { App, Drawer, Input, InputNumber } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { applyFilmLibraryEntry, filmLibraryEntryIsNewer, findFilmLibraryEntry } from "@/app/(user)/film/utils/film-library";
import { CANVAS_Z } from "../[id]/lib/canvas-layer";
import { canvasStatusColors } from "../lib/canvas-palette";
import { patchFilmAssetNode, patchFilmSceneNode, patchFilmScriptNode, patchFilmShotNode } from "../[id]/lib/film-node-patch";
import { FilmAssetSlotFields } from "../[id]/components/film-asset-slot-fields";
import { FilmLibraryPickerDialog } from "../[id]/components/film-library-picker-dialog";
import { FilmCameraMovementControl, FilmShotTypeControl, FilmTransitionControl } from "../[id]/components/film-shot-basic-controls";
import { CanvasNodeType, type CanvasNodeData, type FilmAssetNodeData, type FilmSceneNodeData, type FilmScriptNodeData, type FilmShotNodeData } from "../types";

type CanvasFilmInspectorProps = {
    open: boolean;
    node: CanvasNodeData | null;
    onClose: () => void;
    onChange: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    scriptParsing?: boolean;
    scriptParseProgress?: { done: number; total: number } | null;
    assetExtracting?: boolean;
    assetExtractProgress?: { done: number; total: number } | null;
    onParseScript?: (nodeId: string) => void;
    onUndoParse?: (nodeId: string) => void;
    onExtractAssets?: (nodeId: string) => void;
    boundShotNumbers?: string[];
    onImportLibraryAsset?: (kind: FilmAssetKind, entry: FilmAsset) => void;
    onStopAssetTask?: (nodeId: string) => void;
};

const TITLES: Partial<Record<CanvasNodeType, string>> = {
    [CanvasNodeType.Script]: "剧本",
    [CanvasNodeType.Scene]: "场次",
    [CanvasNodeType.Shot]: "镜头",
    [CanvasNodeType.FilmAsset]: "影视资产",
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

export function CanvasFilmInspector({ open, node, onClose, onChange, scriptParsing, scriptParseProgress, assetExtracting, assetExtractProgress, onParseScript, onUndoParse, onExtractAssets, boundShotNumbers = [], onImportLibraryAsset, onStopAssetTask }: CanvasFilmInspectorProps) {
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
    const patchShot = (patch: Partial<FilmShotNodeData>) => onChange(node.id, (current) => patchFilmShotNode(current, patch));
    const patchAsset = (patch: Partial<FilmAsset>) => onChange(node.id, (current) => patchFilmAssetNode(current, patch));
    const updateAsset = (updater: (asset: FilmAsset) => FilmAsset) => onChange(node.id, (current) => {
        const payload = current.metadata?.filmAsset;
        if (!payload) return current;
        return {
            ...current,
            metadata: {
                ...current.metadata,
                filmAsset: { ...payload, asset: { ...updater(payload.asset), updatedAt: new Date().toISOString() } },
            },
        };
    });
    const script = node.metadata?.filmScript;
    const scene = node.metadata?.filmScene;
    const shot = node.metadata?.filmShot;
    const payload: FilmAssetNodeData | undefined = node.metadata?.filmAsset;
    const libraryLists: Record<FilmAssetKind, FilmAsset[]> = { character: characters, location: locations, prop: props, costume: costumes, style: styles };
    const libraryAssets = payload ? libraryLists[payload.kind] : [];
    const sourceEntry = payload ? findFilmLibraryEntry(libraryAssets, payload.asset) : undefined;
    const saveAssetToLibrary = async () => {
        if (!payload) return;
        const existing = findFilmLibraryEntry(libraryAssets, payload.asset);
        const libraryNewer = filmLibraryEntryIsNewer(existing, payload.asset);
        const ok = await confirm({
            title: existing ? `更新母版库「${existing.name}」？` : `存入${FILM_ASSET_KIND_LABELS[payload.kind]}母版库？`,
            description: existing
                ? `${libraryNewer ? "库条目比当前项目副本新，继续会用项目副本覆盖库中较新的版本。" : "会用当前项目副本覆盖库条目。"}其他项目里的副本不会自动更新。`
                : "会把当前资产存入母版库，之后可在其他影视项目中导入独立副本。",
            confirmText: existing ? "覆盖库条目" : "存入母版库",
            tone: libraryNewer ? "warning" : "default",
        });
        if (!ok) return;
        const mode = saveAsset(payload.kind, payload.asset);
        const next = useFilmCastStore.getState();
        const nextList = payload.kind === "character" ? next.characters : payload.kind === "location" ? next.locations : payload.kind === "prop" ? next.props : payload.kind === "costume" ? next.costumes : next.styles;
        const saved = findFilmLibraryEntry(nextList, payload.asset);
        if (saved) patchAsset({ sourceLibraryAssetId: saved.id });
        message.success(mode === "created" ? "已存入母版库" : "已更新母版库条目");
    };
    const replaceFromLibrary = async (entry: FilmAsset) => {
        if (!payload) return;
        const ok = await confirm({
            title: `从库更新「${payload.asset.name}」？`,
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
        patchAsset(applyFilmLibraryEntry(payload.asset, entry));
        message.success("已从母版库更新资产");
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="min(520px, 96vw)"
            zIndex={CANVAS_Z.popover}
            title={`${TITLES[node.type] || "影视节点"} · 编辑`}
            styles={{
                header: { background: theme.node.panel, color: theme.node.text },
                body: { background: theme.node.panel, color: theme.node.text, paddingTop: 12 },
            }}
        >
            <div className="flex flex-col gap-3">
                {node.type === CanvasNodeType.Script ? (
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
                            <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionSoft, color: theme.node.text }} disabled={scriptParsing || assetExtracting} onClick={() => onParseScript?.(node.id)}>
                                {scriptParsing ? `AI 拆镜中${scriptParseProgress?.total ? ` ${scriptParseProgress.done}/${scriptParseProgress.total}` : "…"}` : "AI 拆镜"}
                            </button>
                            <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={scriptParsing || assetExtracting} onClick={() => onExtractAssets?.(node.id)}>
                                {assetExtracting ? `提取资产中${assetExtractProgress?.total ? ` ${assetExtractProgress.done}/${assetExtractProgress.total}` : "…"}` : "AI 提取资产"}
                            </button>
                            {(script?.parseSnapshots?.length ?? 0) > 0 ? (
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={scriptParsing || assetExtracting} onClick={() => onUndoParse?.(node.id)}>撤销上次拆镜</button>
                            ) : null}
                        </div>
                        <div className="text-xs" style={{ color: theme.node.muted }}>AI 会先生成提案，确认后再写入画布；提取资产可同时绑定到提及的镜头，撤销拆镜可恢复最近一次。</div>
                    </>
                ) : null}
                {node.type === CanvasNodeType.Scene ? (
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
                {node.type === CanvasNodeType.Shot ? (
                    <>
                        <Field label="镜号">
                            <Input value={shot?.shotNo || ""} style={inputStyle} onChange={(event) => patchShot({ shotNo: event.target.value })} />
                        </Field>
                        <Field label="景别">
                            <FilmShotTypeControl value={shot?.shotType} style={inputStyle} onChange={(value) => patchShot({ shotType: value })} />
                        </Field>
                        <Field label="时长（秒）">
                            <InputNumber min={1} max={60} value={shot?.duration ?? 4} style={{ ...inputStyle, width: "100%" }} onChange={(value) => patchShot({ duration: value ?? 4 })} />
                        </Field>
                        <Field label="运镜">
                            <FilmCameraMovementControl value={shot?.cameraMovement} style={inputStyle} onChange={(value) => patchShot({ cameraMovement: value })} />
                        </Field>
                        <Field label="转场">
                            <FilmTransitionControl value={shot?.transition} style={inputStyle} onChange={(value) => patchShot({ transition: value })} />
                        </Field>
                        <Field label="画面描述">
                            <Input.TextArea value={shot?.description || ""} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchShot({ description: event.target.value })} />
                        </Field>
                        <Field label="创作补充">
                            <Input.TextArea value={shot?.prompt || ""} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchShot({ prompt: event.target.value })} />
                        </Field>
                        <Field label="负面提示词">
                            <Input.TextArea value={shot?.negativePrompt || ""} autoSize={{ minRows: 2, maxRows: 6 }} style={inputStyle} onChange={(event) => patchShot({ negativePrompt: event.target.value })} />
                        </Field>
                    </>
                ) : null}
                {node.type === CanvasNodeType.FilmAsset && payload ? (
                    <>
                        <Field label="资产类型">
                            <Input value={FILM_ASSET_KIND_LABELS[payload.kind]} disabled style={inputStyle} />
                        </Field>
                        <Field label="名称">
                            <Input value={payload.asset.name} style={inputStyle} onChange={(event) => patchAsset({ name: event.target.value })} />
                        </Field>
                        <Field label="设定描述">
                            <Input.TextArea value={payload.asset.description} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchAsset({ description: event.target.value })} />
                        </Field>
                        <Field label="视觉提示">
                            <Input.TextArea value={payload.asset.visualPrompt} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchAsset({ visualPrompt: event.target.value })} />
                        </Field>
                        <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                            <div className="flex items-start justify-between gap-2 text-xs">
                                <span style={{ color: theme.node.muted }}>母版库来源</span>
                                <span className="min-w-0 text-right" style={{ color: theme.node.text }}>
                                    {payload.asset.sourceLibraryAssetId ? (sourceEntry ? `${sourceEntry.name} · ${formatTime(sourceEntry.updatedAt)}` : "来源条目已删除") : "项目内创建"}
                                </span>
                            </div>
                            {boundShotNumbers.length ? <div className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>{boundShotNumbers.length} 个镜头引用：{boundShotNumbers.join("、")}</div> : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => setLibraryOpen(true)}>从母版库导入</button>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={() => void saveAssetToLibrary()}>存入母版库</button>
                            </div>
                        </div>
                        {payload.asset.pendingTask ? (
                            <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: canvasStatusColors.loading, color: theme.node.text }}>
                                <span>{assetTaskTargetLabel(payload.asset.pendingTask.target)}生成中；刷新后会自动恢复轮询，完成后写入对应槽位。</span>
                                {onStopAssetTask ? <button type="button" className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => onStopAssetTask(node.id)}>停止生成</button> : null}
                            </div>
                        ) : null}
                        {payload.asset.status === "failed" && payload.asset.errorMessage && !payload.asset.pendingTask ? <div className="rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}>{payload.asset.errorMessage}</div> : null}
                        <FilmAssetSlotFields theme={theme} kind={payload.kind} asset={payload.asset} nodeId={node.id} projectId={projectId} onChange={patchAsset} onChangeAsset={updateAsset} />
                        <FilmLibraryPickerDialog
                            open={libraryOpen}
                            theme={theme}
                            kind={payload.kind}
                            currentAssetName={payload.asset.name}
                            onClose={() => setLibraryOpen(false)}
                            onReplace={(entry) => {
                                setLibraryOpen(false);
                                void replaceFromLibrary(entry);
                            }}
                            onImport={(entry) => {
                                setLibraryOpen(false);
                                onImportLibraryAsset?.(payload.kind, entry);
                            }}
                        />
                    </>
                ) : null}
            </div>
        </Drawer>
    );
}
