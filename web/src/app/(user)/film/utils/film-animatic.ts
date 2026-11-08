import type { FilmProject, FilmShot } from "@/lib/film/types";
import { checkFilmBindingIssues } from "./film-binding-check";
import { checkFilmStyle, type FilmStyleReport } from "./film-style-check";
import { findFilmVariableIssues } from "./film-interactive";

export type FilmAnimaticIssue = {
    id: string;
    level: "error" | "warning" | "info";
    scope: "project" | "scene" | "shot";
    source: "duration" | "pacing" | "coverage" | "continuity" | "binding" | "style" | "consistency" | "branch";
    message: string;
    suggestion?: string;
    shotId?: string;
    sceneId?: string;
};

export type FilmAnimaticShot = {
    shot: FilmShot;
    index: number;
    sceneId: string;
    sceneName: string;
    episodeTitle: string;
    start: number;
    duration: number;
};

export type FilmAnimaticScene = {
    id: string;
    name: string;
    episodeTitle: string;
    start: number;
    duration: number;
    shots: FilmAnimaticShot[];
};

export type FilmAnimatic = {
    scenes: FilmAnimaticScene[];
    shots: FilmAnimaticShot[];
    totalDuration: number;
    targetDuration?: number;
    durationDelta?: number;
    issues: FilmAnimaticIssue[];
    styleReport: FilmStyleReport;
    metrics: {
        shotCount: number;
        sceneCount: number;
        averageShotDuration: number;
        longestScene: { name: string; duration: number } | null;
    };
};

const ESTABLISHING_TYPES = ["ELS", "LS", "WS"];

function safeDuration(value: number) {
    return Math.max(0, Number(value) || 0);
}

