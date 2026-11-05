"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { App, Button, Input, InputNumber, Select, Spin } from "antd";
import { Clapperboard, ImageIcon, Upload } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { uploadImage } from "@/services/image-storage";
import { useEffectiveConfig } from "@/stores/use-config-store";
import type { FilmAsset, FilmFrameSource, FilmShot, FilmVideoSegment } from "../types";
import { useFilmVideoUrl } from "../hooks/use-film-image-url";
import { filmAspectCssRatio } from "../utils/film-aspects";
import { composeFilmVideoPrompt, createDefaultSegments, mergeVideoSegmentWithPrevious, removeVideoSegment, splitVideoSegment, validateSegments } from "../utils/film-video-segments";
import { clampFilmVideoDuration, filmVideoLimits, filmVideoReferenceLimit } from "../utils/film-video-limits";
import { FilmImageThumbnail } from "./film-asset-thumbnail";

type FilmShotVideoPanelProps = {
    shot: FilmShot;
    onChange: (patch: Partial<FilmShot>) => void;
    onGenerate: () => void;
    generating: boolean;
    progress: number;
    aspect?: string;
    styleText: string;
    characters: FilmAsset[];
    locations: FilmAsset[];
};

export function FilmShotVideoPanel({ shot, onChange, onGenerate, generating, progress, aspect, styleText, characters, locations }: FilmShotVideoPanelProps) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const effectiveConfig = useEffectiveConfig();
    const videoModel = effectiveConfig.videoModel || effectiveConfig.model;
    const limits = filmVideoLimits(videoModel);
    const adjustedDuration = clampFilmVideoDuration(shot.duration, videoModel);
    const durationIssue = limits.isSeedance && shot.duration !== adjustedDuration;
    const videoSrc = useFilmVideoUrl(shot.videoUrl, shot.videoStorageKey);
    const uploadRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<"first" | "last" | null>(null);
    const [selectedSegmentId, setSelectedSegmentId] = useState("");

    const mode = shot.videoMode === "frames" ? "frames" : "reference";
    const defaultSegments = useMemo(() => createDefaultSegments(shot.duration), [shot.id, shot.duration]);
    const segments = shot.videoSegments?.length ? shot.videoSegments : defaultSegments;
    const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? segments[0] ?? null;
    const segmentError = validateSegments(segments, shot.duration);
    const frameError = mode === "frames" && !shot.firstFrame ? "首尾帧模式需要先选择首帧" : "";
    const generateBlockReason = segmentError
        || frameError
        || (durationIssue ? `镜头时长 ${shot.duration}s 超出${limits.label}范围（${limits.min}-${limits.max}s），请先调整时长` : "");
    const characterNames = (shot.characterIds || []).map((id) => characters.find((asset) => asset.id === id)?.name).filter((name): name is string => Boolean(name));
    const locationName = locations.find((asset) => asset.id === shot.locationId)?.name || "";

    const composedPrompt = composeFilmVideoPrompt({
        segments,
        shotTypeLabel: shot.shotType || "",
        cameraMovement: shot.cameraMovement || "",
        description: shot.description || "",
        videoPrompt: shot.videoPrompt || "",
        styleText,
        mode,
        hasFirstFrame: mode === "frames" && Boolean(shot.firstFrame),
    });

    const updateSegments = (next: FilmVideoSegment[]) => onChange({ videoSegments: next });

    const updateSegment = (segmentId: string, patch: Partial<FilmVideoSegment>) => {
        updateSegments(segments.map((segment) => segment.id === segmentId ? { ...segment, ...patch } : segment));
    };

    const applySplit = () => {
        if (!selectedSegment) return;
        const next = splitVideoSegment(segments, selectedSegment.id);
        updateSegments(next);
        const added = next.find((segment) => !segments.some((old) => old.id === segment.id));
        if (added) setSelectedSegmentId(added.id);
    };

    const applyMerge = () => {
        if (!selectedSegment) return;
        const next = mergeVideoSegmentWithPrevious(segments, selectedSegment.id);
        updateSegments(next);
        const index = segments.findIndex((segment) => segment.id === selectedSegment.id);
        setSelectedSegmentId(next[Math.max(0, index - 1)]?.id || "");
    };

    const applyRemove = () => {
        if (!selectedSegment) return;
        const next = removeVideoSegment(segments, selectedSegment.id);
        updateSegments(next);
        setSelectedSegmentId(next[0]?.id || "");
    };

    const resetSegments = () => {
        const next = createDefaultSegments(shot.duration);
        updateSegments(next);
        setSelectedSegmentId(next[0]?.id || "");
    };

    const setFrame = (target: "first" | "last", frame: FilmFrameSource | null) => {
        if (target === "first") {
            onChange({ firstFrame: frame || undefined });
        } else {
            onChange({ lastFrame: frame || undefined });
        }
    };

    const triggerUpload = (target: "first" | "last") => {
        setUploadTarget(target);
        uploadRef.current?.click();
    };

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !uploadTarget) return;
        try {
            const uploaded = await uploadImage(file, { localOnly: true });
            setFrame(uploadTarget, { kind: "upload", url: uploaded.url, storageKey: uploaded.storageKey });
        } catch {
            message.error("图片上传失败");
        } finally {
            setUploadTarget(null);
        }
    };

    const formatSeconds = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

    return (
        <div className="grid gap-3">
            <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视频模式</span>
                    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                        {([{ value: "reference", label: "全参考" }, { value: "frames", label: "首尾帧" }] as const).map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => onChange({ videoMode: item.value })}
                                aria-pressed={mode === item.value}
                                className={cn("rounded px-2 py-1 text-[11px] transition-colors", mode === item.value ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground/70">
                    {mode === "reference" ? "默认模式：用角色、场景和分镜图作为参考，保持画面一致。" : "适合已经明确起止画面：选首帧（可选尾帧），按帧控制画面。"}
                </p>
                {limits.isSeedance ? (
                    <p className="text-[11px] leading-5 text-muted-foreground/70">
                        当前视频模型：{limits.label}（{videoModel || "未选择"}），支持 {limits.min}-{limits.max} 秒，参考图最多 {filmVideoReferenceLimit(videoModel)} 张；宽银幕会按 21:9 发送。
                    </p>
                ) : null}
                {durationIssue ? (
                    <div className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">
                        镜头时长 {shot.duration}s 超出{limits.label}范围（{limits.min}-{limits.max}s）。
                        <button
                            type="button"
                            className="ml-1 underline underline-offset-2"
                            onClick={() => onChange({ duration: adjustedDuration, videoSegments: createDefaultSegments(adjustedDuration) })}
                        >
                            调整为 {adjustedDuration}s 并重置分段
                        </button>
                    </div>
                ) : null}

                {mode === "reference" ? (
                    <div className="flex flex-wrap items-center gap-1">
                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">自动参考</span>
                        {characterNames.map((name) => <span key={name} className="chip">{name}</span>)}
                        {locationName ? <span className="chip">{locationName}</span> : null}
                        {shot.imageUrl ? <span className="chip">分镜图</span> : null}
                        {!characterNames.length && !locationName && !shot.imageUrl ? <span className="text-[11px] text-muted-foreground/60">还没有可用的参考图</span> : null}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <FrameSlot title="首帧" frame={shot.firstFrame} shot={shot} onSet={(frame) => setFrame("first", frame)} onUpload={() => triggerUpload("first")} />
                        <FrameSlot title="尾帧（可选）" frame={shot.lastFrame} shot={shot} onSet={(frame) => setFrame("last", frame)} onUpload={() => triggerUpload("last")} />
                    </div>
                )}
                <input ref={uploadRef} hidden type="file" accept="image/*" onChange={handleFile} />
            </div>

            <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视频总描述（可选）</span>
                <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    value={shot.videoPrompt || ""}
                    placeholder="整体动作或情绪补充，例如：全程保持压抑氛围"
                    onChange={(event) => onChange({ videoPrompt: event.target.value })}
                />
            </div>

            <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">分段时间轴</span>
                    <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{segments.length} 段 · {shot.duration}s</span>
                </div>
                <div className="flex gap-1">
                    {[...segments].sort((left, right) => left.start - right.start).map((segment) => (
                        <button
                            key={segment.id}
                            type="button"
                            onClick={() => setSelectedSegmentId(segment.id)}
                            style={{ flexGrow: Math.max(1, segment.end - segment.start) }}
                            className={cn(
                                "h-9 min-w-0 overflow-hidden rounded border px-1.5 font-mono text-[9px] transition-colors",
                                segment.id === selectedSegment?.id ? "border-acid/60 bg-acid/[0.08] text-acid" : "border-border/60 bg-card/50 text-muted-foreground/70 hover:border-border",
                            )}
                        >
                            {formatSeconds(segment.start)}-{formatSeconds(segment.end)}s
                        </button>
                    ))}
                </div>
                {selectedSegment ? (
                    <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">起点</span>
                            <InputNumber size="small" className="w-20" min={0} max={shot.duration} step={0.5} value={selectedSegment.start} onChange={(value) => updateSegment(selectedSegment.id, { start: Number(value) || 0 })} />
                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">终点</span>
                            <InputNumber size="small" className="w-20" min={0} max={shot.duration} step={0.5} value={selectedSegment.end} onChange={(value) => updateSegment(selectedSegment.id, { end: Number(value) || 0 })} />
                        </div>
                        <Input.TextArea
                            autoSize={{ minRows: 2, maxRows: 4 }}
                            value={selectedSegment.prompt}
                            placeholder="这一段时间里发生什么：动作、镜头、情绪、光效"
                            onChange={(event) => updateSegment(selectedSegment.id, { prompt: event.target.value })}
                        />
                    </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="small" onClick={applySplit} disabled={!selectedSegment}>拆分</Button>
                    <Button size="small" onClick={applyMerge} disabled={!selectedSegment || segments.findIndex((segment) => segment.id === selectedSegment.id) <= 0}>合并到前一段</Button>
                    <Button size="small" danger onClick={applyRemove} disabled={segments.length <= 1}>删除本段</Button>
                    <Button size="small" type="text" onClick={resetSegments}>按镜头时长重置</Button>
                </div>
                <p className={cn("text-[11px] leading-5", segmentError ? "text-hot" : "text-muted-foreground/70")}>
                    {segmentError || `需从 0 秒开始、连续覆盖到 ${shot.duration} 秒`}
                </p>
            </div>

            <details className="rounded-lg border border-border/60 bg-background/30 p-3">
                <summary className="cursor-pointer font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">最终提示词（自动拼装）</summary>
                <pre className="thin-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-foreground/75">{composedPrompt}</pre>
                <Button size="small" className="mt-2" onClick={() => copyText(composedPrompt, "提示词已复制")}>复制提示词</Button>
            </details>

            <div className="sticky bottom-0 z-10 grid gap-2 rounded-lg border border-border/60 bg-background/95 p-3 backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">分镜视频</span>
                    <Button
                        type={shot.videoUrl ? "default" : "primary"}
                        size="small"
                        loading={generating}
                        icon={<Clapperboard className="size-3.5" />}
                        onClick={() => {
                            if (generating) return;
                            if (generateBlockReason) {
                                message.warning(generateBlockReason);
                                return;
                            }
                            onGenerate();
                        }}
                    >
                        {generating ? `生成中 ${progress}%` : shot.videoUrl ? "重新生成" : "生成分镜视频"}
                    </Button>
                </div>
                {shot.errorMessage && !generating ? <p className="text-[11px] leading-5 text-hot">上次生成失败：{shot.errorMessage}</p> : null}
                {generateBlockReason ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] leading-5 text-hot">暂不能生成：{generateBlockReason}</p>
                        {durationIssue ? (
                            <Button size="small" onClick={() => onChange({ duration: adjustedDuration, videoSegments: createDefaultSegments(adjustedDuration) })}>调整为 {adjustedDuration}s</Button>
                        ) : null}
                        {segmentError ? (
                            <Button size="small" onClick={() => onChange({ videoSegments: createDefaultSegments(shot.duration) })}>重置分段</Button>
                        ) : null}
                    </div>
                ) : null}
                <div className="relative overflow-hidden rounded-md">
                    {videoSrc ? <video src={videoSrc} controls playsInline className={cn("w-full rounded-md border border-border/50 transition-opacity", generating && "opacity-60")} /> : null}
                    {generating ? (
                        <div className="absolute inset-0 grid place-items-center rounded-md border border-acid/40 bg-background/70 backdrop-blur-[2px]">
                            <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                                <Spin size="small" />
                                <span className="font-mono text-[10px] tracking-[0.14em] text-acid">生成中 {progress}%</span>
                                <span className="text-[10px] text-muted-foreground">正在调用视频模型，耗时取决于模型</span>
                            </div>
                        </div>
                    ) : !videoSrc ? (
                        <div className="grid place-items-center rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-3" style={{ aspectRatio: aspect ? filmAspectCssRatio(aspect) : "16 / 9" }}>
                            <p className="text-center text-[11px] leading-5 text-muted-foreground/70">还没有生成，配置好模式与分段后生成。</p>
                        </div>
                    ) : null}
                </div>
                {shot.videoVersions && shot.videoVersions.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-1">
                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">历史</span>
                        {shot.videoVersions.map((version, index) => {
                            const current = version.url === shot.videoUrl;
                            return (
                                <span key={version.id} className="group/version inline-flex items-center overflow-hidden rounded border border-border/60">
                                    <button
                                        type="button"
                                        title={`第 ${index + 1} 版 · ${version.createdAt ? new Date(version.createdAt).toLocaleTimeString("zh-CN", { hour12: false }) : ""}`}
                                        onClick={() => onChange({ videoUrl: version.url, videoStorageKey: version.storageKey || "", status: "video_ready", errorMessage: "" })}
                                        className={cn("px-1.5 py-0.5 font-mono text-[9px] transition-colors", current ? "text-acid" : "text-muted-foreground/70 hover:text-foreground")}
                                    >
                                        v{index + 1}
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function FrameSlot({ title, frame, shot, onSet, onUpload }: {
    title: string;
    frame?: FilmFrameSource;
    shot: FilmShot;
    onSet: (frame: FilmFrameSource | null) => void;
    onUpload: () => void;
}) {
    const versions = shot.imageVersions || [];
    const options = [
        ...(shot.imageUrl ? [{ value: "storyboard", label: "当前分镜图" }] : []),
        ...versions.map((version, index) => ({ value: version.id, label: `历史 v${index + 1}` })),
    ];
    const value = frame?.kind === "storyboard" ? "storyboard" : frame?.versionId;
    const handleSelect = (id?: string) => {
        if (!id) {
            onSet(null);
            return;
        }
        if (id === "storyboard") {
            onSet({ kind: "storyboard", url: shot.imageUrl || "", storageKey: shot.storageKey });
            return;
        }
        const version = versions.find((item) => item.id === id);
        if (version) onSet({ kind: "version", url: version.url, storageKey: version.storageKey, versionId: version.id });
    };
    return (
        <div className="grid gap-2 overflow-hidden rounded-md border border-border/60 bg-card/40 p-2">
            <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">{title}</span>
                {frame ? (
                    <button type="button" className="shrink-0 font-mono text-[9px] text-muted-foreground/60 transition-colors hover:text-hot" onClick={() => onSet(null)}>
                        清除
                    </button>
                ) : null}
            </div>
            <button type="button" className="relative block h-20 w-full overflow-hidden rounded border border-border/60 bg-background/40" onClick={frame ? undefined : onUpload} title={frame ? undefined : "上传图片"}>
                {frame ? (
                    <FilmImageThumbnail url={frame.url} storageKey={frame.storageKey} className="h-20 w-full" />
                ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground/40">
                        <ImageIcon className="size-4" aria-hidden />
                        <span className="text-[9px]">点击上传或选择分镜图</span>
                    </span>
                )}
            </button>
            <div className="flex items-center gap-1">
                <Select
                    size="small"
                    className="min-w-0 flex-1"
                    placeholder={options.length ? "选择参考帧" : "暂无分镜图"}
                    value={value}
                    options={options}
                    disabled={!options.length}
                    onChange={handleSelect}
                    allowClear={Boolean(frame)}
                />
                <button type="button" aria-label="上传图片" className="grid size-6 shrink-0 place-items-center rounded border border-border/60 text-muted-foreground/70 transition-colors hover:border-acid/50 hover:text-foreground" onClick={onUpload}>
                    <Upload className="size-3" />
                </button>
            </div>
        </div>
    );
}
