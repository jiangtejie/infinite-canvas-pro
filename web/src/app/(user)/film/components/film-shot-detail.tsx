"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from "lucide-react";
import { AutoComplete, Button, Image, Input, InputNumber, Select, Spin } from "antd";

import { cn } from "@/lib/utils";
import type { FilmAsset, FilmContinuitySheet, FilmInteractiveVariable, FilmShot, FilmShotBranch } from "@/lib/film/types";
import type { DirectorStyle } from "@/lib/film/director-styles";
import { checkShotStyle } from "../utils/film-style-check";
import { shotBranchList } from "../utils/film-branch";
import { FilmBranchRuleEditor } from "./film-branch-rule-editor";
import { useFilmImageUrl } from "../hooks/use-film-image-url";
import { useFilmContinuityCheck } from "../hooks/use-film-continuity-check";
import { filmAspectCssRatio } from "@/lib/film/film-aspects";
import { FILM_CAMERA_MOVEMENT_OPTIONS, FILM_SHOT_TYPE_OPTIONS } from "../utils/film-shot-types";
import { FILM_CONTINUITY_FIELDS } from "../utils/film-continuity-sheet";
import { FilmImageThumbnail } from "./film-asset-thumbnail";
import { FilmShotVideoPanel } from "./film-shot-video-panel";
import { WorkbenchCreditHint } from "@/components/workbench/credit-hint";
import { useEffectiveConfig } from "@/stores/use-config-store";

type FilmShotDetailProps = {
    shot: FilmShot;
    onChange: (patch: Partial<FilmShot>) => void;
    onDelete: () => void;
    onGenerate?: () => void;
    generating?: boolean;
    onGenerateVideo?: () => void;
    onStopVideo?: () => void;
    generatingVideo?: boolean;
    videoProgress?: number;
    characters?: FilmAsset[];
    locations?: FilmAsset[];
    onMove?: (direction: "up" | "down") => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onMoveToScene?: (sceneId: string) => void;
    sceneTargets?: Array<{ value: string; label: string }>;
    aspect?: string;
    styleText?: string;
    directorStyle?: DirectorStyle;
    onApplyStylePrompt?: () => void;
    branchTargets?: Array<{ id: string; label: string }>;
    variables?: FilmInteractiveVariable[];
};

