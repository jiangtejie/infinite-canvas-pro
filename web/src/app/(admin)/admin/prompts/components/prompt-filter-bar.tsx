"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Col, Form, Input, Select } from "antd";
import { useEffect, useState } from "react";

import type { AdminPromptCategory } from "@/services/api/admin";

import { AdminFilterBar, adminFilterFieldCol, adminFilterKeywordCol } from "../../components/admin-filter-bar";

export function PromptFilterBar({
    keyword,
    category,
    tag,
    categories,
    tags,
    onSearch,
    changeCategory,
    changeTag,
    onReset,
}: {
    keyword: string;
    category: string;
    tag: string[];
    categories: AdminPromptCategory[];
    tags: string[];
    onSearch: (keyword: string) => void;
    changeCategory: (value: string) => void;
    changeTag: (value: string[]) => void;
    onReset: () => void;
}) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    const categoryOptions = [{ label: "全部分类", value: "" }, ...categories.map((item) => ({ label: item.name, value: item.category }))];
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
                    <Input.Search value={keywordText} placeholder="搜索标题或提示词" allowClear enterButton={<SearchOutlined />} onSearch={() => onSearch(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                </Form.Item>
            </Col>
            <Col {...adminFilterFieldCol}>
                <Form.Item label="分组">
                    <Select value={category} onChange={changeCategory} options={categoryOptions} />
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
