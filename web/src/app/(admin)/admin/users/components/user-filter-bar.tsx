"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import { useEffect, useState } from "react";

import { AdminToolbar } from "../../components/admin-toolbar";

export function UserFilterBar({ keyword, onSearch, onReset }: { keyword: string; onSearch: (keyword: string) => void; onReset: () => void }) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    return (
        <AdminToolbar>
            <div className="w-full sm:w-[320px]">
                <Input.Search
                    value={keywordText}
                    placeholder="搜索用户名、昵称或邮箱"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => onSearch(keywordText)}
                    onChange={(event) => setKeywordText(event.target.value)}
                />
            </div>
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
