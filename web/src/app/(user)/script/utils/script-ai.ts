import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";

import type { ScriptProject, ScriptScene } from "../types";
import { scriptSceneHeading } from "./script-project";

export type ScriptAiIssue = {
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
    suggestion: string;
};

export type ScriptSceneDiagnosis = {
    score: number;
    summary: string;
    issues: ScriptAiIssue[];
};

export const SCRIPT_REWRITE_MODES = [
    { value: "polish", label: "润色文字" },
    { value: "conflict", label: "加强冲突" },
    { value: "subtext", label: "对白更潜台词" },
    { value: "continue", label: "续写这一场" },
] as const;

export type ScriptRewriteMode = (typeof SCRIPT_REWRITE_MODES)[number]["value"];

const DIAGNOSIS_PROMPT = `你是一名资深编剧和剧本医生。请只针对用户给出的这一场戏做诊断，不要泛泛而谈，也不要输出鼓励式套话。
重点检查：
1. 这场戏有没有明确的目标、冲突、转折和结果；
2. 主角在这场的决定是否推动故事，还是只是在传递信息；
3. 对白是否有潜台词，是否存在解释性台词；
4. 这场与前后场的因果是否成立，是否重复之前的功能；
5. 是否有可利用的伏笔 / 道具 / 视觉动作。
只输出 JSON 对象，不要 Markdown，不要解释：
{"score":0-100,"summary":"一句话判断这场戏是否成立","issues":[{"severity":"high|medium|low","title":"问题标题","detail":"具体指出哪句/哪个动作有问题","suggestion":"可执行的修改方向"}]}
issues 控制在 3-6 条，按严重程度排序。`;

export function buildScriptSceneContext(project: ScriptProject, scene: ScriptScene) {
    return {
        project: {
            title: project.title,
            format: project.format,
            genre: project.genre,
            logline: project.logline,
            theme: project.theme,
            synopsis: project.synopsis,
        },
        characters: project.characters.map((character) => ({
            name: character.name,
            role: character.role,
            want: character.want,
            need: character.need,
            flaw: character.flaw,
            arc: character.arc,
        })),
        scene: {
            no: scene.no,
            heading: scriptSceneHeading(scene),
            characters: scene.characters,
            goal: scene.goal,
            conflict: scene.conflict,
            turn: scene.turn,
            outcome: scene.outcome,
            summary: scene.summary,
            content: scene.content,
        },
    };
}

export async function requestScriptSceneDiagnosis(config: AiConfig, project: ScriptProject, scene: ScriptScene): Promise<ScriptSceneDiagnosis> {
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: DIAGNOSIS_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(buildScriptSceneContext(project, scene)) }],
        tools: [],
        toolMode: "prompt-json",
    });
    return parseScriptSceneDiagnosis(turn.content);
}

export function parseScriptSceneDiagnosis(content: string): ScriptSceneDiagnosis {
    const text = (content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 诊断结果不是有效 JSON");
    let parsed: unknown;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
        throw new Error("AI 诊断结果不是有效 JSON");
    }
    const record = parsed as Record<string, unknown>;
    const rawIssues = Array.isArray(record.issues) ? record.issues : [];
    const issues = rawIssues
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
            severity: (item.severity === "high" || item.severity === "low" ? item.severity : "medium") as ScriptAiIssue["severity"],
            title: String(item.title || "问题").trim(),
            detail: String(item.detail || "").trim(),
            suggestion: String(item.suggestion || "").trim(),
        }))
        .filter((item) => item.detail || item.suggestion);
    const score = Number(record.score);
    return {
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
        summary: String(record.summary || "").trim(),
        issues,
    };
}

const REWRITE_PROMPT = `你是一名资深编剧搭档。根据用户提供的项目信息、这一场戏和改写要求，只输出改写后的剧本正文，不要解释、不要加标题、不要 Markdown 代码块。
要求：
1. 保持原有人物语气、世界观和叙事视角；
2. 只改用户指定的范围：有 selectedText 时只改写选中片段，没有时处理整场；
3. 对白要有潜台词，动作用可拍摄的画面，不写心理活动；
4. 不要引入项目里没有的新人物或新设定。`;

export async function requestScriptRewrite(config: AiConfig, project: ScriptProject, scene: ScriptScene, options: { mode: ScriptRewriteMode; instruction?: string; selectedText?: string }): Promise<string> {
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: REWRITE_PROMPT,
        messages: [{
            role: "user",
            content: JSON.stringify({
                ...buildScriptSceneContext(project, scene),
                mode: options.mode,
                instruction: options.instruction?.trim() || "",
                selectedText: options.selectedText?.trim() || "",
            }),
        }],
        tools: [],
        toolMode: "prompt-json",
    });
    return cleanScriptRewriteText(turn.content);
}

export function cleanScriptRewriteText(content: string) {
    const text = (content || "").trim().replace(/^```(?:[a-z]+)?/i, "").replace(/```$/, "").trim();
    return text.replace(/^["“]/, "").replace(/["”]$/, "").trim();
}
