"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button, Input, InputNumber, Select } from "antd";

import type { FilmShot, FilmShotStatus } from "../types";

const SHOT_TYPE_OPTIONS = ["ECU", "MCU", "CU", "MS", "WS", "LS", "OTS", "POV"].map((value) => ({ value, label: value }));

const STATUS_OPTIONS: Array<{ value: FilmShotStatus; label: string }> = [
    { value: "idle", label: "未开始" },
    { value: "image_ready", label: "分镜图已生成" },
    { value: "video_ready", label: "视频已生成" },
    { value: "failed", label: "失败" },
];

type FilmShotDetailProps = {
    shot: FilmShot;
    onChange: (patch: Partial<FilmShot>) => void;
    onDelete: () => void;
};

export function FilmShotDetail({ shot, onChange, onDelete }: FilmShotDetailProps) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="镜号">
                        <Input value={shot.shotNo} placeholder="1-1-01" onChange={(event) => onChange({ shotNo: event.target.value })} />
                    </Field>
                    <Field label="景别">
                        <Select allowClear placeholder="未设置" value={shot.shotType || undefined} options={SHOT_TYPE_OPTIONS} onChange={(value) => onChange({ shotType: value ?? "" })} />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="时长（秒）">
                        <InputNumber className="w-full" min={1} max={120} value={shot.duration} onChange={(value) => onChange({ duration: Number(value) || 5 })} />
                    </Field>
                    <Field label="状态">
                        <Select value={shot.status} options={STATUS_OPTIONS} onChange={(value: FilmShotStatus) => onChange({ status: value })} />
                    </Field>
                </div>
                <Field label="画面描述">
                    <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} value={shot.description} placeholder="这个镜头里发生什么、人物动作、环境、光线" onChange={(event) => onChange({ description: event.target.value })} />
                </Field>
                <Field label="台词 / 旁白">
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={shot.dialogue} placeholder="角色：台词，或旁白" onChange={(event) => onChange({ dialogue: event.target.value })} />
                </Field>
                <Field label="音频 / 音效">
                    <Input value={shot.audio} placeholder="环境声、音效、BGM 提示" onChange={(event) => onChange({ audio: event.target.value })} />
                </Field>
                <Field label="生成提示词">
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={shot.prompt} placeholder="用于生图 / 生视频的完整提示词" onChange={(event) => onChange({ prompt: event.target.value })} />
                    <button type="button" className="mt-1 w-fit font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-acid" onClick={() => onChange({ prompt: shot.description })}>
                        用画面描述填充
                    </button>
                </Field>
                <div className="pt-1">
                    <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
                        删除分镜
                    </Button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">{label}</span>
            {children}
        </div>
    );
}
