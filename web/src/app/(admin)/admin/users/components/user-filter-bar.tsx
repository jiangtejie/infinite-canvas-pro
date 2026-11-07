"use client";

import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Row, Space } from "antd";

export function UserFilterBar({
    keywordText,
    setKeywordText,
    searchUsers,
    resetFilters,
}: {
    keywordText: string;
    setKeywordText: (value: string) => void;
    searchUsers: (value: string) => void;
    resetFilters: () => void;
}) {
    return (
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search
                                        value={keywordText}
                                        placeholder="搜索用户名、昵称或邮箱"
                                        allowClear
                                        enterButton={<SearchOutlined />}
                                        onSearch={() => searchUsers(keywordText)}
                                        onChange={(event) => setKeywordText(event.target.value)}
                                    />
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
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchUsers(keywordText)}>
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
