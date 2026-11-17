"use client";

import { Select } from "antd";

import { AdminFilterBar } from "../../components/admin-filter-bar";
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
    const tagOptions = tags.map((item) => ({ label: item, value: item }));
    return (
        <AdminFilterBar keyword={keyword} placeholder="搜索标题、内容或标签" onSearch={onSearch} onReset={onReset}>
            <Select className="w-full sm:w-[140px]" value={kind} onChange={changeKind} options={assetTypeOptions} />
            <Select mode="multiple" allowClear maxTagCount="responsive" className="w-full sm:w-[240px]" value={tag} onChange={changeTag} options={tagOptions} placeholder="全部标签" />
        </AdminFilterBar>
    );
}