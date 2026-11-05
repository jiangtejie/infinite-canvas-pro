import { ArrowRight, Clapperboard, FileText, PenLine, Sparkles, Users } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";

const capabilities = [
    { icon: PenLine, title: "分场与大纲", description: "把一句想法拆成有冲突、有节奏的场次大纲，先定故事骨架。" },
    { icon: Users, title: "人物与关系", description: "梳理角色目标、关系变化和出场动机，让每场戏都有推进。" },
    { icon: FileText, title: "对白与动作", description: "生成可直接拍摄的对白、动作和场景描述，衔接后续分镜。" },
];

export default function ScriptPage() {
    return (
        <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
            <PageHeader
                eyebrow="SCRIPT / 剧本"
                title="AI 剧本创作"
                description="从一个想法开始，先写出可拍摄的剧本，再进入 AI 影视拆分镜、生成画面与成片。"
                meta={<span className="chip border-acid/35 text-acid">工作区搭建中</span>}
                actions={
                    <>
                        <Link href="/film" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:border-acid/50">
                            去 AI 影视
                            <ArrowRight className="size-3.5" />
                        </Link>
                        <span className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md bg-acid px-4 text-xs font-semibold text-[#0b0b09] opacity-60">
                            <Sparkles className="size-3.5" />
                            新建剧本
                        </span>
                    </>
                }
            />

            <section className="grid gap-3 md:grid-cols-3">
                {capabilities.map(({ icon: Icon, title, description }) => (
                    <article key={title} className="rounded-xl border border-border/70 bg-card/40 p-4">
                        <span className="grid size-9 place-items-center rounded-lg border border-acid/30 bg-acid/10 text-acid">
                            <Icon className="size-4" />
                        </span>
                        <h2 className="mt-3 text-sm font-semibold text-foreground">{title}</h2>
                        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{description}</p>
                    </article>
                ))}
            </section>

            <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border/70 bg-card/25 p-5">
                <div className="grid gap-1.5">
                    <p className="text-sm font-medium text-foreground">现阶段可以先在 AI 影视里写剧本</p>
                    <p className="max-w-2xl text-[11px] leading-5 text-muted-foreground">
                        打开任意影视项目，在「剧本」阶段粘贴或导入剧本，规则切分会拆出场次、对白和出场角色，AI 语义解析会补全人物关系与剧情节拍。
                    </p>
                </div>
                <Link href="/film" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-xs font-semibold" style={{ backgroundColor: "var(--acid)", color: "#0b0b09" }}>
                    <Clapperboard className="size-3.5" />
                    进入剧本工作台
                </Link>
            </section>
        </div>
    );
}
