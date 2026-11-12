"use client";

import { Col, Form, Input, Switch } from "antd";
import { useEffect, useState } from "react";

import { AdminFilterBar, adminFilterFieldCol, adminFilterKeywordCol } from "../../components/admin-filter-bar";

export function AiLogFilterBar({
    keyword,
    onSearch,
    onReset,
    localDirectReportEnabled,
    savingLocalDirectReport,
    onToggleLocalDirectReport,
}: {
    keyword: string;
    onSearch: (keyword: string) => void;
    onReset: () => void;
    localDirectReportEnabled: boolean;
    savingLocalDirectReport: boolean;
    onToggleLocalDirectReport: (checked: boolean) => void;
}) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    return (
        <AdminFilterBar
            onSearch={() => onSearch(keywordText)}
            onReset={() => {
                setKeywordText("");
                onReset();
            }}
        >
            <Col {...adminFilterKeywordCol}>
                <Form.Item label="关键词">
                    <Input value={keywordText} placeholder="搜索用户、模型、渠道、接口或错误" allowClear onPressEnter={() => onSearch(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                </Form.Item>
            </Col>
            <Col {...adminFilterFieldCol}>
                <Form.Item label="本地直连日志">
                    <div className="flex h-8 items-center justify-between gap-3 rounded-md border border-border bg-background px-3">
                        <span className="text-xs text-muted-foreground">{localDirectReportEnabled ? "上报中" : "未上报"}</span>
                        <Switch size="small" checked={localDirectReportEnabled} loading={savingLocalDirectReport} onChange={(checked) => void onToggleLocalDirectReport(checked)} />
                    </div>
                </Form.Item>
            </Col>
        </AdminFilterBar>
    );
}
