"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Clapperboard, ImagePlus, Trash2 } from "lucide-react";
import { AutoComplete, Button, Image, Input, InputNumber, Select } from "antd";

import { cn } from "@/lib/utils";
import type { FilmAsset, FilmShot, FilmShotStatus } from "../types";
import { useFilmImageUrl, useFilmVideoUrl } from "../hooks/use-film-image-url";
import { FILM_CAMERA_MOVEMENT_OPTIONS, FILM_SHOT_TYPE_OPTIONS } from "../utils/film-shot-types";
import { FilmImageThumbnail } from "./film-asset-thumbnail";

const STATUS_OPTIONS: Array<{ value: FilmShotStatus; label: string }> = [
    { value: "idle", label: "未开始" },
    { value: "image_ready", label: "分镜图已生成" },
    { value: "video_ready", label: "视频已生成" },
    { value: "failed", label: "失败" },
];

type FilmShotDetailProps = {
    shot: FilmShot;
    onChange: (patch: Partial<FilmShot>) => void;
    onDelete: () => void;
    onGenerate?: () => void;
    generating?: boolean;
    onGenerateVideo?: () => void;
    generatingVideo?: boolean;
    videoProgress?: number;
    characters?: FilmAsset[];
    locations?: FilmAsset[];
    onMove?: (direction: "up" | "down") => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onMoveToScene?: (sceneId: string) => void;
    sceneTargets?: Array<{ value: string; label: string }>;
};

