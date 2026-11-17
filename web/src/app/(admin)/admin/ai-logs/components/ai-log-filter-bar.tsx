"use client";

import { Switch } from "antd";

import { AdminFilterBar } from "../../components/admin-filter-bar";

export function AiLogFilterBar({
    keyword,
    onSearch,
    onReset,
    localDirectReportEnabled,
    savingLocalDirectReport,
    onToggleLocalDirectReport,
}: {
    keyword: string;
    onSearch: (value: string) => void;
    onReset: () => void;
    localDirectReportEnabled: boolean;
    savingLocalDirectReport: boolean;
    onToggleLocalDirectReport: (checked: boolean) => void;
}) {
    return (
        <AdminFilterBar
            keyword={keyword}
            inputClassName="w-full sm:w-[360px]"
            placeholder="搜索用户、模型、渠道、接口或错误"
            onSearch={onSearch}
            onReset={onReset}
            actions={
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>本地直连日志</span>
                    <Switch size="small" checked={localDirectReportEnabled} loading={savingLocalDirectReport} onChange={(checked) => void onToggleLocalDirectReport(checked)} />
                    <span className="min-w-10 text-foreground">{localDirectReportEnabled ? "上报中" : "未上报"}</span>
                </div>
            }
        />
    );
}