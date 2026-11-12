"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal } from "antd";
import { History, RotateCcw, Save, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import type { ScriptProject } from "../types";
import { createScriptDraft, diffScriptDraft, draftWords } from "../utils/script-project";

type ScriptVersionsModalProps = {
    open: boolean;
    project: ScriptProject;
    onUpdate: (patch: Partial<ScriptProject>) => void;
    onClose: () => void;
};

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
    added: { label: "新增", className: "border-acid/35 text-acid" },
    removed: { label: "删除", className: "border-hot/35 text-hot" },
    changed: { label: "修改", className: "border-amber-400/30 text-amber-500" },
    same: { label: "不变", className: "border-border/60 text-muted-foreground/60" },
};

export function ScriptVersionsModal({ open, project, onUpdate, onClose }: ScriptVersionsModalProps) {
    const confirm = useConfirm();
    const drafts = project.drafts || [];
    const [selectedId, setSelectedId] = useState("");
    const [label, setLabel] = useState("");
    const selected = drafts.find((draft) => draft.id === selectedId) || drafts[0] || null;
    const diff = useMemo(() => selected ? diffScriptDraft(project, selected) : null, [project, selected]);

    const saveDraft = () => {
        const draft = createScriptDraft(project, label);
        onUpdate({ drafts: [...drafts, draft] });
        setSelectedId(draft.id);
        setLabel("");
    };

    const restoreDraft = () => {
        if (!selected) return;
        const safety = createScriptDraft(project, `恢复前 · ${selected.label}`);
        onUpdate({
            logline: selected.logline,
            theme: selected.theme,
            synopsis: selected.synopsis,
            actOne: selected.actOne,
            actTwo: selected.actTwo,
            actThree: selected.actThree,
            characters: selected.characters.map((character) => ({ ...character })),
            scenes: selected.scenes.map((scene) => ({ ...scene, characters: [...scene.characters] })),
            drafts: [...drafts, safety],
        });
    };

    const removeDraft = (id: string) => {
        const next = drafts.filter((draft) => draft.id !== id);
        onUpdate({ drafts: next });
        if (selectedId === id) setSelectedId(next[0]?.id || "");
    };

    return (
        <Modal title="版本与修改记录" open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden>
            <div className="grid gap-3 py-1 lg:grid-cols-[240px_minmax(0,1fr)]">
                <aside className="grid gap-2 self-start rounded-lg border border-border/60 bg-background/30 p-2">
                    <div className="flex gap-1">
                        <Input size="small" value={label} placeholder="版本名（可选）" onChange={(event) => setLabel(event.target.value)} onPressEnter={saveDraft} />
                        <Button size="small" type="primary" icon={<Save className="size-3.5" />} onClick={saveDraft}>保存</Button>
                    </div>
                    <div className="thin-scrollbar grid max-h-72 gap-1 overflow-y-auto">
                        {drafts.length === 0 ? <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">还没有保存过版本</p> : null}
                        {[...drafts].reverse().map((draft) => (
                            <div key={draft.id} className={cn("flex items-center gap-1 rounded-md border px-2 py-1.5", selected?.id === draft.id ? "border-acid/40 bg-acid/[0.05]" : "border-border/40 bg-background/20")}>
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(draft.id)}>
                                    <span className="block truncate text-[11px] font-medium text-foreground/85">{draft.label}</span>
                                    <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground/50">{new Date(draft.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · {draftWords(draft)} 字</span>
                                </button>
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    aria-label="删除版本"
                                    icon={<Trash2 className="size-3" />}
                                    onClick={async () => {
                                        const ok = await confirm({ title: "删除版本", description: `确定删除版本「${draft.label || "未命名版本"}」吗？删除后无法恢复。`, confirmText: "删除", tone: "danger" });
                                        if (ok) removeDraft(draft.id);
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </aside>

                <section className="grid min-w-0 gap-2">
                    {!selected || !diff ? (
                        <EmptyState className="rounded-lg border border-dashed border-border/70 bg-background/25 py-10" icon={<History className="size-5" />} title="先保存一个版本" description="保存后修改剧本，再回来就能看到场次级差异。" />
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[10px] text-muted-foreground/60">当前稿 vs {selected.label}</span>
                                <span className="chip border-acid/30 text-acid">+{diff.added} 场</span>
                                <span className="chip border-hot/30 text-hot">-{diff.removed} 场</span>
                                <span className="chip">{diff.changed} 场修改</span>
                                <span className="chip">{diff.same} 场不变</span>
                                <span className={cn("chip", diff.wordDelta >= 0 ? "border-acid/30 text-acid" : "border-hot/30 text-hot")}>{diff.wordDelta >= 0 ? "+" : ""}{diff.wordDelta} 字</span>
                                <Button className="ml-auto" size="small" icon={<RotateCcw className="size-3.5" />} onClick={restoreDraft}>恢复到这个版本</Button>
                            </div>

                            {diff.characterChanges.length ? (
                                <div className="grid gap-1 rounded-lg border border-border/60 bg-background/30 px-3 py-2">
                                    <span className="font-mono text-[9px] text-muted-foreground/50 uppercase">人物变化</span>
                                    {diff.characterChanges.map((change) => <p key={change} className="text-[11px] leading-5 text-foreground/80">· {change}</p>)}
                                </div>
                            ) : null}

                            <div className="thin-scrollbar grid max-h-[52vh] gap-1 overflow-y-auto pr-1">
                                {diff.scenes.map((scene) => {
                                    const style = STATUS_STYLE[scene.status];
                                    return (
                                        <div key={scene.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-background/25 px-2.5 py-1.5">
                                            <span className="font-mono text-[9px] text-muted-foreground/50">{String(scene.no).padStart(2, "0")}</span>
                                            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{scene.heading}</span>
                                            {scene.changedFields.length ? <span className="text-[10px] text-muted-foreground/60">{scene.changedFields.join("、")}</span> : null}
                                            <span className={cn("chip", style.className)}>{style.label}</span>
                                            {scene.wordDelta ? <span className={cn("font-mono text-[9px]", scene.wordDelta > 0 ? "text-acid/80" : "text-hot/80")}>{scene.wordDelta > 0 ? "+" : ""}{scene.wordDelta} 字</span> : null}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-muted-foreground/50">恢复版本会先自动保存当前稿为「恢复前」，不会丢内容。</p>
                        </>
                    )}
                </section>
            </div>
        </Modal>
    );
}
