"use client";

import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Row, Space, Switch } from "antd";

export function AiLogFilterBar({
    keyword,
    setKeyword,
    onSearch,
    onReset,
    localDirectReportEnabled,
    savingLocalDirectReport,
    onToggleLocalDirectReport,
}: {
    keyword: string;
    setKeyword: (value: string) => void;
    onSearch: () => void;
    onReset: () => void;
    localDirectReportEnabled: boolean;
    savingLocalDirectReport: boolean;
    onToggleLocalDirectReport: (checked: boolean) => void;
}) {
    return (
        <Card variant="borderless">
            <Form layout="vertical" onFinish={onSearch}>
                <Row gutter={16} align="bottom">
                    <Col xs={24} lg={13}>
                        <Form.Item label="关键词">
                            <Input value={keyword} placeholder="搜索用户、模型、渠道、接口或错误" allowClear onPressEnter={onSearch} onChange={(event) => setKeyword(event.target.value)} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12} lg={5}>
                        <Form.Item label="本地直连日志">
                            <div className="flex h-8 items-center justify-between gap-3 rounded-md border border-border bg-background px-3">
                                <span className="text-xs text-muted-foreground">{localDirectReportEnabled ? "上报中" : "未上报"}</span>
                                <Switch size="small" checked={localDirectReportEnabled} loading={savingLocalDirectReport} onChange={(checked) => void onToggleLocalDirectReport(checked)} />
                            </div>
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12} lg={6}>
                        <Form.Item label=" ">
                            <Space>
                                <Button htmlType="submit" type="primary" icon={<SearchOutlined />}>
                                    查询
                                </Button>
                                <Button icon={<ReloadOutlined />} onClick={onReset}>
                                    重置
                                </Button>
                            </Space>
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Card>
    );
}
