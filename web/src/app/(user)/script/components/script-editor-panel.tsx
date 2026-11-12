"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Select } from "antd";
import { Clapperboard, PenLine, Plus, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import type { ScriptProject, ScriptScene } from "../types";
import { collectScriptCharacterNames, createScriptScene, normalizeScriptCharacters, scriptSceneHeading, scriptSceneMissingFields } from "../utils/script-project";
import { ScriptAiDiagnosisModal } from "./script-ai-diagnosis-modal";
import { ScriptAiRewriteModal } from "./script-ai-rewrite-modal";

type ScriptEditorPanelProps = {
    project: ScriptProject;
    selectedSceneId: string;
    onSelectScene: (sceneId: string) => void;
    onUpdate: (patch: Partial<ScriptProject>) => void;
};

export function ScriptEditorPanel({ project, selectedSceneId, onSelectScene, onUpdate }: ScriptEditorPanelProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const scene = project.scenes.find((item) => item.id === selectedSceneId) || project.scenes[0];
    const characterNames = collectScriptCharacterNames(project);
    const [selection, setSelection] = useState({ start: 0, end: 0, text: "" });
    const [diagnosisOpen, setDiagnosisOpen] = useState(false);
    const [rewriteOpen, setRewriteOpen] = useState(false);

    useEffect(() => {
        setSelection({ start: 0, end: 0, text: "" });
        setDiagnosisOpen(false);
        setRewriteOpen(false);
    }, [scene?.id]);

    const updateScene = (patch: Partial<ScriptScene>) => {
        if (!scene) return;
        onUpdate({ scenes: project.scenes.map((item) => item.id === scene.id ? { ...item, ...patch } : item) });
    };

    const applyRewrite = (text: string) => {
        if (!scene || !text.trim()) return;
        const validSelection = Boolean(selection.text) && scene.content.slice(selection.start, selection.end) === selection.text;
        let next = scene.content;
        let position = selection.start;
        if (validSelection) {
            next = `${next.slice(0, selection.start)}${text}${next.slice(selection.end)}`;
        } else {
            const insertAt = Math.min(Math.max(0, selection.start), next.length);
            const prefix = next && !next.endsWith("\n") ? "\n\n" : next ? "\n" : "";
            next = `${next.slice(0, insertAt)}${prefix}${text}${next.slice(insertAt)}`;
            position = insertAt + prefix.length;
        }
        const cursor = position + text.length;
        updateScene({ content: next });
        setSelection({ start: cursor, end: cursor, text: "" });
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(cursor, cursor);
        });
    };

    const addScene = () => {
        const next = createScriptScene(project.scenes.length + 1);
        onUpdate({ scenes: [...project.scenes, next] });
        onSelectScene(next.id);
    };

    const insertText = (snippet: string) => {
        if (!scene) return;
        const textarea = textareaRef.current;
        if (!textarea) {
            updateScene({ content: `${scene.content}${scene.content.endsWith("\n") ? "" : "\n\n"}${snippet}` });
            return;
        }
        const start = textarea.selectionStart ?? scene.content.length;
        const end = textarea.selectionEnd ?? scene.content.length;
        const next = `${scene.content.slice(0, start)}${snippet}${scene.content.slice(end)}`;
        updateScene({ content: next });
        requestAnimationFrame(() => {
            textarea.focus();
            const position = start + snippet.length;
            textarea.setSelectionRange(position, position);
        });
    };

    if (!scene) {
        return (
            <EmptyState
                className="rounded-xl border border-dashed border-border/70 bg-card/25 py-10"
                icon={<Clapperboard className="size-5" />}
                title="还没有可以写的场景"
                description="先建一场，再开始写动作和对白。"
                action={<Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={addScene}>添加第一场</Button>}
            />
        );
    }

    return (
        <>
        <div className="script-editor-shell grid gap-3 lg:grid-cols-4" style={{ minHeight: "calc(100vh - 240px)" }}>
            <aside className="punk-panel flex max-h-[70vh] flex-col overflow-hidden rounded-xl">
                <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
                    <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground/60 uppercase">场次</span>
                    <Button size="small" type="text" aria-label="添加场景" icon={<Plus className="size-3.5" />} onClick={addScene} />
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
                    {project.scenes.map((item) => {
                        const active = item.id === scene.id;
                        const missing = scriptSceneMissingFields(item).length;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onSelectScene(item.id)}
                                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors", active ? "bg-acid/10 text-acid" : "text-foreground/80 hover:bg-foreground/5")}
                            >
                                <span className="font-mono text-[9px] text-muted-foreground/60">{String(item.no).padStart(2, "0")}</span>
                                <span className="min-w-0 flex-1 truncate text-[11px]">{scriptSceneHeading(item)}</span>
                                <span className={cn("size-1.5 shrink-0 rounded-full", missing ? "bg-hot/70" : "bg-acid/70")} />
                            </button>
                        );
                    })}
                </div>
                <div className="shrink-0 border-t border-border/60 px-3 py-2 font-mono text-[9px] text-muted-foreground/50">共 {project.scenes.length} 场</div>
            </aside>

            <section className="punk-panel flex min-h-0 flex-col overflow-hidden rounded-xl lg:col-span-3">
                <div className="grid shrink-0 gap-2 border-b border-border/60 bg-background/25 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Select size="small" className="w-24" value={scene.interiorExterior || undefined} placeholder="内景" options={[{ value: "内景" }, { value: "外景" }, { value: "内外景" }]} onChange={(value: ScriptScene["interiorExterior"]) => updateScene({ interiorExterior: value })} />
                        <Input size="small" className="max-w-44" value={scene.location} placeholder="地点" onChange={(event) => updateScene({ location: event.target.value })} />
                        <Input size="small" className="max-w-24" value={scene.timeOfDay} placeholder="日 / 夜" onChange={(event) => updateScene({ timeOfDay: event.target.value })} />
                        <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">{scene.content.replace(/\s/g, "").length} 字</span>
                    </div>
                    <Select size="small" mode="tags" value={scene.characters} options={characterNames.map((name) => ({ value: name, label: name }))} placeholder="本场出场人物" onChange={(value: string[]) => updateScene({ characters: normalizeScriptCharacters(value.join("、")) })} />
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-3 py-1.5">
                    <Button size="small" type="text" icon={<PenLine className="size-3.5" />} onClick={() => insertText("\n\n角色：台词")}>插入对白</Button>
                    <Button size="small" type="text" onClick={() => insertText("\n\n切至：")}>插入转场</Button>
                    <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />
                    <Button size="small" type="text" icon={<Sparkles className="size-3.5" />} onClick={() => setDiagnosisOpen(true)}>AI 诊断</Button>
                    <Button size="small" type="text" icon={<Sparkles className="size-3.5" />} onClick={() => setRewriteOpen(true)}>AI 润色</Button>
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground/45">动作用普通段落 · 对白用「角色：台词」</span>
                </div>

                <textarea
                    ref={textareaRef}
                    className="thin-scrollbar min-h-80 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[12px] leading-7 text-foreground/90 outline-none"
                    value={scene.content}
                    placeholder={"内景 咖啡馆 日\n\n阿健推门进来，雨水顺着衣角滴落。\n\n阿健：这么晚还开着？\n\n老板娘（抬头）：等你呢。"}
                    onChange={(event) => updateScene({ content: event.target.value })}
                    onSelect={(event) => {
                        const target = event.currentTarget;
                        setSelection({
                            start: target.selectionStart ?? 0,
                            end: target.selectionEnd ?? 0,
                            text: scene.content.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0),
                        });
                    }}
                />
            </section>
        </div>
        <ScriptAiDiagnosisModal open={diagnosisOpen} project={project} scene={scene} onClose={() => setDiagnosisOpen(false)} />
        <ScriptAiRewriteModal open={rewriteOpen} project={project} scene={scene} selectedText={selection.text} onClose={() => setRewriteOpen(false)} onApply={applyRewrite} />
        </>
    );
}
