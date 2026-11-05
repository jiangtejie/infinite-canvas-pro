"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal, Select, Spin } from "antd";
import { Check, Copy, Sparkles } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import type { ScriptProject, ScriptScene } from "../types";
import { useScriptAi } from "../hooks/use-script-ai";
import { SCRIPT_REWRITE_MODES, type ScriptRewriteMode } from "../utils/script-ai";

type ScriptAiRewriteModalProps = {
    open: boolean;
    project: ScriptProject;
    scene: ScriptScene | null;
    selectedText: string;
    onClose: () => void;
    onApply: (text: string) => void;
};

export function ScriptAiRewriteModal({ open, project, scene, selectedText, onClose, onApply }: ScriptAiRewriteModalProps) {
    const copyText = useCopyText();
    const { rewriting, rewriteScene } = useScriptAi();
    const [mode, setMode] = useState<ScriptRewriteMode>("polish");
    const [instruction, setInstruction] = useState("");
    const [result, setResult] = useState("");

    useEffect(() => {
        if (open) {
            setResult("");
            setInstruction("");
        }
    }, [open, scene?.id]);

    const generate = async () => {
        if (!scene) return;
        const text = await rewriteScene(project, scene, mode, instruction, selectedText);
        if (text) setResult(text);
    };

    return (
        <Modal title="AI 润色与共创" open={open} onCancel={onClose} footer={null} width={760} destroyOnHidden>
            {scene ? (
                <div className="grid gap-3 py-1">
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                        <span className="font-mono text-[10px] text-muted-foreground/60">第 {scene.no} 场</span>
                        <span className="text-[11px] text-foreground/80">{selectedText ? `已选中 ${selectedText.replace(/\s/g, "").length} 字，只改选中片段` : "未选中，将处理整场"}</span>
                        {selectedText ? <span className="chip">保持上下文</span> : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <label className="grid gap-1">
                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">改写方式</span>
                            <Select value={mode} options={[...SCRIPT_REWRITE_MODES]} onChange={(value: ScriptRewriteMode) => setMode(value)} />
                        </label>
                        <label className="grid gap-1">
                            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">补充要求（可选）</span>
                            <Input value={instruction} placeholder="例如：更冷一点，不要解释情绪" onChange={(event) => setInstruction(event.target.value)} onPressEnter={() => void generate()} />
                        </label>
                    </div>
                    <Button type="primary" icon={<Sparkles className="size-3.5" />} loading={rewriting} onClick={() => void generate()}>生成建议</Button>

                    <div className="grid gap-1">
                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">建议稿（不会自动写入）</span>
                        {rewriting && !result ? (
                            <div className="grid place-items-center gap-2 rounded-lg border border-border/60 bg-background/30 py-12"><Spin /><span className="text-[11px] text-muted-foreground">正在写…</span></div>
                        ) : result ? (
                            <Input.TextArea readOnly value={result} autoSize={{ minRows: 8, maxRows: 18 }} className="font-mono text-[11px] leading-6" />
                        ) : (
                            <div className="rounded-lg border border-dashed border-border/70 bg-background/25 px-3 py-8 text-center text-[11px] text-muted-foreground/70">选一个方式，点「生成建议」。</div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground/50">AI 建议需要你确认后才会写入正文。</span>
                        <div className="flex gap-2">
                            {result ? <Button icon={<Copy className="size-3.5" />} onClick={() => copyText(result, "建议稿已复制")}>复制</Button> : null}
                            <Button disabled={!result} onClick={() => { onApply(result); onClose(); }} icon={<Check className="size-3.5" />}>
                                {selectedText ? "替换选中" : "插入到光标"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
