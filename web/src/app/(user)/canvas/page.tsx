"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { Download, FileUp, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { PunkAura } from "@/components/ui/punk-aura";
import { LoadingState, EmptyState } from "@/components/ui/state-panel";
import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "./components/canvas-project-card";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore } from "./stores/use-canvas-store";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { exportCanvasProjects } from "./utils/canvas-export";

export default function CanvasPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const enterProject = (id: string) => {
        router.push(`/canvas/${id}`);
    };
    const createAndEnter = () => enterProject(createProject(`无限画布 ${projects.length + 1}`));
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project));
            message.success(`已导入 ${data.projects.length} 个画布`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <main className="h-full overflow-auto bg-transparent text-foreground">
            <div className="page-shell relative isolate flex flex-col gap-7 py-10 sm:py-12">
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[400px] overflow-hidden">
                    <PunkAura className="punk-aura opacity-40" />
                </div>
                <PageHeader
                    eyebrow="画布库"
                    title="我的画布"
                    description="每个画布独立保存节点、连线与外观，随时从上次停下的地方继续。"
                    meta={
                        <>
                            <span className="chip chip-acid">{projects.length} 个画布</span>
                            <span className="chip">本地优先</span>
                        </>
                    }
                    actions={
                        <>
                            <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                                导入画布
                            </Button>
                            <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                                新建画布
                            </Button>
                        </>
                    }
                />

                {selectedIds.length ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-acid/30 bg-acid/[0.06] px-4 py-2.5">
                        <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono tracking-[0.14em] text-acid uppercase">SELECTED</span>
                            <span className="text-muted-foreground">已选 {selectedIds.length} 个画布</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="small" icon={<Download className="size-3.5" />} onClick={() => void exportCanvasProjects(projects.filter((project) => selectedIds.includes(project.id)), `无限画布-${selectedIds.length}个项目`)}>
                                导出选中
                            </Button>
                            <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => setDeleteIds(selectedIds)}>
                                删除选中
                            </Button>
                        </div>
                    </div>
                ) : projects.length ? (
                    <div className="flex items-center gap-3">
                        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">按最近更新排序</p>
                        <span aria-hidden className="h-3 w-px bg-border" />
                        <Button size="small" type="text" danger className="!h-6 !px-1.5 !text-[11px]" disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                            删除全部
                        </Button>
                    </div>
                ) : null}

                {!hydrated ? (
                    <LoadingState className="min-h-[360px] rounded-xl border border-dashed border-border" label="正在加载画布" />
                ) : projects.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project, index) => (
                            <CanvasProjectCard key={project.id} project={project} index={index} />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        className="min-h-[360px] rounded-xl border border-dashed border-border bg-card/40"
                        title="还没有画布"
                        description="新建一个画布后，就可以独立保存节点、连线和画布外观。"
                        action={<Button type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>新建画布</Button>}
                    />
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </main>
    );
}
