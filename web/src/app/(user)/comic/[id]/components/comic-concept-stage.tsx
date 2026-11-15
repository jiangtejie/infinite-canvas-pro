"use client";

import { useState } from "react";
import { App, Button, Input, InputNumber, Select } from "antd";
import { Sparkles } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";
import type { ComicProject } from "../../types";
import { requestComicConcept } from "../../utils/comic-ai";

const FORMAT_OPTIONS = [{ value: "page", label: "页漫（翻页）" }, { value: "strip", label: "条漫（竖向滚动）" }];
const DIRECTION_OPTIONS = [{ value: "rtl", label: "右 → 左（日漫）" }, { value: "ltr", label: "左 → 右" }];

export function ComicConceptStage({ project, onPatch }: { project: ComicProject; onPatch: (patch: Partial<ComicProject>) => void }) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const resolveModelConfig = useModelConfig();
    const [generating, setGenerating] = useState(false);
    const pages = project.chapters.flatMap((chapter) => chapter.pages).length;
    const generateConcept = async () => {
        if (!project.title.trim()) return void message.warning("先填作品名");
        const config = resolveModelConfig("text");
        if (!config) return;
        const accepted = await confirm({
            title: "用 AI 补全企划？",
            description: "会覆盖题材、目标读者、logline、故事梗概、画风指南和目标页数；现有内容请先确认或导出备份。",
            confirmText: "开始生成",
        });
        if (!accepted) return;
        setGenerating(true);
        try {
            onPatch(await requestComicConcept(config, project));
            message.success("企划已补全，可继续手动修改");
        } catch (error) {
            message.error(errorMessage(error, "AI 生成企划失败"));
        } finally {
            setGenerating(false);
        }
    };
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-5 rounded-xl border border-border/70 bg-card/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="eyebrow">Concept / 企划</p>
                        <h2 className="mt-2 text-lg font-semibold tracking-tight">先定作品的方向</h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">题材、读者和风格会约束后面的页格与台词；不用一次写完，改到满意为止。</p>
                    </div>
                    <Button size="small" icon={<Sparkles className="size-3.5" />} loading={generating} onClick={() => void generateConcept()}>AI 补全企划</Button>
                </div>
                <label className="block space-y-2 text-sm"><span>作品名</span><Input value={project.title} maxLength={100} onChange={(event) => onPatch({ title: event.target.value })} /></label>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-2 text-sm"><span>题材 / 类型</span><Input value={project.genre} maxLength={100} placeholder="都市、悬疑、美食、奇幻…" onChange={(event) => onPatch({ genre: event.target.value })} /></label>
                    <label className="block space-y-2 text-sm"><span>目标读者</span><Input value={project.audience} maxLength={100} placeholder="大学生、通勤读者、亲子…" onChange={(event) => onPatch({ audience: event.target.value })} /></label>
                </div>
                <label className="block space-y-2 text-sm"><span>一句话 logline</span><Input.TextArea rows={2} value={project.logline} maxLength={300} placeholder="主角是谁、想要什么、被什么挡住" onChange={(event) => onPatch({ logline: event.target.value })} /></label>
                <label className="block space-y-2 text-sm"><span>故事梗概</span><Input.TextArea rows={6} value={project.synopsis} maxLength={8000} placeholder="起承转合、主要人物关系与结局方向" onChange={(event) => onPatch({ synopsis: event.target.value })} /></label>
                <label className="block space-y-2 text-sm"><span>画风与表达指南</span><Input.TextArea rows={5} value={project.styleGuide} maxLength={5000} placeholder="黑白/网点、线条粗细、构图偏好、禁用元素、角色表情基调…" onChange={(event) => onPatch({ styleGuide: event.target.value })} /></label>
            </section>

            <aside className="space-y-4">
                <section className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-4">
                    <div className="text-[11px] font-medium text-muted-foreground">成品设定</div>
                    <label className="block space-y-2 text-sm"><span>成品形态</span><Select className="w-full" value={project.format} options={FORMAT_OPTIONS} onChange={(format) => onPatch({ format })} /></label>
                    <label className="block space-y-2 text-sm"><span>阅读方向</span><Select className="w-full" value={project.direction} options={DIRECTION_OPTIONS} onChange={(direction) => onPatch({ direction })} /></label>
                    <label className="block space-y-2 text-sm"><span>目标页数</span><InputNumber className="w-full" min={1} max={2000} value={project.targetPages} placeholder="可选" onChange={(value) => onPatch({ targetPages: value ?? undefined })} /></label>
                </section>
                <section className="rounded-xl border border-border/70 bg-card/40 p-4">
                    <div className="text-[11px] font-medium text-muted-foreground">当前进度</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3"><div className="font-mono text-xl font-semibold tabular-nums">{project.chapters.length}</div><div className="mt-0.5 text-[10px] text-muted-foreground">章节</div></div>
                        <div className="rounded-lg border border-border/60 bg-background/40 p-3"><div className="font-mono text-xl font-semibold tabular-nums">{pages}</div><div className="mt-0.5 text-[10px] text-muted-foreground">页</div></div>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-muted-foreground">下一步：到「剧本」里拆章节、页和格，写清每格的画面与对白。</p>
                </section>
            </aside>
        </div>
    );
}
