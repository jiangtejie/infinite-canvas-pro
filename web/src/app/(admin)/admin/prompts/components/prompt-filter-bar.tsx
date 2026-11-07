"use client";

import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Row, Select, Space } from "antd";

import type { AdminPromptCategory } from "@/services/api/admin";

export function PromptFilterBar({
    keywordText,
    setKeywordText,
    category,
    tag,
    categories,
    tags,
    searchPrompts,
    changeCategory,
    changeTag,
    resetFilters,
}: {
    keywordText: string;
    setKeywordText: (value: string) => void;
    category: string;
    tag: string[];
    categories: AdminPromptCategory[];
    tags: string[];
    searchPrompts: (value: string) => void;
    changeCategory: (value: string) => void;
    changeTag: (value: string[]) => void;
    resetFilters: () => void;
}) {
    const categoryOptions = [{ label: "全部分类", value: "" }, ...categories.map((item) => ({ label: item.name, value: item.category }))];
    const tagOptions = tags.map((item) => ({ label: item, value: item }));
    return (
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keywordText} placeholder="搜索标题或提示词" allowClear enterButton={<SearchOutlined />} onSearch={() => searchPrompts(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col flex="220px">
                                <Form.Item label="分组">
                                    <Select value={category} onChange={changeCategory} options={categoryOptions} />
                                </Form.Item>
                            </Col>
                            <Col flex="220px">
                                <Form.Item label="标签">
                                    <Select mode="multiple" allowClear maxTagCount="responsive" value={tag} onChange={changeTag} options={tagOptions} placeholder="全部标签" />
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
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchPrompts(keywordText)}>
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
