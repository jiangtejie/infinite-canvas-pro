"use client";

import { useState } from "react";
import { App, Button, Modal } from "antd";
import { GitMerge } from "lucide-react";

import type { ScriptConflict, ScriptHeader, ScriptScene } from "../types";
import { resolveScriptConflict } from "../stores/use-script-store";

function ConflictValue({ conflict, side }: { conflict: ScriptConflict; side: "local" | "remote" }) {
    const value = conflict[side];
    if (!value) return <p className="rounded-lg border border-dashed border-border/60 bg-background/25 p-4 text-xs text-muted-foreground">这一侧已删除</p>;
    if (conflict.scope === "scene") {
        const scene = value as ScriptScene;
        return <pre className="thin-scrollbar max-h-[52vh] min-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-background/25 p-3 font-mono text-[11px] leading-6 text-foreground/80">{scene.content || "（正文为空）"}</pre>;
    }
    const header = value as ScriptHeader;
    return (
        <div className="thin-scrollbar grid max-h-[52vh] gap-3 overflow-y-auto rounded-lg border border-border/60 bg-background/25 p-3 text-[11px] leading-5">
            <p className="text-sm font-semibold text-foreground">{header.title}</p>
            <p className="text-muted-foreground">{header.logline || "（无一句话故事）"}</p>
            <p><span className="text-muted-foreground/60">人物：</span>{header.characters.map((character) => character.name).filter(Boolean).join("、") || "无"}</p>
            <p><span className="text-muted-foreground/60">剧集：</span>{header.episodes.map((episode) => `${episode.title}（${episode.sceneIds.length} 场）`).join("、") || "无"}</p>
            <p><span className="text-muted-foreground/60">发布记录：</span>{header.publications.length} 条</p>
        </div>
    );
}

type ScriptConflictModalProps = { open: boolean; projectId: string; conflicts: ScriptConflict[]; onClose: () => void };

export function ScriptConflictModal({ open, projectId, conflicts, onClose }: ScriptConflictModalProps) {
    const { message } = App.useApp();
    const [busy, setBusy] = useState(false);
    const choose = async (conflict: ScriptConflict, choice: "local" | "remote") => {
        setBusy(true);
        try {
            await resolveScriptConflict(projectId, conflict.scope, conflict.id, choice);
            message.success(choice === "local" ? "已保留本机内容" : "已采用云端内容");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "冲突处理失败");
        } finally { setBusy(false); }
    };
    return (
        <Modal title="处理同步冲突" open={open} onCancel={onClose} footer={null} width={980} destroyOnHidden>
            <div className="grid gap-4 py-1">
                <p className="text-xs leading-5 text-muted-foreground">本机和云端都改过同一内容。逐项选择要保留的一侧；其他场次已正常合并，不会被覆盖。</p>
                {conflicts.map((conflict, index) => (
                    <section key={`${conflict.scope}:${conflict.id || "header"}`} className="grid gap-2 rounded-xl border border-border/70 bg-card/30 p-3">
                        <div className="flex items-center gap-2"><GitMerge className="size-3.5 text-amber-500" /><span className="text-xs font-medium">{conflict.scope === "header" ? "项目信息" : `场次 ${conflict.id}`}</span><span className="ml-auto font-mono text-[9px] text-muted-foreground/50">{index + 1} / {conflicts.length}</span></div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-2"><span className="font-mono text-[9px] text-acid/80">本机</span><ConflictValue conflict={conflict} side="local" /><Button size="small" loading={busy} disabled={busy || !conflict.local} onClick={() => void choose(conflict, "local")}>保留本机</Button></div>
                            <div className="grid gap-2"><span className="font-mono text-[9px] text-muted-foreground/60">云端</span><ConflictValue conflict={conflict} side="remote" /><Button size="small" loading={busy} disabled={busy || !conflict.remote} onClick={() => void choose(conflict, "remote")}>采用云端</Button></div>
                        </div>
                    </section>
                ))}
            </div>
        </Modal>
    );
}
