"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";
import { useEffect, useState } from "react";

import { AdminToolbar } from "../../components/admin-toolbar";

const statusOptions = [
    { label: "全部状态", value: "" },
    { label: "已启用", value: "enabled" },
    { label: "已停用", value: "disabled" },
];

export function SkillFilterBar({
    keyword,
    status,
    onSearch,
    changeStatus,
    onReset,
}: {
    keyword: string;
    status: string;
    onSearch: (keyword: string) => void;
    changeStatus: (value: string) => void;
    onReset: () => void;
}) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    return (
        <AdminToolbar>
            <div className="w-full sm:w-[320px]">
                <Input.Search
                    value={keywordText}
                    placeholder="搜索名称、描述或内容"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => onSearch(keywordText)}
                    onChange={(event) => setKeywordText(event.target.value)}
                />
            </div>
            <Select className="w-full sm:w-[140px]" value={status} onChange={changeStatus} options={statusOptions} />
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
