"use client";

import { useState } from "react";
import { Button, Input, Modal, Select } from "antd";
import { AlertTriangle, ArrowRight, CheckCircle2, GitBranch, Route } from "lucide-react";

import type { FilmInteractiveVariable, FilmProject } from "@/lib/film/types";
import { buildFilmBranchPaths, collectFilmBranches, findUnreachableShots } from "../utils/film-branch";
import { FilmBranchGraph } from "./film-branch-graph";

export function FilmBranchPanel({ open, project, onClose, onJumpToShot, onVariablesChange }: { open: boolean; project: FilmProject; onClose: () => void; onJumpToShot: (shotId: string) => void; onVariablesChange?: (variables: FilmInteractiveVariable[]) => void }) {
    const [tab, setTab] = useState<"points" | "graph" | "paths">("points");
    const edges = collectFilmBranches(project);
    const paths = buildFilmBranchPaths(project);
    const unreachable = findUnreachableShots(project);
    const missing = edges.filter((edge) => edge.missing || edge.selfLoop).length;
    const variables = project.interactiveVariables || [];

    return (
        <Modal
            title={
                <span className="flex items-center gap-2">
                    <GitBranch className="size-4 text-acid" />
                    互动分支
                </span>
            }
            open={open}
            onCancel={onClose}
            width={820}
            footer={[<Button key="close" onClick={onClose}>关闭</Button>]}
        >
            {!edges.length ? (
                <div className="grid gap-3">
                    <VariableManager variables={variables} onChange={onVariablesChange} />
                    <div className="grid place-items-center gap-2 py-10 text-center">
                    <div className="grid size-12 place-items-center rounded-xl border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70"><GitBranch className="size-5" /></div>
                    <p className="text-sm font-medium text-foreground">还没有互动分支</p>
                    <p className="max-w-md text-xs leading-6 text-muted-foreground">先在下面定义互动变量（可选），再到分镜详情「表演/声音」里给镜头添加分支选项、触发条件和目标镜头；预演里打开「互动分支」就能按选择跳转。</p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-3">
                    <VariableManager variables={variables} onChange={onVariablesChange} />
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="chip chip-acid">{edges.length} 个分支选项</span>
                        <span className="chip">{paths.length} 条结局路径</span>
                        {missing ? <span className="chip border-amber-500/40 text-amber-500">{missing} 个待修正</span> : <span className="chip">连接完整</span>}
                        <span className="ml-auto text-[10px] text-muted-foreground/60">预演里开启「互动分支」可试走不同结局</span>
                    </div>
                    <div className="flex items-center gap-1 border-b border-border/60 pb-1">
                        {([{ key: "points", label: "分支点" }, { key: "graph", label: "分支图" }, { key: "paths", label: "结局路径" }] as const).map((item) => (
                            <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-pressed={tab === item.key} className={"rounded-md px-2.5 py-1 text-[11px] transition-colors " + (tab === item.key ? "bg-foreground/8 font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>
                        ))}
                    </div>
                    <div className="thin-scrollbar grid max-h-[56vh] gap-2 overflow-y-auto pr-1">
                        {tab === "points" ? edges.map((edge) => (
                            <article key={edge.id} className={"rounded-lg border p-3 " + (edge.missing || edge.selfLoop ? "border-amber-500/40 bg-amber-500/[0.04]" : "border-border/70 bg-card/40")}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[10px] text-muted-foreground/60">{edge.episodeTitle} / {edge.sceneName}</span>
                                    <span className="text-xs font-semibold text-foreground">镜头 {edge.shotNo}</span>
                                    <span className="rounded border border-acid/30 bg-acid/[0.05] px-1.5 py-0.5 text-[10px] text-acid">{edge.label}</span>
                                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/70">
                                        {edge.targetShotNo ? <span>→ 镜头 {edge.targetShotNo}</span> : <span className="text-amber-500"><AlertTriangle className="mr-1 inline size-3" />未设置目标</span>}
                                    </span>
                                </div>
                                {edge.condition ? <p className="mt-1.5 text-[11px] leading-5 text-foreground/70">条件：{edge.condition}</p> : null}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {edge.selfLoop ? <span className="text-[10px] text-amber-500">分支跳回自己</span> : null}
                                    <Button size="small" type="text" className="!ml-auto !h-6 !px-2 !text-[10px]" icon={<ArrowRight className="size-3" />} onClick={() => { onJumpToShot(edge.targetShotId || edge.shotId); onClose(); }}>跳到镜头</Button>
                                </div>
                            </article>
                        )) : tab === "graph" ? (
                            <FilmBranchGraph project={project} onJumpToShot={(shotId) => { onJumpToShot(shotId); onClose(); }} />
                        ) : paths.map((path) => (
                            <article key={path.id} className="rounded-lg border border-border/70 bg-card/40 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Route className="size-3.5 text-acid" />
                                    <span className="text-xs font-semibold text-foreground">{path.label}</span>
                                    <span className="chip ml-auto normal-case">{path.shots.length} 镜</span>
                                    <span className="flex items-center gap-1 text-[10px] text-acid"><CheckCircle2 className="size-3" />结局</span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {path.shots.map((shot, index) => (
                                        <span key={shot.shotId + "-" + index} className="flex items-center gap-1.5">
                                            {shot.viaBranch ? <span className="rounded border border-acid/30 bg-acid/[0.05] px-1 py-0.5 text-[9px] text-acid">{shot.viaBranch}</span> : null}
                                            <button type="button" onClick={() => { onJumpToShot(shot.shotId); onClose(); }} className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 transition-colors hover:bg-acid/15 hover:text-acid" title={shot.episodeTitle + " / " + shot.sceneName}>{shot.shotNo}</button>
                                            {index < path.shots.length - 1 ? <ArrowRight className="size-2.5 text-muted-foreground/40" /> : null}
                                        </span>
                                    ))}
                                </div>
                                {path.truncated ? <p className="mt-1.5 text-[10px] text-amber-500">路径过长或存在循环，已截断展示</p> : null}
                            </article>
                        ))}
                    </div>
                    {unreachable.length ? (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.04] px-3 py-2.5">
                            <p className="flex items-center gap-1.5 text-[11px] text-amber-500"><AlertTriangle className="size-3.5" />{unreachable.length} 个镜头不在任何结局路径上</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {unreachable.map((shot) => (
                                    <button key={shot.shotId} type="button" onClick={() => { onJumpToShot(shot.shotId); onClose(); }} className="rounded border border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px] text-amber-500/90">{shot.shotNo}</button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </Modal>
    );
}


function VariableManager({ variables, onChange }: { variables: FilmInteractiveVariable[]; onChange?: (variables: FilmInteractiveVariable[]) => void }) {
    if (!onChange) return null;
    const addVariable = () => {
        onChange([...variables, { id: crypto.randomUUID(), name: "变量 " + (variables.length + 1), type: "boolean", initialValue: "false" }]);
    };
    const patchVariable = (id: string, patch: Partial<FilmInteractiveVariable>) => {
        onChange(variables.map((variable) => variable.id === id ? { ...variable, ...patch } : variable));
    };
    return (
        <section className="grid gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">互动变量</span>
                <span className="text-[10px] text-muted-foreground/60">{variables.length} 个</span>
                <Button size="small" type="text" className="!ml-auto !h-6 !px-1.5 !text-[10px]" onClick={addVariable}>+ 变量</Button>
            </div>
            {variables.map((variable) => (
                <div key={variable.id} className="flex flex-wrap items-center gap-1.5">
                    <Input size="small" className="!w-32" value={variable.name} placeholder="变量名" onChange={(event) => patchVariable(variable.id, { name: event.target.value })} />
                    <Select size="small" className="!w-24" value={variable.type} options={[{ value: "boolean", label: "布尔" }, { value: "number", label: "数值" }, { value: "string", label: "文本" }]} onChange={(value) => patchVariable(variable.id, { type: value, initialValue: value === "number" ? "0" : value === "boolean" ? "false" : "" })} />
                    <Input size="small" className="!w-24" value={variable.initialValue} placeholder="初始值" onChange={(event) => patchVariable(variable.id, { initialValue: event.target.value })} />
                    <Button size="small" type="text" className="!size-6 !min-w-6 !px-0" onClick={() => onChange(variables.filter((item) => item.id !== variable.id))}>×</Button>
                </div>
            ))}
            <p className="text-[9px] leading-4 text-muted-foreground/55">分支的显示条件和选择效果引用这些变量；预演从初始值开始模拟。改动变量后，条件里已引用的变量会自动保留。</p>
        </section>
    );
}
