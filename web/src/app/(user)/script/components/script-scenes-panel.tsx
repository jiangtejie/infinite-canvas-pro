"use client";

import { useState } from "react";
import { Button, Input, Popconfirm, Select } from "antd";
import { ChevronDown, ChevronRight, ChevronUp, PenLine, Plus, Trash2 } from "lucide-react";

import type { ScriptProject, ScriptScene } from "../types";
import { collectScriptCharacterNames, createScriptScene, normalizeScriptCharacters, scriptSceneCompleteness, scriptSceneHeading, scriptSceneMissingFields } from "../utils/script-project";

type ScriptScenesPanelProps = {
    project: ScriptProject;
    onUpdate: (patch: Partial<ScriptProject>) => void;
    onOpenEditor: (sceneId: string) => void;
};

const INTERIOR_OPTIONS = [{ value: "内景" }, { value: "外景" }, { value: "内外景" }];

export function ScriptScenesPanel({ project, onUpdate, onOpenEditor }: ScriptScenesPanelProps) {
    const [expandedId, setExpandedId] = useState(project.scenes[0]?.id || "");
    const characterOptions = collectScriptCharacterNames(project).map((name) => ({ value: name, label: name }));
    const incomplete = project.scenes.filter((scene) => scriptSceneMissingFields(scene).length > 0).length;

    const updateScene = (id: string, patch: Partial<ScriptScene>) => {
        onUpdate({ scenes: project.scenes.map((scene) => scene.id === id ? { ...scene, ...patch } : scene) });
    };
    const addScene = () => {
        const scene = createScriptScene(project.scenes.length + 1);
        onUpdate({ scenes: [...project.scenes, scene] });
        setExpandedId(scene.id);
    };
    const removeScene = (id: string) => {
        onUpdate({ scenes: project.scenes.filter((scene) => scene.id !== id).map((scene, index) => ({ ...scene, no: index + 1 })) });
    };
    const moveScene = (index: number, direction: -1 | 1) => {
        const next = [...project.scenes];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onUpdate({ scenes: next.map((scene, sceneIndex) => ({ ...scene, no: sceneIndex + 1 })) });
    };

    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground/70">每场先写目标、冲突、转折、结果，再进剧本写对白。</span>
                <span className="chip">{project.scenes.length} 场</span>
                {incomplete ? <span className="chip border-hot/35 text-hot/80">{incomplete} 场待补全</span> : null}
                <Button size="small" type="primary" className="ml-auto" icon={<Plus className="size-3.5" />} onClick={addScene}>添加场景</Button>
            </div>

            {project.scenes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-card/25 px-6 py-12 text-center">
                    <p className="text-sm text-foreground">还没有场景卡</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">先建第一场，把「谁想要什么、谁阻挡、发生了什么变化」写下来。</p>
                    <Button className="mt-4" size="small" icon={<Plus className="size-3.5" />} onClick={addScene}>添加第一场</Button>
                </div>
            ) : (
                <div className="grid gap-2">
                    {project.scenes.map((scene, index) => {
                        const expanded = expandedId === scene.id;
                        const missing = scriptSceneMissingFields(scene);
                        return (
                            <section key={scene.id} style={{ "--enter-index": Math.min(index, 12) } as React.CSSProperties} className="punk-card enter-up overflow-hidden rounded-xl border border-border/70 bg-card/40">
                                <div className="flex items-center gap-1 px-2 py-2">
                                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/60 bg-background/40 font-mono text-[10px] text-muted-foreground/70">{String(scene.no).padStart(2, "0")}</span>
                                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setExpandedId(expanded ? "" : scene.id)} aria-expanded={expanded}>
                                        {expanded ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/50" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
                                        <span className="min-w-0 flex-1 grid gap-0.5">
                                            <span className="truncate text-xs font-medium text-foreground/85">{scriptSceneHeading(scene)}</span>
                                            <span className="truncate text-[10px] text-muted-foreground/60">{scene.summary || scene.goal || "还没有摘要，点开补充场景信息"}</span>
                                        </span>
                                    </button>
                                    <span className={missing.length ? "chip border-hot/30 text-hot/70" : "chip border-acid/30 text-acid/80"}>{missing.length ? `缺${missing.join("/")}` : `${scriptSceneCompleteness(scene)}%`}</span>
                                    <Button size="small" type="text" aria-label="上移场景" disabled={index === 0} icon={<ChevronUp className="size-3.5" />} onClick={() => moveScene(index, -1)} />
                                    <Button size="small" type="text" aria-label="下移场景" disabled={index === project.scenes.length - 1} icon={<ChevronDown className="size-3.5" />} onClick={() => moveScene(index, 1)} />
                                    <Popconfirm title="删除这场？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeScene(scene.id)}>
                                        <Button size="small" type="text" danger aria-label="删除场景" icon={<Trash2 className="size-3.5" />} />
                                    </Popconfirm>
                                </div>

                                {expanded ? (
                                    <div className="grid gap-3 border-t border-border/50 bg-background/20 p-3">
                                        <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)_100px_minmax(0,1fr)]">
                                            <Field label="内/外景">
                                                <Select size="small" value={scene.interiorExterior || undefined} options={INTERIOR_OPTIONS} placeholder="内景" onChange={(value: ScriptScene["interiorExterior"]) => updateScene(scene.id, { interiorExterior: value })} />
                                            </Field>
                                            <Field label="地点">
                                                <Input size="small" value={scene.location} placeholder="咖啡馆" onChange={(event) => updateScene(scene.id, { location: event.target.value })} />
                                            </Field>
                                            <Field label="时间">
                                                <Input size="small" value={scene.timeOfDay} placeholder="日 / 夜" onChange={(event) => updateScene(scene.id, { timeOfDay: event.target.value })} />
                                            </Field>
                                            <Field label="出场人物">
                                                <Select size="small" mode="tags" value={scene.characters} options={characterOptions} placeholder="选择或输入角色" onChange={(value: string[]) => updateScene(scene.id, { characters: normalizeScriptCharacters(value.join("、")) })} />
                                            </Field>
                                        </div>
                                        <Field label="一句话剧情">
                                            <Input size="small" value={scene.summary} placeholder="这场发生了什么？" onChange={(event) => updateScene(scene.id, { summary: event.target.value })} />
                                        </Field>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <Field label="目标 / 谁想要什么"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={scene.goal} onChange={(event) => updateScene(scene.id, { goal: event.target.value })} /></Field>
                                            <Field label="冲突 / 谁在阻止"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={scene.conflict} onChange={(event) => updateScene(scene.id, { conflict: event.target.value })} /></Field>
                                            <Field label="转折 / 发生了什么变化"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={scene.turn} onChange={(event) => updateScene(scene.id, { turn: event.target.value })} /></Field>
                                            <Field label="结果 / 下一场为什么发生"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={scene.outcome} onChange={(event) => updateScene(scene.id, { outcome: event.target.value })} /></Field>
                                        </div>
                                        <div className="flex flex-wrap items-end gap-2">
                                            <div className="min-w-0 flex-1">
                                                <Field label="备注 / 伏笔"><Input size="small" value={scene.notes} placeholder="需要记住的细节、伏笔、呼应" onChange={(event) => updateScene(scene.id, { notes: event.target.value })} /></Field>
                                            </div>
                                            <Button size="small" icon={<PenLine className="size-3.5" />} onClick={() => onOpenEditor(scene.id)}>写这场</Button>
                                        </div>
                                    </div>
                                ) : null}
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="grid min-w-0 gap-1">
            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{label}</span>
            {children}
        </label>
    );
}
