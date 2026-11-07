"use client";

import { Button, Card, Col, DatePicker, Form, Input, Row, Space, theme } from "antd";
import dayjs from "dayjs";

export function CreditLogFilterBar({
    keywordText,
    setKeywordText,
    date,
    searchLogs,
    resetFilters,
}: {
    keywordText: string;
    setKeywordText: (value: string) => void;
    date: string;
    searchLogs: (keyword: string, date?: string) => void;
    resetFilters: () => void;
}) {
    const { token } = theme.useToken();
    return (
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Space.Compact block>
                                        <Input style={{ flex: 1, minWidth: 0 }} value={keywordText} placeholder="搜索用户名、用户 ID、类型、备注或关联 ID" allowClear onPressEnter={() => searchLogs(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                        <DatePicker style={{ width: 46, height: token.controlHeight, padding: 0, cursor: "pointer", background: token.colorPrimary, borderColor: token.colorPrimary }} styles={{ input: { opacity: 0, cursor: "pointer" }, suffix: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", marginInlineStart: 0, color: token.colorTextLightSolid } }} value={date ? dayjs(date) : null} format={() => ""} placeholder="" inputReadOnly allowClear={false} title={date || "选择日期"} onChange={(value) => searchLogs(keywordText, value?.format("YYYY-MM-DD") || "")} />
                                    </Space.Compact>
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Space>
                                        <Button
                                            onClick={() => {
                                                setKeywordText("");
                                                resetFilters();
                                            }}
                                        >
                                            重置
                                        </Button>
                                        <Button type="primary" onClick={() => searchLogs(keywordText)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
    );
}
