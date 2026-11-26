import type { FilmAsset, FilmConsistencyReview } from "@/lib/film/types";
import type { FilmAssetReadinessReport } from "@/app/(user)/film/utils/film-asset-readiness";
import { filmAssetReadiness } from "@/app/(user)/film/utils/film-asset-readiness";
import { checkFilmStyleScenes } from "@/app/(user)/film/utils/film-style-check";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { filmReviewContextText } from "@/app/(user)/film/utils/film-ai-consistency";
import { CanvasNodeType, type CanvasConnection, type CanvasFilmMeta, type CanvasNodeData } from "../../types";
import { selectFilmReviewInput as selectGraphFilmReviewInput, type FilmGraphReviewInput } from "./film-review-input";

export { selectFilmReviewInput } from "./film-review-input";

export type FilmReviewSource = "duration" | "pacing" | "coverage" | "binding" | "style" | "consistency";

export type FilmReviewIssue = {
    id: string;
    level: "error" | "warning" | "info";
    scope: "project" | "scene" | "shot";
    source: FilmReviewSource;
    message: string;
    suggestion?: string;
    shotId?: string;
    sceneId?: string;
    targetNodeId?: string;
    targetShotId?: string;
    targetContextNodeId?: string;
    targetReview?: boolean;
};

export type FilmReviewReport = {
    shotCount: number;
    sceneCount: number;
    readiness: FilmAssetReadinessReport;
    issues: FilmReviewIssue[];
    fingerprint: string;
};

const ISSUE_ORDER: Record<FilmReviewIssue["level"], number> = { error: 0, warning: 1, info: 2 };
const ESTABLISHING_TYPES = ["ELS", "LS", "WS"];

