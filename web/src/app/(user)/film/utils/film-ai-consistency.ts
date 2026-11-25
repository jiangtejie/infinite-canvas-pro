import { nanoid } from "nanoid";

import { cleanAiJsonText, extractAiJsonBlock } from "@/lib/ai-json";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmConsistencyIssue, FilmConsistencyReview } from "@/lib/film/types";
import type { FilmGraphReviewInput } from "@/app/(user)/canvas/[id]/lib/film-review-input";
import { directorStyleFor } from "@/lib/film/director-styles";
import { scriptTextHash } from "@/lib/film/film-script-import";
import { structurePlanPromptContext } from "./film-ai-structure";
import { filmCharacterSignature } from "./film-character";
import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";

const MAX_CONTEXT_SHOTS = 160;

const CONSISTENCY_PROMPT = `你是影视项目的一致性监理（script supervisor + continuity editor），只做审片式检查，不重写剧本。
每个镜头的 characters 字段给出出场角色绑定：角色 ID、显示名与别名、造型状态、设定签名、造型引用的服装与持有道具，以及镜头级服装/身体/持有道具/情绪变化（continuity）；props 与 variant 字段给出本镜绑定的项目道具与场景气氛变体。请据此逐镜检查。
检查范围：
1. 结构覆盖：结构计划里每场的 beats / coverage 是否在镜头里体现，缺了哪类镜头或信息点；
2. 身份与造型漂移：同一角色跨镜长相/发型/身份是否改变；服装、身体状态、持有道具是否承接上一镜——镜头 continuity.intentionalChange 声明了刻意变化时允许该差异，否则要求连续；
3. 连续性：轴线、景别跳跃、道具/场景/时间/天气前后矛盾，台词与画面动作冲突；
4. 风格漂移：景别、运镜、构图、色彩是否偏离导演风格语法；
5. 绑定：镜头出场角色/状态绑定与台词、画面描述不一致，提到角色但未绑定。
不要重复机械检查（总时长、镜头数量、单镜成场）——这些由预演层负责。
只输出 JSON 对象，不要 Markdown、不要解释：
{"summary":"一句话整体判断","issues":[{"level":"error|warning|info","category":"structure|continuity|style|binding","message":"具体到哪场哪镜、哪里矛盾","suggestion":"可执行的修正方向","shotNo":"01","scene":"1-1 街道","episode":"第1集"}]}
issues 最多 12 条，按严重程度排序；没有问题时 issues 返回空数组。`;

export async function requestFilmConsistencyReview(config: AiConfig, input: FilmGraphReviewInput): Promise<FilmConsistencyReview> {
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: CONSISTENCY_PROMPT,
        messages: [{ role: "user", content: buildFilmConsistencyContext(input) }],
        tools: [],
        toolMode: "prompt-json",
    });
    return parseFilmConsistencyReview(turn.content, input);
}

export function buildFilmConsistencyContext(input: FilmGraphReviewInput) {
    const style = directorStyleFor(input.filmMeta?.directorStyleId);
    const characters = input.assets.characters;
    const locations = input.assets.locations;
    const props = input.assets.props;
    const scenes = input.scenes.map((scene) => ({
        id: scene.id,
        episode: scene.episodeTitle,
        name: scene.name,
        location: scene.location,
        time: scene.time,
        shotIds: scene.shotIds,
    }));
    const shots = input.shots.slice(0, MAX_CONTEXT_SHOTS).map((entry) => {
        const shot = entry.shot;
        const contexts = entry.contexts;
        const scene = entry.scene;
        return {
            shotNo: shot.shotNo,
            shotType: shot.shotType,
            cameraMovement: shot.cameraMovement,
            coverage: shot.coverage,
            description: (shot.description || "").slice(0, 120),
            dialogue: (shot.dialogue || "").slice(0, 120),
            audio: (shot.audio || "").slice(0, 80),
            prompt: (shot.prompt || "").slice(0, 120),
            scene: scene ? { episode: scene.episodeTitle, name: scene.name, location: scene.location, time: scene.time } : { episode: "", name: "未分场", location: "", time: "" },
            characters: contexts.filter((context) => context.role === "character").map((context) => {
                const asset = context.asset;
                const state = asset?.character?.states.find((item) => item.id === context.stateId);
                return {
                    characterId: asset?.id || context.nodeId,
                    name: asset?.name || context.name,
                    aliases: asset?.aliases || [],
                    state: state?.name || "",
                    costume: state?.costumeId ? input.assets.costumes.find((item) => item.id === state.costumeId)?.name || "" : "",
                    heldProps: (state?.heldPropIds || []).map((id) => props.find((item) => item.id === id)?.name || "").filter(Boolean),
                    signature: asset ? filmCharacterSignature(asset, { costumes: input.assets.costumes, props }) : "",
                    continuity: context.continuity,
                };
            }),
            props: contexts.filter((context) => context.role === "prop").map((context) => context.asset?.name || context.name),
            location: contexts.find((context) => context.role === "location")?.asset?.name || "",
            variant: (() => {
                const context = contexts.find((item) => item.role === "location");
                return context?.variantId
                    ? context.asset?.location?.variants.find((item) => item.id === context.variantId)?.name || ""
                    : "";
            })(),
            performance: shot.performance,
            soundDesign: shot.soundDesign,
        };
    });
    return JSON.stringify({
        title: input.title,
        targetDuration: input.filmMeta?.targetDuration,
        style: style ? { name: style.name, camera: style.camera, visual: style.visual, rules: style.rules.map((rule) => rule.label) } : undefined,
        scenes,
        structurePlan: structurePlanPromptContext(input.script?.structurePlan) || undefined,
        characters: characters.map((asset) => asset.name).slice(0, 40),
        locations: locations.map((asset) => asset.name).slice(0, 40),
        props: props.map((asset) => asset.name).slice(0, 40),
        costumes: input.assets.costumes.map((asset) => asset.name).slice(0, 40),
        styleBible: input.style?.visualPrompt || undefined,
        shots,
    });
}

