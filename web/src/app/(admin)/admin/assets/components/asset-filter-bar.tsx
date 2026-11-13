"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";
import { useEffect, useState } from "react";

import { AdminToolbar } from "../../components/admin-toolbar";
import { assetTypeOptions } from "../asset-utils";

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
        <AdminToolbar>
            <div className="w-full sm:w-[320px]">
                <Input.Search
                    value={keywordText}
                    placeholder="搜索标题、内容或标签"
                    allowClear
                    enterButton={<SearchOutlined />}
                    onSearch={() => onSearch(keywordText)}
                    onChange={(event) => setKeywordText(event.target.value)}
                />
            </div>
            <Select className="w-full sm:w-[140px]" value={kind} onChange={changeKind} options={assetTypeOptions} />
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
