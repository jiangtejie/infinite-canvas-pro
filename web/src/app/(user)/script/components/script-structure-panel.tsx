"use client";

import type { ScriptProject } from "../types";
import { scriptSceneHeading, scriptSceneMissingFields } from "../utils/script-project";

type ScriptStructurePanelProps = {
    project: ScriptProject;
    onUpdate: (patch: Partial<ScriptProject>) => void;
};

const ACTS: Array<{ key: "actOne" | "actTwo" | "actThree"; label: string; hint: string }> = [
    { key: "actOne", label: "第一幕 / 建置", hint: "主角的日常、激励事件、第一次做出选择。" },
    { key: "actTwo", label: "第二幕 / 对抗", hint: "冲突升级、中点反转、主角被逼到最低点。" },
    { key: "actThree", label: "第三幕 / 解决", hint: "最后的决定、高潮、主角真正改变了什么。" },
];

export function ScriptStructurePanel({ project, onUpdate }: ScriptStructurePanelProps) {
    const incomplete = project.scenes.filter((scene) => scriptSceneMissingFields(scene).length > 0);
    const unnamedCharacters = project.scenes.filter((scene) => scene.characters.length === 0).length;

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <div className="grid gap-3 lg:col-span-2">
                {ACTS.map((act, index) => (
                    <section key={act.key} className="rounded-xl border border-border/70 bg-card/40 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] tracking-[0.16em] text-acid/80 uppercase">{act.label}</span>
                            <span className="text-[10px] text-muted-foreground/50">{act.hint}</span>
                            {index === 1 ? <span className="ml-auto chip">中点反转</span> : null}
                            {index === 2 ? <span className="ml-auto chip">高潮 / 结局</span> : null}
                        </div>
                        <textarea
                            className="mt-3 min-h-28 w-full resize-y rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm leading-7 text-foreground outline-none transition-colors focus:border-acid/50"
                            value={project[act.key]}
                            placeholder="这一幕发生了什么？主角的目标和阻力如何变化？"
                            onChange={(event) => onUpdate({ [act.key]: event.target.value })}
                        />
                    </section>
                ))}
            </div>

            <aside className="grid gap-3 self-start">
                <section className="rounded-xl border border-border/70 bg-card/40 p-4">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">结构诊断</span>
                    <div className="mt-3 grid gap-2 text-[11px] leading-5">
                        <p className="text-muted-foreground/80">共 {project.scenes.length} 场</p>
                        <p className={incomplete.length ? "text-hot/90" : "text-acid/90"}>{incomplete.length ? `${incomplete.length} 场缺少目标 / 冲突 / 转折 / 结果` : "场景四要素齐全"}</p>
                        <p className={unnamedCharacters ? "text-muted-foreground/70" : "text-acid/90"}>{unnamedCharacters ? `${unnamedCharacters} 场没有标注出场人物` : "每场都有出场人物"}</p>
                        <p className="text-muted-foreground/60">结构诊断是规则提示，不替你做判断。</p>
                    </div>
                </section>
                <section className="rounded-xl border border-border/70 bg-card/40 p-4">
                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">场次序列</span>
                    <div className="thin-scrollbar mt-3 grid max-h-[420px] gap-1 overflow-y-auto pr-1">
                        {project.scenes.length ? project.scenes.map((scene) => {
                            const missing = scriptSceneMissingFields(scene);
                            return (
                                <div key={scene.id} className="grid gap-0.5 rounded-md border border-border/40 bg-background/30 px-2 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-[9px] text-muted-foreground/50">{String(scene.no).padStart(2, "0")}</span>
                                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{scriptSceneHeading(scene)}</span>
                                        {missing.length ? <span className="font-mono text-[8px] text-hot/70">缺{missing.join("/")}</span> : <span className="font-mono text-[8px] text-acid/70">OK</span>}
                                    </div>
                                    {scene.summary.trim() ? <p className="line-clamp-1 pl-4 text-[10px] text-muted-foreground/60">{scene.summary}</p> : null}
                                </div>
                            );
                        }) : <p className="py-4 text-center text-[11px] text-muted-foreground/60">还没有场次，先去「分场」建场景卡。</p>}
                    </div>
                </section>
            </aside>
        </div>
    );
}
