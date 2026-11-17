"use client";

import { Select } from "antd";

import { AdminFilterBar } from "../../components/admin-filter-bar";

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
    const tagOptions = tags.map((item) => ({ label: item, value: item }));
    return (
        <AdminFilterBar keyword={keyword} placeholder="搜索标题或提示词" onSearch={onSearch} onReset={onReset}>
            <Select mode="multiple" allowClear maxTagCount="responsive" className="w-full sm:w-[240px]" value={tag} onChange={changeTag} options={tagOptions} placeholder="全部标签" />
        </AdminFilterBar>
    );
}