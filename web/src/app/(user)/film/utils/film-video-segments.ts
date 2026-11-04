import { nanoid } from "nanoid";

import type { FilmVideoSegment } from "../types";

export function createDefaultSegments(duration: number): FilmVideoSegment[] {
    return [{ id: nanoid(), start: 0, end: Math.max(1, Math.round(duration)), prompt: "" }];
}

/** 校验分段是否从 0 开始、连续且覆盖完整时长，返回可读错误。 */
export function validateSegments(segments: FilmVideoSegment[] | undefined, duration: number): string | null {
    if (!segments || !segments.length) return "请先划分视频时间段";
    const sorted = [...segments].sort((left, right) => left.start - right.start);
    if (Math.abs(sorted[0].start) > 0.001) return "第一段必须从 0 秒开始";
    if (Math.abs(sorted[sorted.length - 1].end - duration) > 0.001) return `最后一段必须结束在镜头时长 ${duration} 秒`;
    for (let index = 0; index < sorted.length; index += 1) {
        const segment = sorted[index];
        if (!(segment.end > segment.start)) return `第 ${index + 1} 段的结束时间必须大于开始时间`;
        if (index > 0 && Math.abs(segment.start - sorted[index - 1].end) > 0.001) return "时间段之间不能有空隙或重叠";
    }
    return null;
}

export function splitVideoSegment(segments: FilmVideoSegment[], segmentId: string): FilmVideoSegment[] {
    const index = segments.findIndex((segment) => segment.id === segmentId);
    if (index < 0) return segments;
    const segment = segments[index];
    const middle = Math.round((segment.start + segment.end) / 2);
    if (middle <= segment.start || middle >= segment.end) return segments;
    const left: FilmVideoSegment = { ...segment, end: middle };
    const right: FilmVideoSegment = { id: nanoid(), start: middle, end: segment.end, prompt: "" };
    return [...segments.slice(0, index), left, right, ...segments.slice(index + 1)];
}

export function mergeVideoSegmentWithPrevious(segments: FilmVideoSegment[], segmentId: string): FilmVideoSegment[] {
    const index = segments.findIndex((segment) => segment.id === segmentId);
    if (index <= 0) return segments;
    const previous = segments[index - 1];
    const current = segments[index];
    const merged: FilmVideoSegment = {
        ...previous,
        end: current.end,
        prompt: [previous.prompt.trim(), current.prompt.trim()].filter(Boolean).join("；"),
    };
    return [...segments.slice(0, index - 1), merged, ...segments.slice(index + 1)];
}

export function removeVideoSegment(segments: FilmVideoSegment[], segmentId: string): FilmVideoSegment[] {
    if (segments.length <= 1) return segments;
    const index = segments.findIndex((segment) => segment.id === segmentId);
    if (index < 0) return segments;
    if (index === 0) {
        const next = segments[1];
        return [{ ...next, start: 0 }, ...segments.slice(2)];
    }
    const previous = segments[index - 1];
    const current = segments[index];
    const nextSegments = [
        ...segments.slice(0, index - 1),
        { ...previous, end: current.end },
        ...segments.slice(index + 1),
    ];
    return nextSegments;
}

export type ComposeVideoPromptInput = {
    segments: FilmVideoSegment[];
    shotTypeLabel: string;
    cameraMovement: string;
    description: string;
    videoPrompt?: string;
    styleText?: string;
    mode: "reference" | "frames";
    hasFirstFrame?: boolean;
    hints?: string;
};

function formatSeconds(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/.0$/, "");
}

export function composeFilmVideoPrompt(input: ComposeVideoPromptInput): string {
    const parts: string[] = [];
    if (input.styleText) parts.push(`视觉风格：${input.styleText}`);
    const sceneLines = [
        input.description ? `画面内容：${input.description}` : "",
        input.shotTypeLabel ? `景别：${input.shotTypeLabel}` : "",
        input.cameraMovement ? `运镜：${input.cameraMovement}` : "",
        input.videoPrompt?.trim() ? `补充动作：${input.videoPrompt.trim()}` : "",
        input.hints ? `参考角色与场景：${input.hints}` : "",
    ].filter(Boolean);
    if (sceneLines.length) parts.push(sceneLines.join("；"));

    const timeline = [...input.segments]
        .sort((left, right) => left.start - right.start)
        .map((segment) => `${formatSeconds(segment.start)}-${formatSeconds(segment.end)}s：${segment.prompt.trim() || "保持当前画面状态"}`)
        .join("；");
    parts.push(`请严格按时间段控制动作节奏：${timeline}。`);

    if (input.mode === "frames") {
        if (input.hasFirstFrame) parts.push("保持首帧中的人物外观、构图与光线，不要切镜。");
    } else {
        parts.push("保持角色与场景外观一致，不要切镜。");
    }
    parts.push("避免画面跳变、镜头切换、人物变形、闪烁、字幕与水印。");
    return parts.join("\n\n");
}
