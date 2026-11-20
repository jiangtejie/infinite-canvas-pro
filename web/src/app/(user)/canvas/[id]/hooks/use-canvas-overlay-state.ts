"use client";

import { useCallback, useState } from "react";

import type { CanvasOverlay } from "../../types";

/** 画布页面级浮层与蒙版编辑状态。 */
export function useCanvasOverlayState() {
    const [activeOverlay, setActiveOverlay] = useState<CanvasOverlay | null>(null);
    const [maskEditModel, setMaskEditModel] = useState("");
    const [maskEditChannelId, setMaskEditChannelId] = useState("");

    const openOverlay = useCallback((overlay: CanvasOverlay) => setActiveOverlay(overlay), []);
    const closeOverlay = useCallback(() => setActiveOverlay(null), []);
    const togglePromptOverlay = useCallback((nodeId: string) => setActiveOverlay((current) => current?.kind === "prompt" && current.nodeId === nodeId ? null : { kind: "prompt", nodeId }), []);

    return { activeOverlay, setActiveOverlay, openOverlay, closeOverlay, togglePromptOverlay, maskEditModel, setMaskEditModel, maskEditChannelId, setMaskEditChannelId };
}
