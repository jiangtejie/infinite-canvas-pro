import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmContinuitySheet, FilmEpisode, FilmShot } from "@/lib/film/types";
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
- referenceAssets：建议参考资产（角色卡、场景图、上一镜画面等）。
要求：
1. 后续镜头的 prevFrameSummary 必须承接前一镜的 nextFrameRequirement；
2. 道具状态要跨镜连续，例如鱼从水里到岸上后，特写里鱼必须在岸上/手中，不能回到水里；
3. 环境光线整场保持一致，除非剧本明确写了时间或光线变化；
4. 禁项要具体，例如"螺栓不能变完整、标识不能清晰可读"；
5. 只输出 JSON 数组，长度与输入镜头数一致。`;

type FilmContinuityFieldKey =
    | "prevFrameSummary"
    | "nextFrameRequirement"
    | "characterState"
    | "propState"
    | "environment"
    | "cameraParams"
    | "audioState"
    | "emotionNarrative"
    | "risks"
    | "forbidden"
    | "referenceAssets";

export const FILM_CONTINUITY_FIELDS: Array<{ key: FilmContinuityFieldKey; label: string; promptLabel: string; group: string }> = [
    { key: "prevFrameSummary", label: "上一镜末帧", promptLabel: "上一镜末帧", group: "承接" },
    { key: "nextFrameRequirement", label: "本镜要求", promptLabel: "本镜画面要求", group: "承接" },
    { key: "characterState", label: "角色状态", promptLabel: "角色状态", group: "人物与道具" },
    { key: "propState", label: "道具状态", promptLabel: "道具状态", group: "人物与道具" },
    { key: "environment", label: "环境 / 光线", promptLabel: "环境光线", group: "环境与镜头" },
    { key: "cameraParams", label: "镜头参数", promptLabel: "镜头参数", group: "环境与镜头" },
    { key: "audioState", label: "声音状态", promptLabel: "声音", group: "声音与叙事" },
    { key: "emotionNarrative", label: "情绪 / 叙事", promptLabel: "情绪与叙事", group: "声音与叙事" },
    { key: "risks", label: "连续性风险", promptLabel: "连续性风险", group: "风险与禁项" },
    { key: "forbidden", label: "禁项", promptLabel: "禁项（必须避免）", group: "风险与禁项" },
    { key: "referenceAssets", label: "参考资产", promptLabel: "参考资产", group: "参考资产" },
];

export const FILM_CONTINUITY_GROUPS = FILM_CONTINUITY_FIELDS.reduce<Array<{ title: string; fields: typeof FILM_CONTINUITY_FIELDS }>>((groups, field) => {
    const group = groups.find((item) => item.title === field.group);
    if (group) group.fields.push(field);
    else groups.push({ title: field.group, fields: [field] });
    return groups;
}, []);

function buildFilmContinuityInput(episode: FilmEpisode) {
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
        }))
        .filter((sheet) => sheet.shotNo);
}

function toStringValue(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function normalizeContinuityShotNo(value: string) {
    return value.trim().replace(/^0+(?=\d)/, "");
}

/** 按镜号把交接单写回对应镜头；兼容 01/1 两种写法，镜号完全对不上时按顺序兜底。 */
export function applyFilmContinuity(episode: FilmEpisode, sheets: FilmContinuitySheet[]): FilmEpisode {
    const flat = episode.scenes.flatMap((scene) => scene.shots);
    const byShotNo = new Map(sheets.map((sheet) => [normalizeContinuityShotNo(sheet.shotNo), sheet]));
    const anyMatch = flat.some((shot) => byShotNo.has(normalizeContinuityShotNo(shot.shotNo)));
    const byShotId = new Map<string, FilmContinuitySheet>();
    flat.forEach((shot, index) => {
        const sheet = byShotNo.get(normalizeContinuityShotNo(shot.shotNo)) || (!anyMatch && sheets.length === flat.length ? sheets[index] : undefined);
        if (sheet) byShotId.set(shot.id, sheet);
    });
    return {
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
                const sheet = byShotId.get(shot.id);
                return sheet ? { ...shot, continuity: sheet, continuityCheck: "" } : shot;
            }),
        })),
    };
}

/** 把批量校验结果写回镜头，校验不再塞进交接单，避免产生「空壳交接单」。 */
export function applyFilmContinuityChecks(episode: FilmEpisode, results: Record<string, string>): FilmEpisode {
    return {
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
                const check = results[shot.id];
                return check ? { ...shot, continuityCheck: check } : shot;
            }),
        })),
    };
}

/** 拼接到生图/生视频提示词里的场记约束。 */
export function formatFilmContinuityPrompt(sheet: FilmContinuitySheet) {
    const rows = FILM_CONTINUITY_FIELDS
        .map((field) => sheet[field.key].trim() ? `${field.promptLabel}：${sheet[field.key]}` : "")
        .filter(Boolean);
    return rows.length ? `【场记交接·${sheet.shotNo}】\n${rows.join("\n")}` : "";
}

/** 同集内按顺序找上一镜，用于把上一镜画面作为衔接参考。 */
export function previousFilmShot(episodes: FilmEpisode[], shotId: string): FilmShot | undefined {
    const shots = flattenFilmShots(episodes);
    const index = shots.findIndex((shot) => shot.id === shotId);
    return index > 0 ? shots[index - 1] : undefined;
}
