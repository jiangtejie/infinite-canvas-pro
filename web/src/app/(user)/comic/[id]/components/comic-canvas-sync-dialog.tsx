"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Modal, Segmented, Select } from "antd";
import { ArrowLeftRight, Send } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { errorMessage } from "@/lib/utils";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import type { CanvasNodeData } from "@/app/(user)/canvas/types";
import type { ComicProject } from "../../types";
import { buildComicCanvasImport, buildComicCanvasUpdate, findLinkedComicCanvasNode } from "../../utils/comic-canvas-import";
import { applyComicCanvasWriteback } from "../../utils/comic-canvas-writeback";
import { comicComposedPageCount } from "../../utils/comic-project";

export function ComicCanvasSyncDialog({ project, onChange }: { project: ComicProject; onChange: (project: ComicProject) => void }) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const router = useRouter();
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"send" | "writeback">("send");
    const [target, setTarget] = useState<"new" | "existing">("new");
    const [targetId, setTargetId] = useState("");
    const [writebackId, setWritebackId] = useState("");
    const [importing, setImporting] = useState(false);
    const counts = comicComposedPageCount(project);
    const targetProject = projects.find((item) => item.id === targetId);
    const linkedComic = targetProject ? findLinkedComicCanvasNode(targetProject.nodes, project.id) : undefined;
    const updating = target === "existing" && Boolean(linkedComic);
    const linkedProjects = useMemo(() => projects.flatMap((canvas) => {
        const comic = findLinkedComicCanvasNode(canvas.nodes, project.id);
        return comic ? [{ canvas, comic }] : [];
    }), [projects, project.id]);
    const writebackTarget = linkedProjects.find((item) => item.canvas.id === writebackId) || linkedProjects[0];
    const writebackBook = writebackTarget?.comic.metadata?.comicBook;
    const writebackReady = Boolean(writebackBook?.pageProjectIds && Object.keys(writebackBook.pageProjectIds).length);

    useEffect(() => {
        if (targetId && projects.some((item) => item.id === targetId)) return;
        setTargetId(projects[0]?.id || "");
    }, [projects, targetId]);

    useEffect(() => {
        if (writebackId && linkedProjects.some((item) => item.canvas.id === writebackId)) return;
        setWritebackId(linkedProjects[0]?.canvas.id || "");
    }, [linkedProjects, writebackId]);

    const runImport = () => {
        if (!counts.composed || importing) return;
        if (target === "existing" && !targetProject) return void message.warning("先选择一个画布");
        setImporting(true);
        try {
            if (target === "existing" && targetProject) {
                if (linkedComic) {
                    const result = buildComicCanvasUpdate(project, targetProject.nodes, linkedComic.id);
                    updateProject(targetProject.id, { nodes: result.nodes, viewport: result.viewport });
                    message.success(`已更新「${linkedComic.title || "漫画册"}」：${result.pageCount} 页`);
                } else {
                    const plan = buildComicCanvasImport(project, targetProject.nodes);
                    updateProject(targetProject.id, { nodes: [...targetProject.nodes, ...plan.nodes], viewport: plan.viewport });
                    message.success(`已导入 ${plan.pageCount} 页到「${targetProject.title}」`);
                }
                router.push(`/canvas/${targetProject.id}`);
                return;
            }
            const plan = buildComicCanvasImport(project);
            const id = createProject(`${project.title || "漫画"} 漫画册`);
            updateProject(id, { nodes: plan.nodes, viewport: plan.viewport, autoTitlePending: false });
            message.success(`已新建画布并导入 ${plan.pageCount} 页`);
            router.push(`/canvas/${id}`);
        } catch (error) {
            message.error(errorMessage(error, "导入画布失败"));
        } finally {
            setImporting(false);
        }
    };

    const runWriteback = async () => {
        const comic = writebackTarget?.comic;
        const book = comic?.metadata?.comicBook;
        if (!comic || !book) return void message.warning("先选择一个已关联画布");
        if (!writebackReady) return void message.warning("漫画册缺少项目页映射，请先发送或更新一次画布再回写");
        const accepted = await confirm({
            title: `从「${writebackTarget.canvas.title || "画布"}」回写？`,
            description: "会把画布贴字写回项目页格，并调整同章节页序；有贴字的字段会被覆盖，相关页面退回草稿。跨章节页序不会回写。",
            confirmText: "开始回写",
        });
        if (!accepted) return;
        try {
            const result = applyComicCanvasWriteback(project, book);
            if (!result.updatedPages && !result.reorderedChapters) return void message.info("没有可回写的贴字或页序");
            onChange(result.project);
            const details = [result.updatedPages ? `${result.updatedPages} 页贴字` : "", result.reorderedChapters ? `${result.reorderedChapters} 章页序` : ""].filter(Boolean).join("、");
            message.success(`已回写：${details}${result.skippedLetters ? `，${result.skippedLetters} 条贴字未定位` : ""}`);
            setOpen(false);
        } catch (error) {
            message.error(errorMessage(error, "画布回写失败"));
        }
    };

    return (
        <>
            <Button icon={<ArrowLeftRight className="size-4" />} onClick={() => setOpen(true)}>画布同步</Button>
            <Modal title="画布同步" open={open} width={480} mask={{ closable: !importing }} onCancel={() => setOpen(false)} destroyOnHidden footer={null}>
                <div className="space-y-4 py-1">
                    <Segmented block value={mode} options={[{ label: "发送到画布", value: "send" }, { label: "从画布回写", value: "writeback" }]} onChange={(value) => setMode(value as "send" | "writeback")} />

                    {mode === "send" ? (
                        <>
                            <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 text-xs">
                                <div className="flex items-center justify-between"><span className="font-medium">已合成页面</span><span className="font-mono tabular-nums">{counts.composed} / {counts.total}</span></div>
                                {counts.composed < counts.total ? <p className="mt-1.5 text-[11px] leading-5 text-amber-600">还有 {counts.total - counts.composed} 页未合成，只会导入已合成页。</p> : <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground/60">全部页面已合成，将按页序导入。</p>}
                            </div>
                            <div><div className="mb-2 text-sm">目标画布</div><Segmented block value={target} options={[{ label: "新建画布", value: "new" }, { label: "已有画布", value: "existing" }]} onChange={(value) => setTarget(value as "new" | "existing")} /></div>
                            {target === "existing" ? <label className="block space-y-1.5 text-sm"><span>选择画布</span><Select className="w-full" showSearch optionFilterProp="label" loading={!hydrated} value={targetId || undefined} placeholder={hydrated && !projects.length ? "还没有画布，先新建一个" : "选择要加入的画布"} options={projects.map((item) => ({ value: item.id, label: `${item.title || "未命名画布"} · ${item.nodes.length} 个节点` }))} onChange={setTargetId} /></label> : null}
                            {linkedComic ? <div className="rounded-lg border border-acid/35 bg-acid/5 px-3 py-2 text-[11px] leading-5"><span className="font-medium">检测到已关联漫画册「{linkedComic.title || "漫画册"}」</span><p className="m-0 mt-1 text-muted-foreground">将按页序复用现有页面节点并保留贴字；新增页会追加，减少的页只移出漫画册，旧图片节点仍留在画布上。</p></div> : null}
                            <p className="m-0 text-[11px] leading-5 text-muted-foreground/60">{updating ? "会更新已有漫画册的页序、封面与图片，不再新建重复漫画册。" : "每个已合成页会生成一个图片节点，并自动创建一个已关联本漫画项目的漫画册节点；重复导入会新增节点，不会覆盖画布里的旧漫画册。"}</p>
                            <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                                <Button onClick={() => setOpen(false)} disabled={importing}>取消</Button>
                                <Button type="primary" icon={<Send className="size-3.5" />} loading={importing} disabled={!counts.composed || (target === "existing" && (!hydrated || !targetProject))} onClick={runImport}>{updating ? "更新并打开" : "导入并打开"}</Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <label className="block space-y-1.5 text-sm"><span>已关联画布</span><Select className="w-full" showSearch optionFilterProp="label" loading={!hydrated} disabled={!linkedProjects.length} value={writebackTarget?.canvas.id} placeholder={linkedProjects.length ? "选择要回写的画布" : "还没有已关联画布"} options={linkedProjects.map(({ canvas, comic }) => ({ value: canvas.id, label: `${canvas.title || "未命名画布"} · ${comic.metadata?.comicBook?.pageNodeIds.length || 0} 页 · ${letterCount(comic)} 条贴字` }))} onChange={setWritebackId} /></label>
                            {writebackTarget ? <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 text-xs"><div className="flex items-center justify-between"><span className="font-medium">漫画册</span><span>{writebackTarget.comic.title || "漫画册"}</span></div><div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>{writebackBook?.pageNodeIds.length || 0} 页 · {letterCount(writebackTarget.comic)} 条贴字</span><span>{writebackReady ? "可回写" : "缺少页映射"}</span></div></div> : null}
                            {!linkedProjects.length ? <p className="m-0 rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">还没有已关联的漫画册，先切到「发送到画布」导入一次。</p> : null}
                            {writebackTarget && !writebackReady ? <p className="m-0 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-amber-700">这个漫画册还没有项目页映射，先在「发送到画布」里选择该画布更新一次，再回来回写。</p> : null}
                            <p className="m-0 text-[11px] leading-5 text-muted-foreground/60">按页面位置把贴字写回页格：对白/思考 → 对白，旁白 → 旁白，拟声 → 拟声，只覆盖有贴字的字段；页序只调整同章节内的顺序。</p>
                            <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                                <Button onClick={() => setOpen(false)}>取消</Button>
                                <Button type="primary" icon={<ArrowLeftRight className="size-3.5" />} disabled={!writebackTarget || !writebackReady} onClick={() => void runWriteback()}>回写到项目</Button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </>
    );
}

function letterCount(comic: CanvasNodeData) {
    return Object.values(comic.metadata?.comicBook?.lettering || {}).reduce((total, list) => total + (list?.length || 0), 0);
}
