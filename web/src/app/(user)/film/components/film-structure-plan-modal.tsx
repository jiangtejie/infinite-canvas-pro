"use client";

import { useEffect, useState } from "react";
import { Button, Input, InputNumber, Modal, Select } from "antd";
import { Clock3, ListTree, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";

import type { FilmStructurePlan } from "@/lib/film/types";

const BEAT_TYPES = ["信息", "冲突", "转折", "情绪", "悬念"];
const COVERAGE_OPTIONS = ["建立镜头", "人物反应", "细节插入", "关系镜头", "过渡镜头", "情绪镜头"].map((value) => ({ value, label: value }));

function clonePlan(plan: FilmStructurePlan): FilmStructurePlan {
    return JSON.parse(JSON.stringify(plan)) as FilmStructurePlan;
}

export function FilmStructurePlanModal({ open, plan, generating, regeneratingScene = null, characterNames = [], onClose, onGenerate, onChange, onRegenerateScene }: { open: boolean; plan?: FilmStructurePlan; generating: boolean; regeneratingScene?: number | null; characterNames?: string[]; onClose: () => void; onGenerate: () => void; onChange: (plan: FilmStructurePlan) => void; onRegenerateScene?: (index: number) => void }) {
    const scenes = plan?.scenes || [];
    const estimated = scenes.reduce((sum, scene) => sum + scene.estimatedDuration, 0);
    const [draft, setDraft] = useState<FilmStructurePlan | null>(null);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (!open) return;
        setEditing(false);
        setDraft(plan ? clonePlan(plan) : null);
    }, [open, plan]);

    const beginEdit = () => {
        if (!plan) return;
        setDraft(clonePlan(plan));
        setEditing(true);
    };

    const patchScene = (index: number, patch: Partial<FilmStructurePlan["scenes"][number]>) => {
        setDraft((current) => current ? { ...current, scenes: current.scenes.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, ...patch } : scene) } : current);
    };

    const save = () => {
        if (!draft) return;
        onChange(draft);
        setEditing(false);
    };

    const footer = editing ? [
        <Button key="cancel" onClick={() => { setDraft(plan ? clonePlan(plan) : null); setEditing(false); }}>取消</Button>,
        <Button key="save" type="primary" onClick={save}>保存结构计划</Button>,
    ] : [
        <Button key="close" onClick={onClose}>关闭</Button>,
        plan ? <Button key="edit" icon={<Pencil className="size-3.5" />} onClick={beginEdit}>编辑</Button> : null,
        <Button key="generate" type="primary" loading={generating} icon={<Sparkles className="size-3.5" />} onClick={onGenerate}>
            {scenes.length ? "重新生成" : "生成结构计划"}
        </Button>,
    ].filter(Boolean);

    const currentScenes = editing ? draft?.scenes || [] : scenes;
    const currentTotal = editing ? currentScenes.reduce((sum, scene) => sum + scene.estimatedDuration, 0) : estimated;

    return (
        <Modal
            title={
                <span className="flex items-center gap-2">
                    <ListTree className="size-4 text-acid" />
                    结构计划
                </span>
            }
            open={open}
            onCancel={onClose}
            width={880}
            footer={footer}
        >
            {!currentScenes.length ? (
                <div className="grid place-items-center gap-2 py-12 text-center">
                    <div className="grid size-12 place-items-center rounded-xl border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70"><ListTree className="size-5" /></div>
                    <p className="text-sm font-medium text-foreground">还没有结构计划</p>
                    <p className="max-w-md text-xs leading-6 text-muted-foreground">结构代理只分析叙事：每场的目的、beats、信息点、覆盖要求和预计时长；确认后再生成画面分镜，改剧本或改风格时不用整套重跑。</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="chip chip-acid">{currentScenes.length} 场</span>
                        <span className="chip normal-case"><Clock3 className="size-3" />预计 {Math.round(currentTotal)}s</span>
                        {plan?.scriptHash ? <span className="chip normal-case font-mono text-[9px]">脚本 {plan.scriptHash.slice(0, 8)}</span> : null}
                        {editing ? <span className="chip border-acid/30 text-acid">编辑中</span> : null}
                        {!editing && plan ? (
                            <Button size="small" type="text" className="!ml-auto !h-6 !px-2 !text-[10px]" icon={<Pencil className="size-3" />} onClick={beginEdit}>编辑</Button>
                        ) : null}
                    </div>
                    <div className="thin-scrollbar grid max-h-[58vh] gap-2 overflow-y-auto pr-1">
                        {currentScenes.map((scene, index) => (
                            <article key={scene.episodeTitle + "-" + scene.sceneName + "-" + index} className="rounded-lg border border-border/70 bg-card/40 p-3">
                                {editing ? (
                                    <div className="grid gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-[10px] tracking-wide text-muted-foreground/60">{scene.episodeTitle}</span>
                                            <span className="text-xs font-semibold text-foreground">{scene.sceneName}</span>
                                            <label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                预计
                                                <InputNumber className="!w-20" min={3} max={900} value={scene.estimatedDuration} onChange={(value) => patchScene(index, { estimatedDuration: Number(value) || 3 })} addonAfter="s" />
                                            </label>
                                        </div>
                                        <Input value={scene.purpose} placeholder="这场戏的目的" onChange={(event) => patchScene(index, { purpose: event.target.value })} />
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <Select mode="tags" size="small" className="min-w-40 flex-1" placeholder="覆盖要求" value={scene.coverage} options={COVERAGE_OPTIONS} onChange={(value: string[]) => patchScene(index, { coverage: value })} />
                                            <Select mode="tags" size="small" className="min-w-40 flex-1" placeholder="出场角色" value={scene.characters} options={characterNames.map((name) => ({ value: name, label: name }))} onChange={(value: string[]) => patchScene(index, { characters: value })} />
                                        </div>
                                        <div className="grid gap-1.5">
                                            {scene.beats.map((beat, beatIndex) => (
                                                <div key={beatIndex} className="flex items-center gap-1.5">
                                                    <Select size="small" className="!w-20" value={beat.type} options={BEAT_TYPES.map((type) => ({ value: type, label: type }))} onChange={(value) => patchScene(index, { beats: scene.beats.map((item, itemIndex) => itemIndex === beatIndex ? { ...item, type: value } : item) })} />
                                                    <Input size="small" className="flex-1" value={beat.summary} placeholder="发生了什么" onChange={(event) => patchScene(index, { beats: scene.beats.map((item, itemIndex) => itemIndex === beatIndex ? { ...item, summary: event.target.value } : item) })} />
                                                    <Input size="small" className="!w-32" value={beat.infoPoint || ""} placeholder="信息点" onChange={(event) => patchScene(index, { beats: scene.beats.map((item, itemIndex) => itemIndex === beatIndex ? { ...item, infoPoint: event.target.value } : item) })} />
                                                    <Button size="small" type="text" className="!size-7 !min-w-7 !px-0" icon={<Trash2 className="size-3" />} onClick={() => patchScene(index, { beats: scene.beats.filter((_, itemIndex) => itemIndex !== beatIndex) })} />
                                                </div>
                                            ))}
                                            <Button size="small" type="dashed" className="!h-7 !text-[10px]" icon={<Plus className="size-3" />} onClick={() => patchScene(index, { beats: [...scene.beats, { type: "信息", summary: "" }] })}>加一个 beat</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-[10px] tracking-wide text-muted-foreground/60">{scene.episodeTitle}</span>
                                            <span className="text-xs font-semibold text-foreground">{scene.sceneName}</span>
                                            <span className="chip ml-auto normal-case">{scene.estimatedDuration}s</span>
                                            {onRegenerateScene ? <Button size="small" type="text" className="!h-6 !px-1.5 !text-[10px]" icon={<RefreshCw className="size-3" />} loading={regeneratingScene === index} onClick={() => onRegenerateScene(index)}>重生成</Button> : null}
                                        </div>
                                        {scene.purpose ? <p className="mt-1.5 text-[11px] leading-5 text-foreground/75">目的：{scene.purpose}</p> : null}
                                        <div className="mt-2 grid gap-1">
                                            {scene.beats.map((beat, beatIndex) => (
                                                <div key={beatIndex} className="flex items-start gap-2 text-[11px] leading-5">
                                                    <span className="mt-0.5 shrink-0 rounded border border-acid/30 bg-acid/[0.05] px-1 font-mono text-[9px] text-acid">{beat.type}</span>
                                                    <span className="min-w-0">
                                                        <span className="text-foreground/80">{beat.summary}</span>
                                                        {beat.infoPoint ? <span className="text-muted-foreground/70"> · 信息点：{beat.infoPoint}</span> : null}
                                                        {beat.emotion ? <span className="text-muted-foreground/70"> · 情绪：{beat.emotion}</span> : null}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {scene.coverage.map((item) => <span key={item} className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">{item}</span>)}
                                            {scene.characters.map((name) => <span key={name} className="rounded border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground/80">{name}</span>)}
                                        </div>
                                    </>
                                )}
                            </article>
                        ))}
                    </div>
                </div>
            )}
        </Modal>
    );
}
