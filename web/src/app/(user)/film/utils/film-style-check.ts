import type { FilmEpisode, FilmProject, FilmShot } from "@/lib/film/types";
import { directorStyleFor, type DirectorStyle, type DirectorStyleRule } from "@/lib/film/director-styles";

export type FilmStyleIssueLevel = "error" | "warning" | "info";

export type FilmStyleIssue = {
    id: string;
    ruleId: string;
    level: FilmStyleIssueLevel;
    message: string;
    shotId?: string;
    sceneId?: string;
};

export type FilmStyleMetrics = {
    shotCount: number;
    sceneCount: number;
    averageDuration: number;
    shotTypeRatio: Record<string, number>;
    movementRatio: number;
    keywordRatio: number;
};

export type FilmStyleReport = {
    style?: DirectorStyle;
    score: number;
    passed: number;
    total: number;
    issues: FilmStyleIssue[];
    metrics: FilmStyleMetrics;
};

type SceneShots = { sceneId: string; sceneName: string; episodeTitle: string; shots: FilmShot[] };

export function collectSceneShots(episodes: FilmEpisode[]): SceneShots[] {
    return episodes.flatMap((episode) => episode.scenes.map((scene) => ({
        sceneId: scene.id,
        sceneName: scene.name,
        episodeTitle: episode.title,
        shots: scene.shots,
    })));
}

function ratio(count: number, total: number) {
    return total > 0 ? count / total : 0;
}

function includesAny(value: string, words: string[]) {
    const text = value || "";
    return words.some((word) => word && text.includes(word));
}

function checkRule(rule: DirectorStyleRule, scenes: SceneShots[]): FilmStyleIssue[] {
    const issues: FilmStyleIssue[] = [];
    const allShots = scenes.flatMap((scene) => scene.shots);
    const total = allShots.length;
    if (!total) return issues;
    const push = (issue: FilmStyleIssue) => issues.push(issue);

    if (rule.kind === "scene-coverage") {
        const minCount = rule.minCount ?? 1;
        for (const scene of scenes) {
            const matched = scene.shots.filter((shot) => rule.shotTypes.includes(shot.shotType)).length;
            if (matched < minCount) {
                push({
                    id: rule.id + "-" + scene.sceneId,
                    ruleId: rule.id,
                    level: "warning",
                    message: scene.episodeTitle + " / " + scene.sceneName + "：" + rule.label,
                    sceneId: scene.sceneId,
                    shotId: scene.shots[0]?.id,
                });
            }
        }
        return issues;
    }

    if (rule.kind === "shot-type-ratio") {
        const matched = allShots.filter((shot) => rule.shotTypes.includes(shot.shotType)).length;
        const value = ratio(matched, total);
        if (rule.minRatio !== undefined && value < rule.minRatio) {
            push({ id: rule.id, ruleId: rule.id, level: "warning", message: rule.label + "：当前 " + Math.round(value * 100) + "%" });
        }
        if (rule.maxRatio !== undefined && value > rule.maxRatio) {
            push({ id: rule.id, ruleId: rule.id, level: "warning", message: rule.label + "：当前 " + Math.round(value * 100) + "%" });
        }
        return issues;
    }

    if (rule.kind === "movement-ratio") {
        const matched = allShots.filter((shot) => includesAny(shot.cameraMovement, rule.movements)).length;
        const value = ratio(matched, total);
        if (value < (rule.minRatio ?? 0.2)) {
            push({ id: rule.id, ruleId: rule.id, level: "warning", message: rule.label + "：当前 " + Math.round(value * 100) + "%" });
        }
        return issues;
    }

    if (rule.kind === "pacing") {
        const average = allShots.reduce((sum, shot) => sum + Math.max(0, Number(shot.duration) || 0), 0) / total;
        const tooFast = rule.minSeconds !== undefined && average < rule.minSeconds;
        const tooSlow = rule.maxSeconds !== undefined && average > rule.maxSeconds;
        if (tooFast || tooSlow) {
            push({ id: rule.id, ruleId: rule.id, level: "warning", message: rule.label + "：当前平均 " + average.toFixed(1) + " 秒" });
        }
        return issues;
    }

    if (rule.kind === "visual-keywords") {
        const withText = allShots.filter((shot) => (shot.prompt || shot.description || "").trim());
        const matched = withText.filter((shot) => includesAny(shot.prompt + " " + shot.description, rule.keywords)).length;
        const value = ratio(matched, withText.length || total);
        if (value < (rule.minRatio ?? 0.3)) {
            push({
                id: rule.id,
                ruleId: rule.id,
                level: "info",
                message: rule.label + "：当前 " + Math.round(value * 100) + "%（可用镜头详情里的「应用风格提示」补齐）",
            });
        }
        return issues;
    }

    return issues;
}

