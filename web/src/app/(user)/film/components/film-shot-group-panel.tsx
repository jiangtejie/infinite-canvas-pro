"use client";

import { useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { Link2, Plus, Trash2, X } from "lucide-react";

import type { FilmProject } from "@/lib/film/types";
import { cn } from "@/lib/utils";
import { addShotToFilmGroup, createFilmShotConnection, createFilmShotGroup, removeFilmShotConnection, removeFilmShotGroup, removeShotFromFilmGroup } from "../utils/film-shot-groups";
import { flattenFilmShots } from "../utils/parse-script";

/** 导演台的镜头组与连线面板：建组、拖入镜头、连接两个选中镜头、展示与删除。 */
export function FilmShotGroupPanel({
    project,
    selectedIds,
    onUpdate,
    onSelectShots,
}: {
    project: FilmProject;
    selectedIds: string[];
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onSelectShots: (shotIds: string[]) => void;
}) {
    const { message } = App.useApp();
    const [createOpen, setCreateOpen] = useState(false);
    const [groupTitle, setGroupTitle] = useState("");
    const [groupShotIds, setGroupShotIds] = useState<string[]>([]);
    const [dragOverGroupId, setDragOverGroupId] = useState("");
    const shots = flattenFilmShots(project.episodes);
    const groups = project.shotGroups || [];
    const connections = project.shotConnections || [];
    const shotNo = (shotId: string) => shots.find((shot) => shot.id === shotId)?.shotNo || "已删除镜头";

    const openCreate = () => {
        setGroupTitle(`镜头组 ${groups.length + 1}`);
        setGroupShotIds(selectedIds.filter((id) => shots.some((shot) => shot.id === id)));
        setCreateOpen(true);
    };

    const createGroup = () => {
        if (!groupShotIds.length) {
            message.warning("至少选择一个镜头");
            return;
        }
        onUpdate({ shotGroups: [...groups, createFilmShotGroup(groupTitle, groupShotIds)] });
        setCreateOpen(false);
        message.success("镜头组已创建");
    };

    const connectSelected = () => {
        if (selectedIds.length !== 2) {
            message.warning("先在左侧选中两个镜头，再点连接");
            return;
        }
        const next = createFilmShotConnection(connections, selectedIds[0], selectedIds[1]);
        if (next === connections) {
            message.info("这两个镜头已经连过线了");
            return;
        }
        onUpdate({ shotConnections: next });
        message.success("已连接两个镜头");
    };

    const dropShot = (shotId: string, groupId: string) => {
        if (!shotId || !shots.some((shot) => shot.id === shotId)) return;
        const next = addShotToFilmGroup(groups, groupId, shotId);
        if (next !== groups) onUpdate({ shotGroups: next });
    };

    return (
        <div className="punk-panel flex shrink-0 flex-col gap-2 rounded-xl px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">镜头组 / 连线</span>
                <span className="chip">{groups.length} 组</span>
                <span className="chip">{connections.length} 条连线</span>
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={openCreate}>新建镜头组</Button>
                <Button size="small" icon={<Link2 className="size-3.5" />} disabled={selectedIds.length !== 2} onClick={connectSelected}>连接选中镜头</Button>
                <span className="text-[11px] text-muted-foreground/60">把下方镜头卡拖到镜头组上即可加入；镜头被删除后自动清理组内引用。</span>
            </div>
            {groups.length || connections.length ? (
                <div className="flex flex-wrap items-start gap-2">
                    {groups.map((group) => (
                        <div
                            key={group.id}
                            onDragOver={(event) => { event.preventDefault(); setDragOverGroupId(group.id); }}
                            onDragLeave={() => setDragOverGroupId((current) => current === group.id ? "" : current)}
                            onDrop={(event) => {
                                event.preventDefault();
                                setDragOverGroupId("");
                                dropShot(event.dataTransfer.getData("application/x-film-shot-id") || event.dataTransfer.getData("text/plain"), group.id);
                            }}
                            className={cn("grid min-w-44 max-w-72 gap-1 rounded-lg border px-2 py-1.5", dragOverGroupId === group.id ? "border-acid bg-acid/[0.08]" : "border-border/60 bg-background/40")}
                        >
                            <div className="flex items-center gap-1">
                                <button type="button" title="选中该组镜头" onClick={() => onSelectShots(group.shotIds)} className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-foreground/85 hover:text-acid">
                                    {group.title}
                                </button>
                                <span className="font-mono text-[9px] text-muted-foreground/60">{group.shotIds.length} 镜</span>
                                <button type="button" aria-label={`删除镜头组 ${group.title}`} className="grid size-4 place-items-center rounded text-muted-foreground/60 hover:text-hot" onClick={() => onUpdate({ shotGroups: removeFilmShotGroup(groups, group.id) })}>
                                    <Trash2 className="size-3" />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {group.shotIds.map((shotId) => (
                                    <span key={shotId} className="inline-flex items-center gap-0.5 rounded border border-border/50 bg-card/50 px-1 py-0.5 font-mono text-[9px] text-muted-foreground/80">
                                        {shotNo(shotId)}
                                        <button type="button" aria-label={`从组中移出 ${shotNo(shotId)}`} className="text-muted-foreground/50 hover:text-hot" onClick={() => onUpdate({ shotGroups: removeShotFromFilmGroup(groups, group.id, shotId) })}>
                                            <X className="size-2.5" />
                                        </button>
                                    </span>
                                ))}
                                {!group.shotIds.length ? <span className="text-[10px] text-muted-foreground/50">拖入镜头即可加入</span> : null}
                            </div>
                        </div>
                    ))}
                    {connections.map((connection) => (
                        <span key={connection.id} className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-1">
                            <button type="button" title="选中这两个镜头" className="font-mono text-[10px] text-foreground/80 hover:text-acid" onClick={() => onSelectShots([connection.fromShotId, connection.toShotId])}>
                                {shotNo(connection.fromShotId)} → {shotNo(connection.toShotId)}
                            </button>
                            <button type="button" aria-label="删除连线" className="grid size-4 place-items-center rounded text-muted-foreground/60 hover:text-hot" onClick={() => onUpdate({ shotConnections: removeFilmShotConnection(connections, connection.id) })}>
                                <X className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>
            ) : (
                <p className="text-[11px] leading-5 text-muted-foreground/60">还没有镜头组或连线：选中多个镜头后「新建镜头组」，或选中两个镜头后「连接选中镜头」。</p>
            )}

            <Modal title="新建镜头组" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createGroup} okText="创建" cancelText="取消" destroyOnHidden>
                <div className="grid gap-3 py-1">
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">组名称</span>
                        <Input autoFocus value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="例如：回忆闪回组" />
                    </label>
                    <label className="grid gap-1">
                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">包含镜头</span>
                        <Select
                            mode="multiple"
                            value={groupShotIds}
                            onChange={setGroupShotIds}
                            options={shots.map((shot) => ({ value: shot.id, label: `${shot.shotNo} ${shot.description || ""}`.trim() }))}
                            optionFilterProp="label"
                            placeholder="选择要放进组的镜头"
                            maxTagCount="responsive"
                        />
                    </label>
                    <p className="text-[11px] leading-5 text-muted-foreground/60">也可以先创建空组，之后把镜头卡拖到组上加入。</p>
                </div>
            </Modal>
        </div>
    );
}
