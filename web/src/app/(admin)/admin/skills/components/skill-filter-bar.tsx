"use client";

import { Select } from "antd";

import { AdminFilterBar } from "../../components/admin-filter-bar";

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
    return (
        <AdminFilterBar keyword={keyword} placeholder="搜索名称、描述或内容" onSearch={onSearch} onReset={onReset}>
            <Select className="w-full sm:w-[140px]" value={status} onChange={changeStatus} options={statusOptions} />
        </AdminFilterBar>
    );
}