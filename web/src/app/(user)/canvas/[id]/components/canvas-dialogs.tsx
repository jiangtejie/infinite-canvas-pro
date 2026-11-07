"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { Pause, Play } from "lucide-react";
import { App, Button, Modal, Slider } from "antd";
import { CanvasNodeAngleDialog } from "../../components/canvas-node-angle-dialog";
import { CanvasNodeCropDialog } from "../../components/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog } from "../../components/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog } from "../../components/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog } from "../../components/canvas-node-upscale-dialog";
import { CanvasNodeInfoModal } from "../../components/canvas-node-hover-toolbar";
import { AssetPickerModal, type AssetPickerTab } from "../../components/asset-picker-modal";
import { FullscreenPreview } from "./fullscreen-preview";
import { CanvasNodeType, type CanvasNodeData, type InsertAssetPayload, type Position } from "../../types";
import type { CanvasProject } from "../../stores/use-canvas-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasImageCropRect } from "../../components/canvas-node-crop-dialog";
import type { CanvasImageMaskEditPayload } from "../../components/canvas-node-mask-edit-dialog";
import type { CanvasImageSplitParams } from "../../components/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "../../components/canvas-node-upscale-dialog";
import type { CanvasImageAngleParams } from "../../components/canvas-node-angle-dialog";
import type { CanvasOverlay } from "../canvas-client-page";


