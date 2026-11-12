"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { errorMessage as toErrorMessage } from "@/lib/utils";
import { deleteAdminAsset, fetchAdminAssets, saveAdminAsset, type AdminAsset, type AdminAssetListResponse } from "@/services/api/admin";

import { useAdminList } from "../components/use-admin-list";

type AssetListFilters = { keyword: string; type: string; tag: string[] };

export function useAdminAssets() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const list = useAdminList<AssetListFilters, AdminAssetListResponse>({
        queryKey: ({ token, filters, page, pageSize }) => ["admin", "assets", token, filters.keyword, filters.type, filters.tag, page, pageSize],
        fetcher: ({ token, filters, page, pageSize }) => fetchAdminAssets(token, { keyword: filters.keyword, type: filters.type, tag: filters.tag, page, pageSize }),
        initialFilters: { keyword: "", type: "", tag: [] },
        errorFallback: "读取素材失败",
    });
    const token = list.token;

    const saveMutation = useMutation({
        mutationFn: (asset: Partial<AdminAsset>) => saveAdminAsset(token, asset),
        onSuccess: async (_, asset) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "assets"] });
            message.success(asset.id ? "素材已保存" : "素材已新增");
        },
        onError: (error) => {
            message.error(toErrorMessage(error, "保存失败"));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminAsset(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "assets"] });
            message.success("素材已删除");
        },
        onError: (error) => {
            message.error(toErrorMessage(error, "删除失败"));
        },
    });

    const data = list.query.data;

    return {
        assets: data?.items || [],
        tags: data?.tags || [],
        keyword: list.filters.keyword,
        kind: list.filters.type,
        tag: list.filters.tag,
        page: list.page,
        pageSize: list.pageSize,
        total: data?.total || 0,
        isLoading: list.query.isFetching || saveMutation.isPending || deleteMutation.isPending,
        searchAssets: (value = list.filters.keyword) => list.applyFilters({ keyword: value }),
        changeKind: (value: string) => list.applyFilters({ type: value, tag: [] }),
        changeTag: (value: string[]) => list.applyFilters({ tag: value }),
        changePage: list.changePage,
        changePageSize: list.changePageSize,
        resetFilters: list.resetFilters,
        refreshAssets: () => list.query.refetch(),
        saveAsset: (asset: Partial<AdminAsset>) => saveMutation.mutateAsync(asset),
        deleteAsset: (id: string) => deleteMutation.mutateAsync(id),
    };
}
