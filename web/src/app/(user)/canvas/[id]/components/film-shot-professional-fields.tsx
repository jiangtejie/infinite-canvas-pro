"use client";

import { useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import {
    FILM_BODY_LANGUAGE_OPTIONS,
    FILM_COLOR_TONE_OPTIONS,
    FILM_COMPOSITION_OPTIONS,
    FILM_COVERAGE_OPTIONS,
    FILM_DIALOGUE_TONE_OPTIONS,
    FILM_LENS_OPTIONS,
    FILM_LIGHTING_OPTIONS,
    FILM_MUSIC_OPTIONS,
    FILM_PERFORMANCE_EMOTION_OPTIONS,
    FILM_SOUND_AMBIENCE_OPTIONS,
    FILM_SOUND_SFX_OPTIONS,
} from "@/app/(user)/film/utils/film-shot-types";
import type { FilmPerformance, FilmSoundDesign } from "@/lib/film/types";
import type { FilmShotNodeData } from "../../types";
import { FilmOptionControl } from "./film-shot-basic-controls";

type ProfessionalTab = "visual" | "performance" | "sound" | "continuity" | "prompts";

const TABS: Array<[ProfessionalTab, string]> = [
    ["visual", "影像"],
    ["performance", "表演"],
    ["sound", "声音"],
    ["continuity", "连续性"],
    ["prompts", "提示词"],
];

export function FilmShotProfessionalFields({ theme, payload, onUpdate, variant = "table", onClose }: {
    theme: CanvasTheme;
    payload?: FilmShotNodeData;
    onUpdate: (patch: Partial<FilmShotNodeData>) => void;
    variant?: "table" | "panel";
    onClose?: () => void;
}) {
    const [activeTab, setActiveTab] = useState<ProfessionalTab>("visual");
    const performance = payload?.performance;
    const sound = payload?.soundDesign;
    const continuity = payload?.continuity;
    const isTable = variant === "table";
    const optionStyle = { borderColor: theme.node.stroke, color: theme.node.text };
    const updatePerformance = (patch: Partial<FilmPerformance>) => onUpdate({ performance: { objective: "", emotion: "", subtext: "", bodyLanguage: "", intensity: 3, ...performance, ...patch } });
    const updateSound = (patch: Partial<FilmSoundDesign>) => onUpdate({ soundDesign: { ambience: "", sfx: "", music: "", dialogueTone: "", ...sound, ...patch } });
    const continuityFields: Array<[string, string | undefined]> = [
        ["上一帧", continuity?.prevFrameSummary],
        ["下一帧要求", continuity?.nextFrameRequirement],
        ["角色状态", continuity?.characterState],
        ["道具状态", continuity?.propState],
        ["环境", continuity?.environment],
        ["镜头参数", continuity?.cameraParams],
        ["音频状态", continuity?.audioState],
        ["情绪叙事", continuity?.emotionNarrative],
        ["风险", continuity?.risks],
        ["禁止项", continuity?.forbidden],
        ["参考资产", continuity?.referenceAssets],
    ];
    const filledContinuity = continuityFields.filter((item): item is [string, string] => Boolean(item[1]));

    const visualFields = (
        <>
            <DetailField theme={theme} label="构图"><FilmOptionControl variant="compact" options={FILM_COMPOSITION_OPTIONS} value={payload?.composition || ""} style={optionStyle} ariaLabel="构图" placeholder="三分法 / 对称 / 框中框" onChange={(value) => onUpdate({ composition: value })} /></DetailField>
            <DetailField theme={theme} label="光线"><FilmOptionControl variant="compact" options={FILM_LIGHTING_OPTIONS} value={payload?.lighting || ""} style={optionStyle} ariaLabel="光线" placeholder="侧光 / 逆光 / 顶光" onChange={(value) => onUpdate({ lighting: value })} /></DetailField>
            <DetailField theme={theme} label="色彩"><FilmOptionControl variant="compact" options={FILM_COLOR_TONE_OPTIONS} value={payload?.colorTone || ""} style={optionStyle} ariaLabel="色彩" placeholder="冷调 / 暖调 / 低饱和" onChange={(value) => onUpdate({ colorTone: value })} /></DetailField>
            <DetailField theme={theme} label="焦段"><FilmOptionControl variant="compact" options={FILM_LENS_OPTIONS} value={payload?.lens || ""} style={optionStyle} ariaLabel="焦段" placeholder="35mm / 85mm / 浅景深" onChange={(value) => onUpdate({ lens: value })} /></DetailField>
        </>
    );
    const performanceFields = (
        <>
            <DetailField theme={theme} label="目标"><DetailInput theme={theme} value={performance?.objective || ""} placeholder="角色这场戏想达成什么" onChange={(value) => updatePerformance({ objective: value })} /></DetailField>
            <DetailField theme={theme} label="情绪"><FilmOptionControl variant="compact" options={FILM_PERFORMANCE_EMOTION_OPTIONS} value={performance?.emotion || ""} style={optionStyle} ariaLabel="情绪" placeholder="克制 / 惊慌 / 压抑" onChange={(value) => updatePerformance({ emotion: value })} /></DetailField>
            <DetailField theme={theme} label="潜台词"><DetailInput theme={theme} value={performance?.subtext || ""} onChange={(value) => updatePerformance({ subtext: value })} /></DetailField>
            <DetailField theme={theme} label="肢体"><FilmOptionControl variant="compact" options={FILM_BODY_LANGUAGE_OPTIONS} value={performance?.bodyLanguage || ""} style={optionStyle} ariaLabel="肢体" placeholder="动作、走位与身体状态" onChange={(value) => updatePerformance({ bodyLanguage: value })} /></DetailField>
            <DetailField theme={theme} label="强度">
                <input type="number" min={1} max={5} className="w-16 rounded-md border bg-transparent px-2 py-1 text-xs outline-none tabular-nums" style={{ borderColor: theme.node.stroke, color: theme.node.text }} value={performance?.intensity ?? 3} onChange={(event) => updatePerformance({ intensity: Math.max(1, Math.min(5, Number(event.target.value) || 1)) })} aria-label="表演强度" />
            </DetailField>
        </>
    );
    const soundFields = (
        <>
            <DetailField theme={theme} label="声音参考"><DetailInput theme={theme} value={payload?.audio || ""} placeholder="参考音频、音色或声音说明" onChange={(value) => onUpdate({ audio: value })} /></DetailField>
            <DetailField theme={theme} label="环境声"><FilmOptionControl variant="compact" options={FILM_SOUND_AMBIENCE_OPTIONS} value={sound?.ambience || ""} style={optionStyle} ariaLabel="环境声" placeholder="雨声 / 街道底噪" onChange={(value) => updateSound({ ambience: value })} /></DetailField>
            <DetailField theme={theme} label="音效"><FilmOptionControl variant="compact" options={FILM_SOUND_SFX_OPTIONS} value={sound?.sfx || ""} style={optionStyle} ariaLabel="音效" placeholder="脚步 / 关门 / 金属摩擦" onChange={(value) => updateSound({ sfx: value })} /></DetailField>
            <DetailField theme={theme} label="音乐"><FilmOptionControl variant="compact" options={FILM_MUSIC_OPTIONS} value={sound?.music || ""} style={optionStyle} ariaLabel="音乐" placeholder="无音乐 / 钢琴 / 弦乐" onChange={(value) => updateSound({ music: value })} /></DetailField>
            <DetailField theme={theme} label="台词语气"><FilmOptionControl variant="compact" options={FILM_DIALOGUE_TONE_OPTIONS} value={sound?.dialogueTone || ""} style={optionStyle} ariaLabel="台词语气" placeholder="低声 / 压怒 / 气声" onChange={(value) => updateSound({ dialogueTone: value })} /></DetailField>
        </>
    );
    const continuityContent = (
        <>
            <DetailField theme={theme} label="叙事覆盖"><FilmOptionControl variant="compact" options={FILM_COVERAGE_OPTIONS} value={payload?.coverage || ""} style={optionStyle} ariaLabel="叙事覆盖" placeholder="建立 / 反应 / 细节 / 关系 / 过渡" onChange={(value) => onUpdate({ coverage: value })} /></DetailField>
            <DetailField theme={theme} label="连续性检查"><DetailTextArea theme={theme} value={payload?.continuityCheck || ""} placeholder="连续性结论或需要注意的风险" onChange={(value) => onUpdate({ continuityCheck: value })} /></DetailField>
            {filledContinuity.length ? (
                <div className="col-span-full grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-3" style={{ borderColor: theme.node.stroke }}>
                    {filledContinuity.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                            <span className="text-[10px]" style={{ color: theme.node.muted }}>{label}</span>
                            <div className="truncate text-[11px]" title={value} style={{ color: theme.node.text }}>{value}</div>
                        </div>
                    ))}
                </div>
            ) : <span className="col-span-full text-[11px]" style={{ color: theme.node.muted }}>暂无连续性记录</span>}
        </>
    );
    const promptFields = (
        <>
            <div className="col-span-full text-[11px] leading-5" style={{ color: theme.node.muted }}>结构化字段会自动编译进提示词；这里只写无法归入字段的动作或意图补充。</div>
            <DetailField theme={theme} label="创作补充"><DetailTextArea theme={theme} rows={4} value={payload?.prompt || ""} onChange={(value) => onUpdate({ prompt: value })} /></DetailField>
            <DetailField theme={theme} label="负面提示词"><DetailTextArea theme={theme} rows={4} value={payload?.negativePrompt || ""} onChange={(value) => onUpdate({ negativePrompt: value })} /></DetailField>
            <DetailField theme={theme} label="动作补充（视频）"><DetailTextArea theme={theme} rows={4} value={payload?.videoPrompt || ""} onChange={(value) => onUpdate({ videoPrompt: value })} /></DetailField>
        </>
    );
    const activeFields = activeTab === "visual" ? visualFields : activeTab === "performance" ? performanceFields : activeTab === "sound" ? soundFields : activeTab === "continuity" ? continuityContent : promptFields;

    return (
        <div className={isTable ? "border-b" : "flex flex-col gap-4"} style={isTable ? { borderColor: theme.node.stroke, background: theme.node.fill } : undefined}>
            {isTable ? (
                <>
                    <div className="flex items-center justify-between gap-3 border-b px-4 py-2" style={{ borderColor: theme.node.stroke }}>
                        <span className="text-xs font-medium" style={{ color: theme.node.text }}>镜头 {payload?.shotNo || "—"} · 专业设置</span>
                        {onClose ? <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px]" style={{ color: theme.node.muted }} onClick={onClose} aria-label="收起专业详情"><ChevronUp className="size-3.5" />收起</button> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 border-b px-4 py-1.5" style={{ borderColor: theme.node.stroke }}>
                        {TABS.map(([value, label]) => (
                            <button key={value} type="button" className="rounded-md px-2.5 py-1 text-[11px] transition-colors" style={{ background: activeTab === value ? theme.canvas.selectionSoft : undefined, color: activeTab === value ? theme.node.text : theme.node.muted }} onClick={() => setActiveTab(value)} aria-pressed={activeTab === value}>{label}</button>
                        ))}
                    </div>
                    <div className={activeTab === "prompts" ? "grid gap-3 px-4 py-3 md:grid-cols-3" : activeTab === "visual" ? "grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-4" : "grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-3"}>{activeFields}</div>
                </>
            ) : (
                <>
                    <DetailGroup theme={theme} title="影像设计">{visualFields}</DetailGroup>
                    <DetailGroup theme={theme} title="表演">{performanceFields}</DetailGroup>
                    <DetailGroup theme={theme} title="声音设计">{soundFields}</DetailGroup>
                    <DetailGroup theme={theme} title="连续性与结构">{continuityContent}</DetailGroup>
                </>
            )}
        </div>
    );
}

function DetailGroup({ theme, title, children }: { theme: CanvasTheme; title: string; children: ReactNode }) {
    return (
        <section className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{title}</span>
            {children}
        </section>
    );
}

function DetailField({ theme, label, children }: { theme: CanvasTheme; label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: theme.node.muted }}>{label}</span>
            {children}
        </label>
    );
}

function DetailInput({ theme, value, onChange, placeholder }: { theme: CanvasTheme; value: string; onChange: (value: string) => void; placeholder?: string }) {
    return <input className="w-full rounded-md border bg-transparent px-2 py-1 text-xs outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />;
}

function DetailTextArea({ theme, value, onChange, placeholder, rows = 2 }: { theme: CanvasTheme; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
    return <textarea rows={rows} className="thin-scrollbar w-full resize-y rounded-md border bg-transparent px-2 py-1 text-xs leading-5 outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />;
}