export function filmReviewContextText(input: FilmGraphReviewInput) {
    return buildFilmConsistencyContext(input);
}

export function parseFilmConsistencyReview(content: string, input: FilmGraphReviewInput): FilmConsistencyReview {
    const body = extractAiJsonBlock(cleanAiJsonText(content), "object");
    if (!body) throw new Error("AI 一致性检查结果不是有效 JSON");
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error("AI 一致性检查结果不是有效 JSON");
    }
    const record = (parsed || {}) as Record<string, unknown>;
    const rawIssues = Array.isArray(record.issues) ? record.issues : [];
    const shots = input.shots.map((entry) => ({ shot: entry.shot, scene: entry.scene }));
    const issues: FilmConsistencyIssue[] = rawIssues
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .slice(0, 12)
        .map((item) => {
            const shotNo = String(item.shotNo || "").trim();
            const sceneName = String(item.scene || "").trim();
            const episodeTitle = String(item.episode || "").trim();
            const matchingShots = shotNo ? shots.filter((entry) => entry.shot.shotNo === shotNo) : [];
            const matchingScenes = sceneName || episodeTitle
                ? input.scenes.filter((scene) => (!episodeTitle || scene.episodeTitle === episodeTitle)
                    && (!sceneName || scene.name.includes(sceneName) || sceneName.includes(scene.name)))
                : [];
            const reportedScene = matchingScenes.length === 1 ? matchingScenes[0] : undefined;
            let matchedShot: typeof shots[number] | undefined;
            let matchedScene: typeof input.scenes[number] | undefined;
            if (!shotNo) {
                matchedScene = reportedScene;
            } else if (matchingShots.length === 1) {
                matchedShot = matchingShots[0];
                matchedScene = matchedShot.scene;
            } else if (matchingShots.length > 1 && reportedScene) {
                const sceneShots = matchingShots.filter((entry) => entry.scene?.id === reportedScene.id);
                if (sceneShots.length === 1) {
                    matchedShot = sceneShots[0];
                    matchedScene = reportedScene;
                }
            }
            const level = item.level === "error" || item.level === "info" ? item.level : "warning";
            const category = item.category === "structure" || item.category === "style" || item.category === "binding" ? item.category : "continuity";
            return {
                id: nanoid(),
                level: level as FilmConsistencyIssue["level"],
                category: category as FilmConsistencyIssue["category"],
                message: String(item.message || "").trim(),
                suggestion: String(item.suggestion || "").trim() || undefined,
                shotId: matchedShot?.shot.id,
                sceneId: matchedShot?.scene?.id || matchedScene?.id,
            };
        })
        .filter((issue) => issue.message);
    const hashSource = input.script?.source?.hash || input.script?.text || filmReviewContextText(input);
    return {
        scriptHash: scriptTextHash(hashSource),
        reviewedAt: new Date().toISOString(),
        summary: String(record.summary || "").trim() || undefined,
        issues,
    };
}
