"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import { type ReactNode, useEffect, useState } from "react";

import { AdminToolbar } from "./admin-toolbar";

/** 后台列表统一的「关键词搜索 + 额外筛选 + 重置」工具条，草稿输入只在内层保存。 */
export function AdminFilterBar({
    keyword,
    placeholder,
    inputClassName = "w-full sm:w-[320px]",
    actions,
    onSearch,
    onReset,
    children,
}: {
    keyword: string;
    placeholder: string;
    inputClassName?: string;
    actions?: ReactNode;
    onSearch: (keyword: string) => void;
    onReset: () => void;
    children?: ReactNode;
}) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    return (
        <AdminToolbar actions={actions}>
            <div className={inputClassName}>
                <Input.Search
                    value={keywordText}
                    placeholder={placeholder}
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => onSearch(keywordText)}
                    onChange={(event) => setKeywordText(event.target.value)}
                />
            </div>
            {children}
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