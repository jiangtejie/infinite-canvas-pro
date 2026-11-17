"use client";

import { AdminFilterBar } from "../../components/admin-filter-bar";

export function UserFilterBar({ keyword, onSearch, onReset }: { keyword: string; onSearch: (keyword: string) => void; onReset: () => void }) {
    return <AdminFilterBar keyword={keyword} placeholder="搜索用户名、昵称或邮箱" onSearch={onSearch} onReset={onReset} />;
}