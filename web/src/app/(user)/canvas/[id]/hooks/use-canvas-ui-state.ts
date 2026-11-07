"use client";

import { useState } from "react";

import type { UploadedImage } from "@/services/image-storage";
import type { AssetPickerTab } from "../../components/asset-picker-modal";
import type { ContextMenuState, Position } from "../../types";

export type PendingPanoramaImport = {
    image: UploadedImage;
    title: string;
    position: Position;
};

/**
 * 画布页面级 UI 状态：右键菜单、创建菜单定位、图片导入/确认弹窗与素材选择器。
 */
export function useCanvasUiState() {
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreatePosition, setNodeCreatePosition] = useState<Position | null>(null);
    const [pendingPanoramaImport, setPendingPanoramaImport] = useState<PendingPanoramaImport | null>(null);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTab, setAssetPickerTab] = useState<AssetPickerTab>("my-assets");
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);

    return {
        contextMenu,
        setContextMenu,
        nodeCreatePosition,
        setNodeCreatePosition,
        pendingPanoramaImport,
        setPendingPanoramaImport,
        clearConfirmOpen,
        setClearConfirmOpen,
        deleteProjectConfirmOpen,
        setDeleteProjectConfirmOpen,
        assetPickerOpen,
        setAssetPickerOpen,
        assetPickerTab,
        setAssetPickerTab,
        isMiniMapOpen,
        setIsMiniMapOpen,
    };
}
