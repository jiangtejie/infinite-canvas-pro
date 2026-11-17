"use client";

import { DatePicker } from "antd";
import dayjs from "dayjs";

import { AdminFilterBar } from "../../components/admin-filter-bar";

export function CreditLogFilterBar({ keyword, date, onSearch, onReset }: { keyword: string; date: string; onSearch: (keyword: string, date: string) => void; onReset: () => void }) {
    return (
        <AdminFilterBar keyword={keyword} inputClassName="w-full sm:w-[360px]" placeholder="搜索用户名、用户 ID、类型、备注或关联 ID" onSearch={(nextKeyword) => onSearch(nextKeyword, date)} onReset={onReset}>
            <DatePicker className="w-full sm:w-[170px]" value={date ? dayjs(date) : null} allowClear onChange={(value) => onSearch(keyword, value ? value.format("YYYY-MM-DD") : "")} />
        </AdminFilterBar>
    );
}