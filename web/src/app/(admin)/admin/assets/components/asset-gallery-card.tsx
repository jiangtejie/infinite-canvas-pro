"use client";

import { DeleteOutlined, EditOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";

import type { AdminAsset } from "@/services/api/admin";

import { assetTypeLabel } from "../asset-utils";
import { AssetPreview } from "./asset-preview";

export function AssetGalleryCard({
    asset,
    onDetail,
    onEdit,
    onDelete,
}: {
    asset: AdminAsset;
    onDetail: (asset: AdminAsset) => void;
    onEdit: (asset: AdminAsset) => void;
    onDelete: (asset: AdminAsset) => void;
}) {
    return (
        <article className="admin-gallery-card group flex flex-col">
            <div className="relative aspect-[4/3] overflow-hidden bg-muted/30">
                <button type="button" onClick={() => onDetail(asset)} className="block size-full cursor-pointer" aria-label={`查看素材 ${asset.title}`}>
                    <AssetPreview asset={asset} />
                </button>
                <div className="absolute left-2 top-2">
                    <Tag className="!m-0">{assetTypeLabel(asset.type)}</Tag>
                </div>
                <div className="admin-card-actions">
                    <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => onDetail(asset)} aria-label="查看详情" title="查看详情" />
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(asset)} aria-label="编辑素材" title="编辑素材" />
                    <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => onDelete(asset)} aria-label="删除素材" title="删除素材" />
                </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3.5">
                <button type="button" onClick={() => onDetail(asset)} className="truncate text-left text-[13px] font-medium text-foreground transition-colors hover:text-acid" title={asset.title}>
                    {asset.title}
                </button>
                <p className="line-clamp-2 text-[11px] leading-5 text-muted-foreground">{asset.description || (asset.type === "text" ? asset.content : asset.url) || "暂无描述"}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                    {asset.category ? <span className="text-[11px] text-muted-foreground">{asset.category}</span> : null}
                    {(asset.tags || []).slice(0, 2).map((tag) => (
                        <Tag key={tag} className="!m-0">
                            {tag}
                        </Tag>
                    ))}
                </div>
            </div>
        </article>
    );
}
