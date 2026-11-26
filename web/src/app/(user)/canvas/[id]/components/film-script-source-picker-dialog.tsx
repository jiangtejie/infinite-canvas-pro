"use client";

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useUserStore } from "@/stores/use-user-store";
import { hydrateScriptIndex, useScriptStore } from "@/app/(user)/script/stores/use-script-store";
import { SCRIPT_FORMAT_OPTIONS } from "@/app/(user)/script/utils/script-project";
import type { ScriptFormat } from "@/app/(user)/script/types";

const formatLabel = (format: ScriptFormat) => SCRIPT_FORMAT_OPTIONS.find((item) => item.value === format)?.label || "电影";

export function FilmScriptSourcePickerDialog({ open, theme, onClose, onPick }: {
    open: boolean;
    theme: CanvasTheme;
    onClose: () => void;
    onPick: (projectId: string) => Promise<void>;
}) {
    const userId = useUserStore((state) => state.user?.id || "");
    const summaries = useScriptStore((state) => state.summaries);
    const [loading, setLoading] = useState(false);
    const [pendingId, setPendingId] = useState("");
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        void hydrateScriptIndex(userId || "guest").finally(() => setLoading(false));
    }, [open, userId]);
    const ordered = [...summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const pick = async (projectId: string) => {
        setPendingId(projectId);
        try {
            await onPick(projectId);
        } finally {
            setPendingId("");
        }
    };
    return (
        <Modal open={open} onCancel={onClose} footer={null} closable={false} centered width="min(900px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="text-base font-semibold">从剧本工作台导入</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>按锁定剧集建立来源；之后可在来源卡片预览并刷新，画布已有结构不会被删除。</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭剧本来源选择"><X className="size-4" /></button>
                </div>
                <div className="thin-scrollbar max-h-[56vh] min-h-[200px] overflow-y-auto px-5 py-4">
                    {loading && !ordered.length ? <div className="grid min-h-[160px] place-items-center text-xs" style={{ color: theme.node.muted }}>正在加载剧本列表…</div> : null}
                    {!loading && !ordered.length ? (
                        <div className="grid min-h-[160px] place-items-center gap-2 text-center text-xs" style={{ color: theme.node.muted }}>
                            <FileText className="size-5" />
                            <span>还没有剧本项目，先去剧本工作台创建一个。</span>
                        </div>
                    ) : null}
                    {ordered.length ? (
                        <div className="grid gap-2">
                            {ordered.map((project) => {
                                const disabled = !project.lockedEpisodeCount || Boolean(pendingId);
                                return (
                                    <button key={project.id} type="button" disabled={disabled} className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left disabled:opacity-50" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onClick={() => void pick(project.id)}>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs" style={{ color: theme.node.text }}>{project.title}</span>
                                            <span className="mt-0.5 block truncate text-[10px]" style={{ color: theme.node.muted }}>{formatLabel(project.format)} · {project.episodeCount} 集 {project.sceneCount} 场 · {project.lockedEpisodeCount ? `已锁定 ${project.lockedEpisodeCount} 集` : "还没有锁定剧集，先在剧本工作台锁定"}</span>
                                        </span>
                                        <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>{pendingId === project.id ? "导入中…" : project.lockedEpisodeCount ? "导入" : "不可导入"}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>导入会按当前锁定版本生成专属发布副本，只作用于这个画布。</span>
                    <button type="button" className="shrink-0 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>取消</button>
                </div>
            </div>
        </Modal>
    );
}
