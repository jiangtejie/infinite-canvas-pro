import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmShot } from "../types";
import { formatFilmContinuityPrompt } from "./film-continuity-sheet";
import { compressFilmReference } from "./film-image-compress";

export type FilmContinuityCheckResult = {
    passed: boolean;
    issues: string[];
    summary: string;
};

const SYSTEM_PROMPT = `你是一名影视场记验收员。用户会给出一个镜头的分镜描述、场记交接单，以及实际生成的分镜图。
请对照交接单检查生成图是否合格，重点检查：
1. 时间、天气、环境光线是否与交接单一致；
2. 人物服装、姿态、手部动作是否延续；
3. 道具状态是否延续（位置、完整度、朝向），禁项是否被违反；
4. 画面内容是否完成本镜的叙事要求和景别运镜。
只输出 JSON 对象，不要 Markdown、不要解释，格式：
{"passed": true/false, "issues": ["具体问题"], "summary": "一句话结论"}
规则：小瑕疵可放过；违反禁项、道具状态错误、时间/场景错误必须 passed=false。`;

export async function requestFilmShotContinuityCheck(config: AiConfig, shot: FilmShot): Promise<FilmContinuityCheckResult> {
    if (!shot.imageUrl && !shot.storageKey) throw new Error("先生成分镜图，再做场记校验");
    const dataUrl = await imageToDataUrl({ url: shot.imageUrl, storageKey: shot.storageKey });
    if (!dataUrl) throw new Error("读取分镜图失败");
    const image = await compressFilmReference(dataUrl);
    const sheetText = shot.continuity ? formatFilmContinuityPrompt(shot.continuity) : "（该镜头还没有场记交接单，按画面描述判断基本合理性）";
    const text = [
        `镜头 ${shot.shotNo}｜${shot.shotType || ""}｜${shot.cameraMovement || ""}｜${shot.duration}s`,
        `画面描述：${shot.description || "无"}`,
        sheetText,
        "请判断这张生成图是否满足以上要求。",
    ].join("\n\n");
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: image } }] }],
        tools: [],
        toolMode: "prompt-json",
    });
    return parseFilmContinuityCheck(turn.content);
}

export function parseFilmContinuityCheck(content: string): FilmContinuityCheckResult {
    const text = (content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const body = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error("AI 校验结果不是有效 JSON");
    }
    if (!parsed || typeof parsed !== "object") throw new Error("AI 没有返回校验结果");
    const record = parsed as Record<string, unknown>;
    const issues = Array.isArray(record.issues)
        ? record.issues.map((item) => String(item).trim()).filter(Boolean)
        : typeof record.issues === "string" ? [record.issues.trim()].filter(Boolean) : [];
    return {
        passed: record.passed === true,
        issues,
        summary: typeof record.summary === "string" ? record.summary.trim() : "",
    };
}

/** 把校验结果写成交接单里的 validation 文本。 */
export function formatFilmContinuityValidation(result: FilmContinuityCheckResult) {
    return result.passed ? `通过：${result.summary || "画面与交接单一致"}` : `不通过：${result.issues.join("；") || result.summary || "与交接单不一致"}`;
}