export function selectFilmReview(nodes: CanvasNodeData[], connections: CanvasConnection[], film?: CanvasFilmMeta, title = "", costumes: FilmAsset[] = []): FilmReviewReport {
    const input = selectGraphFilmReviewInput(nodes, connections, film, title, costumes);
    const rawReadiness = filmAssetReadiness(input, input.shots.map((shot) => shot.id));
    const contextNodeByAsset = new Map<string, string>();
    const contextNodeByVariant = new Map<string, string>();
    const contextNodeByCostume = new Map<string, string>();
    for (const context of input.contexts) {
        const key = context.asset?.id || context.nodeId;
        if (!contextNodeByAsset.has(key)) contextNodeByAsset.set(key, context.nodeId);
        if (context.variantId) contextNodeByVariant.set(context.variantId, context.nodeId);
        if (context.stateId) {
            const state = context.asset?.character?.states.find((item) => item.id === context.stateId);
            if (state?.costumeId && !contextNodeByCostume.has(state.costumeId)) contextNodeByCostume.set(state.costumeId, context.nodeId);
        }
    }
    const readiness = {
        ...rawReadiness,
        missing: rawReadiness.missing.map((item) => ({
            ...item,
            contextNodeId: (item.variantId && contextNodeByVariant.get(item.variantId))
                || (item.assetId && contextNodeByCostume.get(item.assetId))
                || (item.assetId && contextNodeByAsset.get(item.assetId))
                || undefined,
        })),
    };
    const issues: FilmReviewIssue[] = [];
    const push = (issue: FilmReviewIssue) => issues.push(issue);
    const styleNodeId = nodes.find((node) => node.type === CanvasNodeType.FilmStyle)?.id;
    const styleText = resolveFilmStyleText({ stylePreset: film?.stylePresetId, style: input.style });
    const fingerprint = filmReviewFingerprint(input);

    if (!styleText) {
        push({
            id: styleNodeId ? "style-empty" : "style-missing",
            level: "warning",
            scope: "project",
            source: "style",
            message: styleNodeId
                ? "风格圣经没有可用风格文本，且未选择风格预设；生成只会使用导演风格。"
                : "项目缺少风格圣经，且未选择风格预设；生成只会使用导演风格。",
            suggestion: styleNodeId ? "在风格圣经里选择项目风格预设，或填写视觉提示。" : "新建风格圣经并选择项目风格预设。",
            targetNodeId: styleNodeId,
            targetContextNodeId: styleNodeId,
        });
    }

    if (!input.shots.length) {
        push({ id: "empty", level: "error", scope: "project", source: "coverage", message: "还没有分镜，先从剧本解析出镜头或手动添加。", targetReview: true });
    }
    input.scenes.forEach((scene) => {
        const shots = scene.shotIds.flatMap((id) => input.shots.filter((shot) => shot.id === id));
        const label = `${scene.episodeTitle} / ${scene.name}`;
        if (!shots.length) push({ id: `empty-scene-${scene.id}`, level: "warning", scope: "scene", source: "coverage", message: `${label}：还没有镜头，先从剧本解析出镜头或手动添加。`, sceneId: scene.id, targetNodeId: scene.id });
        if (shots.length === 1) push({ id: `single-shot-${scene.id}`, level: "warning", scope: "scene", source: "coverage", message: `${label}：只有 1 个镜头，连续性和节奏容易断裂`, sceneId: scene.id, shotId: shots[0]?.id, targetNodeId: scene.id, targetShotId: shots[0]?.id });
        const missingCharacters = shots.filter((entry) => !entry.contexts.some((context) => context.role === "character"));
        if (missingCharacters.length) push({ id: `missing-characters-${scene.id}`, level: "warning", scope: "scene", source: "coverage", message: `${label}：${missingCharacters.length} 个镜头未绑定角色`, sceneId: scene.id, shotId: missingCharacters[0].id, targetNodeId: scene.id, targetShotId: missingCharacters[0].id, suggestion: "为这些镜头绑定角色上下文，避免生成时漏掉人物参考" });
        const missingLocations = shots.filter((entry) => !entry.contexts.some((context) => context.role === "location"));
        if (missingLocations.length) push({ id: `missing-locations-${scene.id}`, level: "warning", scope: "scene", source: "coverage", message: `${label}：${missingLocations.length} 个镜头未绑定场景`, sceneId: scene.id, shotId: missingLocations[0].id, targetNodeId: scene.id, targetShotId: missingLocations[0].id, suggestion: "为这些镜头绑定场景上下文，避免空间参考缺失" });
        if (shots.length && !shots.some((item) => ESTABLISHING_TYPES.includes(item.shot.shotType))) {
            push({ id: `missing-establishing-${scene.id}`, level: "warning", scope: "scene", source: "coverage", message: `${label}：缺少建立镜头（大远景/远景/全景）`, sceneId: scene.id, shotId: shots[0]?.id, targetNodeId: scene.id, targetShotId: shots[0]?.id, suggestion: "补一个建立镜头交代空间，或把已有镜头改成全景" });
        }
        for (let index = 1; index < shots.length; index += 1) {
            const previous = shots[index - 1].shot;
            const current = shots[index].shot;
            if (previous.shotType && previous.shotType === current.shotType && previous.cameraMovement && previous.cameraMovement === current.cameraMovement) {
                push({ id: `repeat-${current.id}`, level: "info", scope: "shot", source: "pacing", message: `${label}：镜头 ${previous.shotNo} 与 ${current.shotNo} 景别和运镜都相同，可能显得重复`, shotId: current.id, targetNodeId: current.id, targetShotId: current.id });
            }
        }
    });
    input.shots.forEach(({ shot, scene, contexts }) => {
        if (shot.duration <= 0) push({ id: `zero-duration-${shot.id}`, level: "warning", scope: "shot", source: "duration", message: `镜头 ${shot.shotNo} 时长为 0 秒`, shotId: shot.id, targetNodeId: shot.id, targetShotId: shot.id });
        if (scene) {
            const sceneLabel = `${scene.episodeTitle} / ${scene.name}`;
            const text = `${shot.description} ${shot.dialogue}`.normalize("NFKC");
            input.assets.characters.filter((asset) => asset.name.trim().length >= 2).forEach((asset) => {
                const mentioned = [asset.name, ...asset.aliases].some((name) => name.trim() && text.includes(name.normalize("NFKC").trim()));
                if (mentioned && !contexts.some((context) => context.role === "character" && context.asset?.id === asset.id)) {
                    push({ id: `character-${asset.id}-${shot.id}`, level: "warning", scope: "shot", source: "binding", message: `${sceneLabel}：镜头 ${shot.shotNo} 提到「${asset.name}」但未绑定角色`, shotId: shot.id, targetNodeId: shot.id, targetShotId: shot.id });
                }
            });
        }
        contexts.forEach((context) => {
            if (context.role === "character" && context.stateId && context.asset && !context.asset.character?.states.some((state) => state.id === context.stateId)) {
                push({ id: `missing-state-${context.asset.id}-${context.stateId}-${shot.id}`, level: "warning", scope: "shot", source: "binding", message: `镜头 ${shot.shotNo} 绑定的状态「${context.stateId}」已失效`, shotId: shot.id, targetNodeId: shot.id, targetShotId: shot.id, targetContextNodeId: context.nodeId });
            }
        });
    });
    const styleReport = checkFilmStyleScenes(input.scenes.map((scene) => ({
        sceneId: scene.id,
        sceneName: scene.name,
        episodeTitle: scene.episodeTitle,
        shots: scene.shotIds.flatMap((id) => input.shots.find((entry) => entry.id === id)?.shot || []),
    })), film?.directorStyleId);
    styleReport.issues.forEach((issue) => push({
        id: `style-${issue.id}`,
        level: issue.level,
        scope: issue.sceneId ? "scene" : issue.shotId ? "shot" : "project",
        source: "style",
        message: `风格：${issue.message}`,
        shotId: issue.shotId,
        sceneId: issue.sceneId,
        targetNodeId: styleNodeId || issue.shotId || issue.sceneId,
        targetShotId: issue.shotId,
        targetContextNodeId: styleNodeId,
        suggestion: "在镜头详情里使用「应用风格提示」，或调整镜头景别/运镜",
    }));
    if (film?.targetDuration && film.targetDuration > 0) {
        const totalDuration = input.shots.reduce((total, entry) => total + Math.max(0, Number(entry.shot.duration) || 0), 0);
        const delta = totalDuration - film.targetDuration;
        const ratio = Math.abs(delta) / film.targetDuration;
        if (ratio > 0.2) {
            push({
                id: "target-duration",
                level: ratio > 0.4 ? "error" : "warning",
                scope: "project",
                source: "duration",
                message: `总时长 ${totalDuration.toFixed(0)} 秒，目标 ${film.targetDuration} 秒（${delta > 0 ? "超出" : "不足"} ${Math.abs(delta).toFixed(0)} 秒）`,
                suggestion: "调整分镜时长，或在项目设置里重新设定目标时长",
            });
        }
    }
    if (filmReviewIsStale(film?.consistencyReview, fingerprint)) {
        push({
            id: "consistency-stale",
            level: "warning",
            scope: "project",
            source: "consistency",
            message: "上次 AI 一致性检查已过期，结论仅供参考。",
            suggestion: "重新运行 AI 一致性检查",
            targetReview: true,
        });
    }
    (film?.consistencyReview?.issues || []).forEach((issue) => push({
        id: `consistency-${issue.id}`,
        level: issue.level,
        scope: issue.shotId ? "shot" : issue.sceneId ? "scene" : "project",
        source: "consistency",
        message: `一致性：${issue.message}`,
        suggestion: issue.suggestion || "打开一致性检查查看详情",
        shotId: issue.shotId,
        sceneId: issue.sceneId,
        targetNodeId: issue.shotId || issue.sceneId,
        targetShotId: issue.shotId,
        targetReview: !issue.shotId && !issue.sceneId,
    }));
    issues.sort((left, right) => ISSUE_ORDER[left.level] - ISSUE_ORDER[right.level]);
    return {
        shotCount: input.shots.length,
        sceneCount: input.scenes.length,
        readiness,
        issues,
        fingerprint,
    };
}

/** AI 检查读取的窄 graph input；输入变化即代表上次结果过期。 */
export function filmReviewFingerprint(input: FilmGraphReviewInput) {
    return hashFingerprint(filmReviewContextText(input));
}

export function filmReviewIsStale(review: FilmConsistencyReview | undefined, fingerprint: string | undefined) {
    return Boolean(review && fingerprint && review.graphFingerprint !== fingerprint);
}

function hashFingerprint(value: string) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