export function FilmShotDetail({ shot, onChange, onDelete, onGenerate, generating, onGenerateVideo, onStopVideo, generatingVideo, videoProgress, characters = [], locations = [], onMove, canMoveUp, canMoveDown, onMoveToScene, sceneTargets = [], aspect, styleText = "", directorStyle, onApplyStylePrompt, branchTargets = [], variables = [] }: FilmShotDetailProps) {
    const imageSrc = useFilmImageUrl(shot.imageUrl, shot.storageKey);
    const { checkingShotId, checkShot } = useFilmContinuityCheck();
    const [tab, setTab] = useState<"basic" | "performance" | "image" | "video">("basic");
    const [continuityEditing, setContinuityEditing] = useState(false);
    const continuityCheck = shot.continuityCheck || "";
    const imageVersionsRef = useRef<HTMLDivElement>(null);
    const imageElapsed = useElapsedSeconds(Boolean(generating));
    const frameStyle = { aspectRatio: aspect ? filmAspectCssRatio(aspect) : "16 / 9" };
    const styleIssues = checkShotStyle(shot, directorStyle);
    const filmConfig = useEffectiveConfig();
    const updatePerformance = (patch: Partial<NonNullable<FilmShot["performance"]>>) => {
        onChange({ performance: { objective: "", emotion: "", subtext: "", bodyLanguage: "", intensity: 3, ...shot.performance, ...patch } });
    };
    const updateSoundDesign = (patch: Partial<NonNullable<FilmShot["soundDesign"]>>) => {
        onChange({ soundDesign: { ambience: "", sfx: "", music: "", dialogueTone: "", ...shot.soundDesign, ...patch } });
    };
    const branches = shotBranchList(shot);
    const updateBranches = (list: FilmShotBranch[]) => {
        const cleaned = list.filter((branch) => (branch.label || "").trim() || (branch.condition || "").trim() || branch.nextShotId);
        onChange({ branches: cleaned, branch: undefined });
    };
    const updateBranchAt = (index: number, patch: Partial<FilmShotBranch>) => {
        updateBranches(branches.map((branch, branchIndex) => branchIndex === index ? { ...branch, ...patch } : branch));
    };

    useEffect(() => {
        setContinuityEditing(false);
    }, [shot.id]);

    const updateContinuity = (patch: Partial<FilmContinuitySheet>) => {
        if (!shot.continuity) return;
        onChange({ continuity: { ...shot.continuity, ...patch }, continuityCheck: "" });
    };

    const handleContinuityCheck = async () => {
        const validation = await checkShot(shot);
        if (validation) onChange({ continuityCheck: validation });
    };

    const scrollImageVersions = (direction: -1 | 1) => {
        imageVersionsRef.current?.scrollBy({ left: direction * 150, behavior: "smooth" });
    };

    const removeImageVersion = (versionId: string) => {
        const versions = (shot.imageVersions || []).filter((version) => version.id !== versionId);
        const patch: Partial<FilmShot> = { imageVersions: versions };
        if (!versions.some((version) => version.url === shot.imageUrl)) {
            const fallback = versions[versions.length - 1];
            patch.imageUrl = fallback?.url || "";
            patch.storageKey = fallback?.storageKey || "";
        }
        onChange(patch);
    };

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center gap-0.5 border-b border-border/50 bg-background/85 px-4 py-2.5 backdrop-blur-xl">
                <TabButton active={tab === "basic"} onClick={() => setTab("basic")}>基础</TabButton>
                <TabButton active={tab === "performance"} onClick={() => setTab("performance")}>表演/声音</TabButton>
                <TabButton active={tab === "image"} onClick={() => setTab("image")}>
                    画面{shot.imageVersions && shot.imageVersions.length > 1 ? ` ${shot.imageVersions.length}` : ""}
                </TabButton>
                <TabButton active={tab === "video"} onClick={() => setTab("video")}>
                    视频{shot.videoVersions && shot.videoVersions.length > 1 ? ` ${shot.videoVersions.length}` : ""}
                </TabButton>
            </div>
            <div key={tab} className="film-stage-enter grid gap-3">
                {tab === "basic" ? (
                <>
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
                <p className="text-[11px] leading-5 text-muted-foreground/60">镜头状态由是否已有分镜图 / 视频自动派生，无需手动设置。</p>
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
                {directorStyle ? (
                    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">导演风格</span>
                            <span className="text-[11px] text-foreground/80">{directorStyle.name}</span>
                            {onApplyStylePrompt ? (
                                <Button size="small" type="text" className="!ml-auto !h-6 !px-1.5 !text-[10px]" onClick={onApplyStylePrompt}>
                                    应用风格提示
                                </Button>
                            ) : null}
                        </div>
                        <p className="text-[10px] leading-4 text-muted-foreground/70">{directorStyle.tagline}</p>
                        {styleIssues.map((issue) => (
                            <p key={issue.id} className="text-[10px] leading-4 text-amber-500">{issue.message}</p>
                        ))}
                    </div>
                ) : null}
                {shot.coverage || shot.composition || shot.lighting || shot.colorTone || shot.lens || shot.transition ? (
                    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">镜头语言</span>
                        <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground/80">
                            {shot.coverage ? <span className="rounded bg-muted/60 px-1.5 py-0.5">覆盖 · {shot.coverage}</span> : null}
                            {shot.lens ? <span className="rounded bg-muted/60 px-1.5 py-0.5">镜头 · {shot.lens}</span> : null}
                            {shot.composition ? <span className="rounded bg-muted/60 px-1.5 py-0.5">构图 · {shot.composition}</span> : null}
                            {shot.lighting ? <span className="rounded bg-muted/60 px-1.5 py-0.5">光线 · {shot.lighting}</span> : null}
                            {shot.colorTone ? <span className="rounded bg-muted/60 px-1.5 py-0.5">色彩 · {shot.colorTone}</span> : null}
                            {shot.transition ? <span className="rounded bg-muted/60 px-1.5 py-0.5">转场 · {shot.transition}</span> : null}
                        </div>
                    </div>
                ) : null}
                </>
                ) : null}
                {tab === "image" && onGenerate ? (
                    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">分镜图</span>
                            <Button type={shot.imageUrl ? "default" : "primary"} size="small" loading={generating} icon={<ImagePlus className="size-3.5" />} onClick={onGenerate}>
                                {shot.imageUrl ? "重新生成" : "生成分镜图"}
                            </Button>
                        </div>
                        <div className="flex justify-end text-[10px] text-muted-foreground/70"><WorkbenchCreditHint config={filmConfig} model={filmConfig.imageModel} mode="image" count={1} /></div>
                        <div className="relative overflow-hidden rounded-md">
                            {generating && !imageSrc ? <div className="w-full animate-pulse rounded-md border border-border/60 bg-foreground/[0.04]" style={frameStyle} /> : null}
                            {imageSrc ? <Image src={imageSrc} alt={`分镜 ${shot.shotNo}`} className={cn("w-full rounded-md transition-opacity", generating && "opacity-50")} preview={{ mask: "预览" }} /> : null}
                            {generating ? (
                                <div className="absolute inset-0 grid place-items-center rounded-md border border-acid/40 bg-background/70 backdrop-blur-[2px]">
                                    <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                                        <Spin size="small" />
                                        <span className="font-mono text-[10px] tracking-[0.14em] text-acid">生成中 · {imageElapsed}s</span>
                                        <span className="text-[10px] text-muted-foreground">正在调用图片模型，请稍候</span>
                                    </div>
                                </div>
                            ) : !imageSrc ? (
                                <div className="grid place-items-center rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-6" style={frameStyle}>
                                    <p className="text-center text-[11px] leading-5 text-muted-foreground/70">还没有生成，先补全画面描述或生成提示词。</p>
                                </div>
                            ) : null}
                        </div>
                        {shot.imageVersions && shot.imageVersions.length > 1 ? (
                            <div className="grid gap-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">
                                        历史版本 <span className="text-muted-foreground/40">{shot.imageVersions.length}</span>
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                        <button type="button" aria-label="向前翻版本" className="grid size-5 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={() => scrollImageVersions(-1)}>
                                            <ChevronLeft className="size-3" />
                                        </button>
                                        <button type="button" aria-label="向后翻版本" className="grid size-5 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={() => scrollImageVersions(1)}>
                                            <ChevronRight className="size-3" />
                                        </button>
                                    </div>
                                </div>
                                <div ref={imageVersionsRef} className="thin-scrollbar flex snap-x gap-1.5 overflow-x-auto pb-1">
                                    {shot.imageVersions.map((version, index) => {
                                        const current = version.url === shot.imageUrl;
                                        return (
                                            <div key={version.id} className="group/version relative shrink-0 snap-start">
                                                <button
                                                    type="button"
                                                    title={`第 ${index + 1} 版 · ${formatVersionTime(version.createdAt)}`}
                                                    onClick={() => onChange({ imageUrl: version.url, storageKey: version.storageKey || "", errorMessage: "" })}
                                                    className={cn("relative h-12 w-16 overflow-hidden rounded border transition-colors", current ? "border-acid" : "border-border/60 hover:border-acid/50")}
                                                >
                                                    <FilmImageThumbnail url={version.url} storageKey={version.storageKey} className="h-12 w-full" />
                                                    <span className="absolute left-0.5 top-0.5 rounded bg-background/80 px-1 font-mono text-[8px] text-foreground/80">v{index + 1}</span>
                                                    {current ? <span className="absolute bottom-0 right-0 rounded-tl bg-acid px-1 font-mono text-[8px] text-background">当前</span> : null}
                                                </button>
                                                {!current ? (
                                                    <button
                                                        type="button"
                                                        aria-label={`删除第 ${index + 1} 版`}
                                                        className="absolute -right-1 -top-1 hidden size-4 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-hot group-hover/version:grid"
                                                        onClick={() => removeImageVersion(version.id)}
                                                    >
                                                        <X className="size-2.5" />
                                                    </button>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {tab === "performance" ? (
                    <div className="grid gap-3">
                        <section className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">表演意图</span>
                            <Field label="目标（这场戏想要什么）">
                                <Input value={shot.performance?.objective || ""} placeholder="例如：留住对方" onChange={(event) => updatePerformance({ objective: event.target.value })} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="表层情绪">
                                    <Input value={shot.performance?.emotion || ""} placeholder="例如：克制" onChange={(event) => updatePerformance({ emotion: event.target.value })} />
                                </Field>
                                <Field label="强度（1-5）">
                                    <InputNumber className="w-full" min={1} max={5} value={shot.performance?.intensity ?? 3} onChange={(value) => updatePerformance({ intensity: Number(value) || 3 })} />
                                </Field>
                            </div>
                            <Field label="潜台词">
                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={shot.performance?.subtext || ""} placeholder="角色没有说出口的东西" onChange={(event) => updatePerformance({ subtext: event.target.value })} />
                            </Field>
                            <Field label="肢体 / 眼神">
                                <Input value={shot.performance?.bodyLanguage || ""} placeholder="例如：手指收紧，视线躲开" onChange={(event) => updatePerformance({ bodyLanguage: event.target.value })} />
                            </Field>
                        </section>
                        <section className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">声音设计</span>
                            <Field label="环境声">
                                <Input value={shot.soundDesign?.ambience || ""} placeholder="例如：雨声、远处车流" onChange={(event) => updateSoundDesign({ ambience: event.target.value })} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="音效">
                                    <Input value={shot.soundDesign?.sfx || ""} placeholder="例如：伞骨合拢" onChange={(event) => updateSoundDesign({ sfx: event.target.value })} />
                                </Field>
                                <Field label="音乐">
                                    <Input value={shot.soundDesign?.music || ""} placeholder="例如：低频弦乐" onChange={(event) => updateSoundDesign({ music: event.target.value })} />
                                </Field>
                            </div>
                            <Field label="台词语气">
                                <Input value={shot.soundDesign?.dialogueTone || ""} placeholder="例如：压低、停顿" onChange={(event) => updateSoundDesign({ dialogueTone: event.target.value })} />
                            </Field>
                        </section>
                        <section className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">互动分支（可选）</span>
                                <Button size="small" type="text" className="!ml-auto !h-6 !px-2 !text-[10px]" icon={<span className="text-sm leading-none">+</span>} onClick={() => updateBranches([...branches, { label: "新分支", condition: "" }])}>添加分支</Button>
                            </div>
                            {!branches.length ? <p className="text-[10px] leading-4 text-muted-foreground/60">普通镜头留空即可；多结局项目在这里添加多个选项，预演时会出现分支选择。</p> : null}
                            {branches.map((branch, index) => (
                                <div key={index} className="grid gap-2 rounded-md border border-border/50 bg-background/40 p-2">
                                    <div className="flex items-center gap-2">
                                        <Input size="small" className="flex-1" value={branch.label} placeholder="分支标签，例如：跟上去" onChange={(event) => updateBranchAt(index, { label: event.target.value })} />
                                        <Select size="small" allowClear className="!w-44" placeholder="目标镜头" value={branch.nextShotId} options={branchTargets.map((target) => ({ value: target.id, label: target.label }))} onChange={(value?: string) => updateBranchAt(index, { nextShotId: value })} />
                                        <Button size="small" type="text" className="!size-7 !min-w-7 !px-0" icon={<Trash2 className="size-3" />} onClick={() => updateBranches(branches.filter((_, branchIndex) => branchIndex !== index))} />
                                    </div>
                                    <Input size="small" value={branch.condition} placeholder="条件说明（可选），例如：观众选择相信阿青" onChange={(event) => updateBranchAt(index, { condition: event.target.value })} />
                                    <FilmBranchRuleEditor branch={branch} variables={variables} onChange={(patch) => updateBranchAt(index, patch)} />
                                </div>
                            ))}
                            <p className="text-[10px] leading-4 text-muted-foreground/60">分支用于标注、分支总览和预演试走；播放器会按选择的选项跳到目标镜头。</p>
                        </section>
                    </div>
                ) : null}
                {tab === "video" && onGenerateVideo ? (
                    <FilmShotVideoPanel
                        shot={shot}
                        onChange={onChange}
                        onGenerate={onGenerateVideo}
                        onStop={onStopVideo}
                        generating={Boolean(generatingVideo)}
                        progress={videoProgress ?? 0}
                        aspect={aspect}
                        styleText={styleText}
                        characters={characters}
                        locations={locations}
                    />
                ) : null}
                {tab === "basic" ? (
                <>
                {shot.errorMessage ? <p className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">{shot.errorMessage}</p> : null}
                {shot.continuity || continuityCheck ? (
                    <div className="grid gap-2 rounded-lg border border-acid/25 bg-acid/[0.04] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-acid uppercase">{shot.continuity ? `场记交接单 ${shot.continuity.version}` : "场记校验"}</span>
                            <div className="flex items-center gap-1">
                                <Button size="small" type="text" title="使用当前文本模型对生成图做视觉校验，需要模型支持图片输入" loading={checkingShotId === shot.id} disabled={!shot.imageUrl} onClick={() => void handleContinuityCheck()}>
                                    AI 校验
                                </Button>
                                {shot.continuity ? (
                                    <Button size="small" type="text" onClick={() => setContinuityEditing((value) => !value)}>
                                        {continuityEditing ? "完成" : "编辑"}
                                    </Button>
                                ) : null}
                                <Button size="small" type="text" danger onClick={() => onChange({ continuity: undefined, continuityCheck: "" })}>
                                    清除
                                </Button>
                            </div>
                        </div>
                        {continuityCheck ? (
                            <p className={cn("text-[11px] leading-5", continuityCheck.startsWith("通过") ? "text-acid" : "text-hot")}>校验结果：{continuityCheck}</p>
                        ) : null}
                        {shot.continuity ? (
                            continuityEditing ? (
                                <div className="grid gap-2">
                                    {FILM_CONTINUITY_FIELDS.map((field) => (
                                        <label key={field.key} className="grid gap-1">
                                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{field.label}</span>
                                            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={shot.continuity?.[field.key] || ""} onChange={(event) => updateContinuity({ [field.key]: event.target.value } as Partial<FilmContinuitySheet>)} />
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {FILM_CONTINUITY_FIELDS.map((field) => <ContinuityRow key={field.key} label={field.label} value={shot.continuity?.[field.key] || ""} />)}
                                </>
                            )
                        ) : (
                            <p className="text-[11px] leading-5 text-muted-foreground/70">还没有场记交接单，可以回到剧情页做「AI 场记分析」，或直接 AI 校验。</p>
                        )}
                    </div>
                ) : null}
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
                </>
                ) : null}
            </div>
        </div>
    );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn("inline-flex flex-1 items-center justify-center rounded px-2 py-1 text-[11px] transition-colors [@media(pointer:coarse)]:min-h-9", active ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}
        >
            {children}
        </button>
    );
}

function ContinuityRow({ label, value }: { label: string; value: string }) {
    if (!value) return null;
    return (
        <div className="grid gap-0.5">
            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{label}</span>
            <span className="text-[11px] leading-5 text-foreground/80">{value}</span>
        </div>
    );
}

function useElapsedSeconds(active: boolean) {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        if (!active) {
            setSeconds(0);
            return;
        }
        const startedAt = Date.now();
        setSeconds(0);
        const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [active]);
    return seconds;
}

function formatVersionTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour12: false });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">{label}</span>
            {children}
        </div>
    );
}
