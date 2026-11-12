"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { errorMessage as toErrorMessage } from "@/lib/utils";
import { deleteAdminCreditLog, fetchAdminCreditLogs, saveAdminCreditLog, type AdminCreditLog, type AdminCreditLogListResponse } from "@/services/api/admin";

import { useAdminList } from "../components/use-admin-list";

type CreditLogListFilters = { keyword: string; date: string };

export function useAdminCreditLogs() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const list = useAdminList<CreditLogListFilters, AdminCreditLogListResponse>({
        queryKey: ({ token, filters, page, pageSize }) => ["admin", "credit-logs", token, filters.keyword, filters.date, page, pageSize],
        fetcher: ({ token, filters, page, pageSize }) => fetchAdminCreditLogs(token, { keyword: filters.keyword, date: filters.date, page, pageSize }),
        initialFilters: { keyword: "", date: "" },
        errorFallback: "读取日志失败",
    });
    const token = list.token;

    const saveMutation = useMutation({
        mutationFn: (log: Partial<AdminCreditLog>) => saveAdminCreditLog(token, log),
        onSuccess: async (_, log) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "credit-logs"] });
            message.success(log.id ? "日志已保存" : "日志已新增");
        },
        onError: (error) => message.error(toErrorMessage(error, "保存失败")),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminCreditLog(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "credit-logs"] });
            message.success("日志已删除");
        },
        onError: (error) => message.error(toErrorMessage(error, "删除失败")),
    });

    const data = list.query.data;

    return {
        logs: data?.items || [],
        keyword: list.filters.keyword,
        date: list.filters.date,
        page: list.page,
        pageSize: list.pageSize,
        total: data?.total || 0,
        isLoading: list.query.isFetching || saveMutation.isPending || deleteMutation.isPending,
        searchLogs: (value = list.filters.keyword, selectedDate = list.filters.date) => list.applyFilters({ keyword: value, date: selectedDate }),
        changePage: list.changePage,
        changePageSize: list.changePageSize,
        resetFilters: list.resetFilters,
        refreshLogs: () => list.query.refetch(),
        saveLog: (log: Partial<AdminCreditLog>) => saveMutation.mutateAsync(log),
        deleteLog: (id: string) => deleteMutation.mutateAsync(id),
    };
}
