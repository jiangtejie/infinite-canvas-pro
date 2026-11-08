import type { FilmBranchCondition, FilmInteractiveVariable, FilmProject, FilmShotBranch } from "@/lib/film/types";
import { flattenFilmShotsWithScene, shotBranchList } from "./film-branch";

export function initialFilmVariables(project: Pick<FilmProject, "interactiveVariables">): Record<string, string> {
    const values: Record<string, string> = {};
    for (const variable of project.interactiveVariables || []) {
        values[variable.id] = variable.initialValue ?? "";
    }
    return values;
}

function numeric(value?: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function truthy(value?: string) {
    const text = (value || "").trim().toLowerCase();
    return text !== "" && text !== "false" && text !== "0" && text !== "no";
}

export function evaluateFilmCondition(condition: FilmBranchCondition, variables: Record<string, string>): boolean {
    const left = variables[condition.variableId] ?? "";
    const right = condition.value ?? "";
    switch (condition.operator) {
        case "eq": return left === right;
        case "neq": return left !== right;
        case "gt": return numeric(left) > numeric(right);
        case "gte": return numeric(left) >= numeric(right);
        case "lt": return numeric(left) < numeric(right);
        case "lte": return numeric(left) <= numeric(right);
        case "truthy": return truthy(left);
        case "falsy": return !truthy(left);
        default: return true;
    }
}

/** 没有结构化条件时总是显示；all/any 默认 all。 */
export function evaluateFilmBranchConditions(branch: FilmShotBranch, variables: Record<string, string>): boolean {
    const conditions = branch.conditions || [];
    if (!conditions.length) return true;
    const results = conditions.map((condition) => evaluateFilmCondition(condition, variables));
    return branch.conditionLogic === "any" ? results.some(Boolean) : results.every(Boolean);
}

export function applyFilmBranchEffects(branch: FilmShotBranch, variables: Record<string, string>): Record<string, string> {
    const next = { ...variables };
    for (const effect of branch.effects || []) {
        if (!(effect.variableId in next)) continue;
        if (effect.operation === "add") {
            const current = Number(next[effect.variableId]);
            const delta = Number(effect.value);
            if (Number.isFinite(current) && Number.isFinite(delta)) next[effect.variableId] = String(current + delta);
        } else {
            next[effect.variableId] = effect.value;
        }
    }
    return next;
}

export type FilmVariableIssue = {
    shotId: string;
    shotNo: string;
    branchLabel: string;
    message: string;
};

/** 检查分支条件/效果引用的变量是否存在、数值运算是否作用在非数值变量上。 */
export function findFilmVariableIssues(project: Pick<FilmProject, "episodes" | "interactiveVariables">): FilmVariableIssue[] {
    const variables = new Map((project.interactiveVariables || []).map((variable) => [variable.id, variable]));
    const issues: FilmVariableIssue[] = [];
    for (const entry of flattenFilmShotsWithScene(project)) {
        shotBranchList(entry.shot).forEach((branch) => {
            const label = branch.label || "未命名分支";
            for (const condition of branch.conditions || []) {
                const variable = variables.get(condition.variableId);
                if (!variable) {
                    issues.push({ shotId: entry.shot.id, shotNo: entry.shot.shotNo, branchLabel: label, message: "条件引用了不存在的变量" });
                    continue;
                }
                if (["gt", "gte", "lt", "lte"].includes(condition.operator) && variable.type !== "number") {
                    issues.push({ shotId: entry.shot.id, shotNo: entry.shot.shotNo, branchLabel: label, message: "数值比较只能用于 number 变量" });
                }
            }
            for (const effect of branch.effects || []) {
                const variable = variables.get(effect.variableId);
                if (!variable) {
                    issues.push({ shotId: entry.shot.id, shotNo: entry.shot.shotNo, branchLabel: label, message: "效果引用了不存在的变量" });
                } else if (effect.operation === "add" && variable.type !== "number") {
                    issues.push({ shotId: entry.shot.id, shotNo: entry.shot.shotNo, branchLabel: label, message: "+值只能用于 number 变量" });
                }
            }
        });
    }
    return issues;
}

export type FilmVariableUsage = {
    variable: FilmInteractiveVariable;
    conditionCount: number;
    effectCount: number;
    shots: Array<{ shotId: string; shotNo: string; branchLabel: string }>;
};

/** 统计每个变量被哪些镜头/分支引用，供预演变量面板展示。 */
export function collectFilmVariableUsage(project: Pick<FilmProject, "episodes" | "interactiveVariables">): FilmVariableUsage[] {
    const usages = new Map<string, FilmVariableUsage>();
    for (const variable of project.interactiveVariables || []) {
        usages.set(variable.id, { variable, conditionCount: 0, effectCount: 0, shots: [] });
    }
    for (const entry of flattenFilmShotsWithScene(project)) {
        shotBranchList(entry.shot).forEach((branch) => {
            const label = branch.label || "未命名分支";
            for (const condition of branch.conditions || []) {
                const usage = usages.get(condition.variableId);
                if (!usage) continue;
                usage.conditionCount += 1;
                if (!usage.shots.some((shot) => shot.shotId === entry.shot.id)) usage.shots.push({ shotId: entry.shot.id, shotNo: entry.shot.shotNo, branchLabel: label });
            }
            for (const effect of branch.effects || []) {
                const usage = usages.get(effect.variableId);
                if (!usage) continue;
                usage.effectCount += 1;
                if (!usage.shots.some((shot) => shot.shotId === entry.shot.id)) usage.shots.push({ shotId: entry.shot.id, shotNo: entry.shot.shotNo, branchLabel: label });
            }
        });
    }
    return [...usages.values()];
}

export function variableLabel(variable?: FilmInteractiveVariable) {
    return variable ? variable.name : "未选择变量";
}

/** 用于分支面板展示变量当前值摘要。 */
export function describeFilmVariables(project: Pick<FilmProject, "interactiveVariables">, values: Record<string, string>) {
    return (project.interactiveVariables || []).map((variable) => variable.name + "=" + (values[variable.id] ?? variable.initialValue ?? ""));
}
