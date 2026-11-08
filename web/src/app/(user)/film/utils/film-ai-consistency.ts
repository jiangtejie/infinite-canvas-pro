import { nanoid } from "nanoid";

import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmConsistencyIssue, FilmConsistencyReview, FilmProject } from "@/lib/film/types";
import { directorStyleFor } from "@/lib/film/director-styles";
import { scriptTextHash } from "@/lib/film/film-script-import";
import { structurePlanPromptContext } from "./film-ai-structure";

const MAX_CONTEXT_SHOTS = 160;

const CONSISTENCY_PROMPT = `你是影视项目的一致性监理（script supervisor + continuity editor），只做审片式检查，不重写剧本。
检查范围：
1. 结构覆盖：结构计划里每场的 beats / coverage 是否在镜头里体现，缺了哪类镜头或信息点；
2. 连续性：轴线、景别跳跃、道具/服装/时间/天气/角色状态前后矛盾，台词与画面动作冲突；
3. 风格漂移：景别、运镜、构图、色彩是否偏离导演风格语法；
4. 绑定：角色/场景引用与台词、画面描述不一致。
不要重复机械检查（总时长、镜头数量、单镜成场）——这些由预演层负责。
只输出 JSON 对象，不要 Markdown、不要解释：
{"summary":"一句话整体判断","issues":[{"level":"error|warning|info","category":"structure|continuity|style|binding","message":"具体到哪场哪镜、哪里矛盾","suggestion":"可执行的修正方向","shotNo":"01","scene":"1-1 街道"}]}
issues 最多 12 条，按严重程度排序；没有问题时 issues 返回空数组。`;

export async function requestFilmConsistencyReview(config: AiConfig, project: FilmProject): Promise<FilmConsistencyReview> {
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: CONSISTENCY_PROMPT,
        messages: [{ role: "user", content: buildConsistencyContext(project) }],
        tools: [],
        toolMode: "prompt-json",
    });
    return parseFilmConsistencyReview(turn.content, project);
}

function buildConsistencyContext(project: FilmProject) {
    const style = directorStyleFor(project.directorStyleId);
    let shotCount = 0;
    const episodes = (project.episodes || []).slice(0, 60).map((episode) => ({
        episode: episode.title,
        scenes: episode.scenes.slice(0, 40).map((scene) => ({
            name: scene.name,
            location: scene.location,
            time: scene.time,
            shots: scene.shots.slice(0, 20).flatMap((shot) => {
                if (shotCount >= MAX_CONTEXT_SHOTS) return [];
                shotCount += 1;
                return [{
                    shotNo: shot.shotNo,
                    shotType: shot.shotType,
                    cameraMovement: shot.cameraMovement,
                    coverage: shot.coverage,
                    description: (shot.description || "").slice(0, 120),
                    dialogue: (shot.dialogue || "").slice(0, 120),
                    audio: (shot.audio || "").slice(0, 80),
                    prompt: (shot.prompt || "").slice(0, 120),
                    continuityCheck: shot.continuityCheck,
                    performance: shot.performance,
                    soundDesign: shot.soundDesign,
                }];
            }),
        })),
    }));
    return JSON.stringify({
        title: project.title,
        targetDuration: project.targetDuration,
        style: style ? { name: style.name, camera: style.camera, visual: style.visual, rules: style.rules.map((rule) => rule.label) } : undefined,
        structurePlan: structurePlanPromptContext(project.structurePlan) || undefined,
        characters: (project.characters || []).map((asset) => asset.name).slice(0, 40),
        locations: (project.locations || []).map((asset) => asset.name).slice(0, 40),
        episodes,
    });
}

export function parseFilmConsistencyReview(content: string, project: FilmProject): FilmConsistencyReview {
    const text = (content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 一致性检查结果不是有效 JSON");
    let parsed: unknown;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
        throw new Error("AI 一致性检查结果不是有效 JSON");
    }
    const record = (parsed || {}) as Record<string, unknown>;
    const rawIssues = Array.isArray(record.issues) ? record.issues : [];
    const allShots = (project.episodes || []).flatMap((episode) => episode.scenes.flatMap((scene) => scene.shots.map((shot) => ({ shot, scene }))));
    const issues: FilmConsistencyIssue[] = rawIssues
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .slice(0, 12)
        .map((item) => {
            const shotNo = String(item.shotNo || "").trim();
            const sceneName = String(item.scene || "").trim();
            const matchedShot = shotNo ? allShots.find((entry) => entry.shot.shotNo === shotNo) : undefined;
            const matchedScene = sceneName
                ? allShots.find((entry) => entry.scene.name.includes(sceneName) || sceneName.includes(entry.scene.name))
                : undefined;
            const level = item.level === "error" || item.level === "info" ? item.level : "warning";
            const category = item.category === "structure" || item.category === "style" || item.category === "binding" ? item.category : "continuity";
            return {
                id: nanoid(),
                level: level as FilmConsistencyIssue["level"],
                category: category as FilmConsistencyIssue["category"],
                message: String(item.message || "").trim(),
                suggestion: String(item.suggestion || "").trim() || undefined,
                shotId: matchedShot?.shot.id,
                sceneId: matchedShot?.scene.id || matchedScene?.scene.id,
            };
        })
        .filter((issue) => issue.message);
    const hashSource = project.scriptHash || project.scriptText || JSON.stringify(project.episodes || []);
    return {
        scriptHash: scriptTextHash(hashSource),
        reviewedAt: new Date().toISOString(),
        summary: String(record.summary || "").trim() || undefined,
        issues,
    };
}
