"use client";

import { Col, DatePicker, Form, Input } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { AdminFilterBar, adminFilterFieldCol, adminFilterKeywordCol } from "../../components/admin-filter-bar";

export function CreditLogFilterBar({ keyword, date, onSearch, onReset }: { keyword: string; date: string; onSearch: (keyword: string, date: string) => void; onReset: () => void }) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    return (
        <AdminFilterBar
            onSearch={() => onSearch(keywordText, date)}
            onReset={() => {
                setKeywordText("");
                onReset();
            }}
        >
            <Col {...adminFilterKeywordCol}>
                <Form.Item label="关键词">
                    <Input value={keywordText} placeholder="搜索用户名、用户 ID、类型、备注或关联 ID" allowClear onPressEnter={() => onSearch(keywordText, date)} onChange={(event) => setKeywordText(event.target.value)} />
                </Form.Item>
            </Col>
            <Col {...adminFilterFieldCol}>
                <Form.Item label="日期">
                    <DatePicker className="!w-full" value={date ? dayjs(date) : null} allowClear onChange={(value) => onSearch(keywordText, value ? value.format("YYYY-MM-DD") : "")} />
                </Form.Item>
            </Col>
        </AdminFilterBar>
    );
}
