"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Row, Space } from "antd";
import type { ReactNode } from "react";

/** 后台筛选条响应式栅格：关键词字段较宽，其余筛选字段统一窄列 */
export const adminFilterKeywordCol = { xs: 24, sm: 24, md: 12, lg: 8 } as const;
export const adminFilterFieldCol = { xs: 12, sm: 12, md: 6, lg: 5 } as const;

const actionCol = { xs: 24, sm: 12, md: 6, lg: 5 } as const;

export function AdminFilterBar({ children, onSearch, onReset, extraActions }: { children: ReactNode; onSearch?: () => void; onReset: () => void; extraActions?: ReactNode }) {
    return (
        <Card variant="borderless">
            <Form layout="vertical">
                <Row gutter={16} align="bottom">
                    {children}
                    <Col {...actionCol}>
                        <Form.Item>
                            <Space>
                                <Button onClick={onReset}>重置</Button>
                                {extraActions ?? (onSearch ? <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>查询</Button> : null)}
                            </Space>
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Card>
    );
}