/** 把项目编译成可播放的故事板时间线，并做时长/覆盖/连续性/风格校验。 */
export function buildFilmAnimatic(project: FilmProject): FilmAnimatic {
    const scenes: FilmAnimaticScene[] = [];
    const shots: FilmAnimaticShot[] = [];
    let cursor = 0;
    for (const episode of project.episodes || []) {
        for (const scene of episode.scenes || []) {
            const sceneStart = cursor;
            const sceneShots: FilmAnimaticShot[] = [];
            for (const shot of scene.shots || []) {
                const duration = safeDuration(shot.duration);
                const animaticShot: FilmAnimaticShot = {
                    shot,
                    index: shots.length,
                    sceneId: scene.id,
                    sceneName: scene.name,
                    episodeTitle: episode.title,
                    start: cursor,
                    duration,
                };
                shots.push(animaticShot);
                sceneShots.push(animaticShot);
                cursor += duration;
            }
            scenes.push({
                id: scene.id,
                name: scene.name,
                episodeTitle: episode.title,
                start: sceneStart,
                duration: Math.max(0, cursor - sceneStart),
                shots: sceneShots,
            });
        }
    }

    const totalDuration = shots.reduce((sum, item) => sum + item.duration, 0);
    const targetDuration = project.targetDuration && project.targetDuration > 0 ? project.targetDuration : undefined;
    const durationDelta = targetDuration ? totalDuration - targetDuration : undefined;
    const issues: FilmAnimaticIssue[] = [];
    const push = (issue: FilmAnimaticIssue) => issues.push(issue);

    if (!shots.length) {
        push({ id: "empty", level: "error", scope: "project", source: "coverage", message: "还没有分镜，先从剧本解析出镜头或手动添加。" });
    }

    if (targetDuration && durationDelta !== undefined) {
        const ratio = Math.abs(durationDelta) / targetDuration;
        if (ratio > 0.2) {
            push({
                id: "target-duration",
                level: ratio > 0.4 ? "error" : "warning",
                scope: "project",
                source: "duration",
                message: "总时长 " + totalDuration.toFixed(0) + " 秒，目标 " + targetDuration + " 秒（" + (durationDelta > 0 ? "超出" : "不足") + " " + Math.abs(durationDelta).toFixed(0) + " 秒）",
                suggestion: "调整分镜时长，或在项目设置里重新设定目标时长",
            });
        }
    }

    for (const scene of scenes) {
        const label = scene.episodeTitle + " / " + scene.name;
        if (scene.shots.length === 1) {
            push({ id: "single-shot-" + scene.id, level: "warning", scope: "scene", source: "coverage", message: label + "：只有 1 个镜头，连续性和节奏容易断裂", sceneId: scene.id, shotId: scene.shots[0]?.shot.id });
        }
        if (scene.duration > 0 && scene.duration < 3) {
            push({ id: "short-scene-" + scene.id, level: "info", scope: "scene", source: "pacing", message: label + "：整场只有 " + scene.duration.toFixed(1) + " 秒", sceneId: scene.id });
        }
        const hasEstablishing = scene.shots.some((item) => ESTABLISHING_TYPES.includes(item.shot.shotType));
        if (scene.shots.length && !hasEstablishing) {
            push({ id: "missing-establishing-" + scene.id, level: "warning", scope: "scene", source: "coverage", message: label + "：缺少建立镜头（大远景/远景/全景）", sceneId: scene.id, shotId: scene.shots[0]?.shot.id, suggestion: "补一个建立镜头交代空间，或把已有镜头改成全景" });
        }
        for (let index = 1; index < scene.shots.length; index += 1) {
            const prev = scene.shots[index - 1].shot;
            const current = scene.shots[index].shot;
            if (!prev.shotType || !current.shotType) continue;
            if (prev.shotType === current.shotType && prev.cameraMovement && prev.cameraMovement === current.cameraMovement) {
                push({
                    id: "repeat-" + current.id,
                    level: "info",
                    scope: "shot",
                    source: "pacing",
                    message: label + "：镜头 " + prev.shotNo + " 与 " + current.shotNo + " 景别和运镜都相同，可能显得重复",
                    shotId: current.id,
                });
            }
        }
    }

    for (const item of shots) {
        if (item.duration <= 0) {
            push({ id: "zero-duration-" + item.shot.id, level: "warning", scope: "shot", source: "duration", message: "镜头 " + item.shot.shotNo + " 时长为 0 秒", shotId: item.shot.id });
        }
        if (item.shot.branch) {
            if (!item.shot.branch.nextShotId) {
                push({ id: "branch-empty-" + item.shot.id, level: "warning", scope: "shot", source: "branch", message: "镜头 " + item.shot.shotNo + " 设置了互动分支，但没有选择目标镜头", shotId: item.shot.id });
            } else if (!shots.some((entry) => entry.shot.id === item.shot.branch?.nextShotId)) {
                push({ id: "branch-missing-" + item.shot.id, level: "warning", scope: "shot", source: "branch", message: "镜头 " + item.shot.shotNo + " 的分支目标镜头不存在", shotId: item.shot.id });
            } else if (item.shot.branch.nextShotId === item.shot.id) {
                push({ id: "branch-loop-" + item.shot.id, level: "info", scope: "shot", source: "branch", message: "镜头 " + item.shot.shotNo + " 的分支跳回自己", shotId: item.shot.id });
            }
        }
        const continuity = (item.shot.continuityCheck || "").trim();
        if (continuity && !continuity.startsWith("通过")) {
            push({
                id: "continuity-" + item.shot.id,
                level: "warning",
                scope: "shot",
                source: "continuity",
                message: "镜头 " + item.shot.shotNo + " 场记校验未通过：" + continuity.slice(0, 80),
                shotId: item.shot.id,
                suggestion: "打开镜头详情，按场记表修正或重新生成",
            });
        }
    }

    for (const binding of checkFilmBindingIssues(project.episodes || [], project.characters || [], project.locations || [])) {
        push({
            id: "binding-" + binding.id,
            level: binding.level === "warning" ? "warning" : "info",
            scope: binding.shotId ? "shot" : "project",
            source: "binding",
            message: binding.message,
            shotId: binding.shotId,
        });
    }

    for (const variableIssue of findFilmVariableIssues(project)) {
        push({
            id: "variable-" + variableIssue.shotId + "-" + variableIssue.message,
            level: "warning",
            scope: "shot",
            source: "branch",
            message: "镜头 " + variableIssue.shotNo + " 分支「" + variableIssue.branchLabel + "」：" + variableIssue.message,
            shotId: variableIssue.shotId,
        });
    }

    for (const issue of project.consistencyReview?.issues || []) {
        push({
            id: "consistency-" + issue.id,
            level: issue.level,
            scope: issue.shotId ? "shot" : issue.sceneId ? "scene" : "project",
            source: "consistency",
            message: "一致性：" + issue.message,
            suggestion: issue.suggestion || "打开一致性检查查看详情",
            shotId: issue.shotId,
            sceneId: issue.sceneId,
        });
    }

    const styleReport = checkFilmStyle(project);
    for (const styleIssue of styleReport.issues) {
        push({
            id: "style-" + styleIssue.id,
            level: styleIssue.level,
            scope: styleIssue.sceneId ? "scene" : styleIssue.shotId ? "shot" : "project",
            source: "style",
            message: "风格：" + styleIssue.message,
            sceneId: styleIssue.sceneId,
            shotId: styleIssue.shotId,
            suggestion: "在镜头详情里使用「应用风格提示」，或调整镜头景别/运镜",
        });
    }

    const longest = scenes.reduce<FilmAnimaticScene | null>((current, scene) => (!current || scene.duration > current.duration ? scene : current), null);
    return {
        scenes,
        shots,
        totalDuration,
        targetDuration,
        durationDelta,
        issues,
        styleReport,
        metrics: {
            shotCount: shots.length,
            sceneCount: scenes.length,
            averageShotDuration: shots.length ? totalDuration / shots.length : 0,
            longestScene: longest ? { name: longest.episodeTitle + " / " + longest.name, duration: longest.duration } : null,
        },
    };
}

export function formatAnimaticDuration(value: number) {
    const seconds = Math.max(0, Math.round(value));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes ? minutes + ":" + String(rest).padStart(2, "0") : seconds + "s";
}
