"use client";

import { useEffect, useState } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { DIRECTOR_STYLES } from "@/lib/film/director-styles";
import { usePrompt } from "@/components/ui/confirm-dialog";
import type { FilmAnalysisOptions } from "../../types";
import { useFilmAnalysisPresetStore } from "@/stores/use-film-analysis-preset-store";

type Props = {
    theme: CanvasTheme;
    scriptNodeId: string;
    lastOptions?: FilmAnalysisOptions;
};

const PACING_LABELS = { fast: "快节奏", normal: "常规", slow: "慢节奏" } as const;
const DENSITY_LABELS = { sparse: "稀疏", normal: "常规", dense: "密集" } as const;

function sameOptions(left: FilmAnalysisOptions, right: FilmAnalysisOptions) {
    return left.pacing === right.pacing
        && left.shotDensity === right.shotDensity
        && left.targetDuration === right.targetDuration
        && left.directorStyleId === right.directorStyleId
        && (left.extractAssets !== false) === (right.extractAssets !== false);
}

/** 分析参数与预设：项目最近一次参数优先带出，预设保存在账号本地。 */
export function FilmAnalysisPresetBar({ theme, scriptNodeId, lastOptions }: Props) {
    const presets = useFilmAnalysisPresetStore((state) => state.presets);
    const defaultPresetId = useFilmAnalysisPresetStore((state) => state.defaultPresetId);
    const options = useFilmAnalysisPresetStore((state) => state.options);
    const setOptions = useFilmAnalysisPresetStore((state) => state.setOptions);
    const replaceOptions = useFilmAnalysisPresetStore((state) => state.replaceOptions);
    const selectPreset = useFilmAnalysisPresetStore((state) => state.selectPreset);
    const savePreset = useFilmAnalysisPresetStore((state) => state.savePreset);
    const setDefaultPreset = useFilmAnalysisPresetStore((state) => state.setDefaultPreset);
    const prompt = usePrompt();
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        if (lastOptions) replaceOptions(lastOptions);
    }, [lastOptions, replaceOptions, scriptNodeId]);
    const activePreset = presets.find((preset) => sameOptions(preset.options, options));
    const inputStyle = { background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke };
    const save = async () => {
        const name = await prompt({
            title: "保存分析预设",
            description: "保存当前节奏、镜头密度、目标时长、导演风格与资产提取设置。",
            placeholder: "预设名称",
            confirmText: "保存",
        });
        if (name?.trim()) savePreset(name);
    };
    return (
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px]" style={{ color: theme.node.muted }}>分析预设</span>
                <select className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={activePreset?.id ?? ""} onChange={(event) => selectPreset(event.target.value || null)} aria-label="选择分析预设">
                    <option value="">自定义参数</option>
                    {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}{defaultPresetId === preset.id ? "（默认）" : ""}</option>)}
                </select>
                <button type="button" className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起参数" : "参数"}</button>
                <button type="button" className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => void save()}>保存预设</button>
                {activePreset && defaultPresetId !== activePreset.id ? <button type="button" className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => setDefaultPreset(activePreset.id)}>设为默认</button> : null}
                <span className="ml-auto text-[10px]" style={{ color: theme.node.muted }}>{PACING_LABELS[options.pacing ?? "normal"]} · {DENSITY_LABELS[options.shotDensity ?? "normal"]} · {options.targetDuration ? `目标 ${options.targetDuration}s` : "项目时长"} · {options.extractAssets === false ? "不提取资产" : "提取资产"}</span>
            </div>
            {expanded ? (
                <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>节奏
                        <select className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={options.pacing ?? "normal"} onChange={(event) => setOptions({ pacing: event.target.value as FilmAnalysisOptions["pacing"] })}>
                            {Object.entries(PACING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>镜头密度
                        <select className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={options.shotDensity ?? "normal"} onChange={(event) => setOptions({ shotDensity: event.target.value as FilmAnalysisOptions["shotDensity"] })}>
                            {Object.entries(DENSITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>目标时长（秒）
                        <input type="number" min={0} className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={options.targetDuration ?? ""} placeholder="沿用项目设置" onChange={(event) => setOptions({ targetDuration: event.target.value ? Math.max(0, Number(event.target.value)) : undefined })} />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px]" style={{ color: theme.node.muted }}>导演风格
                        <select className="rounded border px-2 py-1 text-[11px]" style={inputStyle} value={options.directorStyleId ?? ""} onChange={(event) => setOptions({ directorStyleId: event.target.value || undefined })}>
                            <option value="">沿用项目风格</option>
                            {DIRECTOR_STYLES.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 text-[11px]" style={{ color: theme.node.text }}>
                        <input type="checkbox" checked={options.extractAssets !== false} onChange={(event) => setOptions({ extractAssets: event.target.checked })} />提取角色/场景/道具资产
                    </label>
                </div>
            ) : null}
        </div>
    );
}
