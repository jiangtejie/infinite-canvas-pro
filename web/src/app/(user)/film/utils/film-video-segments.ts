import { nanoid } from "nanoid";

import type { FilmVideoSegment } from "@/lib/film/types";

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

