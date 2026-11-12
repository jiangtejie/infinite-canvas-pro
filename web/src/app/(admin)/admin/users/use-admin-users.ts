"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { errorMessage as toErrorMessage } from "@/lib/utils";
import { adjustAdminUserCredits, deleteAdminUser, fetchAdminUsers, saveAdminUser, type AdminUser, type AdminUserListResponse } from "@/services/api/admin";

import { useAdminList } from "../components/use-admin-list";

type UserListFilters = { keyword: string };

export function useAdminUsers() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const list = useAdminList<UserListFilters, AdminUserListResponse>({
        queryKey: ({ token, filters, page, pageSize }) => ["admin", "users", token, filters.keyword, page, pageSize],
        fetcher: ({ token, filters, page, pageSize }) => fetchAdminUsers(token, { keyword: filters.keyword, page, pageSize }),
        initialFilters: { keyword: "" },
        errorFallback: "读取用户失败",
    });
    const token = list.token;

    const saveMutation = useMutation({
        mutationFn: (user: Partial<AdminUser> & { password?: string }) => saveAdminUser(token, user),
        onSuccess: async (_, user) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success(user.id ? "用户已保存" : "用户已新增");
        },
        onError: (error) => message.error(toErrorMessage(error, "保存失败")),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminUser(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success("用户已删除");
        },
        onError: (error) => message.error(toErrorMessage(error, "删除失败")),
    });

    const creditMutation = useMutation({
        mutationFn: ({ id, credits }: { id: string; credits: number }) => adjustAdminUserCredits(token, id, credits),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success("算力点已调整");
        },
        onError: (error) => message.error(toErrorMessage(error, "调整失败")),
    });

    const data = list.query.data;

    return {
        users: data?.items || [],
        keyword: list.filters.keyword,
        page: list.page,
        pageSize: list.pageSize,
        total: data?.total || 0,
        isLoading: list.query.isFetching || saveMutation.isPending || deleteMutation.isPending || creditMutation.isPending,
        searchUsers: (value = list.filters.keyword) => list.applyFilters({ keyword: value }),
        changePage: list.changePage,
        changePageSize: list.changePageSize,
        resetFilters: list.resetFilters,
        refreshUsers: () => list.query.refetch(),
        saveUser: (user: Partial<AdminUser> & { password?: string }) => saveMutation.mutateAsync(user),
        adjustCredits: (id: string, credits: number) => creditMutation.mutateAsync({ id, credits }),
        deleteUser: (id: string) => deleteMutation.mutateAsync(id),
    };
}
