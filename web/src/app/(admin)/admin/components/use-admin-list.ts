"use client";

import { useQuery } from "@tanstack/react-query";
import { App } from "antd";
import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/utils";
import { errorStatus } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

type AdminListFilters = Record<string, unknown>;

export type AdminListState<TFilters extends AdminListFilters> = {
    token: string;
    filters: TFilters;
    page: number;
    pageSize: number;
};

/** 后台列表请求错误的统一处理：展示错误文案，未登录/无权限（401/403）时清空登录态。 */
export function useAdminQueryError(error: unknown, isError: boolean, fallback: string) {
    const { message } = App.useApp();
    const clearSession = useUserStore((state) => state.clearSession);
    useEffect(() => {
        if (!isError) return;
        message.error(errorMessage(error, fallback));
        const status = errorStatus(error);
        if (status === 401 || status === 403) clearSession();
    }, [clearSession, error, fallback, isError, message]);
}

/** 后台列表通用分页/筛选状态与查询，页面 hook 只需提供 fetcher、初始筛选与错误兜底文案。 */
export function useAdminList<TFilters extends AdminListFilters, TData>({
    queryKey,
    fetcher,
    initialFilters,
    errorFallback,
    pageSize: initialPageSize = defaultPageSize,
}: {
    queryKey: (state: AdminListState<TFilters>) => readonly unknown[];
    fetcher: (state: AdminListState<TFilters>) => Promise<TData>;
    initialFilters: TFilters;
    errorFallback: string;
    pageSize?: number;
}) {
    const token = useUserStore((state) => state.token);
    const [filters, setFilters] = useState<TFilters>(initialFilters);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);

    const query = useQuery({
        queryKey: queryKey({ token, filters, page, pageSize }),
        queryFn: () => fetcher({ token, filters, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    useAdminQueryError(query.error, query.isError, errorFallback);

    const applyFilters = (changes: Partial<TFilters>) => {
        setFilters((current) => ({ ...current, ...changes }));
        setPage(1);
    };

    const changePage = (value: number) => setPage(value);

    const changePageSize = (value: number) => {
        setPageSize(value);
        setPage(1);
    };

    const resetFilters = () => {
        setFilters(initialFilters);
        setPage(1);
        setPageSize(initialPageSize);
    };

    return { token, query, filters, page, pageSize, applyFilters, changePage, changePageSize, resetFilters };
}
