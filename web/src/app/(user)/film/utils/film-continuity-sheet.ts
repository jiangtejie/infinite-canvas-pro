import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmContinuitySheet, FilmEpisode, FilmShot } from "../types";
import { flattenFilmShots } from "./parse-script";

const SYSTEM_PROMPT = `你是一名影视场记（continuity supervisor），负责把隐含的连续性显式化、把导演意图约束化。
根据用户给出的分镜列表，为每个镜头输出一份「场记交接单」，只输出 JSON 数组，不要 Markdown、不要解释。
每个元素字段必须齐全：
- shotNo：镜号，必须与输入一致；
- version：版本，固定输出 "v1"；
- prevFrameSummary：上一镜末帧摘要，写清楚画面里人物位置、动作、道具状态、光线与环境；第一镜写"本场第一镜，无上一镜"；
- nextFrameRequirement：下一镜首帧要求，写成可验收的画面标准；最后一镜写"本场最后一镜"；
- characterState：角色状态（服装、姿态、手部动作、情绪）；
- propState：道具状态（位置、完整度、朝向、是否可辨识）；
- environment：环境与光线（时间、天气、地点、光源方向）；
- cameraParams：镜头参数（景别、运镜、焦段感、机位）；
- audioState：声音状态（环境声、音效、台词）；
- emotionNarrative：情绪与叙事功能（这一镜承担的信息点）；
- risks：连续性风险（最容易被模型画错的地方）；
- forbidden：禁项（本镜不能出现的变化或错误）；
- referenceAssets：建议参考资产（角色卡、场景图、上一镜画面等）；
- validation：校验结果，先输出空字符串。
要求：
1. 后续镜头的 prevFrameSummary 必须承接前一镜的 nextFrameRequirement；
2. 道具状态要跨镜连续，例如鱼从水里到岸上后，特写里鱼必须在岸上/手中，不能回到水里；
3. 环境光线整场保持一致，除非剧本明确写了时间或光线变化；
4. 禁项要具体，例如"螺栓不能变完整、标识不能清晰可读"；
5. 只输出 JSON 数组，长度与输入镜头数一致。`;

export function buildFilmContinuityInput(episode: FilmEpisode) {
    const shots = flattenFilmShots([episode]);
    return {
        episode: episode.title,
        shots: shots.map((shot) => ({
            shotNo: shot.shotNo,
            shotType: shot.shotType,
            cameraMovement: shot.cameraMovement,
            duration: shot.duration,
            description: shot.description,
            dialogue: shot.dialogue,
            prompt: shot.prompt,
            characterIds: shot.characterIds || [],
            locationId: shot.locationId || "",
        })),
    };
}

export async function requestFilmContinuity(config: AiConfig, episode: FilmEpisode): Promise<FilmContinuitySheet[]> {
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(buildFilmContinuityInput(episode)) }],
        tools: [],
        toolMode: "prompt-json",
    });
    return parseFilmContinuitySheets(turn.content);
}

export function parseFilmContinuitySheets(content: string): FilmContinuitySheet[] {
    const text = (content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const body = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error("AI 返回的场记交接单不是有效 JSON");
    }
    if (!Array.isArray(parsed)) {
        const nested = parsed && typeof parsed === "object" ? Object.values(parsed as Record<string, unknown>).find(Array.isArray) : undefined;
        parsed = nested;
    }
    if (!Array.isArray(parsed)) throw new Error("AI 没有返回场记交接单数组");
    return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
            shotNo: toStringValue(item.shotNo),
            version: toStringValue(item.version) || "v1",
            prevFrameSummary: toStringValue(item.prevFrameSummary),
            nextFrameRequirement: toStringValue(item.nextFrameRequirement),
            characterState: toStringValue(item.characterState),
            propState: toStringValue(item.propState),
            environment: toStringValue(item.environment),
            cameraParams: toStringValue(item.cameraParams),
            audioState: toStringValue(item.audioState),
            emotionNarrative: toStringValue(item.emotionNarrative),
            risks: toStringValue(item.risks),
            forbidden: toStringValue(item.forbidden),
            referenceAssets: toStringValue(item.referenceAssets),
            validation: toStringValue(item.validation),
        }))
        .filter((sheet) => sheet.shotNo);
}

function toStringValue(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

/** 按镜号把交接单写回对应镜头。 */
export function applyFilmContinuity(episode: FilmEpisode, sheets: FilmContinuitySheet[]): FilmEpisode {
    const byShotNo = new Map(sheets.map((sheet) => [sheet.shotNo.trim(), sheet]));
    return {
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
                const sheet = byShotNo.get(shot.shotNo.trim());
                return sheet ? { ...shot, continuity: sheet } : shot;
            }),
        })),
    };
}

const EMPTY_SHEET_FIELDS = {
    version: "v1",
    prevFrameSummary: "",
    nextFrameRequirement: "",
    characterState: "",
    propState: "",
    environment: "",
    cameraParams: "",
    audioState: "",
    emotionNarrative: "",
    risks: "",
    forbidden: "",
    referenceAssets: "",
    validation: "",
};

export function emptyFilmContinuitySheet(shotNo: string): FilmContinuitySheet {
    return { shotNo, ...EMPTY_SHEET_FIELDS };
}

/** 把批量校验结果写回镜头；没有交接单的镜头补一份最小交接单。 */
export function applyFilmContinuityValidation(episode: FilmEpisode, results: Record<string, string>): FilmEpisode {
    return {
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
                const validation = results[shot.id];
                if (!validation) return shot;
                return { ...shot, continuity: { ...(shot.continuity || emptyFilmContinuitySheet(shot.shotNo)), validation } };
            }),
        })),
    };
}

/** 拼接到生图/生视频提示词里的场记约束。 */
export function formatFilmContinuityPrompt(sheet: FilmContinuitySheet) {
    const rows = [
        sheet.prevFrameSummary ? `上一镜末帧：${sheet.prevFrameSummary}` : "",
        sheet.nextFrameRequirement ? `本镜画面要求：${sheet.nextFrameRequirement}` : "",
        sheet.characterState ? `角色状态：${sheet.characterState}` : "",
        sheet.propState ? `道具状态：${sheet.propState}` : "",
        sheet.environment ? `环境光线：${sheet.environment}` : "",
        sheet.audioState ? `声音：${sheet.audioState}` : "",
        sheet.emotionNarrative ? `情绪与叙事：${sheet.emotionNarrative}` : "",
        sheet.forbidden ? `禁项（必须避免）：${sheet.forbidden}` : "",
    ].filter(Boolean);
    return rows.length ? `【场记交接·${sheet.shotNo}】\n${rows.join("\n")}` : "";
}

/** 同集内按顺序找上一镜，用于把上一镜画面作为衔接参考。 */
export function previousFilmShot(episodes: FilmEpisode[], shotId: string): FilmShot | undefined {
    const shots = flattenFilmShots(episodes);
    const index = shots.findIndex((shot) => shot.id === shotId);
    return index > 0 ? shots[index - 1] : undefined;
}
