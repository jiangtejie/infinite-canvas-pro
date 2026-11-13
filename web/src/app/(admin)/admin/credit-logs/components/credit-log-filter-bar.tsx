"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, DatePicker, Input } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { AdminToolbar } from "../../components/admin-toolbar";

export function CreditLogFilterBar({ keyword, date, onSearch, onReset }: { keyword: string; date: string; onSearch: (keyword: string, date: string) => void; onReset: () => void }) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    return (
        <AdminToolbar>
            <div className="w-full sm:w-[360px]">
                <Input.Search
                    value={keywordText}
                    placeholder="搜索用户名、用户 ID、类型、备注或关联 ID"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => onSearch(keywordText, date)}
                    onChange={(event) => setKeywordText(event.target.value)}
                />
            </div>
            <DatePicker className="w-full sm:w-[170px]" value={date ? dayjs(date) : null} allowClear onChange={(value) => onSearch(keywordText, value ? value.format("YYYY-MM-DD") : "")} />
            <Button
                type="text"
                onClick={() => {
                    setKeywordText("");
                    onReset();
                }}
            >
                重置
            </Button>
        </AdminToolbar>
    );
}
