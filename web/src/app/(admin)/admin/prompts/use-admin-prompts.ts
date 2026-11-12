"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { errorMessage as toErrorMessage } from "@/lib/utils";
import { deleteAdminPrompt, deleteAdminPrompts, fetchAdminPrompts, fetchAdminPromptCategories, saveAdminPrompt, syncAdminPromptCategoriesAll, syncAdminPromptCategory, type AdminPromptCategory } from "@/services/api/admin";
import type { Prompt, PromptListResponse } from "@/services/api/prompts";

import { useAdminList, useAdminQueryError } from "../components/use-admin-list";

type PromptListFilters = { keyword: string; category: string; tag: string[] };

export function useAdminPrompts() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const list = useAdminList<PromptListFilters, PromptListResponse>({
        queryKey: ({ token, filters, page, pageSize }) => ["admin", "prompts", token, filters.keyword, filters.category, filters.tag, page, pageSize],
        fetcher: ({ token, filters, page, pageSize }) => fetchAdminPrompts(token, { keyword: filters.keyword, category: filters.category, tag: filters.tag, page, pageSize }),
        initialFilters: { keyword: "", category: "", tag: [] },
        errorFallback: "读取提示词失败",
    });
    const token = list.token;

    const categoriesQuery = useQuery({
        queryKey: ["admin", "prompt-categories", token],
        queryFn: () => fetchAdminPromptCategories(token),
        enabled: Boolean(token),
        retry: false,
    });

    useAdminQueryError(categoriesQuery.error, categoriesQuery.isError && !list.query.isError, "读取提示词失败");

    const syncMutation = useMutation({
        mutationFn: (category: string) => syncAdminPromptCategory(token, category),
        onSuccess: async (categories) => {
            queryClient.setQueryData<AdminPromptCategory[]>(["admin", "prompt-categories", token], categories);
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success("远程提示词源已同步");
        },
        onError: (error) => {
            message.error(toErrorMessage(error, "同步失败"));
        },
    });

    const syncAllMutation = useMutation({
        mutationFn: () => syncAdminPromptCategoriesAll(token),
        onSuccess: async (categories) => {
            queryClient.setQueryData<AdminPromptCategory[]>(["admin", "prompt-categories", token], categories);
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success("全部远程提示词源已同步");
        },
        onError: (error) => {
            message.error(toErrorMessage(error, "同步失败"));
        },
    });

    const saveMutation = useMutation({
        mutationFn: (prompt: Partial<Prompt>) => saveAdminPrompt(token, prompt),
        onSuccess: async (_, prompt) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-categories"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success(prompt.id ? "提示词已保存" : "提示词已新增");
        },
        onError: (error) => {
            message.error(toErrorMessage(error, "保存失败"));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminPrompt(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-categories"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success("提示词已删除");
        },
        onError: (error) => {
            message.error(toErrorMessage(error, "删除失败"));
        },
    });

    const batchDeleteMutation = useMutation({
        mutationFn: (ids: string[]) => deleteAdminPrompts(token, ids),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-categories"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success("提示词已批量删除");
        },
        onError: (error) => {
            message.error(toErrorMessage(error, "批量删除失败"));
        },
    });

    const data = list.query.data;

    return {
        categories: categoriesQuery.data || [],
        prompts: data?.items || [],
        tags: data?.tags || [],
        keyword: list.filters.keyword,
        category: list.filters.category,
        tag: list.filters.tag,
        page: list.page,
        pageSize: list.pageSize,
        total: data?.total || 0,
        isLoading: categoriesQuery.isFetching || list.query.isFetching || saveMutation.isPending || deleteMutation.isPending || batchDeleteMutation.isPending,
        isSyncing: syncMutation.isPending || syncAllMutation.isPending,
        syncCategory: (category: string) => syncMutation.mutateAsync(category),
        syncAllCategories: () => syncAllMutation.mutateAsync(),
        searchPrompts: (value = list.filters.keyword) => list.applyFilters({ keyword: value }),
        changeCategory: (value: string) => list.applyFilters({ category: value, tag: [] }),
        changeTag: (value: string[]) => list.applyFilters({ tag: value }),
        changePage: list.changePage,
        changePageSize: list.changePageSize,
        resetFilters: list.resetFilters,
        refreshPrompts: async () => {
            await categoriesQuery.refetch();
            await list.query.refetch();
        },
        savePrompt: (prompt: Partial<Prompt>) => saveMutation.mutateAsync(prompt),
        deletePrompt: (id: string) => deleteMutation.mutateAsync(id),
        deletePrompts: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
    };
}
