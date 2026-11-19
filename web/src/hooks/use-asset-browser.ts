"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchAssetLibrary } from "@/services/api/assets";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

function useAssetFilterState(initialKind?: Asset["kind"]) {
    const [keyword, setKeyword] = useState("");
    const [kind, setKind] = useState(initialKind || "");
    const [category, setCategory] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [page, setPage] = useState(1);

    useEffect(() => setPage(1), [keyword, kind, category, tags]);

    return { keyword, setKeyword, kind, setKind, category, setCategory, tags, setTags, page, setPage };
}

/** 我的素材：本地数组筛选 + 分页，搜索覆盖标题、分类和标签。 */
export function useMyAssetBrowser(pageSize: number, initialKind?: Asset["kind"]) {
    const assets = useAssetStore((state) => state.assets);
    const filters = useAssetFilterState(initialKind);
    const { keyword, kind, category, tags, page, setPage } = filters;

    const categories = useMemo(() => Array.from(new Set(assets.flatMap((asset) => (asset.category ? [asset.category] : [])))), [assets]);
    const availableTags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags || []))), [assets]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets.filter((asset) =>
            (!kind || asset.kind === kind)
            && (!category || asset.category === category)
            && (!tags.length || tags.some((tag) => (asset.tags || []).includes(tag)))
            && (!query || [asset.title, asset.category || "", ...(asset.tags || [])].join(" ").toLowerCase().includes(query)),
        );
    }, [assets, keyword, kind, category, tags]);

    const items = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

    useEffect(() => setPage((value) => Math.min(value, Math.max(1, Math.ceil(filtered.length / pageSize)))), [filtered.length, pageSize, setPage]);

    return { ...filters, categories, availableTags, items, total: filtered.length };
}

/** 素材库：服务端分页查询，queryKey 由调用方区分缓存。 */
export function useLibraryAssetBrowser(pageSize: number, queryKey: string, initialKind?: Asset["kind"]) {
    const filters = useAssetFilterState(initialKind);
    const { keyword, kind, category, tags, page } = filters;

    const query = useQuery({
        queryKey: [queryKey, keyword, kind, category, tags, page],
        queryFn: () => fetchAssetLibrary({ keyword, type: kind, category, tag: tags, page, pageSize }),
        retry: false,
    });

    return {
        ...filters,
        query,
        items: query.data?.items || [],
        categories: query.data?.categories || [],
        availableTags: query.data?.tags || [],
        total: query.data?.total || 0,
    };
}
