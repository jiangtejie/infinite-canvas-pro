"use client";

import { useEffect, useState } from "react";
import { Input, Modal } from "antd";
import { Check, Clapperboard, Eye, FolderPlus, Pencil, Trash2, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useFilmViewState } from "@/app/(user)/canvas/stores/use-film-view-store";
import type { FilmShotGroupSummary } from "../lib/film-shot-groups";

type Props = {
    theme: CanvasTheme;
    projectId: string;
    groups: FilmShotGroupSummary[];
    onCreate: (title: string, shotIds: string[]) => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
    onSelect: (shotIds: string[]) => void;
    onPreview: (shotIds: string[]) => void;
    onProduce: (shotIds: string[]) => void;
    onClose: () => void;
};

export function FilmShotGroupsDialog({ theme, projectId, groups, onCreate, onRename, onDelete, onSelect, onPreview, onProduce, onClose }: Props) {
    const confirm = useConfirm();
    const viewState = useFilmViewState(projectId);
    const selectedShotIds = [...viewState.selectedShotIds];
    const [title, setTitle] = useState(`镜头组 ${groups.length + 1}`);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftTitle, setDraftTitle] = useState("");
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    useEffect(() => {
        setTitle(`镜头组 ${groups.length + 1}`);
    }, [groups.length]);
    const canCreate = selectedShotIds.length > 0 && Boolean(title.trim());
    const create = () => {
        if (!canCreate) return;
        onCreate(title, selectedShotIds);
    };
    const startRename = (group: FilmShotGroupSummary) => {
        setEditingId(group.id);
        setDraftTitle(group.title);
    };
    const commitRename = (group: FilmShotGroupSummary) => {
        if (editingId !== group.id) return;
        onRename(group.id, draftTitle);
        setEditingId(null);
    };
    const remove = async (group: FilmShotGroupSummary) => {
        const ok = await confirm({ title: `删除镜头组「${group.title}」？`, description: "只删除分组，不会删除镜头本身。", confirmText: "删除", tone: "warning" });
        if (ok) onDelete(group.id);
    };

    return (
        <Modal open onCancel={onClose} footer={null} closable={false} centered width="min(780px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-base font-semibold"><FolderPlus className="size-4" style={{ color: theme.canvas.selectionStroke }} />镜头组</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>把镜头表 / 故事板里勾选的镜头存成一组，按全片顺序用于批量制作或预览。</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭镜头组"><X className="size-4" /></button>
                </div>
                <div className="thin-scrollbar flex max-h-[62vh] flex-col gap-3 overflow-y-auto px-5 py-4">
                    <div className="flex flex-col gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>当前选中 {selectedShotIds.length} 镜</span>
                            <span style={{ color: theme.node.muted }}>{selectedShotIds.length ? "命名后保存为镜头组" : "先在镜头表或故事板勾选镜头"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input size="small" value={title} style={inputStyle} placeholder="镜头组名称" onChange={(event) => setTitle(event.target.value)} onPressEnter={create} />
                            <button type="button" className="shrink-0 rounded-full border px-3 py-1 text-[11px] disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionSoft, color: theme.node.text }} disabled={!canCreate} onClick={create}>创建镜头组</button>
                        </div>
                    </div>
                    {groups.length ? groups.map((group) => {
                        const shotIds = group.shots.map((entry) => entry.shot.id);
                        return (
                            <div key={group.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                <div className="flex flex-wrap items-center gap-2">
                                    {editingId === group.id ? (
                                        <Input size="small" autoFocus value={draftTitle} style={{ ...inputStyle, maxWidth: 240 }} onChange={(event) => setDraftTitle(event.target.value)} onPressEnter={() => commitRename(group)} onBlur={() => commitRename(group)} />
                                    ) : (
                                        <button type="button" className="min-w-0 truncate text-xs font-medium" style={{ color: theme.node.text }} onDoubleClick={() => startRename(group)} title="双击重命名">{group.title}</button>
                                    )}
                                    <button type="button" className="grid size-6 place-items-center rounded" style={{ color: theme.node.muted }} onClick={() => startRename(group)} aria-label={`重命名镜头组 ${group.title}`}><Pencil className="size-3" /></button>
                                    <span className="text-[10px]" style={{ color: theme.node.muted }}>{group.shots.length} 镜 · {group.duration.toFixed(0)}s · 图 {group.imageCount} / 视频 {group.videoCount} / 缺 {group.missingCount}</span>
                                    {group.removedCount ? <span className="text-[10px]" style={{ color: theme.node.muted }}>已移除 {group.removedCount} 镜</span> : null}
                                    <span className="ml-auto flex items-center gap-1">
                                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={!shotIds.length} onClick={() => onSelect(shotIds)}><Check className="size-2.5" />选入镜头表</button>
                                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }} disabled={!shotIds.length} onClick={() => onProduce(shotIds)}><Clapperboard className="size-2.5" />制作组</button>
                                        <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={!shotIds.length} onClick={() => onPreview(shotIds)}><Eye className="size-2.5" />预览组</button>
                                        <button type="button" className="grid size-6 place-items-center rounded" style={{ color: theme.node.muted }} onClick={() => void remove(group)} aria-label={`删除镜头组 ${group.title}`}><Trash2 className="size-3" /></button>
                                    </span>
                                </div>
                                {group.shots.length ? (
                                    <div className="flex flex-wrap gap-1">
                                        {group.shots.slice(0, 10).map((entry) => <span key={entry.shot.id} className="rounded-full border px-1.5 py-0.5 font-mono text-[10px] tabular-nums" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{entry.shot.metadata?.filmShot?.shotNo || entry.shot.title}</span>)}
                                        {group.shots.length > 10 ? <span className="text-[10px]" style={{ color: theme.node.muted }}>等 {group.shots.length} 镜</span> : null}
                                    </div>
                                ) : <span className="text-[10px]" style={{ color: theme.node.muted }}>组内镜头已全部移除</span>}
                            </div>
                        );
                    }) : <div className="grid min-h-[120px] place-items-center text-sm" style={{ color: theme.node.muted }}>还没有镜头组，先在镜头表/故事板勾选镜头再创建。</div>}
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>组内镜头删除后自动忽略，不会影响画布内容。</span>
                    <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>关闭</button>
                </div>
            </div>
        </Modal>
    );
}
