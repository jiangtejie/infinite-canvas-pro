"use client";

import type { ScriptProject } from "../types";
import { collectScriptCharacterNames, scriptPageCount, scriptWordCount } from "../utils/script-project";

// 故事圣经：logline、主题、梗概与写作提示。
type ScriptStoryPanelProps = {
    project: ScriptProject;
    onUpdate: (patch: Partial<ScriptProject>) => void;
};

export function ScriptStoryPanel({ project, onUpdate }: ScriptStoryPanelProps) {
    const names = collectScriptCharacterNames(project);
    const scenesWithoutGoal = project.scenes.filter((scene) => !scene.goal.trim()).length;
    const hints = [
        !project.logline.trim() ? "先写一句话故事：谁、想要什么、被什么阻止、失败会怎样。" : "",
        !project.theme.trim() ? "写下这个故事的主题问题，后面每场戏都要围绕它。" : "",
        !project.characters.length ? "先建人物，把 want / need / flaw 写清楚再分场。" : "",
        !project.scenes.length ? "开始拆场：每场先写目标、冲突和转折，再写对白。" : "",
        project.scenes.length && scenesWithoutGoal ? `还有 ${scenesWithoutGoal} 场没有写「目标」。` : "",
    ].filter(Boolean);

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <div className="grid gap-4 lg:col-span-2">
                <section className="punk-panel rounded-xl p-4 transition-colors hover:border-border/80">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-acid/80 uppercase">一句话故事 / LOGLINE</span>
                        <span className="font-mono text-[9px] text-muted-foreground/50">{project.logline.length} 字</span>
                    </div>
                    <textarea
                        style={{ minHeight: 72 }}
                        className="mt-3 w-full resize-y rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm leading-7 text-foreground outline-none transition-colors hover:border-border focus:border-acid/50 focus:ring-2 focus:ring-acid/10"
                        value={project.logline}
                        placeholder="例如：一个过气的拳击手为了给女儿治病，接下最后一场假拳，却在擂台上发现对手是女儿的父亲。"
                        onChange={(event) => onUpdate({ logline: event.target.value })}
                    />
                </section>

                <section className="punk-panel rounded-xl p-4">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-acid/80 uppercase">主题</span>
                    <textarea
                        style={{ minHeight: 88 }}
                        className="mt-3 w-full resize-y rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm leading-7 text-foreground outline-none transition-colors hover:border-border focus:border-acid/50 focus:ring-2 focus:ring-acid/10"
                        value={project.theme}
                        placeholder="这个故事真正想说的是什么？主角最后明白了什么？"
                        onChange={(event) => onUpdate({ theme: event.target.value })}
                    />
                </section>

                <section className="punk-panel rounded-xl p-4">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-acid/80 uppercase">故事梗概</span>
                    <textarea
                        style={{ minHeight: 140 }}
                        className="mt-3 w-full resize-y rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm leading-7 text-foreground outline-none transition-colors hover:border-border focus:border-acid/50 focus:ring-2 focus:ring-acid/10"
                        value={project.synopsis}
                        placeholder="用 300–800 字把故事从头到尾讲一遍，先不写对白。"
                        onChange={(event) => onUpdate({ synopsis: event.target.value })}
                    />
                </section>
            </div>

            <aside className="grid gap-3 self-start">
                <section className="punk-panel rounded-xl p-4">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">当前进度</span>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                            ["场次", String(project.scenes.length)],
                            ["角色", String(names.length)],
                            ["字数", scriptWordCount(project).toLocaleString()],
                            ["约页数", String(scriptPageCount(project))],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
                                <span className="font-mono text-[9px] text-muted-foreground/50">{label}</span>
                                <p className="mt-0.5 font-mono text-sm text-foreground">{value}</p>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="rounded-xl border border-acid/25 bg-acid/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-acid/80 uppercase">下一步</span>
                    <div className="mt-3 grid gap-2">
                        {hints.length ? hints.map((hint) => <p key={hint} className="text-[11px] leading-5 text-muted-foreground/80">· {hint}</p>) : <p className="text-[11px] leading-5 text-acid/90">故事骨架已经齐了，继续把场景卡写扎实。</p>}
                    </div>
                </section>
            </aside>
        </div>
    );
}