export function FilmShotDetail({ shot, onChange, onDelete, onGenerate, generating, onGenerateVideo, generatingVideo, videoProgress, characters = [], locations = [], onMove, canMoveUp, canMoveDown, onMoveToScene, sceneTargets = [] }: FilmShotDetailProps) {
    const imageSrc = useFilmImageUrl(shot.imageUrl, shot.storageKey);
    const videoSrc = useFilmVideoUrl(shot.videoUrl, shot.videoStorageKey);
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="镜号">
                        <Input value={shot.shotNo} placeholder="1-1-01" onChange={(event) => onChange({ shotNo: event.target.value })} />
                    </Field>
                    <Field label="景别">
                        <Select allowClear placeholder="未设置" value={shot.shotType || undefined} options={FILM_SHOT_TYPE_OPTIONS} onChange={(value) => onChange({ shotType: value ?? "" })} />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="运镜">
                        <AutoComplete
                            allowClear
                            placeholder="例如：缓慢横移"
                            value={shot.cameraMovement || ""}
                            options={FILM_CAMERA_MOVEMENT_OPTIONS.map((value) => ({ value }))}
                            onChange={(value) => onChange({ cameraMovement: value })}
                        />
                    </Field>
                    <Field label="时长（秒）">
                        <InputNumber className="w-full" min={1} max={120} value={shot.duration} onChange={(value) => onChange({ duration: Number(value) || 5 })} />
                    </Field>
                </div>
                <Field label="状态">
                    <Select value={shot.status} options={STATUS_OPTIONS} onChange={(value: FilmShotStatus) => onChange({ status: value })} />
                </Field>
                {characters.length || locations.length ? (
                    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">参考对象</span>
                        {characters.length ? (
                            <div className="grid gap-1">
                                <span className="text-[11px] text-muted-foreground/70">出场角色</span>
                                <Select
                                    mode="multiple"
                                    size="small"
                                    allowClear
                                    placeholder="选择角色，生成时作为参考图"
                                    value={shot.characterIds ?? []}
                                    options={characters.map((character) => ({ value: character.id, label: character.name }))}
                                    onChange={(value: string[]) => onChange({ characterIds: value })}
                                />
                            </div>
                        ) : null}
                        {locations.length ? (
                            <div className="grid gap-1">
                                <span className="text-[11px] text-muted-foreground/70">场景</span>
                                <Select
                                    size="small"
                                    allowClear
                                    placeholder="选择场景"
                                    value={shot.locationId || undefined}
                                    options={locations.map((location) => ({ value: location.id, label: location.name }))}
                                    onChange={(value: string) => onChange({ locationId: value || "" })}
                                />
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {onGenerate ? (
                    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">分镜图</span>
                            <Button type={shot.imageUrl ? "default" : "primary"} size="small" loading={generating} icon={<ImagePlus className="size-3.5" />} onClick={onGenerate}>
                                {shot.imageUrl ? "重新生成" : "生成分镜图"}
                            </Button>
                        </div>
                        {imageSrc ? (
                            <Image src={imageSrc} alt={`分镜 ${shot.shotNo}`} className="w-full rounded-md" preview={{ mask: "预览" }} />
                        ) : (
                            <p className="text-[11px] leading-5 text-muted-foreground/70">还没有生成，先补全画面描述或生成提示词。</p>
                        )}
                        {shot.imageVersions && shot.imageVersions.length > 1 ? (
                            <div className="grid gap-1">
                                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">历史版本</span>
                                <div className="thin-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
                                    {shot.imageVersions.map((version, index) => (
                                        <button
                                            key={version.id}
                                            type="button"
                                            title={`第 ${index + 1} 版`}
                                            onClick={() => onChange({ imageUrl: version.url, storageKey: version.storageKey || "", status: "image_ready", errorMessage: "" })}
                                            className={cn("relative h-12 w-16 shrink-0 overflow-hidden rounded border transition-colors", version.url === shot.imageUrl ? "border-acid" : "border-border/60 hover:border-acid/50")}
                                        >
                                            <FilmImageThumbnail url={version.url} storageKey={version.storageKey} className="h-12 w-full" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {onGenerateVideo ? (
                    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">分镜视频</span>
                            <Button
                                type={shot.videoUrl ? "default" : "primary"}
                                size="small"
                                loading={generatingVideo}
                                icon={<Clapperboard className="size-3.5" />}
                                onClick={onGenerateVideo}
                            >
                                {shot.videoUrl ? "重新生成" : generatingVideo ? `生成中 ${videoProgress ?? 0}%` : "生成分镜视频"}
                            </Button>
                        </div>
                        {videoSrc ? (
                            <video src={videoSrc} controls playsInline className="w-full rounded-md border border-border/50" />
                        ) : (
                            <p className="text-[11px] leading-5 text-muted-foreground/70">还没有生成；有分镜图时会自动作为首帧。</p>
                        )}
                        {shot.videoVersions && shot.videoVersions.length > 1 ? (
                            <div className="flex flex-wrap items-center gap-1">
                                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">历史</span>
                                {shot.videoVersions.map((version, index) => (
                                    <button
                                        key={version.id}
                                        type="button"
                                        onClick={() => onChange({ videoUrl: version.url, videoStorageKey: version.storageKey || "", status: "video_ready", errorMessage: "" })}
                                        className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] transition-colors", version.url === shot.videoUrl ? "border-acid text-acid" : "border-border/60 text-muted-foreground/70 hover:border-acid/50")}
                                    >
                                        视频 {index + 1}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {shot.errorMessage ? <p className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">{shot.errorMessage}</p> : null}
                <Field label="画面描述">
                    <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} value={shot.description} placeholder="这个镜头里发生什么、人物动作、环境、光线" onChange={(event) => onChange({ description: event.target.value })} />
                </Field>
                <Field label="声音 / 台词">
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={shot.dialogue} placeholder="角色：台词，或旁白" onChange={(event) => onChange({ dialogue: event.target.value })} />
                </Field>
                <Field label="音效 / 环境声">
                    <Input value={shot.audio} placeholder="环境声、音效、BGM 提示" onChange={(event) => onChange({ audio: event.target.value })} />
                </Field>
                <Field label="生成提示词">
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={shot.prompt} placeholder="用于生图 / 生视频的完整提示词" onChange={(event) => onChange({ prompt: event.target.value })} />
                    <button type="button" className="mt-1 w-fit font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-acid" onClick={() => onChange({ prompt: shot.description })}>
                        用画面描述填充
                    </button>
                </Field>
                {onMove || onMoveToScene ? (
                    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">位置</span>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="small" icon={<ArrowUp className="size-3.5" />} disabled={!canMoveUp} onClick={() => onMove?.("up")}>上移</Button>
                            <Button size="small" icon={<ArrowDown className="size-3.5" />} disabled={!canMoveDown} onClick={() => onMove?.("down")}>下移</Button>
                            {onMoveToScene && sceneTargets.length ? (
                                <Select
                                    size="small"
                                    className="min-w-40 flex-1"
                                    placeholder="移动到其他场"
                                    value={undefined}
                                    options={sceneTargets}
                                    onChange={(value: string) => onMoveToScene(value)}
                                />
                            ) : null}
                        </div>
                    </div>
                ) : null}
                <div className="pt-1">
                    <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
                        删除分镜
                    </Button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">{label}</span>
            {children}
        </div>
    );
}
