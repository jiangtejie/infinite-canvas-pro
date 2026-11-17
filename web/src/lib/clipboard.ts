/** 从已读取的剪贴板条目中提取指定 MIME 前缀的文件（图片/视频/音频）。 */
export function blobsFromClipboardItems(items: ClipboardItem[], typePrefix: string): Promise<Blob[]> {
    return Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith(typePrefix)).map((type) => item.getType(type))));
}

/** 读取系统剪贴板中指定 MIME 前缀的文件，读取失败由调用方兜底。 */
export async function readClipboardBlobs(typePrefix: string): Promise<Blob[]> {
    return blobsFromClipboardItems(await navigator.clipboard.read(), typePrefix);
}