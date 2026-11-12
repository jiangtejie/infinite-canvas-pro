"use client";

import { saveAs } from "file-saver";

/** 统一导出/下载入口：Blob 直接下载，字符串按文件地址下载。 */
export function useDownloadFile() {
    return (data: Blob | string, filename: string) => {
        saveAs(data, filename);
    };
}