/** 校验项目镜头是否符合所选导演风格语法。没有选风格时返回空报告（score 100）。 */
export function checkFilmStyle(project: Pick<FilmProject, "episodes" | "directorStyleId">): FilmStyleReport {
    const style = directorStyleFor(project.directorStyleId);
    const scenes = collectSceneShots(project.episodes || []);
    const allShots = scenes.flatMap((scene) => scene.shots);
    const metrics: FilmStyleMetrics = {
        shotCount: allShots.length,
        sceneCount: scenes.length,
        averageDuration: allShots.length ? allShots.reduce((sum, shot) => sum + Math.max(0, Number(shot.duration) || 0), 0) / allShots.length : 0,
        shotTypeRatio: {},
        movementRatio: 0,
        keywordRatio: 0,
    };
    for (const shot of allShots) {
        const key = shot.shotType || "未设置";
        metrics.shotTypeRatio[key] = (metrics.shotTypeRatio[key] || 0) + 1;
    }
    if (!style) {
        return { style: undefined, score: 100, passed: 0, total: 0, issues: [], metrics };
    }
    const issues: FilmStyleIssue[] = [];
    let passed = 0;
    for (const rule of style.rules) {
        const ruleIssues = checkRule(rule, scenes);
        if (ruleIssues.length) issues.push(...ruleIssues);
        else passed += 1;
    }
    const total = style.rules.length;
    const matchedMovement = allShots.filter((shot) => includesAny(shot.cameraMovement, style.camera.movement.split(/[、，,]/).filter(Boolean))).length;
    const withText = allShots.filter((shot) => (shot.prompt || shot.description || "").trim());
    const matchedKeywords = withText.filter((shot) => includesAny(shot.prompt + " " + shot.description, style.visual.keywords)).length;
    metrics.movementRatio = ratio(matchedMovement, allShots.length);
    metrics.keywordRatio = ratio(matchedKeywords, withText.length || allShots.length);
    return {
        style,
        score: total ? Math.round((passed / total) * 100) : 100,
        passed,
        total,
        issues,
        metrics,
    };
}

/** 单个镜头视角的风格提示（用于镜头详情面板，不用整片规则）。 */
export function checkShotStyle(shot: FilmShot, style?: DirectorStyle): FilmStyleIssue[] {
    if (!style) return [];
    const issues: FilmStyleIssue[] = [];
    const text = shot.prompt + " " + shot.description;
    if (!shot.prompt.trim() && !shot.description.trim()) {
        issues.push({ id: "shot-prompt-empty", ruleId: "prompt", level: "info", message: "还没有画面描述或镜头 prompt，生成前建议补上", shotId: shot.id });
    } else if (!includesAny(text, style.visual.keywords)) {
        issues.push({ id: "shot-style-keywords", ruleId: "visual-keywords", level: "info", message: "镜头 prompt 未包含风格关键词：" + style.visual.keywords.slice(0, 3).join(" / "), shotId: shot.id });
    }
    return issues;
}

export function styleIssuesForShot(report: FilmStyleReport, shotId: string) {
    return report.issues.filter((issue) => issue.shotId === shotId);
}
