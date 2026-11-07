"use client";

import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Row, Select, Space } from "antd";

import { assetTypeOptions } from "../asset-utils";

export function AssetFilterBar({
    keywordText,
    setKeywordText,
    kind,
    tag,
    tags,
    searchAssets,
    changeKind,
    changeTag,
    resetFilters,
}: {
    keywordText: string;
    setKeywordText: (value: string) => void;
    kind: string;
    tag: string[];
    tags: string[];
    searchAssets: (value: string) => void;
    changeKind: (value: string) => void;
    changeTag: (value: string[]) => void;
    resetFilters: () => void;
}) {
    const tagOptions = tags.map((item) => ({ label: item, value: item }));
    return (
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keywordText} placeholder="搜索标题、内容或标签" allowClear enterButton={<SearchOutlined />} onSearch={() => searchAssets(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="类型">
                                    <Select value={kind} onChange={changeKind} options={assetTypeOptions} />
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
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchAssets(keywordText)}>
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
