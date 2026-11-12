"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchAssetLibrary, type AssetLibraryItem } from "@/services/api/assets";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

import type { InsertAssetPayload } from "../types";

/** 素材选择器与侧栏素材 Tab 共用的插入载荷；素材库同样带 assetId，供参考图与生成记录回填。 */
export function assetInsertPayload(asset: Asset): InsertAssetPayload {
    if (asset.kind === "text") return { kind: "text", content: asset.data.content, title: asset.title, assetId: asset.id, source: "asset" };
    if (asset.kind === "image") return { kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title, assetId: asset.id, width: asset.data.width, height: asset.data.height, bytes: asset.data.bytes, mimeType: asset.data.mimeType, source: "asset" };
    if (asset.kind === "video") return { kind: "video", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, assetId: asset.id, width: asset.data.width, height: asset.data.height, bytes: asset.data.bytes, mimeType: asset.data.mimeType, source: "asset" };
    return { kind: "audio", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, assetId: asset.id, bytes: asset.data.bytes, mimeType: asset.data.mimeType, durationMs: asset.data.durationMs, source: "asset" };
}

export function libraryInsertPayload(asset: AssetLibraryItem): InsertAssetPayload {
    if (asset.type === "text") return { kind: "text", content: asset.content, title: asset.title, assetId: asset.id, source: "library" };
    if (asset.type === "image") return { kind: "image", dataUrl: asset.url, title: asset.title, assetId: asset.id, source: "library" };
    if (asset.type === "video") return { kind: "video", url: asset.url, title: asset.title, assetId: asset.id, source: "library" };
    return { kind: "audio", url: asset.url, title: asset.title, assetId: asset.id, source: "library" };
}

function useAssetFilterState() {
    const [keyword, setKeyword] = useState("");
    const [kind, setKind] = useState("");
    const [category, setCategory] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [page, setPage] = useState(1);

    useEffect(() => setPage(1), [keyword, kind, category, tags]);

    return { keyword, setKeyword, kind, setKind, category, setCategory, tags, setTags, page, setPage };
}

/** 我的素材：本地数组筛选 + 分页，搜索覆盖标题、分类和标签。 */
export function useMyAssetBrowser(pageSize: number) {
    const assets = useAssetStore((state) => state.assets);
    const filters = useAssetFilterState();
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
export function useLibraryAssetBrowser(pageSize: number, queryKey: string) {
    const filters = useAssetFilterState();
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
