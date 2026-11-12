"use client";

import { App } from "antd";
import copy from "copy-to-clipboard";

export function useCopyText() {
    const { message } = App.useApp();

    return (value: string, successText = "已复制") => {
        if (!copy(value)) {
            message.error("复制失败，请手动选择文本");
            return;
        }
        message.success(successText);
    };
}
