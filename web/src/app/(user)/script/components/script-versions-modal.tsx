"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { History, Lock, RotateCcw, Save, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import type { ScriptProjectDocument, ScriptVersion } from "../types";
import { useScriptStore } from "../stores/use-script-store";
import { snapshotScriptContent } from "../utils/script-document";
import { diffScriptSnapshots } from "../utils/script-version";

type ScriptVersionsModalProps = { open: boolean; project: ScriptProjectDocument; initialEpisodeId?: string; onClose: () => void };
const EMPTY_VERSIONS: ScriptVersion[] = [];
const STATUS_STYLE = {
    added: { label: "新增", className: "border-acid/35 text-acid" },
    removed: { label: "删除", className: "border-hot/35 text-hot" },
    changed: { label: "修改", className: "border-amber-400/30 text-amber-500" },
    same: { label: "不变", className: "border-border/60 text-muted-foreground/60" },
};

export function ScriptVersionsModal({ open, project, initialEpisodeId, onClose }: ScriptVersionsModalProps) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const versions = useScriptStore((state) => state.versions[project.id] ?? EMPTY_VERSIONS);
    const [filter, setFilter] = useState<"all" | "project" | "episode">("all");
    const [episodeId, setEpisodeId] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const [label, setLabel] = useState("");
    const [busy, setBusy] = useState(false);
    const defaultEpisodeId = initialEpisodeId || project.episodes[0]?.id || "";
    useEffect(() => { if (open) setEpisodeId(defaultEpisodeId); }, [open, defaultEpisodeId]);
    const selected = versions.find((version) => version.id === selectedId) || versions[0] || null;
    const filtered = versions.filter((version) => filter === "all" || (filter === "project" ? version.scope === "project" : version.scope === "episode" && (!episodeId || version.episodeId === episodeId)));
    const diff = useMemo(() => selected ? diffScriptSnapshots(snapshotScriptContent(project), selected.data) : null, [project, selected]);
    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        try { await action(); } catch (error) { message.error(error instanceof Error ? error.message : "版本操作失败"); } finally { setBusy(false); }
    };
    const save = () => run(async () => {
        const version = await useScriptStore.getState().saveVersion(project.id, {
            scope: filter === "episode" ? "episode" : "project", episodeId: filter === "episode" ? episodeId || project.episodes[0]?.id : undefined, label,
        });
        setSelectedId(version.id); setLabel("");
    });
    return (
        <Modal title="版本与修改记录" open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden>
            <div className="grid gap-3 py-1 lg:grid-cols-[250px_minmax(0,1fr)]">
                <aside className="grid gap-2 self-start rounded-lg border border-border/60 bg-background/30 p-2">
                    <div className="flex flex-wrap gap-1">
                        {([["all", "全部"], ["project", "项目"], ["episode", "本集"]] as const).map(([key, text]) => <Button key={key} size="small" type={filter === key ? "primary" : "text"} onClick={() => setFilter(key)}>{text}</Button>)}
                    </div>
                    {filter === "episode" ? <Select size="small" value={episodeId || undefined} placeholder="选择剧集" options={project.episodes.map((episode) => ({ value: episode.id, label: episode.title }))} onChange={setEpisodeId} /> : null}
                    <div className="flex gap-1"><Input size="small" value={label} placeholder="版本名（可选）" onChange={(event) => setLabel(event.target.value)} onPressEnter={() => void save()} /><Button size="small" type="primary" icon={<Save className="size-3.5" />} loading={busy} onClick={() => void save()}>保存</Button></div>
                    <div className="thin-scrollbar grid max-h-72 gap-1 overflow-y-auto">
                        {!filtered.length ? <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">这个范围还没有版本</p> : null}
                        {filtered.map((version) => {
                            const protectedVersion = project.lockedVersionId === version.id || project.episodes.some((episode) => episode.lockedVersionId === version.id) || project.publications.some((publication) => publication.sourceVersionIds.includes(version.id));
                            return <div key={version.id} className={cn("flex items-center gap-1 rounded-md border px-2 py-1.5", selected?.id === version.id ? "border-acid/40 bg-acid/[0.05]" : "border-border/40 bg-background/20")}>
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(version.id)}>
                                    <span className="flex items-center gap-1 truncate text-[11px] font-medium text-foreground/85">{version.kind === "locked" ? <Lock className="size-3 text-acid" /> : null}{version.label}</span>
                                    <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground/50">{version.scope === "project" ? "全项目" : project.episodes.find((episode) => episode.id === version.episodeId)?.title || "本集"} · {new Date(version.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                </button>
                                {!protectedVersion ? <Button size="small" type="text" danger aria-label="删除版本" icon={<Trash2 className="size-3" />} onClick={() => void run(async () => { const ok = await confirm({ title: "删除版本", description: `确定删除「${version.label}」吗？`, tone: "danger" }); if (ok) await useScriptStore.getState().deleteVersion(project.id, version.id); })} /> : <span className="chip">保护</span>}
                            </div>;
                        })}
                    </div>
                </aside>
                <section className="grid min-w-0 gap-2">
                    {!selected || !diff ? <EmptyState className="rounded-lg border border-dashed border-border/70 bg-background/25 py-10" icon={<History className="size-5" />} title="先保存一个版本" description="保存后可查看场次级差异。" /> : <>
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground/60">当前稿 vs {selected.label}</span><span className="chip border-acid/30 text-acid">+{diff.added}</span><span className="chip border-hot/30 text-hot">-{diff.removed}</span><span className="chip">{diff.changed} 场修改</span><Button className="ml-auto" size="small" icon={<RotateCcw className="size-3.5" />} loading={busy} onClick={() => void run(async () => useScriptStore.getState().restoreVersion(project.id, selected.id))}>恢复</Button></div>
                        {diff.characterChanges.map((change) => <p key={change} className="text-[11px] text-muted-foreground/70">{change}</p>)}
                        <div className="thin-scrollbar grid max-h-[52vh] gap-1 overflow-y-auto pr-1">{diff.scenes.map((scene) => { const style = STATUS_STYLE[scene.status]; return <div key={scene.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-background/25 px-2.5 py-1.5"><span className="font-mono text-[9px] text-muted-foreground/50">{String(scene.no).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-[11px]">{scene.heading}</span><span className="text-[10px] text-muted-foreground/60">{scene.changedFields.join("、")}</span><span className={cn("chip", style.className)}>{style.label}</span></div>; })}</div>
                        <p className="text-[10px] text-muted-foreground/50">登录账号的版本操作需联网；恢复前会自动保存安全稿。</p>
                    </>}
                </section>
            </div>
        </Modal>
    );
}
