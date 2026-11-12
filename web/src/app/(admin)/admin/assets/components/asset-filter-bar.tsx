"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Col, Form, Input, Select } from "antd";
import { useEffect, useState } from "react";

import { assetTypeOptions } from "../asset-utils";
import { AdminFilterBar, adminFilterFieldCol, adminFilterKeywordCol } from "../../components/admin-filter-bar";

export function AssetFilterBar({
    keyword,
    kind,
    tag,
    tags,
    onSearch,
    changeKind,
    changeTag,
    onReset,
}: {
    keyword: string;
    kind: string;
    tag: string[];
    tags: string[];
    onSearch: (keyword: string) => void;
    changeKind: (value: string) => void;
    changeTag: (value: string[]) => void;
    onReset: () => void;
}) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    const tagOptions = tags.map((item) => ({ label: item, value: item }));
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
                    <Input.Search value={keywordText} placeholder="搜索标题、内容或标签" allowClear enterButton={<SearchOutlined />} onSearch={() => onSearch(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                </Form.Item>
            </Col>
            <Col {...adminFilterFieldCol}>
                <Form.Item label="类型">
                    <Select value={kind} onChange={changeKind} options={assetTypeOptions} />
                </Form.Item>
            </Col>
            <Col {...adminFilterFieldCol}>
                <Form.Item label="标签">
                    <Select mode="multiple" allowClear maxTagCount="responsive" value={tag} onChange={changeTag} options={tagOptions} placeholder="全部标签" />
                </Form.Item>
            </Col>
        </AdminFilterBar>
    );
}
