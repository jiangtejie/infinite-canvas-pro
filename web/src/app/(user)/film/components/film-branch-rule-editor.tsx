"use client";

import { Button, Input, Select } from "antd";

import type { FilmBranchCondition, FilmBranchConditionOperator, FilmBranchEffect, FilmInteractiveVariable, FilmShotBranch } from "@/lib/film/types";

const OPERATOR_OPTIONS: Array<{ value: FilmBranchConditionOperator; label: string }> = [
    { value: "eq", label: "等于" },
    { value: "neq", label: "不等于" },
    { value: "gt", label: "大于" },
    { value: "gte", label: "大于等于" },
    { value: "lt", label: "小于" },
    { value: "lte", label: "小于等于" },
    { value: "truthy", label: "为真" },
    { value: "falsy", label: "为假" },
];

export function FilmBranchRuleEditor({ branch, variables, onChange }: { branch: FilmShotBranch; variables: FilmInteractiveVariable[]; onChange: (patch: Partial<FilmShotBranch>) => void }) {
    const conditions = branch.conditions || [];
    const effects = branch.effects || [];
    const defaultVariableId = variables[0]?.id || "";
    const patchCondition = (index: number, patch: Partial<FilmBranchCondition>) => {
        onChange({ conditions: conditions.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition) });
    };
    const patchEffect = (index: number, patch: Partial<FilmBranchEffect>) => {
        onChange({ effects: effects.map((effect, effectIndex) => effectIndex === index ? { ...effect, ...patch } : effect) });
    };
    return (
        <div className="grid gap-1.5 rounded-md border border-border/40 bg-background/30 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60 uppercase">显示条件</span>
                {conditions.length > 1 ? (
                    <Select size="small" className="!w-20" value={branch.conditionLogic || "all"} options={[{ value: "all", label: "全部满足" }, { value: "any", label: "任一满足" }]} onChange={(value) => onChange({ conditionLogic: value })} />
                ) : null}
                <Button size="small" type="text" className="!ml-auto !h-6 !px-1.5 !text-[10px]" disabled={!variables.length} onClick={() => onChange({ conditions: [...conditions, { variableId: defaultVariableId, operator: "eq", value: "" }] })}>+ 条件</Button>
            </div>
            {!variables.length ? <p className="text-[9px] leading-4 text-muted-foreground/55">先在分支面板顶部的「互动变量」里定义变量，才能添加条件。</p> : null}
            {conditions.map((condition, index) => {
                const operator = condition.operator;
                return (
                    <div key={index} className="flex flex-wrap items-center gap-1">
                        <Select size="small" className="!min-w-24 flex-1" value={condition.variableId} placeholder="变量" options={variables.map((variable) => ({ value: variable.id, label: variable.name + " (" + variable.type + ")" }))} onChange={(value) => patchCondition(index, { variableId: value })} />
                        <Select size="small" className="!w-[92px]" value={operator} options={OPERATOR_OPTIONS} onChange={(value) => patchCondition(index, { operator: value })} />
                        {operator !== "truthy" && operator !== "falsy" ? (
                            <Input size="small" className="!w-16" value={condition.value || ""} placeholder="值" onChange={(event) => patchCondition(index, { value: event.target.value })} />
                        ) : null}
                        <Button size="small" type="text" className="!size-6 !min-w-6 !px-0" onClick={() => onChange({ conditions: conditions.filter((_, conditionIndex) => conditionIndex !== index) })}>×</Button>
                    </div>
                );
            })}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60 uppercase">选择后效果</span>
                <Button size="small" type="text" className="!ml-auto !h-6 !px-1.5 !text-[10px]" disabled={!variables.length} onClick={() => onChange({ effects: [...effects, { variableId: defaultVariableId, operation: "set", value: "" }] })}>+ 效果</Button>
            </div>
            {effects.map((effect, index) => (
                <div key={index} className="flex flex-wrap items-center gap-1">
                    <Select size="small" className="!min-w-24 flex-1" value={effect.variableId} options={variables.map((variable) => ({ value: variable.id, label: variable.name }))} onChange={(value) => patchEffect(index, { variableId: value })} />
                    <Select size="small" className="!w-[76px]" value={effect.operation} options={[{ value: "set", label: "设为" }, { value: "add", label: "+值" }]} onChange={(value) => patchEffect(index, { operation: value })} />
                    <Input size="small" className="!w-16" value={effect.value} placeholder="值" onChange={(event) => patchEffect(index, { value: event.target.value })} />
                    <Button size="small" type="text" className="!size-6 !min-w-6 !px-0" onClick={() => onChange({ effects: effects.filter((_, effectIndex) => effectIndex !== index) })}>×</Button>
                </div>
            ))}
        </div>
    );
}
