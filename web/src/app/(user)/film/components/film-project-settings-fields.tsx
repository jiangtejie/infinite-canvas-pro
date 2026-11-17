"use client";

import { Input, InputNumber, Select } from "antd";

import type { FilmAspect, FilmStylePresetId } from "@/lib/film/types";
import { FILM_ASPECT_OPTIONS, normalizeFilmAspect } from "@/lib/film/film-aspects";
import { FILM_STYLE_PRESETS, normalizeFilmStylePreset } from "@/lib/film/film-styles";
import { DIRECTOR_STYLES } from "@/lib/film/director-styles";

export type FilmProjectSettingsValue = {
    aspect: FilmAspect;
    stylePreset: FilmStylePresetId;
    visualStyle: string;
    directorStyleId: string;
    targetDuration: number | undefined;
};

/** 新建项目与项目设置共用的画幅/风格/导演风格/目标时长字段。 */
export function FilmProjectSettingsFields({ value, onChange }: { value: FilmProjectSettingsValue; onChange: (patch: Partial<FilmProjectSettingsValue>) => void }) {
    return (
        <>
            <label className="grid gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">画幅</span>
                <Select value={normalizeFilmAspect(value.aspect)} options={FILM_ASPECT_OPTIONS} onChange={(aspect: FilmAspect) => onChange({ aspect })} />
            </label>
            <label className="grid gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视觉风格预设</span>
                <Select
                    value={normalizeFilmStylePreset(value.stylePreset)}
                    options={FILM_STYLE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
                    onChange={(stylePreset: FilmStylePresetId) => onChange({ stylePreset })}
                />
            </label>
            <label className="grid gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">风格补充（可选）</span>
                <Input value={value.visualStyle} placeholder="例如：低饱和、冷色调、颗粒感" onChange={(event) => onChange({ visualStyle: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">导演风格</span>
                <Select
                    value={value.directorStyleId}
                    options={DIRECTOR_STYLES.map((style) => ({ value: style.id, label: `${style.name} · ${style.tagline}` }))}
                    onChange={(directorStyleId: string) => onChange({ directorStyleId })}
                />
                <span className="text-[11px] leading-5 text-muted-foreground/60">{DIRECTOR_STYLES.find((style) => style.id === value.directorStyleId)?.description || ""}</span>
            </label>
            <label className="grid gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">目标时长（可选）</span>
                <InputNumber className="!w-full" min={1} max={7200} placeholder="成片目标秒数，例如 180" addonAfter="秒" value={value.targetDuration} onChange={(targetDuration) => onChange({ targetDuration: typeof targetDuration === "number" ? targetDuration : undefined })} />
                <span className="text-[11px] leading-5 text-muted-foreground/60">用于预演校验总时长偏差；留空表示不校验。</span>
            </label>
        </>
    );
}