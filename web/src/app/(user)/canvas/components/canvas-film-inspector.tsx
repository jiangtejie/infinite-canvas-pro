"use client";

import type { ReactNode } from "react";
import { Drawer, Input, InputNumber } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset } from "@/lib/film/types";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../[id]/lib/canvas-layer";
import { patchFilmAssetNode, patchFilmSceneNode, patchFilmScriptNode, patchFilmShotNode } from "../[id]/lib/film-node-patch";
import { FilmAssetSlotFields } from "../[id]/components/film-asset-slot-fields";
import { CanvasNodeType, type CanvasNodeData, type FilmAssetNodeData, type FilmSceneNodeData, type FilmScriptNodeData, type FilmShotNodeData } from "../types";

type CanvasFilmInspectorProps = {
    open: boolean;
    node: CanvasNodeData | null;
    onClose: () => void;
    onChange: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
};

const TITLES: Partial<Record<CanvasNodeType, string>> = {
    [CanvasNodeType.Script]: "剧本",
    [CanvasNodeType.Scene]: "场次",
    [CanvasNodeType.Shot]: "镜头",
    [CanvasNodeType.FilmAsset]: "影视资产",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ opacity: 0.6 }}>{label}</span>
            {children}
        </label>
    );
}

export function CanvasFilmInspector({ open, node, onClose, onChange }: CanvasFilmInspectorProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const patchScript = (patch: Partial<FilmScriptNodeData>) => onChange(node.id, (current) => patchFilmScriptNode(current, patch));
    const patchScene = (patch: Partial<FilmSceneNodeData>) => onChange(node.id, (current) => patchFilmSceneNode(current, patch));
    const patchShot = (patch: Partial<FilmShotNodeData>) => onChange(node.id, (current) => patchFilmShotNode(current, patch));
    const patchAsset = (patch: Partial<FilmAsset>) => onChange(node.id, (current) => patchFilmAssetNode(current, patch));
    const script = node.metadata?.filmScript;
    const scene = node.metadata?.filmScene;
    const shot = node.metadata?.filmShot;
    const payload: FilmAssetNodeData | undefined = node.metadata?.filmAsset;

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size={520}
            zIndex={CANVAS_Z.popover}
            title={`${TITLES[node.type] || "影视节点"} · 编辑`}
            styles={{
                header: { background: theme.node.panel, color: theme.node.text },
                body: { background: theme.node.panel, color: theme.node.text, paddingTop: 12 },
            }}
        >
            <div className="flex flex-col gap-3">
                {node.type === CanvasNodeType.Script ? (
                    <Field label="剧本正文">
                        <Input.TextArea
                            value={script?.text || ""}
                            autoSize={{ minRows: 12, maxRows: 24 }}
                            style={inputStyle}
                            onChange={(event) => patchScript({ text: event.target.value })}
                        />
                    </Field>
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
                            <Input value={shot?.shotType || ""} style={inputStyle} onChange={(event) => patchShot({ shotType: event.target.value })} />
                        </Field>
                        <Field label="时长（秒）">
                            <InputNumber min={1} max={60} value={shot?.duration ?? 4} style={{ ...inputStyle, width: "100%" }} onChange={(value) => patchShot({ duration: value ?? 4 })} />
                        </Field>
                        <Field label="运镜">
                            <Input value={shot?.cameraMovement || ""} style={inputStyle} onChange={(event) => patchShot({ cameraMovement: event.target.value })} />
                        </Field>
                        <Field label="画面描述">
                            <Input.TextArea value={shot?.description || ""} autoSize={{ minRows: 3, maxRows: 8 }} style={inputStyle} onChange={(event) => patchShot({ description: event.target.value })} />
                        </Field>
                        <Field label="画面提示词">
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
                        <FilmAssetSlotFields theme={theme} kind={payload.kind} asset={payload.asset} onChange={patchAsset} />
                    </>
                ) : null}
            </div>
        </Drawer>
    );
}
