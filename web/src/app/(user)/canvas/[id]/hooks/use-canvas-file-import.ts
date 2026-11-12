"use client";

import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ChangeEvent as ReactChangeEvent, RefObject } from "react";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { downloadRemoteMedia, resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { fitNodeSize } from "../../utils/canvas-node-size";
import { PANORAMA_IMAGE_SIZE, PANORAMA_NODE_SIZE, isPanoramaNodeType } from "../../utils/canvas-panorama";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../lib/canvas-node-constants";
import { audioMetadata, buildImportedVideoNode, imageMetadata, videoMetadata } from "../lib/canvas-node-builders";
import { isAudioFile } from "../lib/canvas-graph";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "../../types";
import type { PendingPanoramaImport } from "./use-canvas-ui-state";
import type { useCanvasTaskSystem } from "./use-canvas-task-system";
import { errorMessage } from "@/lib/utils";

type CanvasFileImportTaskSystem = ReturnType<typeof useCanvasTaskSystem>;

type CanvasFileImportMessage = {
    error: (content: string) => void;
    warning: (content: string) => void;
    success: (content: string) => void;
    loading: (content: string, duration?: number) => () => void;
};

type UseCanvasFileImportOptions = {
    message: CanvasFileImportMessage;
    containerRef: RefObject<HTMLDivElement | null>;
    size: { width: number; height: number };
    screenToCanvas: (clientX: number, clientY: number) => Position;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    nodeTaskRunsRef: CanvasFileImportTaskSystem["nodeTaskRunsRef"];
    abortNodePolling: CanvasFileImportTaskSystem["abortNodePolling"];
    selectOnly: (nodeId: string) => void;
    setSelectedConnectionId: (id: string | null) => void;
    openOverlay: (overlay: { kind: "prompt"; nodeId: string }) => void;
    pendingPanoramaImport: PendingPanoramaImport | null;
    setPendingPanoramaImport: (pending: PendingPanoramaImport | null) => void;
    setTrimmingAudio: (trimming: boolean) => void;
};

/**
 * 画布文件导入：图片/视频/音频上传建节点、音频提取与截取、文件选择/拖入与全景图导入确认。
 */
export function useCanvasFileImport({
    message,
    containerRef,
    size,
    screenToCanvas,
    nodesRef,
    setNodes,
    setConnections,
    nodeTaskRunsRef,
    abortNodePolling,
    selectOnly,
    setSelectedConnectionId,
    openOverlay,
    pendingPanoramaImport,
    setPendingPanoramaImport,
    setTrimmingAudio,
}: UseCanvasFileImportOptions) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);

    const appendImportedImageNode = useCallback((image: UploadedImage, title: string, position: Position, type: CanvasNodeType.Image | CanvasNodeType.Panorama) => {
        const isPanorama = type === CanvasNodeType.Panorama;
        const size = isPanorama ? PANORAMA_NODE_SIZE : fitNodeSize(image.width, image.height);
        const id = nanoid();
        const newNode: CanvasNodeData = {
            id,
            type,
            title,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: isPanorama ? { ...imageMetadata(image), size: PANORAMA_IMAGE_SIZE, panoramaProjection: "equirectangular" } : imageMetadata(image),
        };
        setNodes((prev) => [...prev, newNode]);
        selectOnly(id);
        setSelectedConnectionId(null);
        openOverlay({ kind: "prompt", nodeId: id });
    }, [openOverlay, selectOnly, setSelectedConnectionId, setNodes]);

    const createImageFileNode = useCallback(async (file: File, position: Position, choosePanoramaImport = false) => {
        const hideLoading = message.loading("正在上传图片...", 0);
        try {
            const image = await uploadImage(file);
            if (choosePanoramaImport && image.width === image.height * 2) {
                setPendingPanoramaImport({ image, title: file.name, position });
                return;
            }
            appendImportedImageNode(image, file.name, position, CanvasNodeType.Image);
        } catch (error) {
            console.error("Upload image node failed:", error);
            message.error("图片上传失败");
        } finally {
            hideLoading();
        }
    }, [appendImportedImageNode, message, setPendingPanoramaImport]);

    const finishPanoramaImport = useCallback((type: CanvasNodeType.Image | CanvasNodeType.Panorama) => {
        if (!pendingPanoramaImport) return;
        setPendingPanoramaImport(null);
        appendImportedImageNode(pendingPanoramaImport.image, pendingPanoramaImport.title, pendingPanoramaImport.position, type);
    }, [appendImportedImageNode, pendingPanoramaImport, setPendingPanoramaImport]);
    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const hideLoading = message.loading("正在上传视频...", 0);
        try {
            const video = await uploadMediaFile(file, "video");
            const node = buildImportedVideoNode(video, file.name, position);
            setNodes((prev) => [...prev, node]);
            selectOnly(node.id);
            setSelectedConnectionId(null);
            openOverlay({ kind: "prompt", nodeId: node.id });
        } catch (error) {
            console.error("Upload video node failed:", error);
            message.error("视频上传失败");
        } finally {
            hideLoading();
        }
    }, [message, openOverlay, selectOnly, setSelectedConnectionId, setNodes]);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const hideLoading = message.loading("正在上传音频...", 0);
        try {
            const audio = await uploadMediaFile(file, "audio");
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            const id = nanoid();
            setNodes((prev) => [
                ...prev,
                {
                    id,
                    type: CanvasNodeType.Audio,
                    title: file.name,
                    position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                    width: spec.width,
                    height: spec.height,
                    metadata: audioMetadata(audio),
                },
            ]);
            selectOnly(id);
            setSelectedConnectionId(null);
            return id;
        } catch (error) {
            console.error("Upload audio node failed:", error);
            message.error("音频上传失败");
        } finally {
            hideLoading();
        }
    }, [message, selectOnly, setSelectedConnectionId, setNodes]);

    const extractingAudioRef = useRef(new Set<string>());

    const extractAudio = useCallback(async (node: CanvasNodeData, trim?: { start: number; end: number }) => {
        if ((node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content || extractingAudioRef.current.has(node.id)) return;
        extractingAudioRef.current.add(node.id);
        if (trim) setTrimmingAudio(true);
        const hideLoading = message.loading(trim ? "正在截取音频..." : "正在分离音频...", 0);
        let input: import("mediabunny").Input | undefined;
        let conversion: import("mediabunny").Conversion | undefined;

        try {
            if (trim && (!Number.isFinite(trim.start) || !Number.isFinite(trim.end) || trim.start < 0 || Math.round((trim.end - trim.start) * 100) < 50)) {
                throw new Error("请填写有效的起止时间，至少保留 0.5 秒");
            }
            const [{ Input, ALL_FORMATS, BlobSource, Output, WavOutputFormat, BufferTarget, Conversion }, blob] = await Promise.all([
                import("mediabunny"),
                resolveMediaUrl(node.metadata.storageKey, node.metadata.content).then(downloadRemoteMedia),
            ]);
            input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
            const audioTrack = await input.getPrimaryAudioTrack();
            if (!audioTrack) throw new Error("该文件没有音轨");
            if (trim && trim.end > await audioTrack.computeDuration()) throw new Error("结束时间不能超过音频时长");

            const target = new BufferTarget();
            const output = new Output({ format: new WavOutputFormat(), target });
            conversion = await Conversion.init({
                input, output, tracks: "primary", trim,
                audio: { process: (sample) => { if (sample.timestamp < 0 && sample.timestamp > -1e-9) sample.setTimestamp(0); return sample; } },
            });
            if (!conversion.isValid) throw new Error("当前浏览器无法解码该文件的音频");
            await conversion.execute();

            const file = new File([target.buffer!], `${node.title || (trim ? "音频" : "视频")} ${trim ? "截取" : "音频"}.wav`, {
                type: "audio/wav",
            });
            const width = NODE_DEFAULT_SIZE[CanvasNodeType.Audio].width;
            hideLoading();
            const audioNodeId = await createAudioFileNode(file, {
                x: node.position.x + node.width + 96 + width / 2,
                y: node.position.y + node.height / 2,
            });

            if (audioNodeId) {
                setConnections((prev) => [
                    ...prev,
                    { id: nanoid(), fromNodeId: node.id, toNodeId: audioNodeId },
                ]);
            }
            return audioNodeId;
        } catch (error) {
            message.error(errorMessage(error, "音频处理失败"));
        } finally {
            await conversion?.cancel().catch(console.error);
            input?.dispose();
            extractingAudioRef.current.delete(node.id);
            hideLoading();
            if (trim) setTrimmingAudio(false);
        }
    }, [createAudioFileNode, message, setConnections, setTrimmingAudio]);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        if (imageInputRef.current) imageInputRef.current.multiple = !nodeId;
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files || []);
            const file = files[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file))) return;
            const targetNode = target?.nodeId ? nodesRef.current.find((node) => node.id === target.nodeId) : null;
            const targetRun = target?.nodeId ? nodeTaskRunsRef.current.get(target.nodeId) : undefined;
            const targetToken = targetRun?.preparing || targetRun?.generation || targetRun?.controller;
            if (isPanoramaNodeType(targetNode?.type) && !file.type.startsWith("image/")) {
                message.warning("全景图节点仅支持上传图片作为参考");
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            if (target?.nodeId) {
                const targetNodeId = target.nodeId;
                const hideLoading = message.loading(isAudioFile(file) ? "正在上传音频..." : file.type.startsWith("video/") ? "正在上传视频..." : "正在上传图片...", 0);
                try {
                    const audio = isAudioFile(file) ? await uploadMediaFile(file, "audio") : null;
                    const video = !audio && file.type.startsWith("video/") ? await uploadMediaFile(file, "video") : null;
                    const image = !audio && !video ? await uploadImage(file) : null;
                    const canApplyUpload = (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && nodesRef.current.some((node) => node.id === targetNodeId);
                    if (canApplyUpload) {
                        if (targetRun && targetRun.preparing === targetToken) delete targetRun.preparing;
                        if (targetRun) nodeTaskRunsRef.current.set(targetNodeId, { id: "", controller: targetRun.controller, generation: typeof targetToken === "symbol" ? targetToken : undefined });
                        abortNodePolling(targetNodeId);
                    }
                    if (audio && canApplyUpload) {
                        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                        setNodes((prev) => (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && prev.some((node) => node.id === targetNodeId) ? prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Audio, title: file.name, position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 }, width: spec.width, height: spec.height, metadata: { ...node.metadata, ...audioMetadata(audio), clientTaskId: undefined, taskBackend: undefined, errorDetails: undefined } } : node)) : prev);
                        selectOnly(targetNodeId);
                        setSelectedConnectionId(null);
                    } else if (video && canApplyUpload) {
                        const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        setNodes((prev) => (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && prev.some((node) => node.id === targetNodeId) ? prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Video, title: file.name, position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 }, width: nextSize.width, height: nextSize.height, metadata: { ...node.metadata, ...videoMetadata(video), clientTaskId: undefined, taskBackend: undefined, errorDetails: undefined } } : node)) : prev);
                        selectOnly(targetNodeId);
                        setSelectedConnectionId(null);
                        openOverlay({ kind: "prompt", nodeId: targetNodeId });
                    } else if (image && canApplyUpload) {
                        const size = fitNodeSize(image.width, image.height);
                        setNodes((prev) => (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && prev.some((node) => node.id === targetNodeId) ?
                            prev.map((node) => {
                                if (node.id !== targetNodeId) return node;
                                const isPanorama = isPanoramaNodeType(node.type);
                                const nextSize = isPanorama ? PANORAMA_NODE_SIZE : size;
                                return {
                                    ...node,
                                    type: isPanorama ? CanvasNodeType.Panorama : CanvasNodeType.Image,
                                    title: isPanorama ? node.title : file.name,
                                    position: isPanorama ? { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 } : node.position,
                                    width: nextSize.width,
                                    height: nextSize.height,
                                    metadata: {
                                        ...node.metadata,
                                        ...imageMetadata(image),
                                        clientTaskId: undefined,
                                        taskBackend: undefined,
                                        errorDetails: undefined,
                                        freeResize: false,
                                        isBatchRoot: undefined,
                                        batchRootId: undefined,
                                        batchChildIds: undefined,
                                        batchUsesReferenceImages: undefined,
                                        generationType: undefined,
                                        model: isPanorama ? node.metadata?.model : undefined,
                                        size: isPanorama ? PANORAMA_IMAGE_SIZE : undefined,
                                        quality: isPanorama ? node.metadata?.quality : undefined,
                                        count: isPanorama ? node.metadata?.count : undefined,
                                        references: undefined,
                                        primaryImageId: undefined,
                                        imageBatchExpanded: undefined,
                                        imageTaskId: undefined,
                                        imageTaskResultId: undefined,
                                        panoramaSourcePrompt: isPanorama ? node.metadata?.panoramaSourcePrompt : undefined,
                                        panoramaFinalPrompt: undefined,
                                        panoramaProjection: undefined,
                                    },
                                };
                            }) : prev,
                        );
                        selectOnly(targetNodeId);
                        setSelectedConnectionId(null);
                        openOverlay({ kind: "prompt", nodeId: targetNodeId });
                    }
                } catch (error) {
                    console.error("Upload node file failed:", error);
                    message.error("上传失败");
                } finally {
                    hideLoading();
                }
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                files.forEach((item, index) => {
                    const nextPosition = { x: position.x + index * 48, y: position.y + index * 48 };
                    void (isAudioFile(item)
                        ? createAudioFileNode(item, nextPosition)
                        : item.type.startsWith("video/") ? createVideoFileNode(item, nextPosition) : createImageFileNode(item, nextPosition, files.length === 1));
                });
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas, size.height, size.width, abortNodePolling, message, nodeTaskRunsRef, openOverlay, selectOnly, setSelectedConnectionId, containerRef, nodesRef, setNodes],
    );

    return {
        imageInputRef,
        appendImportedImageNode,
        createImageFileNode,
        finishPanoramaImport,
        createVideoFileNode,
        createAudioFileNode,
        extractAudio,
        handleUploadRequest,
        handleImageInputChange,
    };
}
