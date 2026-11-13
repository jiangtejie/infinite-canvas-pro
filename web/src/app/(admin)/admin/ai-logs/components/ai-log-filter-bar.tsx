"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Switch } from "antd";
import { useEffect, useState } from "react";

import { AdminToolbar } from "../../components/admin-toolbar";

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
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    return (
        <AdminToolbar
            actions={
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>本地直连日志</span>
                    <Switch size="small" checked={localDirectReportEnabled} loading={savingLocalDirectReport} onChange={(checked) => void onToggleLocalDirectReport(checked)} />
                    <span className="min-w-10 text-foreground">{localDirectReportEnabled ? "上报中" : "未上报"}</span>
                </div>
            }
        >
            <div className="w-full sm:w-[360px]">
                <Input.Search
                    value={keywordText}
                    placeholder="搜索用户、模型、渠道、接口或错误"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => onSearch(keywordText)}
                    onChange={(event) => setKeywordText(event.target.value)}
                />
            </div>
            <Button
                type="text"
                onClick={() => {
                    setKeywordText("");
                    onReset();
                }}
            >
                重置
            </Button>
        </AdminToolbar>
    );
}