export type CanvasDialogModel = {
    handleAssetInsert: (payload: InsertAssetPayload) => void;
    currentProject: CanvasProject | undefined;
    setDeleteProjectConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    closeOverlay: () => void;
    assetInsertPositionRef: RefObject<Position | null>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    extractAudio: (node: CanvasNodeData, trim?: { start: number; end: number; }) => Promise<string | undefined>;
    downloadNodeImage: (node: CanvasNodeData) => void;
    setMaskEditModel: Dispatch<SetStateAction<string>>;
    setMaskEditChannelId: Dispatch<SetStateAction<string>>;
    size: { width: number; height: number; };
    infoNode: CanvasNodeData | null;
    audioTrimNode: CanvasNodeData | null;
    trimmingAudio: boolean;
    audioTrimTooShort: boolean;
    audioTrimRef: RefObject<HTMLAudioElement | null>;
    audioTrimStart: number;
    audioTrimEnd: number;
    audioTrimDuration: number;
    setAudioTrimStart: Dispatch<SetStateAction<number>>;
    setAudioTrimEnd: Dispatch<SetStateAction<number>>;
    audioTrimPlaying: boolean;
    message: ReturnType<typeof App.useApp>["message"];
    cropNode: CanvasNodeData | null;
    cropImageNode: (node: CanvasNodeData, crop: CanvasImageCropRect) => Promise<void>;
    maskEditNode: CanvasNodeData | null;
    maskEditConfig: AiConfig | null;
    currentMaskEditModel: string;
    currentMaskEditChannelId: string;
    openConfigDialog: (shouldPromptContinue?: boolean, continueAction?: () => void) => void;
    maskEditImageNode: (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => Promise<void>;
    splitNode: CanvasNodeData | null;
    splitImageNode: (node: CanvasNodeData, params: CanvasImageSplitParams) => Promise<void>;
    upscaleNode: CanvasNodeData | null;
    upscaleImageNode: (node: CanvasNodeData, params: CanvasImageUpscaleParams) => Promise<void>;
    superResolveNode: CanvasNodeData | null;
    angleNode: CanvasNodeData | null;
    generateAngleNode: (node: CanvasNodeData, params: CanvasImageAngleParams) => Promise<void>;
    previewNode: CanvasNodeData | null;
    getBatchGroupNodes: (activeNode: CanvasNodeData | null) => CanvasNodeData[];
    setActiveOverlay: Dispatch<SetStateAction<CanvasOverlay | null>>;
    deleteProjectConfirmOpen: boolean;
    deleteCurrentProject: () => void;
    clearConfirmOpen: boolean;
    clearCanvas: () => void;
    assetPickerOpen: boolean;
    assetPickerTab: AssetPickerTab;
};

/**
 * 画布节点对话框与确认弹窗：信息/裁剪/切图/放大/超分/角度/局部编辑/预览/音频截取/删除与清空确认/素材选择。
 */
export function CanvasDialogs({ model }: { model: CanvasDialogModel }) {
    const {
        handleAssetInsert,
        currentProject,
        setDeleteProjectConfirmOpen,
        setClearConfirmOpen,
        closeOverlay,
        assetInsertPositionRef,
        setAssetPickerOpen,
        extractAudio,
        downloadNodeImage,
        setMaskEditModel,
        setMaskEditChannelId,
        infoNode,
        audioTrimNode,
        trimmingAudio,
        audioTrimTooShort,
        audioTrimRef,
        audioTrimStart,
        audioTrimEnd,
        audioTrimDuration,
        setAudioTrimStart,
        setAudioTrimEnd,
        audioTrimPlaying,
        message,
        cropNode,
        cropImageNode,
        maskEditNode,
        maskEditConfig,
        currentMaskEditModel,
        currentMaskEditChannelId,
        openConfigDialog,
        maskEditImageNode,
        splitNode,
        splitImageNode,
        upscaleNode,
        upscaleImageNode,
        superResolveNode,
        angleNode,
        generateAngleNode,
        previewNode,
        getBatchGroupNodes,
        setActiveOverlay,
        deleteProjectConfirmOpen,
        deleteCurrentProject,
        clearConfirmOpen,
        clearCanvas,
        assetPickerOpen,
        assetPickerTab,
    } = model;

    return (
        <>
                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => closeOverlay()} />

                <Modal
                    title="截取音频"
                    open={Boolean(audioTrimNode)}
                    centered
                    width={360}
                    confirmLoading={trimmingAudio}
                    closable={!trimmingAudio}
                    okText="确认截取"
                    cancelText="取消"
                    okButtonProps={{ disabled: audioTrimTooShort }}
                    cancelButtonProps={{ disabled: trimmingAudio }}
                    onCancel={() => {
                        if (!trimmingAudio) closeOverlay();
                    }}
                    onOk={async () => {
                        if (!audioTrimNode || audioTrimTooShort) return;

                        audioTrimRef.current?.pause();
                        const id = await extractAudio(audioTrimNode, {
                            start: audioTrimStart,
                            end: audioTrimEnd,
                        });
                        if (id) closeOverlay();
                    }}
                    modalRender={(content) => <div className="select-none" data-canvas-no-zoom>{content}</div>}
                >
                    <div className="space-y-4 py-2">
                        <Slider
                            {...{ allowCross: false, pushable: 0.5 }}
                            range={{ draggableTrack: true }}
                            min={0}
                            max={audioTrimDuration || 1}
                            step={0.01}
                            value={[audioTrimStart, audioTrimEnd]}
                            disabled={trimmingAudio || audioTrimDuration < 0.5}
                            ariaLabelForHandle={["截取开始时间", "截取结束时间"]}
                            tooltip={{ formatter: (value) => `${(value ?? 0).toFixed(2)} 秒` }}
                            onChange={(value: number | number[]) => {
                                if (!Array.isArray(value)) return;
                                const [start, end] = value;
                                if (Math.round((end - start) * 100) < 50) return;
                                audioTrimRef.current?.pause();
                                if (audioTrimRef.current) audioTrimRef.current.currentTime = start;
                                setAudioTrimStart(start);
                                setAudioTrimEnd(end);
                            }}
                        />

                        <div className="flex justify-between text-xs tabular-nums opacity-60">
                            <span>{audioTrimStart.toFixed(2)} 秒</span>
                            <span>选中 {(audioTrimEnd - audioTrimStart).toFixed(2)} 秒</span>
                            <span>{audioTrimEnd.toFixed(2)} 秒</span>
                        </div>

                        <div className="flex justify-center">
                            <Button
                                type="text"
                                shape="circle"
                                aria-label={audioTrimPlaying ? "暂停" : "播放"}
                                disabled={trimmingAudio || audioTrimTooShort}
                                icon={audioTrimPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                                onClick={() => {
                                    const audio = audioTrimRef.current;
                                    if (!audio) return;

                                    if (!audio.paused) {
                                        audio.pause();
                                        return;
                                    }

                                    if (audio.currentTime < audioTrimStart || audio.currentTime >= audioTrimEnd) {
                                        audio.currentTime = audioTrimStart;
                                    }

                                    void audio.play().catch((error) => {
                                        if (error.name !== "AbortError") message.error("音频试听失败");
                                    });
                                }}
                            />
                        </div>
                    </div>
                </Modal>

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => closeOverlay()} onConfirm={(crop) => cropImageNode(cropNode!, crop)} /> : null}

                {maskEditNode?.metadata?.content && maskEditConfig ? (
                    <CanvasNodeMaskEditDialog
                        dataUrl={maskEditNode.metadata.content}
                        open={Boolean(maskEditNode)}
                        config={{ ...maskEditConfig, model: currentMaskEditModel, imageChannelId: currentMaskEditChannelId }}
                        model={currentMaskEditModel}
                        channelId={currentMaskEditChannelId}
                        onModelChange={(model, channelId) => {
                            setMaskEditModel(model);
                            setMaskEditChannelId(channelId || "");
                        }}
                        onMissingConfig={() => openConfigDialog(true)}
                        onClose={() => {
                            closeOverlay();
                            setMaskEditModel("");
                            setMaskEditChannelId("");
                        }}
                        onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)}
                    />
                ) : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => closeOverlay()} onConfirm={(params) => splitImageNode(splitNode!, params)} /> : null}

                {upscaleNode?.metadata?.content ? <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => closeOverlay()} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} /> : null}

                <Modal title="AI 超分" open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={() => closeOverlay()}>
                    <div className="py-8 text-center text-base font-medium">暂未实现</div>
                </Modal>

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => closeOverlay()} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                {previewNode?.metadata?.content ? (() => {
                    const group = getBatchGroupNodes(previewNode);
                    const isRoot = previewNode.metadata?.isBatchRoot;
                    const activeItemNode = isRoot
                        ? (group.find((n) => n.id === previewNode.metadata?.primaryImageId) || group[0] || previewNode)
                        : previewNode;
                    const currentIndex = group.findIndex((n) => n.id === activeItemNode.id);
                    return (
                        <FullscreenPreview
                            src={activeItemNode.metadata?.content || ""}
                            alt={activeItemNode.title || "图片"}
                            isVideo={activeItemNode.type === CanvasNodeType.Video}
                            isPanorama={activeItemNode.type === CanvasNodeType.Panorama}
                            proxyGeneratedPanorama={activeItemNode.type === CanvasNodeType.Panorama && Boolean(activeItemNode.metadata?.imageTaskId || activeItemNode.metadata?.imageTaskResultId) && !activeItemNode.metadata?.storageKey}
                            onDownload={() => downloadNodeImage(activeItemNode)}
                            onClose={() => closeOverlay()}
                            hasPrev={currentIndex > 0}
                            hasNext={currentIndex < group.length - 1}
                            onPrev={() => setActiveOverlay({ kind: "preview", nodeId: group[currentIndex - 1].id })}
                            onNext={() => setActiveOverlay({ kind: "preview", nodeId: group[currentIndex + 1].id })}
                        />
                    );
                })() : null}

                <Modal
                    title="删除当前画布？"
                    open={deleteProjectConfirmOpen}
                    centered
                    onCancel={() => setDeleteProjectConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setDeleteProjectConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={() => { setDeleteProjectConfirmOpen(false); deleteCurrentProject(); }}>
                                删除画布
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">将永久删除「{currentProject?.title || "未命名画布"}」及其中所有节点、连线与生成记录，删除后无法恢复。</p>
                </Modal>

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                <AssetPickerModal open={assetPickerOpen} defaultTab={assetPickerTab} onInsert={handleAssetInsert} onClose={() => { assetInsertPositionRef.current = null; setAssetPickerOpen(false); }} />
        </>
    );
}
