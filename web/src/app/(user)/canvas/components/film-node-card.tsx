"use client";

import type { ReactNode } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { CanvasNodeData } from "../types";

function CardShell({ theme, label, children }: { theme: CanvasTheme; label: string; children: ReactNode }) {
    return (
        <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-4" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                <span className="font-mono tracking-[0.12em] uppercase">{label}</span>
                <span>点击编辑</span>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto text-sm leading-6" style={{ color: theme.node.muted }}>
                {children}
            </div>
        </div>
    );
}

export function FilmScriptNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const text = node.metadata?.filmScript?.text?.trim() || "";
    return (
        <CardShell theme={theme} label="剧本">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs">{text || "空剧本，点击填写正文"}</pre>
        </CardShell>
    );
}

export function FilmSceneNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const scene = node.metadata?.filmScene;
    const heading = [scene?.episodeTitle, scene?.name].filter(Boolean).join(" · ") || "未命名场次";
    const details = [scene?.location, scene?.time, scene?.mood].filter(Boolean).join(" / ");
    return (
        <CardShell theme={theme} label="场次">
            <div className="font-medium" style={{ color: theme.node.text }}>{heading}</div>
            <div className="mt-1 text-xs">{details || "点击填写地点、时间与气氛"}</div>
            {scene?.notes ? <div className="mt-2 text-xs">{scene.notes}</div> : null}
        </CardShell>
    );
}

export function FilmShotNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const shot = node.metadata?.filmShot;
    return (
        <CardShell theme={theme} label="镜头">
            <div className="font-mono text-xs">{shot?.shotNo || "未编号"}</div>
            <div className="mt-1" style={{ color: theme.node.text }}>{shot?.shotType || "未设置景别"} · {shot?.duration ?? 0}s</div>
            <div className="mt-2 text-xs">{shot?.description || shot?.prompt || "点击填写镜头描述"}</div>
        </CardShell>
    );
}

export function FilmAssetNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const payload = node.metadata?.filmAsset;
    const label = payload ? FILM_ASSET_KIND_LABELS[payload.kind] : "影视资产";
    return (
        <CardShell theme={theme} label={label}>
            <div className="font-medium" style={{ color: theme.node.text }}>{payload?.asset.name || node.title}</div>
            <div className="mt-1 text-xs">{payload?.asset.description || payload?.asset.visualPrompt || "点击填写设定"}</div>
        </CardShell>
    );
}
