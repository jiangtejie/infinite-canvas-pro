"use client";

import { Check, Download, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Input } from "antd";

import { CanvasNodeType } from "../types";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";

export function CanvasProjectCard({ project, index = 0 }: { project: CanvasProject; index?: number }) {
    const router = useRouter();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const previews = project.nodes.filter((node) => node.type === CanvasNodeType.Image && node.metadata?.content).slice(0, 3);
    const open = () => router.push(`/canvas/${project.id}`);
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };

    return (
        <article
            className={`punk-card brackets group relative flex min-h-[214px] cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-card-foreground ${selected ? "border-acid/45" : "border-border"}`}
            onClick={() => !editing && open()}
        >
            <div className="relative h-[104px] shrink-0 overflow-hidden border-b border-border/70 bg-muted/40">
                {previews.length ? (
                    <div className="flex h-full gap-1 p-1">
                        {previews.map((node) => (
                            <img key={node.id} src={node.metadata?.content} alt="" loading="lazy" decoding="async" className="h-full min-w-0 flex-1 rounded-[4px] object-cover opacity-90 transition duration-500 group-hover:opacity-100" />
                        ))}
                    </div>
                ) : (
                    <div className="relative flex h-full items-center justify-center overflow-hidden">
                        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle,var(--grid-dot)_1px,transparent_1.2px)] [background-size:14px_14px] opacity-70" />
                        <span className="relative font-mono text-3xl font-semibold tracking-tight text-foreground/20 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                )}
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
            </div>

            <div className="flex flex-1 flex-col justify-between gap-6 p-5 pt-4">
                <div className="flex items-start gap-3">
                    <input
                        type="checkbox"
                        checked={selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => toggleSelected(project.id, event.target.checked)}
                        className="mt-1.5 size-3.5 shrink-0 cursor-pointer accent-[var(--acid)]"
                        aria-label={`选择 ${project.title}`}
                    />
                    {editing ? (
                        <Input size="small" className="min-w-0" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                    ) : (
                        <button
                            type="button"
                            className="min-w-0 cursor-pointer text-left"
                            onClick={(event) => {
                                event.stopPropagation();
                                open();
                            }}
                        >
                            <h2 className="truncate text-lg font-semibold tracking-tight">{project.title}</h2>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="chip">{project.nodes.length} 节点</span>
                                <span className="chip">{project.connections.length} 连线</span>
                            </div>
                        </button>
                    )}
                </div>

                <div className="flex items-end justify-between gap-3">
                    <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/80 uppercase">
                        {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" onClick={(event) => event.stopPropagation()}>
                        {editing ? (
                            <>
                                <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label="保存名称" />
                                <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={stopEditing} aria-label="取消重命名" />
                            </>
                        ) : (
                            <>
                                <Button type="text" size="small" shape="circle" icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects([project], project.title || "矩灵画布")} aria-label="导出" />
                                <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => startEditing(project.id, project.title)} aria-label="重命名" />
                                <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds([project.id])} aria-label="删除" />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
