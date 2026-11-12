"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Col, Form, Input } from "antd";
import { useEffect, useState } from "react";

import { AdminFilterBar, adminFilterKeywordCol } from "../../components/admin-filter-bar";

export function UserFilterBar({ keyword, onSearch, onReset }: { keyword: string; onSearch: (keyword: string) => void; onReset: () => void }) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
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
                    <Input.Search value={keywordText} placeholder="搜索用户名、昵称或邮箱" allowClear enterButton={<SearchOutlined />} onSearch={() => onSearch(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                </Form.Item>
            </Col>
        </AdminFilterBar>
    );
}
