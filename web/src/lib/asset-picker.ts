import type { AssetLibraryItem } from "@/services/api/assets";
import type { Asset } from "@/stores/use-asset-store";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string; assetId?: string; source?: "asset" | "library" }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string; assetId?: string; width?: number; height?: number; bytes?: number; mimeType?: string; source?: "asset" | "library" }
    | { kind: "video"; url: string; title: string; storageKey?: string; assetId?: string; width?: number; height?: number; bytes?: number; mimeType?: string; source?: "asset" | "library" }
    | { kind: "audio"; url: string; title: string; storageKey?: string; assetId?: string; bytes?: number; mimeType?: string; durationMs?: number; source?: "asset" | "library" };

/** 素材选择器通用插入载荷；素材库同样带 assetId，供参考图与生成记录回填。 */
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
