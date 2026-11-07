"use client";

import { DeleteOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, InputNumber, Switch, Typography } from "antd";

export function AiLogFilterBar({
    keyword,
    setKeyword,
    onSearch,
    onReset,
    localDirectReportEnabled,
    savingLocalDirectReport,
    onToggleLocalDirectReport,
    clearDays,
    setClearDays,
    clearing,
    onClearLogs,
}: {
    keyword: string;
    setKeyword: (value: string) => void;
    onSearch: () => void;
    onReset: () => void;
    localDirectReportEnabled: boolean;
    savingLocalDirectReport: boolean;
    onToggleLocalDirectReport: (checked: boolean) => void;
    clearDays: number;
    setClearDays: (value: number) => void;
    clearing: boolean;
    onClearLogs: () => void;
}) {
    return (
                <Card variant="borderless">
                    <Form
                        layout="vertical"
                        onFinish={() => onSearch()}
                    >
                        <div className="flex flex-wrap items-center gap-3">
                            <Input className="min-w-[280px] flex-1 lg:max-w-[460px]" value={keyword} placeholder="搜索用户、模型、渠道、接口或错误" onChange={(event) => setKeyword(event.target.value)} />
                            <Button htmlType="submit" type="primary" icon={<SearchOutlined />}>
                                查询
                            </Button>
                            <Button icon={<ReloadOutlined />} onClick={onReset}>
                                重置
                            </Button>
                            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3">
                                <Typography.Text className="whitespace-nowrap text-sm">本地直连日志</Typography.Text>
                                <Switch size="small" checked={localDirectReportEnabled} loading={savingLocalDirectReport} onChange={(checked) => void onToggleLocalDirectReport(checked)} />
                            </div>
                            <div className="flex h-8 items-center gap-2">
                                <Typography.Text className="whitespace-nowrap text-sm">清理超过</Typography.Text>
                                <InputNumber min={1} value={clearDays} className="!w-24" onChange={(value) => setClearDays(Number(value) || 7)} />
                                <Typography.Text type="secondary" className="shrink-0">天前</Typography.Text>
                            </div>
                            <Button danger icon={<DeleteOutlined />} loading={clearing} onClick={() => void onClearLogs()} className="ml-0 lg:ml-auto">
                                清理旧日志
                            </Button>
                        </div>
                    </Form>
                </Card>
    );
}
