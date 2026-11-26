"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { App, Select } from "antd";
import { FolderOpen, ImageIcon, Upload, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmFrameSource, FilmImageRef, FilmVideoMode } from "@/lib/film/types";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/assets/asset-picker-modal";
import { uploadImage } from "@/services/image-storage";
import { canvasStatusColors } from "../../lib/canvas-palette";
import type { FilmShotNodeData } from "../../types";
import { filmFrameReady, filmVideoMode } from "../lib/film-shot-video-frames";

type FilmShotVideoFramesProps = {
    theme: CanvasTheme;
    filmShot: FilmShotNodeData;
    disabled?: boolean;
    onChange: (patch: Partial<FilmShotNodeData>) => void;
};

export function FilmShotVideoFrames({ theme, filmShot, disabled, onChange }: FilmShotVideoFramesProps) {
    const { message } = App.useApp();
    const uploadRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<"first" | "last" | null>(null);
    const mode = filmVideoMode(filmShot);
    const setFrame = (target: "first" | "last", frame: FilmFrameSource | null) => {
        onChange(target === "first" ? { firstFrame: frame ?? undefined } : { lastFrame: frame ?? undefined });
    };

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !uploadTarget) return;
        try {
            const uploaded = await uploadImage(file);
            setFrame(uploadTarget, { kind: "upload", url: uploaded.url, storageKey: uploaded.storageKey });
        } catch {
            message.error("图片上传失败");
        } finally {
            setUploadTarget(null);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: theme.node.muted }}>视频模式</span>
                <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                    {([{ value: "reference", label: "参考模式" }, { value: "frames", label: "首尾帧" }] as { value: FilmVideoMode; label: string }[]).map((item) => (
                        <button key={item.value} type="button" className="rounded-full px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ background: mode === item.value ? theme.canvas.selectionSoft : undefined, color: mode === item.value ? theme.node.text : theme.node.muted }} aria-pressed={mode === item.value} disabled={disabled} onClick={() => onChange({ videoMode: item.value })}>{item.label}</button>
                    ))}
                </div>
            </div>
            {mode === "reference" ? (
                <p className="text-[11px] leading-5" style={{ color: theme.node.muted }}>使用角色、场景和分镜图作为参考，保持画面一致。</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <FrameSlot theme={theme} title="首帧" frame={filmShot.firstFrame} filmShot={filmShot} disabled={disabled} onSelect={(frame) => setFrame("first", frame)} onUpload={() => { setUploadTarget("first"); uploadRef.current?.click(); }} onClear={() => setFrame("first", null)} />
                        <FrameSlot theme={theme} title="尾帧（可选）" frame={filmShot.lastFrame} filmShot={filmShot} disabled={disabled} onSelect={(frame) => setFrame("last", frame)} onUpload={() => { setUploadTarget("last"); uploadRef.current?.click(); }} onClear={() => setFrame("last", null)} />
                    </div>
                    {!filmFrameReady(filmShot.firstFrame) ? <p className="text-[11px]" style={{ color: canvasStatusColors.error }}>首尾帧模式需要先选择首帧</p> : null}
                </>
            )}
            <input ref={uploadRef} hidden type="file" accept="image/*" onChange={handleFile} />
        </div>
    );
}

function FrameSlot({ theme, title, frame, filmShot, disabled, onSelect, onUpload, onClear }: {
    theme: CanvasTheme;
    title: string;
    frame?: FilmFrameSource;
    filmShot: FilmShotNodeData;
    disabled?: boolean;
    onSelect: (frame: FilmFrameSource | null) => void;
    onUpload: () => void;
    onClear: () => void;
}) {
    const src = useResolvedMediaSrc(frame?.url, frame?.storageKey);
    const { message } = App.useApp();
    const [pickerOpen, setPickerOpen] = useState(false);
    const versions = filmShot.imageVersions ?? [];
    const options = [
        ...(filmShot.imageUrl || filmShot.storageKey ? [{ value: "storyboard", label: "当前分镜图" }] : []),
        ...versions.map((version, index) => ({ value: version.id, label: `历史 v${index + 1}` })),
    ];
    const value = frame?.kind === "storyboard" ? "storyboard" : frame?.versionId;
    const handleSelect = (id?: string) => {
        if (!id) {
            onSelect(null);
            return;
        }
        if (id === "storyboard") {
            onSelect({ kind: "storyboard", url: filmShot.imageUrl || "", storageKey: filmShot.storageKey });
            return;
        }
        const version: FilmImageRef | undefined = versions.find((item) => item.id === id);
        if (version) onSelect({ kind: "version", url: version.url, storageKey: version.storageKey, versionId: version.id });
    };
    const handlePickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind !== "image") {
            message.warning("请选择图片素材");
            return;
        }
        setPickerOpen(false);
        try {
            if (payload.storageKey || payload.source === "library") {
                onSelect({ kind: "upload", url: payload.dataUrl, storageKey: payload.storageKey });
                return;
            }
            const uploaded = await uploadImage(payload.dataUrl);
            onSelect({ kind: "upload", url: uploaded.url, storageKey: uploaded.storageKey });
        } catch {
            message.error("素材引入失败");
        }
    };

    return (
        <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[10px] tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
                {frame ? <button type="button" className="shrink-0 opacity-55 hover:opacity-100 disabled:opacity-30" disabled={disabled} onClick={onClear} aria-label={`清除${title}`}><X className="size-3.5" /></button> : null}
            </div>
            <button type="button" className="grid h-16 place-items-center overflow-hidden rounded-md border disabled:opacity-60" style={{ borderColor: theme.node.stroke, background: theme.node.panel }} disabled={disabled} onClick={frame ? undefined : onUpload} aria-label={frame ? title : `上传${title}`}>
                {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1" style={{ color: theme.node.muted }}><ImageIcon className="size-4" /><span className="text-[10px]">上传或选择</span></span>}
            </button>
            <div className="flex items-center gap-1">
                <Select size="small" className="min-w-0 flex-1" placeholder={options.length ? "选择分镜图" : "暂无分镜图"} value={value} options={options} disabled={!options.length || disabled} allowClear={Boolean(frame)} onChange={handleSelect} />
                <button type="button" className="grid size-6 shrink-0 place-items-center rounded border disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} disabled={disabled} onClick={() => setPickerOpen(true)} aria-label={`从素材选择${title}`}><FolderOpen className="size-3" /></button>
                <button type="button" className="grid size-6 shrink-0 place-items-center rounded border disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} disabled={disabled} onClick={onUpload} aria-label={`上传${title}`}><Upload className="size-3" /></button>
            </div>
            <AssetPickerModal open={pickerOpen} defaultTab="my-assets" kind="image" onInsert={(payload) => void handlePickedAsset(payload)} onClose={() => setPickerOpen(false)} />
        </div>
    );
}
