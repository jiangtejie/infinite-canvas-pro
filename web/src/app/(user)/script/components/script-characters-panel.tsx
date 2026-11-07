"use client";

import { Button, Input } from "antd";
import { Plus, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import type { ScriptCharacter, ScriptProject } from "../types";
import { createScriptCharacter } from "../utils/script-project";

type ScriptCharactersPanelProps = {
    project: ScriptProject;
    onUpdate: (patch: Partial<ScriptProject>) => void;
};

export function ScriptCharactersPanel({ project, onUpdate }: ScriptCharactersPanelProps) {
    const confirm = useConfirm();
    const updateCharacter = (id: string, patch: Partial<ScriptCharacter>) => {
        onUpdate({ characters: project.characters.map((character) => character.id === id ? { ...character, ...patch } : character) });
    };
    const addCharacter = () => {
        onUpdate({ characters: [...project.characters, createScriptCharacter()] });
    };
    const removeCharacter = (id: string) => {
        onUpdate({ characters: project.characters.filter((character) => character.id !== id) });
    };

    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground/70">人物不是标签，是欲望、缺陷和变化。</span>
                <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={addCharacter}>添加角色</Button>
            </div>
            {project.characters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-card/25 px-6 py-12 text-center">
                    <p className="text-sm text-foreground">还没有人物</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">先加主角和对手，把 want / need / flaw 写清楚。</p>
                </div>
            ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                    {project.characters.map((character, index) => (
                        <section key={character.id} style={{ "--enter-index": Math.min(index, 8) } as React.CSSProperties} className="punk-card enter-up grid gap-3 rounded-xl border border-border/70 bg-card/40 p-4">
                            <div className="flex items-center gap-2">
                                <span className="grid size-7 place-items-center rounded-full border border-acid/30 bg-acid/10 font-mono text-[10px] text-acid">{index + 1}</span>
                                <Input variant="borderless" className="!px-0 text-sm font-semibold" value={character.name} placeholder="角色名" onChange={(event) => updateCharacter(character.id, { name: event.target.value })} />
                                <Input variant="borderless" className="!w-24 !px-0 text-right text-[11px]" value={character.role} placeholder="定位" onChange={(event) => updateCharacter(character.id, { role: event.target.value })} />
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    aria-label="删除角色"
                                    icon={<Trash2 className="size-3.5" />}
                                    onClick={async () => {
                                        const ok = await confirm({ title: "删除角色", description: `确定删除「${character.name || "未命名角色"}」吗？删除后无法恢复。`, confirmText: "删除", tone: "danger" });
                                        if (ok) removeCharacter(character.id);
                                    }}
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <Field label="Want / 外在目标"><Input value={character.want} placeholder="他想要什么" onChange={(event) => updateCharacter(character.id, { want: event.target.value })} /></Field>
                                <Field label="Need / 内心需要"><Input value={character.need} placeholder="他真正缺什么" onChange={(event) => updateCharacter(character.id, { need: event.target.value })} /></Field>
                                <Field label="Flaw / 缺陷"><Input value={character.flaw} placeholder="什么阻止他" onChange={(event) => updateCharacter(character.id, { flaw: event.target.value })} /></Field>
                                <Field label="Arc / 变化"><Input value={character.arc} placeholder="从什么样变成什么样" onChange={(event) => updateCharacter(character.id, { arc: event.target.value })} /></Field>
                            </div>
                            <Field label="人物小传"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={character.description} placeholder="经历、秘密、说话方式……" onChange={(event) => updateCharacter(character.id, { description: event.target.value })} /></Field>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="grid gap-1">
            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{label}</span>
            {children}
        </label>
    );
}
