"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, DatePicker, Form, Input, Row, Space } from "antd";
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
    return (
        <Card variant="borderless">
            <Form layout="vertical">
                <Row gutter={16} align="bottom">
                    <Col xs={24} md={10} lg={12}>
                        <Form.Item label="关键词">
                            <Input value={keywordText} placeholder="搜索用户名、用户 ID、类型、备注或关联 ID" allowClear onPressEnter={() => searchLogs(keywordText, date)} onChange={(event) => setKeywordText(event.target.value)} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={6} lg={5}>
                        <Form.Item label="日期">
                            <DatePicker
                                className="!w-full"
                                value={date ? dayjs(date) : null}
                                allowClear
                                onChange={(value) => searchLogs(keywordText, value ? value.format("YYYY-MM-DD") : "")}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8} lg={7}>
                        <Form.Item label=" ">
                            <Space>
                                <Button
                                    onClick={() => {
                                        setKeywordText("");
                                        resetFilters();
                                    }}
                                >
                                    重置
                                </Button>
                                <Button type="primary" icon={<SearchOutlined />} onClick={() => searchLogs(keywordText, date)}>
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
