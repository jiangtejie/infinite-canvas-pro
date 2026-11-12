/** 生图卡片用的一行元信息：日期 · 模型 · 接口 · 尺寸 · 质量 · 耗时。 */
export function ImageMetaLine({ items, title }: { items: Array<string | undefined | null | false>; title?: string }) {
    const visible = items.filter((item): item is string => Boolean(item));
    if (!visible.length) return null;
    return (
        <div title={title || visible.join(" · ")} className="line-clamp-2 break-words text-[10px] leading-4 text-muted-foreground/90">
            {visible.join(" · ")}
        </div>
    );
}
