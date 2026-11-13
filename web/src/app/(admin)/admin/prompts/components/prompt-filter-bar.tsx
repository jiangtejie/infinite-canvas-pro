"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";
import { useEffect, useState } from "react";

import { AdminToolbar } from "../../components/admin-toolbar";

export function PromptFilterBar({
    keyword,
    tag,
    tags,
    onSearch,
    changeTag,
    onReset,
}: {
    keyword: string;
    tag: string[];
    tags: string[];
    onSearch: (keyword: string) => void;
    changeTag: (value: string[]) => void;
    onReset: () => void;
}) {
    const [keywordText, setKeywordText] = useState(keyword);
    useEffect(() => setKeywordText(keyword), [keyword]);
    const tagOptions = tags.map((item) => ({ label: item, value: item }));
    return (
        <AdminToolbar>
            <div className="w-full sm:w-[320px]">
                <Input.Search
                    value={keywordText}
                    placeholder="搜索标题或提示词"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => onSearch(keywordText)}
                    onChange={(event) => setKeywordText(event.target.value)}
                />
            </div>
            <Select mode="multiple" allowClear maxTagCount="responsive" className="w-full sm:w-[240px]" value={tag} onChange={changeTag} options={tagOptions} placeholder="全部标签" />
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
